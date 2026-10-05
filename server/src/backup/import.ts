/**
 * Merges a JSON backup (friseur-*.json.gz) into the live database: only records
 * whose id does not exist yet are inserted, existing rows are never touched or
 * deleted. Worst case nothing happens - which is what makes it safe to expose
 * as a button in the admin panel.
 *
 * Used by tools/import-json.ts (server) and POST /system/restore (panel).
 */
import { gunzipSync } from 'node:zlib';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/errors.js';

export interface JsonBackup {
  format: number;
  exportedAt: string;
  users: Record<string, unknown>[];
  services: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  sessionItems: Record<string, unknown>[];
}

export interface TableCounts {
  users: number;
  services: number;
  sessions: number;
  items: number;
  total: number;
}

export interface ImportSummary {
  exportedAt: string;
  /** what the file contains */
  found: TableCounts;
  /** what was missing and got inserted */
  added: TableCounts;
}

const counts = (users: number, services: number, sessions: number, items: number): TableCounts => ({
  users,
  services,
  sessions,
  items,
  total: users + services + sessions + items,
});

/**
 * Reads the file the admin picked. The messages matter: people will hand the
 * whole downloaded zip, or the .dump, to this function.
 */
export function parseJsonBackup(buf: Buffer): JsonBackup {
  // "PK" - a zip; both the downloaded backup archive and the .xlsx inside it
  if (buf.length > 1 && buf[0] === 0x50 && buf[1] === 0x4b) {
    throw new HttpError(
      400,
      'zip_selected',
      'This is a zip/Excel file. Pick the .json.gz file inside the backup.',
    );
  }
  let dump: JsonBackup;
  try {
    dump = JSON.parse(gunzipSync(buf).toString()) as JsonBackup;
  } catch {
    throw new HttpError(
      400,
      'invalid_backup_file',
      'The file could not be read; pick the .json.gz file inside the backup.',
    );
  }
  if (dump.format !== 1 || !Array.isArray(dump.sessions)) {
    throw new HttpError(400, 'invalid_backup_file', `Unknown file format: ${dump.format}`);
  }
  return dump;
}

function withDates(rows: Record<string, unknown>[], fields: string[]) {
  return rows.map((row) => {
    const out = { ...row };
    for (const f of fields) {
      if (typeof out[f] === 'string') out[f] = new Date(out[f] as string);
    }
    return out;
  });
}

export async function importJsonBackup(
  dump: JsonBackup,
  log?: (msg: string) => void,
): Promise<ImportSummary> {
  // parents first: users/services -> sessions -> items
  // skipDuplicates: rows whose id already exists are silently left as-is
  const users = await prisma.user.createMany({
    data: withDates(dump.users, ['createdAt', 'deletedAt']) as Prisma.UserCreateManyInput[],
    skipDuplicates: true,
  });
  const services = await prisma.service.createMany({
    data: withDates(dump.services, ['createdAt']) as Prisma.ServiceCreateManyInput[],
    skipDuplicates: true,
  });
  const sessions = await prisma.session.createMany({
    data: withDates(dump.sessions, [
      'startedAt',
      'finishedAt',
      'editedAt',
    ]) as Prisma.SessionCreateManyInput[],
    skipDuplicates: true,
  });
  const items = await prisma.sessionItem.createMany({
    data: dump.sessionItems as Prisma.SessionItemCreateManyInput[],
    skipDuplicates: true,
  });

  // explicit ids bypass the sequences; bump them so new records don't collide
  for (const table of ['User', 'Service', 'Session', 'SessionItem']) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM "${table}"), 1))`,
    );
  }

  const summary: ImportSummary = {
    exportedAt: dump.exportedAt,
    found: counts(
      dump.users.length,
      dump.services.length,
      dump.sessions.length,
      dump.sessionItems.length,
    ),
    added: counts(users.count, services.count, sessions.count, items.count),
  };
  log?.(
    `${summary.found.total} rows in the backup, ${summary.added.total} missing rows added ` +
      `(users ${users.count}, services ${services.count}, sessions ${sessions.count}, items ${items.count})`,
  );
  return summary;
}
