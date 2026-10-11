import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { ArrowRight, Warning, WarningOctagon } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { systemWarnings } from '../lib/health';
import type { SystemStatus } from '../lib/types';
import { EASE_OUT } from './ui';

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
    <div className="flex flex-col gap-2 mb-5">
      {warnings.map((w, i) => (
        <motion.div
          key={w.key}
          role="alert"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT, delay: i * 0.06 }}
          className={`rounded-2xl p-3 pl-3.5 text-[14px] font-medium flex items-center justify-between gap-3 flex-wrap ${
            w.level === 'crit' ? 'bg-danger-soft text-danger-text' : 'bg-warn-soft text-warn-text'
          }`}
        >
          <span className="flex items-center gap-2.5">
            {w.level === 'crit' ? (
              <WarningOctagon size={20} weight="fill" className="shrink-0" />
            ) : (
              <Warning size={20} weight="fill" className="shrink-0" />
            )}
            {t(`system.${w.key}`, { ...w.vars })}
          </span>
          <Link
            to="/admin/system"
            className="group inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface/70 font-semibold shrink-0 hover:bg-surface transition-colors"
          >
            {t('system.warnOpen')}
            <ArrowRight size={14} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
