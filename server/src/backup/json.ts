import { gzipSync } from 'node:zlib';
import { prisma } from '../lib/prisma.js';
import { itemWhere, sessionWhere, type ExportRange } from './range.js';

/**
 * Raw dump of all tables as gzipped JSON. Machine-readable disaster copy:
 * backup/import.ts can merge missing records back into a live database (by id),
 * unlike a pg_dump which replaces everything.
 *
 * With a range only the sessions of that window are exported - the archive of a
 * period. Users and services always come along in full: they are the parents of
 * those sessions, so without them the file could not be imported back, and both
 * tables are tiny.
 */
export async function buildJsonExport(range?: ExportRange): Promise<Buffer> {
  const [users, services, sessions, sessionItems] = await Promise.all([
    prisma.user.findMany({ orderBy: { id: 'asc' } }),
    prisma.service.findMany({ orderBy: { id: 'asc' } }),
    prisma.session.findMany({ where: sessionWhere(range), orderBy: { id: 'asc' } }),
    prisma.sessionItem.findMany({ where: itemWhere(range), orderBy: { id: 'asc' } }),
  ]);
  const payload = {
    format: 1,
    exportedAt: new Date().toISOString(),
    range: range?.from || range?.to
      ? { from: range.from?.toISOString() ?? null, to: range.to?.toISOString() ?? null }
      : null,
    users,
    services,
    sessions,
    sessionItems,
  };
  return gzipSync(Buffer.from(JSON.stringify(payload)));
}
