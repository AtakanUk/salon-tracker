import type { SystemStatus } from './types';

/**
 * "Is something wrong with the server" lives here alone. The Sistem page and
 * the banner above every admin page both read from it, so the two can never
 * disagree about the same disk.
 */

export const DISK_WARN_PCT = 85;
export const DISK_CRIT_PCT = 95;

/** ops/watchdog.sh mails at the same age; the panel should not contradict it. */
export const BACKUP_STALE_HOURS = 26;

export interface Warning {
  /** i18n key under `system.` */
  key: string;
  level: 'warn' | 'crit';
  vars?: Record<string, string | number>;
}

export function diskUsedPct(disk: SystemStatus['disk']): number | null {
  if (!disk || disk.totalMb <= 0) return null;
  return Math.round(((disk.totalMb - disk.freeMb) / disk.totalMb) * 100);
}

export function systemWarnings(status: SystemStatus): Warning[] {
  const out: Warning[] = [];

  if (!status.dbOk) out.push({ key: 'warnDb', level: 'crit' });

  const pct = diskUsedPct(status.disk);
  if (pct !== null && pct >= DISK_CRIT_PCT) {
    out.push({ key: 'warnDiskFull', level: 'crit', vars: { pct } });
  } else if (pct !== null && pct >= DISK_WARN_PCT) {
    out.push({ key: 'warnDisk', level: 'warn', vars: { pct } });
  }

  const last = status.lastBackup;
  if (!last) {
    out.push({ key: 'warnBackupMissing', level: 'warn' });
  } else if (!last.ok || !last.dump.ok) {
    out.push({ key: 'warnBackupFailed', level: 'warn' });
  } else {
    const hours = (Date.now() - new Date(last.finishedAt).getTime()) / 3_600_000;
    // the threshold is just over a day, so "1 day" is the smallest thing it says
    if (hours > BACKUP_STALE_HOURS) {
      out.push({ key: 'warnBackupStale', level: 'warn', vars: { days: Math.round(hours / 24) } });
    }
  }

  return out;
}
