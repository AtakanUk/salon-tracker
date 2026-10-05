import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { api, ApiError } from '../lib/api';
import { serverNow, syncClock } from '../lib/clock';
import { fmtTime } from '../lib/format';
import type { Board, PickedItem, Service, Session } from '../lib/types';
import { Button, Card, ErrorText, FullScreenSpinner, LangSwitch, Modal } from '../components/ui';
import ChangePasswordModal from '../components/ChangePasswordModal';
import ServicePicker from '../components/ServicePicker';
import { useWakeLock } from '../hooks/useWakeLock';

function Elapsed({ since }: { since: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // serverNow(), not Date.now(): a device clock running behind the server would
  // pin this at 0:00 for the whole difference before the seconds started moving
  const secs = Math.max(0, Math.floor((serverNow() - new Date(since).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return <>{h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}</>;
}

const errCode = (e: unknown) => (e instanceof ApiError ? e.code : 'generic');

/**
 * Start / finish, and nothing else. Customers stand in front of this tablet,
 * so it shows no prices, no revenue and no customer count - those are on the
 * "my day" screen (MyDay.tsx), one tap away. The only prices anyone sees here
 * are in the picker the employee opens to finish a customer.
 */
export default function Work() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user, logout } = useAuth();

  const [board, setBoard] = useState<Board | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState<Session | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Session | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  /** Board only - what every button press needs. */
  const refreshBoard = useCallback(async () => {
    try {
      const b = await api<Board>('/sessions/board');
      syncClock(b.now);
      setBoard(b);
      setError(null);
    } catch (e) {
      setError(errCode(e));
    }
  }, []);

  /**
   * Board + price list. The price list changes maybe once a month, so it is
   * fetched on mount and when the tablet wakes - never on the critical path of
   * a button press, where it used to add a whole round trip.
   */
  const refresh = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([
        api<Board>('/sessions/board'),
        api<{ services: Service[] }>('/services'),
      ]);
      syncClock(b.now);
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

  // tablets sleep and wake all day long: refetch whenever the app comes back
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refresh]);

  useWakeLock(!!board?.active);

  const run = async (fn: () => Promise<unknown>, onError?: (code: string) => void) => {
    setBusy(true);
    try {
      await fn();
      await refreshBoard();
      return true;
    } catch (e) {
      (onError ?? setError)(errCode(e));
      await refreshBoard();
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Not run() on purpose. Starting a customer changes exactly one thing on the
   * board - the active session - and the response already carries it. So the
   * timer can appear after a single round trip instead of waiting for a board
   * refetch on top.
   */
  const start = async () => {
    setBusy(true);
    try {
      const { session, now } = await api<{ session: Session; now: string }>('/sessions/start', {
        method: 'POST',
      });
      syncClock(now);
      setBoard((b) => (b ? { ...b, active: session } : b));
      setError(null);
    } catch (e) {
      // e.g. another tab already started one: fall back to what the server says
      setError(errCode(e));
      await refreshBoard();
    } finally {
      setBusy(false);
    }
  };

  const finish = async (items: PickedItem[]) => {
    if (!finishing) return;
    setPickerError(null);
    const id = finishing.id;
    const ok = await run(
      () => api(`/sessions/${id}/finish`, { method: 'POST', body: { items } }),
      setPickerError,
    );
    if (ok) setFinishing(null);
  };

  const cancelSession = async () => {
    if (!confirmCancel) return;
    const id = confirmCancel.id;
    await run(() => api(`/sessions/${id}/cancel`, { method: 'POST' }));
    // closed either way: a failure is written on the page, which this dialog
    // would otherwise sit on top of
    setConfirmCancel(null);
  };

  if (!board) return <FullScreenSpinner />;

  const active = board.active;

  return (
    <div className="min-h-dvh flex flex-col max-w-3xl mx-auto p-4-safe gap-4">
      {/* header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xl font-bold text-slate-800">✂️ {user?.name}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/work/today"
            className="px-3 py-1.5 text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-700"
          >
            📋 {t('work.myDay')}
          </Link>
          {user?.role === 'ADMIN' && (
            <Link
              to="/admin"
              className="px-3 py-1.5 text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-700"
            >
              {t('work.adminPanel')}
            </Link>
          )}
          <LangSwitch />
          <Button variant="ghost" size="sm" onClick={() => setChangingPassword(true)}>
            {t('account.password')}
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            {t('common.logout')}
          </Button>
        </div>
      </div>

      <ErrorText code={error} />

      {/* main area */}
      <div className="grow flex flex-col justify-center gap-4 py-4">
        {active ? (
          <Card className="p-8 text-center border-4 border-emerald-500">
            <div className="text-lg font-semibold text-emerald-700 uppercase tracking-wide">
              {t('work.activeCustomer')}
            </div>
            <div className="text-7xl font-bold text-slate-800 tabular-nums my-4">
              <Elapsed since={active.startedAt} />
            </div>
            <div className="text-slate-500 mb-6">
              {t('work.startedAt')}: {fmtTime(active.startedAt, lang)}
            </div>
            <div className="flex flex-col gap-3">
              <Button
                size="xl"
                className="w-full"
                disabled={busy}
                onClick={() => setFinishing(active)}
              >
                {t('work.finish')}
              </Button>
              <Button
                variant="dangerOutline"
                disabled={busy}
                onClick={() => setConfirmCancel(active)}
              >
                {t('work.cancelSession')}
              </Button>
            </div>
          </Card>
        ) : (
          <Button size="xl" className="w-full py-14" disabled={busy} onClick={start}>
            {busy ? t('work.starting') : t('work.start')}
          </Button>
        )}
      </div>

      {/* finish dialog */}
      {finishing && (
        <ServicePicker
          services={services}
          title={t('work.selectServices')}
          busy={busy}
          error={pickerError}
          onSave={finish}
          onClose={() => {
            setFinishing(null);
            setPickerError(null);
          }}
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

      <ChangePasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />
    </div>
  );
}
