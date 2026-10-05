/** Manual backup, used by the `friseur` menu: docker compose exec app node server/dist/tools/run-backup.js */
import { runBackup } from '../backup/job.js';
import { prisma } from '../lib/prisma.js';

const log = {
  info: (m: string) => console.log(m),
  error: (m: string) => console.error(m),
};

try {
  const result = await runBackup(log);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
