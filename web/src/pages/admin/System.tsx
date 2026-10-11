import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  ArrowClockwise,
  Check,
  CheckCircle,
  CloudArrowDown,
  Database,
  DownloadSimple,
  EnvelopeSimple,
  FileZip,
  HardDrive,
  Pulse,
  ShieldCheck,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react';
import { api, ApiError } from '../../lib/api';
import { dateInputValue, decimal, euros, fmtDate, fmtDateTime, percent } from '../../lib/format';
import { DISK_CRIT_PCT, DISK_WARN_PCT, diskUsedPct } from '../../lib/health';
import type { SystemStatus } from '../../lib/types';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EASE_OUT,
  EmptyState,
  ErrorText,
  Notice,
  PageHeader,
  Spinner,
  StatusDot,
  TextInput,
  stagger,
} from '../../components/ui';

interface RangePreview {
  sessionCount: number;
  itemCount: number;
  revenueCents: number;
  oldestAt: string | null;
  newestAt: string | null;
}

interface CleanupPreview extends RangePreview {
  backupFresh: boolean;
}

interface TableCounts {
  users: number;
  services: number;
  sessions: number;
  items: number;
  total: number;
}

interface ImportSummary {
  exportedAt: string;
  found: TableCounts;
  added: TableCounts;
}

/** Query string for the archive endpoints; empty ends mean "open". */
function rangeQuery(from: string, to: string): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return params.toString();
}

/** The cleanup deletes everything *before* its date, so the archive ends a day earlier. */
function dayBefore(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10);
}

function StatusCard({
  icon,
  label,
  ok,
  value,
  sub,
  children,
  i,
}: {
  icon: ReactNode;
  label: string;
  ok: boolean | null;
  value: string;
  sub?: string;
  children?: ReactNode;
  i: number;
}) {
  return (
    <Card className="stagger" style={stagger(i)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 text-[14px] font-medium text-ink-2">
          <span className="grid place-items-center size-8 rounded-xl bg-fill text-ink-2">{icon}</span>
          {label}
        </span>
        {ok !== null && <StatusDot tone={ok ? 'go' : 'danger'} pulse />}
      </div>
      <div className="mt-4 text-[22px] font-semibold tracking-[-0.02em] leading-tight text-ink">{value}</div>
      {sub && <div className="text-[13px] text-ink-2 mt-1">{sub}</div>}
      {children}
    </Card>
  );
}

/** One step of the cleanup: its number turns into a check once it is done. */
function Step({ n, done, children }: { n: number; done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 flex-wrap">
      <span
        className={`grid place-items-center size-7 shrink-0 rounded-full text-[13px] font-semibold transition-colors duration-300 ${
          done ? 'bg-go text-white' : 'bg-fill text-ink'
        }`}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={done ? 'done' : 'todo'}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.5, duration: 0.4 }}
          >
            {done ? <Check size={14} weight="bold" /> : n}
          </motion.span>
        </AnimatePresence>
      </span>
      {children}
    </li>
  );
}

