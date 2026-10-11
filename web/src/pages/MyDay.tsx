import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { ArrowLeft, Coins, PencilSimple, Scissors, UsersThree } from '@phosphor-icons/react';
import { useAuth } from '../auth';
import { api, ApiError } from '../lib/api';
import { euros, fmtTime, intlLocale, itemLabel } from '../lib/format';
import type { Board, PickedItem, Service, Session } from '../lib/types';
import {
  AnimatedNumber,
  Button,
  Card,
  EmptyState,
  ErrorText,
  FullScreenSpinner,
  Modal,
  stagger,
} from '../components/ui';
import ServicePicker from '../components/ServicePicker';

const errCode = (e: unknown) => (e instanceof ApiError ? e.code : 'generic');

function Stat({ icon, label, children, i }: { icon: ReactNode; label: string; children: ReactNode; i: number }) {
  return (
    <Card className="stagger" style={stagger(i)}>
      <div className="flex items-center gap-2.5 text-[14px] font-medium text-ink-2">
        <span className="grid place-items-center size-8 rounded-xl bg-accent-soft text-accent-text">{icon}</span>
        {label}
      </div>
      <div className="mt-4 text-[34px] sm:text-[40px] font-semibold tracking-[-0.035em] leading-none text-ink">
        {children}
      </div>
    </Card>
  );
}

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
  const date = new Intl.DateTimeFormat(intlLocale(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="min-h-dvh flex flex-col max-w-3xl mx-auto p-4-safe sm:p-6-safe gap-5">
      {/* header */}
      <header className="flex flex-col gap-5 animate-enter">
        <Link
          to="/work"
          className="self-start inline-flex items-center gap-2 h-9 pl-3 pr-4 rounded-full bg-fill text-[14px] font-semibold text-ink hover:bg-fill-strong transition-colors"
        >
          <ArrowLeft size={16} weight="bold" />
          {t('common.back')}
        </Link>
        <div>
          <h1 className="text-[32px] sm:text-[38px] font-semibold tracking-[-0.035em] leading-[1.05] text-balance">
            {t('work.myDay')}
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-2">
            {user?.name} · {date}
          </p>
        </div>
      </header>

      {/* today's numbers */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Stat i={1} icon={<UsersThree size={18} />} label={t('work.todayCustomers')}>
          <AnimatedNumber value={today.count} format={(v) => String(Math.round(v))} />
        </Stat>
        <Stat i={2} icon={<Coins size={18} />} label={t('work.todayRevenue')}>
          <AnimatedNumber value={today.revenueCents} format={(v) => euros(Math.round(v), lang)} />
        </Stat>
      </div>

      <ErrorText code={error} />

      {/* last entry, correctable for 30 min */}
      {last && (
        <Card
          className="stagger border-accent/40! bg-[linear-gradient(135deg,var(--accent-soft),transparent_60%)]"
          style={stagger(3)}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink-2">
                {t('work.lastSession')} · {fmtTime(last.finishedAt!, lang)}
                {last.editedAt && <span className="ml-2 text-warn-text">({t('work.edited')})</span>}
              </div>
              <div className="text-[17px] font-semibold mt-1 text-ink text-pretty">
                {last.items!.map((i) => itemLabel(i, lang)).join(', ')}
              </div>
              <div className="text-[22px] font-semibold tracking-[-0.02em] mt-1 tabular-nums">
                {euros(last.totalCents, lang)}
              </div>
            </div>
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => setCorrecting(last)}>
              <PencilSimple size={18} weight="bold" />
              {t('work.correct')}
            </Button>
          </div>
          <p className="mt-4 pt-3 border-t border-line text-[13px] text-ink-2">{t('work.editableInfo')}</p>
        </Card>
      )}

      {/* the whole day, newest first */}
      <Card className="stagger" style={stagger(4)}>
        <h2 className="text-[17px] font-semibold tracking-[-0.015em] mb-2">{t('work.todayList')}</h2>
        {today.sessions.length === 0 ? (
          <EmptyState icon={<Scissors size={22} />}>{t('work.noneToday')}</EmptyState>
        ) : (
          <ol className="relative">
            {/* the day's spine */}
            <span className="absolute left-[5px] top-4 bottom-4 w-px bg-line-strong" aria-hidden="true" />
            {today.sessions.map((s, i) => (
              <li key={s.id} className="stagger relative flex items-start gap-4 py-3" style={stagger(5 + i)}>
                <span className="relative z-10 mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-accent bg-surface" />
                <div className="min-w-0 grow">
                  <div className="text-[13px] text-ink-2 tabular-nums">
                    {fmtTime(s.finishedAt!, lang)}
                    {s.durationMinutes !== null && ` · ${s.durationMinutes} ${t('work.minutes')}`}
                    {s.editedAt && <span className="ml-2 text-warn-text">({t('work.edited')})</span>}
                  </div>
                  <div className="text-[15px] font-medium text-ink mt-0.5 text-pretty">
                    {(s.items ?? []).map((it) => itemLabel(it, lang)).join(', ')}
                  </div>
                </div>
                <div className="text-[15px] font-semibold tabular-nums shrink-0 mt-4">{euros(s.totalCents, lang)}</div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* correction dialog */}
      <AnimatePresence>
        {correcting && (
          <ServicePicker
            key="correct"
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
    </div>
  );
}
