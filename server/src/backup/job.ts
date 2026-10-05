import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { dayKey } from '../lib/dates.js';
import { mailConfigured, sendMail } from '../lib/mailer.js';
import { buildWorkbook } from './excel.js';
import { buildJsonExport } from './json.js';

const RETENTION_DAYS = 60;
/** The only file names the backup layer ever produces - also used to validate downloads. */
export const BACKUP_FILE_RE = /^friseur-\d{4}-\d{2}-\d{2}\.(dump|xlsx|json\.gz)$/;

interface StepResult {
  ok: boolean;
  error?: string;
}

export interface BackupResult {
  startedAt: string;
  finishedAt: string;
  ok: boolean; // true when the data exports (excel + json) succeeded
  files: string[];
  dump: StepResult;
  excel: StepResult;
  json: StepResult;
  mail: { sent: boolean; error?: string };
  deletedOld: number;
}

export const LAST_BACKUP_FILE = 'last-backup.json';

let running = false;
export const isBackupRunning = () => running;

function runPgDump(outPath: string): Promise<StepResult> {
  return new Promise((resolve) => {
    const child = spawn(config.pgDump, [
      '--format=custom',
      '--no-owner',
      `--dbname=${config.databaseUrl}`,
      `--file=${outPath}`,
    ]);
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (e) => resolve({ ok: false, error: `pg_dump: ${e.message}` }));
    child.on('exit', (code) =>
      resolve(code === 0 ? { ok: true } : { ok: false, error: `pg_dump exit ${code}: ${stderr.slice(0, 300)}` }),
    );
  });
}

async function fileSizeKb(p: string): Promise<number> {
  try {
    return Math.round((await stat(p)).size / 1024);
  } catch {
    return 0;
  }
}

/** "friseur-2026-08-19.xlsx" -> "2026-08-19" */
const dayOf = (name: string) => name.slice('friseur-'.length, 'friseur-'.length + 10);

/**
 * Daily backups live for RETENTION_DAYS; one set from every month is kept for
 * good, so a problem noticed months later still has a point to return to. A
 * month's set is a few tens of KB - next to nothing against the disk.
 *
 * The keeper is the oldest day still on disk for that month, not "the 1st":
 * if the server was down that night no backup exists for it, and a rule tied
 * to the 1st would throw the whole month away. Once the rest of the month is
 * gone the keeper is the only day left, so later runs pick it again.
 *
 * Exported without its file system: the rule is the part worth checking.
 */
export function expiredBackups(names: string[], cutoff: string): string[] {
  const kept = names.filter((n) => BACKUP_FILE_RE.test(n));

  const keeper = new Map<string, string>(); // "2026-08" -> oldest day present
  for (const name of kept) {
    const day = dayOf(name);
    const month = day.slice(0, 7);
    const current = keeper.get(month);
    if (current === undefined || day < current) keeper.set(month, day);
  }

  return kept.filter((name) => {
    const day = dayOf(name);
    return day < cutoff && keeper.get(day.slice(0, 7)) !== day;
  });
}

async function deleteOldBackups(dir: string): Promise<number> {
  const cutoff = dayKey(new Date(Date.now() - RETENTION_DAYS * 86_400_000), config.salonTz);
  const doomed = expiredBackups(await readdir(dir), cutoff);
  for (const name of doomed) await rm(path.join(dir, name), { force: true });
  return doomed.length;
}

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

/**
 * Nightly (or on-demand) backup: pg_dump + Excel + JSON into BACKUP_DIR,
 * prune old files, email the result. Steps are independent: a missing
 * pg_dump binary (local dev) does not stop the Excel/JSON exports.
 */
export async function runBackup(log?: Logger): Promise<BackupResult> {
  if (running) throw new Error('backup_already_running');
  running = true;
  const startedAt = new Date().toISOString();
  try {
    const dir = config.backupDir;
    await mkdir(dir, { recursive: true });
    const day = dayKey(new Date(), config.salonTz);
    const base = `friseur-${day}`;
    const dumpPath = path.join(dir, `${base}.dump`);
    const xlsxPath = path.join(dir, `${base}.xlsx`);
    const jsonPath = path.join(dir, `${base}.json.gz`);

    const dump = await runPgDump(dumpPath);
    if (!dump.ok) log?.error(`backup: ${dump.error}`);

    let excel: StepResult;
    try {
      const wb = await buildWorkbook();
      await wb.xlsx.writeFile(xlsxPath);
      excel = { ok: true };
    } catch (e) {
      excel = { ok: false, error: e instanceof Error ? e.message : String(e) };
      log?.error(`backup excel: ${excel.error}`);
    }

    let json: StepResult;
    try {
      await writeFile(jsonPath, await buildJsonExport());
      json = { ok: true };
    } catch (e) {
      json = { ok: false, error: e instanceof Error ? e.message : String(e) };
      log?.error(`backup json: ${json.error}`);
    }

    const deletedOld = await deleteOldBackups(dir);

    const files: string[] = [];
    const attachments: { filename: string; path: string }[] = [];
    for (const [step, p] of [
      [dump, dumpPath],
      [excel, xlsxPath],
      [json, jsonPath],
    ] as const) {
      if (step.ok) {
        files.push(path.basename(p));
        attachments.push({ filename: path.basename(p), path: p });
      }
    }

    const ok = excel.ok && json.ok;
    const lines = [
      `Friseur backup report – ${day}`,
      '',
      `Database dump: ${dump.ok ? `OK (${await fileSizeKb(dumpPath)} KB)` : `FAILED – ${dump.error}`}`,
      `Excel file:    ${excel.ok ? `OK (${await fileSizeKb(xlsxPath)} KB)` : `FAILED – ${excel.error}`}`,
      `JSON export:   ${json.ok ? `OK (${await fileSizeKb(jsonPath)} KB)` : `FAILED – ${json.error}`}`,
      `Old files removed: ${deletedOld}`,
      '',
      `The files are attached and kept on the server for ${RETENTION_DAYS} days;`,
      'one backup per month is kept for good.',
    ];
    const mail = mailConfigured()
      ? await sendMail({
          subject: `Friseur backup – ${day} (${ok && dump.ok ? 'OK' : 'PROBLEM'})`,
          text: lines.join('\n'),
          attachments,
        })
      : { sent: false, error: 'mail_not_configured' };
    if (!mail.sent) log?.info(`backup mail not sent: ${mail.error}`);

    const result: BackupResult = {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok,
      files,
      dump,
      excel,
      json,
      mail,
      deletedOld,
    };
    await writeFile(path.join(dir, LAST_BACKUP_FILE), JSON.stringify(result, null, 2));
    log?.info(`backup finished: ok=${result.ok} dump=${dump.ok} mail=${mail.sent}`);
    return result;
  } finally {
    running = false;
  }
}
