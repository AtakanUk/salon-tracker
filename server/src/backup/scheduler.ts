import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { addDaysStr, dayKey, startOfDayUtc } from '../lib/dates.js';
import { LAST_BACKUP_FILE, runBackup } from './job.js';

const BACKUP_HOUR = 3; // 03:00 salon time
const CATCH_UP_AFTER_MS = 25 * 3600_000;
const CATCH_UP_DELAY_MS = 5 * 60_000;

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

function msUntilNextRun(): number {
  const now = Date.now();
  const today = dayKey(new Date(), config.salonTz);
  let runAt = startOfDayUtc(today, config.salonTz).getTime() + BACKUP_HOUR * 3600_000;
  if (runAt <= now) {
    runAt = startOfDayUtc(addDaysStr(today, 1), config.salonTz).getTime() + BACKUP_HOUR * 3600_000;
  }
  return runAt - now;
}

async function lastBackupAgeMs(): Promise<number | null> {
  try {
    const raw = await readFile(path.join(config.backupDir, LAST_BACKUP_FILE), 'utf8');
    const parsed = JSON.parse(raw) as { startedAt?: string };
    if (!parsed.startedAt) return null;
    return Date.now() - new Date(parsed.startedAt).getTime();
  } catch {
    return null;
  }
}

/** Nightly backup at 03:00 salon time + a catch-up run if the last one is stale. */
export function startBackupScheduler(log: Logger) {
  const scheduleNext = () => {
    const delay = msUntilNextRun();
    log.info(`next backup in ${Math.round(delay / 60_000)} min`);
    setTimeout(async () => {
      try {
        await runBackup(log);
      } catch (e) {
        log.error(`scheduled backup failed: ${e instanceof Error ? e.message : e}`);
      }
      scheduleNext();
    }, delay).unref();
  };
  scheduleNext();

  // catch-up: server was off during the scheduled window
  (async () => {
    const age = await lastBackupAgeMs();
    if (age === null || age > CATCH_UP_AFTER_MS) {
      log.info('last backup is stale or missing, catch-up backup in 5 min');
      setTimeout(() => {
        runBackup(log).catch((e) =>
          log.error(`catch-up backup failed: ${e instanceof Error ? e.message : e}`),
        );
      }, CATCH_UP_DELAY_MS).unref();
    }
  })();
}
