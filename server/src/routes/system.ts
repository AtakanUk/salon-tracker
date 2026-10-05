import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { access, readFile, readdir, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import archiver from 'archiver';
import { SessionStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { DATE_RE, addDaysStr, dayKey, startOfDayUtc } from '../lib/dates.js';
import { mailConfigured, sendMail } from '../lib/mailer.js';
import { recentErrors } from '../lib/errorlog.js';
import {
  BACKUP_FILE_RE,
  isBackupRunning,
  LAST_BACKUP_FILE,
  runBackup,
  type BackupResult,
} from '../backup/job.js';
import { buildJsonExport } from '../backup/json.js';
import { buildWorkbook } from '../backup/excel.js';
import { importJsonBackup, parseJsonBackup } from '../backup/import.js';
import { sessionWhere, type ExportRange } from '../backup/range.js';
import { HttpError } from '../lib/errors.js';

/**
 * Short on purpose: the backup must belong to *this* cleanup, not just be
 * "some backup from earlier today". The UI takes one right before deleting.
 */
const BACKUP_MAX_AGE_MS = 15 * 60 * 1000;

/** A salon's whole JSON export is well under a megabyte; this is a sanity cap. */
const MAX_RESTORE_BYTES = 64 * 1024 * 1024;

const rangeQuery = z.object({
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
});

/** Query (?from=&to=, both optional) -> UTC window + a name for the file. */
function parseRange(query: unknown): { range: ExportRange; label: string } {
  const q = rangeQuery.parse(query);
  if (q.from && q.to && q.from > q.to) throw new HttpError(400, 'range_reversed');
  return {
    range: {
      from: q.from ? startOfDayUtc(q.from, config.salonTz) : undefined,
      // the last day belongs to the range, so cut at the start of the next one
      to: q.to ? startOfDayUtc(addDaysStr(q.to, 1), config.salonTz) : undefined,
    },
    label: `${q.from ?? 'start'}_${q.to ?? dayKey(new Date(), config.salonTz)}`,
  };
}

/** What a window holds - shown before archiving or deleting it. */
async function summarize(range: ExportRange) {
  const sessions = await prisma.session.findMany({
    where: sessionWhere(range),
    select: {
      status: true,
      startedAt: true,
      items: { select: { priceCentsSnapshot: true, quantity: true } },
    },
    orderBy: { startedAt: 'asc' },
  });
  return {
    sessionCount: sessions.length,
    itemCount: sessions.reduce((a, s) => a + s.items.length, 0),
    revenueCents: sessions
      .filter((s) => s.status === SessionStatus.COMPLETED)
      .reduce(
        (a, s) => a + s.items.reduce((b, i) => b + i.priceCentsSnapshot * i.quantity, 0),
        0,
      ),
    oldestAt: sessions[0]?.startedAt ?? null,
    newestAt: sessions.at(-1)?.startedAt ?? null,
  };
}

/** A backup taken minutes ago - the safety net for retention cleanup. */
async function hasFreshBackup(): Promise<boolean> {
  const files = await latestBackupFiles();
  for (const name of files) {
    try {
      const s = await stat(path.join(config.backupDir, name));
      if (Date.now() - s.mtimeMs <= BACKUP_MAX_AGE_MS) return true;
    } catch {
      // vanished between listing and stat
    }
  }
  return false;
}

/** Names of the newest backup set: the last run's files, else the newest date on disk. */
async function latestBackupFiles(): Promise<string[]> {
  const dir = config.backupDir;
  const onDisk = async (names: string[]) => {
    const found: string[] = [];
    for (const n of names) {
      if (!BACKUP_FILE_RE.test(n)) continue;
      try {
        await access(path.join(dir, n));
        found.push(n);
      } catch {
        // recorded but since deleted (retention) - skip
      }
    }
    return found;
  };

  try {
    const last = JSON.parse(
      await readFile(path.join(dir, LAST_BACKUP_FILE), 'utf8'),
    ) as BackupResult;
    const files = await onDisk(last.files ?? []);
    if (files.length > 0) return files;
  } catch {
    // no last-backup.json yet
  }

  // fall back to the newest date prefix present in the folder
  try {
    const all = (await readdir(dir)).filter((n) => BACKUP_FILE_RE.test(n)).sort();
    const newestDay = all.at(-1)?.slice('friseur-'.length, 'friseur-'.length + 10);
    if (newestDay) return all.filter((n) => n.startsWith(`friseur-${newestDay}`));
  } catch {
    // backup dir missing
  }
  return [];
}

export default async function systemRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAdmin);

  // the restore upload is a raw .json.gz body; hand it to the route untouched
  app.addContentTypeParser(
    'application/gzip',
    { parseAs: 'buffer', bodyLimit: MAX_RESTORE_BYTES },
    (_req, body, done) => done(null, body),
  );

  app.get('/status', async () => {
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      // db down; report it
    }

    let disk: { freeMb: number; totalMb: number } | null = null;
    try {
      const s = await statfs(config.backupDir);
      disk = {
        freeMb: Math.round((s.bavail * s.bsize) / 1_048_576),
        totalMb: Math.round((s.blocks * s.bsize) / 1_048_576),
      };
    } catch {
      // backup dir may not exist yet
    }

    let lastBackup: BackupResult | null = null;
    try {
      lastBackup = JSON.parse(
        await readFile(path.join(config.backupDir, LAST_BACKUP_FILE), 'utf8'),
      ) as BackupResult;
    } catch {
      // no backup yet
    }

    let backupFiles: { name: string; sizeKb: number }[] = [];
    try {
      const names = (await readdir(config.backupDir))
        .filter((n) => n.startsWith('friseur-'))
        .sort()
        .reverse()
        .slice(0, 9);
      backupFiles = await Promise.all(
        names.map(async (name) => ({
          name,
          sizeKb: Math.round((await stat(path.join(config.backupDir, name))).size / 1024),
        })),
      );
    } catch {
      // ignore
    }

    return {
      uptimeSeconds: Math.round(process.uptime()),
      dbOk,
      disk,
      lastBackup,
      backupFiles,
      backupRunning: isBackupRunning(),
      mailConfigured: mailConfigured(),
      errors: recentErrors(),
    };
  });

  app.post('/backup', async (req) => {
    if (isBackupRunning()) throw new HttpError(409, 'backup_already_running');
    const result = await runBackup({
      info: (m) => req.log.info(m),
      error: (m) => req.log.error(m),
    });
    return { result };
  });

  /**
   * One-tap backup download for the owner: the whole latest set as a single zip.
   * Files are already compressed (dump/xlsx/gz), so store them instead of
   * burning CPU on a small VPS.
   */
  app.get('/backup/latest.zip', async (req, reply) => {
    const files = await latestBackupFiles();
    if (files.length === 0) throw new HttpError(404, 'no_backup');

    const day = files[0].slice('friseur-'.length, 'friseur-'.length + 10);
    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.on('warning', (e) => req.log.warn(`backup zip: ${e.message}`));
    archive.on('error', (e) => {
      req.log.error(`backup zip: ${e.message}`);
      archive.destroy();
    });
    for (const name of files) archive.file(path.join(config.backupDir, name), { name });
    void archive.finalize();

    return reply
      .type('application/zip')
      .header('Content-Disposition', `attachment; filename="friseur-backup-${day}.zip"`)
      .send(archive);
  });

  app.get('/backup/file/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    // the regex is the whole guard: no separators, no traversal, no other files
    if (!BACKUP_FILE_RE.test(name)) throw new HttpError(400, 'validation');
    const file = path.join(config.backupDir, name);
    try {
      await access(file);
    } catch {
      throw new HttpError(404, 'not_found');
    }
    return reply
      .type('application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${name}"`)
      .send(createReadStream(file));
  });

  /**
   * Archive of a period: the same restorable JSON as the nightly backup but
   * limited to the chosen days, plus its Excel sheet. Generated on the fly and
   * never stored, so it costs no disk and cannot be mistaken for the daily
   * backup that guards the cleanup below.
   */
  app.get('/archive/preview', async (req) => summarize(parseRange(req.query).range));

  app.get('/archive.zip', async (req, reply) => {
    const { range, label } = parseRange(req.query);
    if ((await prisma.session.count({ where: sessionWhere(range) })) === 0) {
      throw new HttpError(404, 'no_records');
    }

    const base = `friseur-archive-${label}`;
    const [json, workbook] = await Promise.all([buildJsonExport(range), buildWorkbook(range)]);
    const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());

    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.on('warning', (e) => req.log.warn(`archive zip: ${e.message}`));
    archive.on('error', (e) => {
      req.log.error(`archive zip: ${e.message}`);
      archive.destroy();
    });
    archive.append(json, { name: `${base}.json.gz` });
    archive.append(xlsx, { name: `${base}.xlsx` });
    void archive.finalize();

    return reply
      .type('application/zip')
      .header('Content-Disposition', `attachment; filename="${base}.zip"`)
      .send(archive);
  });

  /**
   * Restore from a JSON backup the admin downloaded earlier (daily backup or
   * period archive). Insert-only, so it can add back what is missing but never
   * overwrite or delete what is there.
   */
  app.post('/restore', { bodyLimit: MAX_RESTORE_BYTES }, async (req) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new HttpError(400, 'invalid_backup_file', 'Empty or unreadable file.');
    }
    const dump = parseJsonBackup(req.body);
    const summary = await importJsonBackup(dump, (msg) => req.log.info(`restore: ${msg}`));
    req.log.warn(`restore: ${summary.added.total} rows added from backup ${summary.exportedAt}`);
    return summary;
  });

  /**
   * Retention cleanup. Deleting years of history is the most destructive thing
   * the panel can do, so it is two guarded steps: preview what goes, then
   * delete - and only if a backup exists that was taken minutes ago.
   */
  app.get('/cleanup/preview', async (req) => {
    const { before } = z.object({ before: z.string().regex(DATE_RE) }).parse(req.query);
    return {
      ...(await summarize({ to: startOfDayUtc(before, config.salonTz) })),
      backupFresh: await hasFreshBackup(),
    };
  });

  app.post('/cleanup', async (req) => {
    const { before, confirm } = z
      .object({ before: z.string().regex(DATE_RE), confirm: z.literal('DELETE') })
      .parse(req.body);

    // the UI makes the admin download it first; the server insists it exists
    if (!(await hasFreshBackup())) throw new HttpError(400, 'backup_required');

    const cutoff = startOfDayUtc(before, config.salonTz);
    const [items, sessions] = await prisma.$transaction([
      prisma.sessionItem.deleteMany({ where: { session: { startedAt: { lt: cutoff } } } }),
      prisma.session.deleteMany({ where: { startedAt: { lt: cutoff } } }),
    ]);
    req.log.warn(`cleanup: deleted ${sessions.count} sessions before ${before}`);
    return { deletedSessions: sessions.count, deletedItems: items.count };
  });

  app.post('/test-mail', async () => {
    if (!mailConfigured()) throw new HttpError(400, 'mail_not_configured');
    const result = await sendMail({
      subject: 'Friseur – test mail',
      text: 'This is a test mail. Alerts and backup mails will arrive at this address.',
    });
    if (!result.sent) throw new HttpError(502, 'mail_send_failed');
    return { ok: true };
  });
}
