/**
 * Restores missing records from a JSON backup into the live database.
 * Existing rows are never touched (see backup/import.ts).
 *
 * Usage: node server/dist/tools/import-json.js /backups/friseur-2026-07-14.json.gz
 * From the menu: friseur → 8
 */
import { readFile } from 'node:fs/promises';
import { importJsonBackup, parseJsonBackup } from '../backup/import.js';
import { prisma } from '../lib/prisma.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node server/dist/tools/import-json.js <friseur-YYYY-MM-DD.json.gz>');
  process.exit(1);
}

async function main() {
  const dump = parseJsonBackup(await readFile(file));
  console.log(`Backup taken: ${dump.exportedAt}`);
  const summary = await importJsonBackup(dump, (msg) => console.log(msg));
  console.log(`Done: ${summary.added.total} missing rows restored in total.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
