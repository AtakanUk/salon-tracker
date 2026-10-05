import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { api, ApiError } from '../lib/api';
import { euros, fmtTime, itemLabel } from '../lib/format';
import type { Board, PickedItem, Service, Session } from '../lib/types';
import { Button, Card, ErrorText, FullScreenSpinner, Modal } from '../components/ui';
import ServicePicker from '../components/ServicePicker';

const errCode = (e: unknown) => (e instanceof ApiError ? e.code : 'generic');

/**
 * The employee's own day: how many customers, how much revenue, every entry,
 * and the correction of the last one while its 30 minutes last. All of this
 * used to sit on the start/finish screen, which customers can see.
 */
export default function MyDay() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();

  const [board, setBoard] = useState<Board | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState<Session | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Session | null>(null);

  const loadBoard = useCallback(async () => {
    try {
      setBoard(await api<Board>('/sessions/board'));
      setError(null);
    } catch (e) {
      setError(errCode(e));
    }
  }, []);

  /** Board + price list; the price list is only needed to correct an entry. */
  const refresh = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([
        api<Board>('/sessions/board'),
        api<{ services: Service[] }>('/services'),
      ]);
      setBoard(b);
      setServices(s.services);
      setError(null);
    } catch (e) {
      setError(errCode(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>, onError?: (code: string) => void) => {
    setBusy(true);
    try {
      await fn();
      await loadBoard();
      return true;
    } catch (e) {
      (onError ?? setError)(errCode(e));
      await loadBoard();
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveCorrection = async (items: PickedItem[]) => {
    if (!correcting) return;
    setPickerError(null);
    const id = correcting.id;
    const ok = await run(
      () => api(`/sessions/${id}/items`, { method: 'PATCH', body: { items } }),
      setPickerError,
    );
    if (ok) setCorrecting(null);
  };

  /** Only reachable from inside the correction dialog, so that is where a failure is shown. */
  const cancelSession = async () => {
    if (!confirmCancel) return;
    const id = confirmCancel.id;
    const ok = await run(() => api(`/sessions/${id}/cancel`, { method: 'POST' }), setPickerError);
    setConfirmCancel(null);
    if (ok) setCorrecting(null);
  };

  if (!board) return <FullScreenSpinner />;

  const { today } = board;
  // shown on its own only while it can still be corrected; the list has it anyway
  const last = board.lastCompletedEditable && board.lastCompleted?.items ? board.lastCompleted : null;

  return (
    <div className="min-h-dvh flex flex-col max-w-3xl mx-auto p-4-safe gap-4">
      {/* header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          to="/work"
          className="px-3 py-1.5 text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-700"
        >
          ← {t('common.back')}
        </Link>
        <h1 className="text-xl font-bold text-slate-800">
          {t('work.myDay')} · {user?.name}
        </h1>
      </div>

      {/* today's numbers */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="text-center py-3">
          <div className="text-sm text-slate-500 font-medium">
            {t('work.today')} · {t('work.todayCustomers')}
          </div>
          <div className="text-3xl font-bold text-slate-800">{today.count}</div>
        </Card>
        <Card className="text-center py-3">
          <div className="text-sm text-slate-500 font-medium">
            {t('work.today')} · {t('work.todayRevenue')}
          </div>
          <div className="text-3xl font-bold text-slate-800">{euros(today.revenueCents, lang)}</div>
        </Card>
      </div>

      <ErrorText code={error} />

      {/* last entry, correctable for 30 min */}
      {last && (
        <Card className="border-2 border-emerald-500">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-slate-500">
                {t('work.lastSession')} · {fmtTime(last.finishedAt!, lang)}
                {last.editedAt && <span className="ml-2 text-amber-600">({t('work.edited')})</span>}
              </div>
              <div className="text-slate-800 font-semibold mt-1">
                {last.items!.map((i) => itemLabel(i, lang)).join(', ')}
              </div>
              <div className="text-lg font-bold text-slate-800 mt-1">{euros(last.totalCents, lang)}</div>
            </div>
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => setCorrecting(last)}>
              {t('work.correct')}
            </Button>
          </div>
        </Card>
      )}
      <p className="text-center text-sm text-slate-400">{t('work.editableInfo')}</p>

      {/* the whole day, newest first */}
      <Card>
        <div className="font-semibold text-slate-800 mb-1">{t('work.todayList')}</div>
        {today.sessions.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">{t('work.noneToday')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {today.sessions.map((s) => (
              <li key={s.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-slate-500">
                    {fmtTime(s.finishedAt!, lang)}
                    {s.durationMinutes !== null && ` · ${s.durationMinutes} ${t('work.minutes')}`}
                    {s.editedAt && <span className="ml-2 text-amber-600">({t('work.edited')})</span>}
                  </div>
                  <div className="text-slate-800 font-medium">
                    {(s.items ?? []).map((i) => itemLabel(i, lang)).join(', ')}
                  </div>
                </div>
                <div className="font-bold text-slate-800 tabular-nums shrink-0">
                  {euros(s.totalCents, lang)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* correction dialog */}
      {correcting && (
        <ServicePicker
          services={services}
          title={t('work.editLastTitle')}
          initial={correcting.items}
          busy={busy}
          error={pickerError}
          onSave={saveCorrection}
          onClose={() => {
            setCorrecting(null);
            setPickerError(null);
          }}
          extraFooter={
            <Button
              variant="dangerOutline"
              size="lg"
              disabled={busy}
              onClick={() => setConfirmCancel(correcting)}
            >
              {t('work.cancelCompleted')}
            </Button>
          }
        />
      )}

      {/* cancel confirmation */}
      <Modal
        open={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        title={t('work.confirmCancelTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(null)} disabled={busy}>
              {t('common.no')}
            </Button>
            <Button variant="danger" onClick={cancelSession} disabled={busy}>
              {t('common.yes')}
            </Button>
          </>
        }
      >
        <p className="text-slate-600">{t('work.confirmCancelText')}</p>
      </Modal>
    </div>
  );
}
