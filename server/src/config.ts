import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || '',
  salonTz: process.env.SALON_TZ || 'Europe/Berlin',
  isProd: process.env.NODE_ENV === 'production',
  // works from both src/ (dev) and dist/ (build) since each is one level under server/
  webDist: process.env.WEB_DIST || path.resolve(here, '../../web/dist'),
  logPretty: process.env.LOG_PRETTY === '1',
  backupDir: process.env.BACKUP_DIR || path.resolve(here, '../../backups'),
  pgDump: process.env.PG_DUMP_PATH || 'pg_dump',
  databaseUrl: process.env.DATABASE_URL || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  mailFrom: process.env.MAIL_FROM || '',
  alertTo: process.env.ALERT_TO || '',
};

if (!config.jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}
