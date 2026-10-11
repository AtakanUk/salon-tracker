import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { GearSix, ListChecks, Play } from '@phosphor-icons/react';
import { useAuth } from '../auth';
import { api, ApiError } from '../lib/api';
import { serverNow, syncClock } from '../lib/clock';
import { fmtTime, intlLocale } from '../lib/format';
import type { Board, PickedItem, Service, Session } from '../lib/types';
import {
  Aurora,
  BrandMark,
  Button,
  EASE_OUT,
  ErrorText,
  FullScreenSpinner,
  Modal,
  StatusDot,
} from '../components/ui';
import AccountMenu, { MenuLink } from '../components/AccountMenu';
import ServicePicker from '../components/ServicePicker';
import { useWakeLock } from '../hooks/useWakeLock';

/** The start button and the running customer are one object that changes shape. */
const MORPH = { type: 'spring', bounce: 0.16, duration: 0.7 } as const;

/** Re-renders once a second while mounted. */
function useSecondTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The running customer as a watch face: the digits count up, and the ring
 * fills once per hour like a minute hand going round, so a long colour or a
 * quick beard trim can be told apart across the room.
 */
function SessionDial({ since }: { since: string }) {
  const { t, i18n } = useTranslation();
  useSecondTick();
  // serverNow(), not Date.now(): a device clock running behind the server would
  // pin this at 0:00 for the whole difference before the seconds started moving
  const secs = Math.max(0, Math.floor((serverNow() - new Date(since).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const lap = (secs % 3600) / 3600;

  return (
    <div className="relative aspect-square w-[min(78vw,46dvh,360px)] shrink-0">
      <div className="absolute inset-[12%] rounded-full bg-go/30 blur-3xl animate-breathe" />
      <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="dial-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#30d158" />
            <stop offset="100%" stopColor="#0fa8a0" />
          </linearGradient>
        </defs>
        {Array.from({ length: 60 }, (_, i) => {
          const major = i % 5 === 0;
          const passed = i / 60 <= lap;
          return (
            <line
              key={i}
              x1={major ? 186 : 189}
              y1="100"
              x2="194"
              y2="100"
              transform={`rotate(${i * 6} 100 100)`}
              strokeWidth={major ? 2 : 1.2}
              strokeLinecap="round"
              className={`transition-[stroke] duration-500 ${passed ? 'stroke-go-text' : 'stroke-line-strong'}`}
            />
          );
        })}
        <circle cx="100" cy="100" r="78" fill="none" strokeWidth="9" className="stroke-fill" />
        <motion.circle
          cx="100"
          cy="100"
          r="78"
          fill="none"
          stroke="url(#dial-arc)"
          strokeWidth="9"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(lap, 0.002) }}
          transition={{ duration: 1, ease: 'linear' }}
        />
        <g
          style={{
            transform: `rotate(${lap * 360}deg)`,
            transformOrigin: '100px 100px',
            transition: 'transform 1s linear',
          }}
        >
          <circle cx="178" cy="100" r="7.5" className="fill-surface" />
          <circle cx="178" cy="100" r="4.5" fill="#30d158" />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          role="timer"
          className="text-[clamp(52px,min(13vw,8.5dvh),84px)] font-extralight tracking-[-0.04em] leading-none tabular-nums text-ink"
        >
          {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}
        </div>
        <div className="mt-3 text-[14px] text-ink-2">
          {t('work.startedAt')} {fmtTime(since, i18n.language)}
        </div>
      </div>
    </div>
  );
}

/** A soft ring spreading from where the finger landed. */
function useRipples() {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const next = useRef(0);
  const add = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const id = next.current++;
    setRipples((list) => [...list, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
  };
  const layer = (
    <span className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
      {ripples.map((p) => (
        <motion.span
          key={p.id}
          className="absolute size-10 -ml-5 -mt-5 rounded-full bg-white/45"
          style={{ left: p.x, top: p.y }}
          initial={{ scale: 0, opacity: 0.6 }}
          animate={{ scale: 40, opacity: 0 }}
          transition={{ duration: 1, ease: EASE_OUT }}
          onAnimationComplete={() => setRipples((list) => list.filter((q) => q.id !== p.id))}
        />
      ))}
    </span>
  );
  return { add, layer };
}

/** A check that draws itself after a customer is saved, then gets out of the way. */
function SavedToast({ show }: { show: boolean }) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-40 grid place-items-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
        >
          <motion.div
            initial={{ scale: 0.6, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: -10 }}
            transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }}
            className="flex flex-col items-center gap-4 rounded-[2rem] bg-raised/85 backdrop-blur-xl border border-line shadow-raised px-12 py-9"
          >
            <span className="grid place-items-center size-20 rounded-full bg-go shadow-[0_12px_32px_-8px_rgb(31_143_69/.7)]">
              <svg viewBox="0 0 24 24" className="size-10" aria-hidden="true">
                <motion.path
                  d="M5 12.5l4.2 4.2L19 7"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.45, delay: 0.15, ease: EASE_OUT }}
                />
              </svg>
            </span>
            <span role="status" className="text-[22px] font-semibold tracking-[-0.02em]">
              {t('work.saved')}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
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
  const { user } = useAuth();

  const [board, setBoard] = useState<Board | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState<Session | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Session | null>(null);
  const [saved, setSaved] = useState(false);
  const ripples = useRipples();

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

  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 1700);
    return () => clearTimeout(id);
  }, [saved]);

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
    if (ok) {
      setFinishing(null);
      setSaved(true);
    }
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
  const today = new Intl.DateTimeFormat(intlLocale(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="relative isolate min-h-dvh overflow-hidden flex flex-col p-4-safe sm:p-6-safe">
      <Aurora />

      <header className="w-full max-w-5xl mx-auto flex items-center justify-between gap-3 animate-enter">
        <div className="flex items-center gap-3 min-w-0">
          <BrandMark className="size-10" />
          <div className="min-w-0">
            <div className="text-[17px] font-semibold tracking-[-0.015em] leading-tight">{t('app.name')}</div>
            <div className="text-[13px] text-ink-2 truncate">{today}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/work/today"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-surface/70 backdrop-blur border border-line shadow-card text-[14px] font-semibold text-ink hover:bg-surface transition-colors"
          >
            <ListChecks size={18} className="text-accent-text" />
            <span className="hidden min-[420px]:inline">{t('work.myDay')}</span>
          </Link>
          <AccountMenu>
            {user?.role === 'ADMIN' && (
              <MenuLink to="/admin" icon={GearSix}>
                {t('work.adminPanel')}
              </MenuLink>
            )}
          </AccountMenu>
        </div>
      </header>

      <div className="w-full max-w-5xl mx-auto">
        <ErrorText code={error} />
      </div>

      <main className="grow grid place-items-center py-6">
        {active ? (
          <motion.div
            key="active"
            layoutId="session"
            transition={MORPH}
            style={{ borderRadius: 40 }}
            className="relative w-full max-w-4xl overflow-hidden bg-surface/80 backdrop-blur-xl border border-go/25 shadow-raised"
          >
            <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-go/12 to-transparent pointer-events-none" />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.2 }}
              className="relative flex flex-col landscape:md:flex-row items-center gap-8 landscape:md:gap-12 p-6 sm:p-10"
            >
              <SessionDial since={active.startedAt} />
              <div className="flex flex-col gap-3 w-full landscape:md:max-w-sm">
                <div className="flex items-center justify-center landscape:md:justify-start gap-2.5 text-[17px] font-semibold text-go-text mb-2">
                  <StatusDot tone="go" pulse />
                  {t('work.activeCustomer')}
                </div>
                <Button size="xl" className="w-full" disabled={busy} onClick={() => setFinishing(active)}>
                  {t('work.finish')}
                </Button>
                <Button
                  variant="dangerOutline"
                  size="lg"
                  className="w-full"
                  disabled={busy}
                  onClick={() => setConfirmCancel(active)}
                >
                  {t('work.cancelSession')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            layoutId="session"
            transition={MORPH}
            style={{ borderRadius: 40 }}
            className="relative w-full max-w-3xl"
          >
            <div className="absolute -inset-3 rounded-[3rem] bg-go/35 blur-3xl animate-breathe pointer-events-none" />
            <button
              type="button"
              disabled={busy}
              onClick={start}
              onPointerDown={ripples.add}
              className="group relative w-full overflow-hidden rounded-[2.5rem] p-[2px] cursor-pointer select-none touch-manipulation transition-transform duration-200 ease-out-expo active:scale-[.985] disabled:cursor-wait"
            >
              {/* a light running round the rim */}
              <span className="absolute inset-[-60%] animate-spin-slow bg-[conic-gradient(from_0deg,transparent_0_58%,rgb(255_255_255/.85)_72%,transparent_86%)]" />
              <span className="relative flex flex-col items-center justify-center gap-6 rounded-[calc(2.5rem-2px)] min-h-[min(48dvh,440px)] px-8 py-14 text-white bg-[linear-gradient(155deg,#2fb457,#1f8f45_52%,#17703a)] shadow-[inset_0_1px_0_rgb(255_255_255/.35)]">
                <motion.span
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', bounce: 0.45, duration: 0.7, delay: 0.1 }}
                  className="grid place-items-center size-24 rounded-full bg-white/20 ring-1 ring-white/35 shadow-[0_10px_30px_-10px_rgb(0_0_0/.35)] transition-transform duration-300 ease-out-expo group-hover:scale-105"
                >
                  <Play size={42} weight="fill" className="translate-x-0.5" />
                </motion.span>
                <span className="text-[clamp(32px,5vw,52px)] font-semibold tracking-[-0.035em] leading-none">
                  {busy ? t('work.starting') : t('work.start')}
                </span>
              </span>
              {ripples.layer}
            </button>
          </motion.div>
        )}
      </main>

      {/* finish dialog */}
      <AnimatePresence>
        {finishing && (
          <ServicePicker
            key="finish"
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
      </AnimatePresence>

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
        <p className="text-[15px] text-ink-2 pb-2">{t('work.confirmCancelText')}</p>
      </Modal>

      <SavedToast show={saved} />
    </div>
  );
}
