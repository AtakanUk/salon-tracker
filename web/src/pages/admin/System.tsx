import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { dateInputValue, euros, fmtDate, fmtDateTime } from '../../lib/format';
import { DISK_WARN_PCT, diskUsedPct } from '../../lib/health';
import type { SystemStatus } from '../../lib/types';
import { Badge, Button, Card, ErrorText, Spinner, TextInput } from '../../components/ui';

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
  label,
  ok,
  value,
  sub,
}: {
  label: string;
  ok: boolean | null;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {ok !== null && (
          <span
            className={`w-3 h-3 rounded-full inline-block ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
          />
        )}
      </div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value}</div>
      {sub && <div className="text-sm text-slate-500 mt-0.5">{sub}</div>}
    </Card>
  );
}

export default function System() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [busy, setBusy] = useState<'backup' | 'mail' | 'cleanup' | 'restore' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const uptimeH = Math.floor(status.uptimeSeconds / 3600);
  const uptimeM = Math.floor((status.uptimeSeconds % 3600) / 60);
  const diskPct = diskUsedPct(status.disk);
  const lb = status.lastBackup;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-slate-800">{t('system.title')}</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={refresh}>
            {t('system.refresh')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null || !status.mailConfigured}
            onClick={() => act('mail')}
          >
            {t('system.testMail')}
          </Button>
        </div>
      </div>
      {notice && <p className="text-sm font-medium text-emerald-700">{notice}</p>}
      <ErrorText code={error} />

      {/* the owner's daily routine lives here, so it gets the primary spot */}
      <Card className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="grow">
          <h2 className="font-bold text-slate-800">{t('system.dailyBackup')}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{t('system.backupHint')}</p>
        </div>
        <Button
          size="lg"
          className="shrink-0"
          disabled={busy !== null || status.backupRunning}
          onClick={() => act('backup')}
        >
          {busy === 'backup' || status.backupRunning
            ? t('system.backupRunning')
            : `⬇ ${t('system.backupDownload')}`}
        </Button>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          label={t('system.app')}
          ok
          value={t('system.running')}
          sub={`${uptimeH} sa ${uptimeM} dk ${t('system.uptime')}`}
        />
        <StatusCard
          label={t('system.db')}
          ok={status.dbOk}
          value={status.dbOk ? t('system.running') : t('system.problem')}
        />
        <StatusCard
          label={t('system.disk')}
          ok={diskPct !== null ? diskPct < DISK_WARN_PCT : null}
          value={diskPct !== null ? `%${diskPct}` : '–'}
          sub={
            status.disk
              ? `${(status.disk.freeMb / 1024).toFixed(1)} GB ${t('system.free')}`
              : undefined
          }
        />
        <StatusCard
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
      <Card>
        <h2 className="font-bold text-slate-800">{t('system.archive')}</h2>
        <p className="text-sm text-slate-500 mt-0.5 mb-3">{t('system.archiveHint')}</p>

        <div className="flex items-end gap-2 flex-wrap">
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1">
              {t('dashboard.from')}
            </span>
            <TextInput
              type="date"
              value={archFrom}
              max={dateInputValue(new Date())}
              onChange={(e) => setArchFrom(e.target.value)}
              className="!w-auto"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1">
              {t('dashboard.to')}
            </span>
            <TextInput
              type="date"
              value={archTo}
              max={dateInputValue(new Date())}
              onChange={(e) => setArchTo(e.target.value)}
              className="!w-auto"
            />
          </label>
          <Button
            disabled={!archPreview || archPreview.sessionCount === 0}
            onClick={() => download(`/api/system/archive.zip?${rangeQuery(archFrom, archTo)}`)}
          >
            ⬇ {t('system.archiveDownload')}
          </Button>
        </div>

        {archPreview &&
          (archPreview.sessionCount === 0 ? (
            <p className="text-sm text-slate-500 mt-3">{t('system.archiveNothing')}</p>
          ) : (
            <p className="text-sm mt-3">
              <span className="font-semibold text-slate-700">
                {t('system.archiveCount', { count: archPreview.sessionCount })} ·{' '}
                {euros(archPreview.revenueCents, lang)}
              </span>
              {archPreview.oldestAt && archPreview.newestAt && (
                <span className="text-slate-500">
                  {' '}
                  · {fmtDate(archPreview.oldestAt, lang)} – {fmtDate(archPreview.newestAt, lang)}
                </span>
              )}
            </p>
          ))}
      </Card>

      {/* retention cleanup — the most destructive action in the panel */}
      <Card>
        <h2 className="font-bold text-slate-800">{t('system.cleanup')}</h2>
        <p className="text-sm text-slate-500 mt-0.5 mb-3">{t('system.cleanupHint')}</p>

        <div className="flex items-end gap-2 flex-wrap">
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1">
              {t('system.cleanupBefore')}
            </span>
            <TextInput
              type="date"
              value={cleanupDate}
              max={dateInputValue(new Date())}
              onChange={(e) => previewCleanup(e.target.value)}
              className="!w-auto"
            />
          </label>
        </div>

        {preview && (
          <div className="mt-3">
            {preview.sessionCount === 0 ? (
              <p className="text-sm text-slate-500">{t('system.cleanupNothing')}</p>
            ) : (
              <>
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                  <div className="font-semibold">
                    {t('system.cleanupCount', { count: preview.sessionCount })} ·{' '}
                    {euros(preview.revenueCents, lang)}
                  </div>
                  {preview.oldestAt && preview.newestAt && (
                    <div className="text-red-600">
                      {fmtDateTime(preview.oldestAt, lang)} – {fmtDateTime(preview.newestAt, lang)}
                    </div>
                  )}
                  <button
                    type="button"
                    className="mt-2 font-semibold underline underline-offset-2"
                    onClick={() =>
                      download(
                        `/api/system/archive.zip?${rangeQuery('', dayBefore(cleanupDate))}`,
                      )
                    }
                  >
                    ⬇ {t('system.archiveThisPeriod')}
                  </button>
                </div>

                <ol className="mt-3 flex flex-col gap-2 text-sm">
                  <li className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-700">1.</span>
                    <span className="text-slate-600">{t('system.cleanupStep1')}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => act('backup')}
                    >
                      ⬇ {t('system.backupDownload')}
                    </Button>
                    {downloaded && <span className="text-emerald-700 font-semibold">✓</span>}
                  </li>
                  <li className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-700">2.</span>
                    <span className="text-slate-600">{t('system.cleanupStep2')}</span>
                    <TextInput
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="DELETE"
                      className="!w-24 uppercase"
                      disabled={!downloaded}
                    />
                  </li>
                </ol>

                <Button
                  variant="danger"
                  className="mt-3"
                  disabled={busy !== null || !downloaded || confirmText.trim().toUpperCase() !== 'DELETE'}
                  onClick={runCleanup}
                >
                  {busy === 'cleanup' ? t('common.loading') : t('system.cleanupDelete')}
                </Button>
              </>
            )}
          </div>
        )}
      </Card>

      {/* restore — putting records back after a loss (or from an old archive) */}
      <Card>
        <h2 className="font-bold text-slate-800">{t('system.restore')}</h2>
        <p className="text-sm text-slate-500 mt-0.5 mb-3">{t('system.restoreHint')}</p>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            key={restoreKey}
            type="file"
            accept=".gz,application/gzip"
            onChange={(e) => {
              setRestoreFile(e.target.files?.[0] ?? null);
              setRestored(null);
            }}
            className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
          />
          <Button disabled={!restoreFile || busy !== null} onClick={runRestore}>
            {busy === 'restore' ? t('common.loading') : t('system.restoreRun')}
          </Button>
        </div>

        {restored && (
          <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
            <div className="font-semibold">
              {restored.added.total === 0
                ? t('system.restoreNone')
                : t('system.restoreDone', { count: restored.added.sessions })}
            </div>
            <div className="text-emerald-700">
              {t('system.restoreDetail', {
                found: restored.found.total,
                users: restored.added.users,
                sessions: restored.added.sessions,
                items: restored.added.items,
              })}
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-bold text-slate-800 mb-2">{t('system.backupFiles')}</h2>
          {status.backupFiles.length === 0 ? (
            <p className="text-sm text-slate-500">{t('system.noBackupYet')}</p>
          ) : (
            <table className="w-full text-sm [font-variant-numeric:tabular-nums]">
              <tbody>
                {status.backupFiles.map((f) => (
                  <tr key={f.name} className="border-b border-slate-100">
                    <td className="py-1.5">
                      <a
                        href={`/api/system/backup/file/${f.name}`}
                        download
                        className="font-mono text-sky-700 hover:underline"
                      >
                        {f.name}
                      </a>
                    </td>
                    <td className="py-1.5 text-right text-slate-500">
                      {f.sizeKb >= 1024 ? `${(f.sizeKb / 1024).toFixed(1)} MB` : `${f.sizeKb} KB`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-3">
            <Badge color={status.mailConfigured ? 'green' : 'amber'}>
              {status.mailConfigured ? t('system.mailOn') : t('system.mailOff')}
            </Badge>
          </div>
        </Card>

        <Card>
          <h2 className="font-bold text-slate-800 mb-2">{t('system.recentErrors')}</h2>
          {status.errors.length === 0 ? (
            <p className="text-sm text-slate-500">{t('system.noErrors')} 🎉</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {status.errors.map((e, i) => (
                <div key={i} className="border-b border-slate-100 py-2 text-sm">
                  <div className="text-slate-500">
                    {fmtDateTime(e.time, lang)} ·{' '}
                    <span className="font-mono">
                      {e.method} {e.url}
                    </span>
                  </div>
                  <div className="text-red-700 break-words">{e.message}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
