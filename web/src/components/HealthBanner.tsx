import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { systemWarnings } from '../lib/health';
import type { SystemStatus } from '../lib/types';

/** Disk usage and backup age move slowly; five minutes is often enough. */
const POLL_MS = 5 * 60_000;

/**
 * Sits above every admin page and stays completely silent while things are
 * fine. There is no dismiss button on purpose: a warning that can be closed
 * gets closed and forgotten, and these are exactly the problems nobody
 * notices on their own - a disk filling up, a nightly backup that quietly
 * stopped running.
 */
export default function HealthBanner() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api<SystemStatus>('/system/status')
        .then((s) => !cancelled && setStatus(s))
        // a failed poll is not itself worth a banner; the next one will tell
        .catch(() => {});
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const warnings = status ? systemWarnings(status) : [];
  if (warnings.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-4">
      {warnings.map((w) => (
        <div
          key={w.key}
          className={`rounded-xl border p-3 text-sm font-medium flex items-center justify-between gap-3 flex-wrap ${
            w.level === 'crit'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <span>
            {w.level === 'crit' ? '⛔' : '⚠️'} {t(`system.${w.key}`, { ...w.vars })}
          </span>
          <Link
            to="/admin/system"
            className="underline underline-offset-2 font-semibold shrink-0"
          >
            {t('system.warnOpen')}
          </Link>
        </div>
      ))}
    </div>
  );
}
