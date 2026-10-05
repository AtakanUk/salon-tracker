import { buildApp } from './app.js';
import { config } from './config.js';
import { startBackupScheduler } from './backup/scheduler.js';

const app = await buildApp();

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

startBackupScheduler({
  info: (m) => app.log.info(m),
  error: (m) => app.log.error(m),
});