export default function System() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [busy, setBusy] = useState<'backup' | 'mail' | 'cleanup' | 'restore' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spin, setSpin] = useState(0);

  // archive of a period: pick two dates -> see what is in them -> download
  const [archFrom, setArchFrom] = useState('');
  const [archTo, setArchTo] = useState('');
  const [archPreview, setArchPreview] = useState<RangePreview | null>(null);

  // retention cleanup: preview -> download a backup -> type DELETE -> delete
  const [cleanupDate, setCleanupDate] = useState('');
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // restore: pick a .json.gz from an earlier backup and merge it back
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restored, setRestored] = useState<ImportSummary | null>(null);
  const [restoreKey, setRestoreKey] = useState(0); // remounts the file input after a run
  const [dragging, setDragging] = useState(false);

  const refresh = useCallback(
    () => api<SystemStatus>('/system/status').then(setStatus).catch(() => {}),
    [],
  );

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!archFrom && !archTo) {
      setArchPreview(null);
      return;
    }
    let cancelled = false;
    api<RangePreview>(`/system/archive/preview?${rangeQuery(archFrom, archTo)}`)
      .then((p) => !cancelled && setArchPreview(p))
      .catch(() => !cancelled && setArchPreview(null));
    return () => {
      cancelled = true;
    };
  }, [archFrom, archTo]);

  /** Takes a fresh backup first, so the file contains today's records too. */
  async function act(kind: 'backup' | 'mail') {
    setBusy(kind);
    setNotice(null);
    setError(null);
    try {
      if (kind === 'backup') {
        await api('/system/backup', { method: 'POST' });
        setNotice(t('system.backupDone'));
        download('/api/system/backup/latest.zip');
        setDownloaded(true); // unlocks the cleanup below
      } else {
        await api('/system/test-mail', { method: 'POST' });
        setNotice(t('system.mailSent'));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'generic');
    } finally {
      setBusy(null);
      refresh();
    }
  }

  function download(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** Insert-only merge on the server; nothing existing can be lost here. */
  async function runRestore() {
    if (!restoreFile) return;
    setBusy('restore');
    setNotice(null);
    setError(null);
    setRestored(null);
    try {
      setRestored(
        await api<ImportSummary>('/system/restore', {
          method: 'POST',
          body: restoreFile,
          contentType: 'application/gzip',
        }),
      );
      setRestoreFile(null);
      setRestoreKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'generic');
    } finally {
      setBusy(null);
      refresh();
    }
  }

  async function previewCleanup(date: string) {
    setCleanupDate(date);
    setPreview(null);
    setError(null);
    if (!date) return;
    try {
      setPreview(await api<CleanupPreview>(`/system/cleanup/preview?before=${date}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'generic');
    }
  }

  async function runCleanup() {
    setBusy('cleanup');
    setNotice(null);
    setError(null);
    try {
      const r = await api<{ deletedSessions: number }>('/system/cleanup', {
        method: 'POST',
        body: { before: cleanupDate, confirm: 'DELETE' },
      });
      setNotice(t('system.cleanupDone', { count: r.deletedSessions }));
      setPreview(null);
      setCleanupDate('');
      setConfirmText('');
      setDownloaded(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'generic');
    } finally {
      setBusy(null);
      refresh();
    }
  }

  if (!status) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="size-7" />
      </div>
    );
  }

  const uptimeH = Math.floor(status.uptimeSeconds / 3600);
  const uptimeM = Math.floor((status.uptimeSeconds % 3600) / 60);
  const diskPct = diskUsedPct(status.disk);
  const lb = status.lastBackup;
  const diskTone = diskPct === null ? '' : diskPct >= DISK_CRIT_PCT ? 'bg-danger' : diskPct >= DISK_WARN_PCT ? 'bg-warn' : 'bg-go';
  const confirmed = confirmText.trim().toUpperCase() === 'DELETE';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('system.title')}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSpin((n) => n + 1);
                refresh();
              }}
            >
              <motion.span
                key={spin}
                initial={{ rotate: 0 }}
                animate={{ rotate: spin ? 360 : 0 }}
                transition={{ duration: 0.7, ease: EASE_OUT }}
                className="inline-flex"
              >
                <ArrowClockwise size={15} weight="bold" />
              </motion.span>
              {t('system.refresh')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null || !status.mailConfigured}
              onClick={() => act('mail')}
            >
              <EnvelopeSimple size={15} weight="bold" />
              {t('system.testMail')}
            </Button>
          </>
        }
      />
      {notice && <Notice key={notice}>{notice}</Notice>}
      <ErrorText code={error} />

      {/* the owner's daily routine lives here, so it gets the primary spot */}
      <Card className="stagger overflow-hidden" padding="p-6 sm:p-7" style={stagger(0)}>
        <div className="absolute -right-20 -top-28 size-80 rounded-full bg-accent/20 blur-3xl animate-breathe pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <span className="grid place-items-center size-14 shrink-0 rounded-2xl bg-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/.25),0_12px_28px_-10px_rgb(0_113_227/.7)]">
            <CloudArrowDown size={28} weight="fill" />
          </span>
          <div className="grow">
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{t('system.dailyBackup')}</h2>
            <p className="text-[15px] text-ink-2 mt-1 max-w-[62ch] text-pretty">{t('system.backupHint')}</p>
          </div>
          <Button
            size="lg"
            className="shrink-0"
            disabled={busy !== null || status.backupRunning}
            onClick={() => act('backup')}
          >
            {busy === 'backup' || status.backupRunning ? (
              <>
                <Spinner className="size-4 border-white/35 border-t-white" />
                {t('system.backupRunning')}
              </>
            ) : (
              <>
                <DownloadSimple size={18} weight="bold" />
                {t('system.backupDownload')}
              </>
            )}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          i={1}
          icon={<Pulse size={18} />}
          label={t('system.app')}
          ok
          value={t('system.running')}
          sub={t('system.uptimeFor', { hours: uptimeH, minutes: uptimeM })}
        />
        <StatusCard
          i={2}
          icon={<Database size={18} />}
          label={t('system.db')}
          ok={status.dbOk}
          value={status.dbOk ? t('system.running') : t('system.problem')}
        />
        <StatusCard
          i={3}
          icon={<HardDrive size={18} />}
          label={t('system.disk')}
          ok={diskPct !== null ? diskPct < DISK_WARN_PCT : null}
          value={diskPct !== null ? percent(diskPct, lang) : '–'}
          sub={
            status.disk ? `${decimal(status.disk.freeMb / 1024, lang)} GB ${t('system.free')}` : undefined
          }
        >
          {diskPct !== null && (
            <div className="mt-3 h-1.5 rounded-full bg-fill overflow-hidden">
              <motion.div
                className={`h-full rounded-full origin-left ${diskTone}`}
                style={{ width: `${diskPct}%` }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1, ease: EASE_OUT, delay: 0.3 }}
              />
            </div>
          )}
        </StatusCard>
        <StatusCard
          i={4}
          icon={<ShieldCheck size={18} />}
          label={t('system.lastBackup')}
          ok={lb ? lb.ok && lb.dump.ok : false}
          value={lb ? fmtDateTime(lb.finishedAt, lang) : t('system.noBackupYet')}
          sub={
            lb
              ? `${t('system.fileCount', { count: lb.files.length })} · ${lb.mail.sent ? t('system.withMail') : t('system.withoutMail')}`
              : undefined
          }
        />
      </div>

      {/* archive of a chosen period — the safe counterpart of the cleanup below */}
      <Card className="stagger" style={stagger(5)}>
        <CardTitle>
          <span className="flex items-center gap-2.5">
            <Archive size={20} className="text-ink-2" />
            {t('system.archive')}
          </span>
        </CardTitle>
        <p className="text-[14px] text-ink-2 -mt-1 mb-4 max-w-[70ch] text-pretty">{t('system.archiveHint')}</p>

        <div className="flex items-end gap-2.5 flex-wrap">
          <label className="block">
            <span className="block text-[13px] font-medium text-ink-2 mb-1.5">{t('dashboard.from')}</span>
            <TextInput
              type="date"
              value={archFrom}
              max={dateInputValue(new Date())}
              onChange={(e) => setArchFrom(e.target.value)}
              className="w-auto!"
            />
          </label>
          <label className="block">
            <span className="block text-[13px] font-medium text-ink-2 mb-1.5">{t('dashboard.to')}</span>
            <TextInput
              type="date"
              value={archTo}
              max={dateInputValue(new Date())}
              onChange={(e) => setArchTo(e.target.value)}
              className="w-auto!"
            />
          </label>
          <Button
            className="min-h-11"
            disabled={!archPreview || archPreview.sessionCount === 0}
            onClick={() => download(`/api/system/archive.zip?${rangeQuery(archFrom, archTo)}`)}
          >
            <DownloadSimple size={16} weight="bold" />
            {t('system.archiveDownload')}
          </Button>
        </div>

        <AnimatePresence mode="wait">
          {archPreview && (
            <motion.p
              key={`${archPreview.sessionCount}-${archPreview.revenueCents}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="text-[14px] mt-4"
            >
              {archPreview.sessionCount === 0 ? (
                <span className="text-ink-2">{t('system.archiveNothing')}</span>
              ) : (
                <>
                  <span className="font-semibold text-ink tabular-nums">
                    {t('system.archiveCount', { count: archPreview.sessionCount })} ·{' '}
                    {euros(archPreview.revenueCents, lang)}
                  </span>
                  {archPreview.oldestAt && archPreview.newestAt && (
                    <span className="text-ink-2">
                      {' '}
                      · {fmtDate(archPreview.oldestAt, lang)} – {fmtDate(archPreview.newestAt, lang)}
                    </span>
                  )}
                </>
              )}
            </motion.p>
          )}
        </AnimatePresence>
      </Card>

      {/* retention cleanup — the most destructive action in the panel */}
      <Card className="stagger border-danger/25!" style={stagger(6)}>
        <CardTitle>
          <span className="flex items-center gap-2.5">
            <span className="grid place-items-center size-8 rounded-xl bg-danger-soft text-danger-text">
              <Trash size={17} weight="bold" />
            </span>
            {t('system.cleanup')}
          </span>
        </CardTitle>
        <p className="text-[14px] text-ink-2 -mt-1 mb-4 max-w-[70ch] text-pretty">{t('system.cleanupHint')}</p>

        <label className="block">
          <span className="block text-[13px] font-medium text-ink-2 mb-1.5">{t('system.cleanupBefore')}</span>
          <TextInput
            type="date"
            value={cleanupDate}
            max={dateInputValue(new Date())}
            onChange={(e) => previewCleanup(e.target.value)}
            className="w-auto!"
          />
        </label>

        <AnimatePresence initial={false}>
          {preview && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <div className="pt-4">
                {preview.sessionCount === 0 ? (
                  <p className="text-[14px] text-ink-2">{t('system.cleanupNothing')}</p>
                ) : (
                  <>
                    <div className="rounded-2xl bg-danger-soft p-4 text-[14px] text-danger-text">
                      <div className="font-semibold tabular-nums">
                        {t('system.cleanupCount', { count: preview.sessionCount })} ·{' '}
                        {euros(preview.revenueCents, lang)}
                      </div>
                      {preview.oldestAt && preview.newestAt && (
                        <div className="opacity-85">
                          {fmtDateTime(preview.oldestAt, lang)} – {fmtDateTime(preview.newestAt, lang)}
                        </div>
                      )}
                      <button
                        type="button"
                        className="mt-2.5 inline-flex items-center gap-1.5 font-semibold underline underline-offset-4 decoration-1 cursor-pointer"
                        onClick={() =>
                          download(`/api/system/archive.zip?${rangeQuery('', dayBefore(cleanupDate))}`)
                        }
                      >
                        <DownloadSimple size={15} weight="bold" />
                        {t('system.archiveThisPeriod')}
                      </button>
                    </div>

                    <ol className="mt-4 flex flex-col gap-3 text-[14px]">
                      <Step n={1} done={downloaded}>
                        <span className="text-ink-2">{t('system.cleanupStep1')}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => act('backup')}
                        >
                          <DownloadSimple size={15} weight="bold" />
                          {t('system.backupDownload')}
                        </Button>
                      </Step>
                      <Step n={2} done={downloaded && confirmed}>
                        <span className="text-ink-2">{t('system.cleanupStep2')}</span>
                        <TextInput
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          placeholder="DELETE"
                          className="w-28! h-9! uppercase font-semibold tracking-wide"
                          disabled={!downloaded}
                        />
                      </Step>
                    </ol>

                    <Button
                      variant="danger"
                      className="mt-4"
                      disabled={busy !== null || !downloaded || !confirmed}
                      onClick={runCleanup}
                    >
                      <Trash size={16} weight="bold" />
                      {busy === 'cleanup' ? t('common.loading') : t('system.cleanupDelete')}
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* restore — putting records back after a loss (or from an old archive) */}
      <Card className="stagger" style={stagger(7)}>
        <CardTitle>
          <span className="flex items-center gap-2.5">
            <UploadSimple size={20} className="text-ink-2" />
            {t('system.restore')}
          </span>
        </CardTitle>
        <p className="text-[14px] text-ink-2 -mt-1 mb-4 max-w-[70ch] text-pretty">{t('system.restoreHint')}</p>

        <div className="flex items-stretch gap-3 flex-col sm:flex-row">
          {/* the input covers the whole box, so a file dropped on it lands in the input */}
          <label
            className={`relative grow flex items-center gap-3.5 rounded-2xl border-[1.5px] border-dashed px-4 py-3.5 cursor-pointer transition-colors duration-200 ${
              dragging
                ? 'border-accent bg-accent-soft'
                : restoreFile
                  ? 'border-accent/50 bg-accent-soft/50'
                  : 'border-line-strong hover:border-ink-3 hover:bg-fill/40'
            }`}
          >
            <input
              key={restoreKey}
              type="file"
              accept=".gz,application/gzip"
              onChange={(e) => {
                setRestoreFile(e.target.files?.[0] ?? null);
                setRestored(null);
                setDragging(false);
              }}
              onDragEnter={() => setDragging(true)}
              onDragLeave={() => setDragging(false)}
              onDrop={() => setDragging(false)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <span className="grid place-items-center size-10 shrink-0 rounded-xl bg-fill text-ink-2">
              <FileZip size={20} />
            </span>
            <span className="min-w-0 text-[14px]">
              {restoreFile ? (
                <>
                  <span className="block font-semibold text-ink truncate">{restoreFile.name}</span>
                  <span className="text-ink-3">{decimal(restoreFile.size / 1024, lang, 0)} KB</span>
                </>
              ) : (
                <span className="text-ink-2">{t('system.chooseFile')}</span>
              )}
            </span>
          </label>
          <Button className="min-h-12 sm:self-center" disabled={!restoreFile || busy !== null} onClick={runRestore}>
            {busy === 'restore' ? t('common.loading') : t('system.restoreRun')}
          </Button>
        </div>

        <AnimatePresence>
          {restored && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
              className="mt-4 flex gap-3 rounded-2xl bg-go-soft p-4 text-[14px] text-go-text"
            >
              <CheckCircle size={20} weight="fill" className="shrink-0 mt-px" />
              <div>
                <div className="font-semibold">
                  {restored.added.total === 0
                    ? t('system.restoreNone')
                    : t('system.restoreDone', { count: restored.added.sessions })}
                </div>
                <div className="opacity-85">
                  {t('system.restoreDetail', {
                    found: restored.found.total,
                    users: restored.added.users,
                    sessions: restored.added.sessions,
                    items: restored.added.items,
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="stagger" style={stagger(8)}>
          <CardTitle
            aside={
              <Badge color={status.mailConfigured ? 'green' : 'amber'} dot>
                {status.mailConfigured ? t('system.mailOn') : t('system.mailOff')}
              </Badge>
            }
          >
            {t('system.backupFiles')}
          </CardTitle>
          {status.backupFiles.length === 0 ? (
            <p className="text-[14px] text-ink-2">{t('system.noBackupYet')}</p>
          ) : (
            <ul className="-mx-2">
              {status.backupFiles.map((f) => (
                <li key={f.name}>
                  <a
                    href={`/api/system/backup/file/${f.name}`}
                    download
                    className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-fill/60 transition-colors"
                  >
                    <FileZip size={18} className="text-ink-3 shrink-0" />
                    {/* file names are data: monospace keeps the dates in them aligned */}
                    <span className="font-mono text-[13px] text-accent-text truncate grow">{f.name}</span>
                    <span className="text-[13px] text-ink-3 tabular-nums shrink-0">
                      {f.sizeKb >= 1024 ? `${(f.sizeKb / 1024).toFixed(1)} MB` : `${f.sizeKb} KB`}
                    </span>
                    <DownloadSimple
                      size={15}
                      weight="bold"
                      className="text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="stagger" style={stagger(9)}>
          <CardTitle>{t('system.recentErrors')}</CardTitle>
          {status.errors.length === 0 ? (
            <EmptyState icon={<CheckCircle size={22} weight="fill" className="text-go-text" />}>
              {t('system.noErrors')}
            </EmptyState>
          ) : (
            <div className="max-h-80 overflow-y-auto -mx-1 px-1">
              {status.errors.map((e, i) => (
                <div key={i} className="border-t border-line first:border-t-0 py-2.5 text-[13px]">
                  <div className="text-ink-3">
                    {fmtDateTime(e.time, lang)} ·{' '}
                    <span className="font-mono text-ink-2">
                      {e.method} {e.url}
                    </span>
                  </div>
                  <div className="text-danger-text break-words mt-0.5">{e.message}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
