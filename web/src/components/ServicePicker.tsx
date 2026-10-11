import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Minus, Plus } from '@phosphor-icons/react';
import { amountInput, euros, serviceName } from '../lib/format';
import type { PickedItem, Service, SessionItem } from '../lib/types';
import { AnimatedNumber, Button, ErrorText, Modal, TextInput, stagger } from './ui';

interface PickerService {
  id: number;
  nameTr: string;
  nameDe: string;
  priceCents: number;
  custom: boolean;
  inactive?: boolean;
}

interface Props {
  services: Service[];
  title: string;
  initial?: SessionItem[];
  busy?: boolean;
  error?: string | null;
  onSave: (items: PickedItem[]) => void;
  onClose: () => void;
  extraFooter?: ReactNode;
}

/** "35,50" or "35.5" -> 3550. NaN when the field is empty or not a number. */
const toCents = (typed: string) => Math.round(parseFloat(typed.replace(',', '.')) * 100);

const stepBtn =
  'grid place-items-center size-9 rounded-full bg-surface text-accent-text border border-accent/25 shadow-[0_1px_2px_rgb(0_0_0/.06)] transition-transform duration-150 active:scale-90 cursor-pointer';

export default function ServicePicker({
  services,
  title,
  initial,
  busy,
  error,
  onSave,
  onClose,
  extraFooter,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  // active price list + any services on the record that are no longer active
  const display = useMemo<PickerService[]>(() => {
    const list: PickerService[] = services.map((s) => ({ ...s }));
    for (const item of initial ?? []) {
      if (!list.some((s) => s.id === item.serviceId)) {
        list.push({
          id: item.serviceId,
          nameTr: item.nameTr,
          nameDe: item.nameDe,
          priceCents: item.priceCents,
          custom: item.custom,
          inactive: true,
        });
      }
    }
    return list;
  }, [services, initial]);

  const priced = display.filter((s) => !s.custom);
  const specials = display.filter((s) => s.custom);

  const [qty, setQty] = useState<Map<number, number>>(
    () => new Map((initial ?? []).filter((i) => !i.custom).map((i) => [i.serviceId, i.quantity])),
  );

  /**
   * Typed-in amounts, kept as text so a half-finished "3" is not read as 3 €.
   * Every custom service has an entry from the start: the fields are always on
   * screen, and an amount above zero is what puts the item on the record. There
   * is nothing to press first - the other tiles are tapped anywhere on the card,
   * so a small "add" button here was something nobody found.
   */
  const [special, setSpecial] = useState<Map<number, { amount: string; note: string }>>(
    () =>
      new Map(
        display
          .filter((s) => s.custom)
          .map((s) => {
            const was = (initial ?? []).find((i) => i.serviceId === s.id);
            return [
              s.id,
              was
                ? // shown the way the current language writes it, and read back by toCents
                  { amount: amountInput(was.priceCents, lang), note: was.note ?? '' }
                : { amount: '', note: '' },
            ];
          }),
      ),
  );

  const setCount = (id: number, count: number) => {
    setQty((prev) => {
      const next = new Map(prev);
      if (count <= 0) next.delete(id);
      else next.set(id, Math.min(count, 20));
      return next;
    });
  };

  const editSpecial = (id: number, patch: Partial<{ amount: string; note: string }>) => {
    setSpecial((prev) => new Map(prev).set(id, { amount: '', note: '', ...prev.get(id), ...patch }));
  };

  /** On the record only once it is worth something; clearing the amount takes it off. */
  const chosen = [...special.entries()].filter(([, c]) => toCents(c.amount) > 0);

  const totalCents =
    priced.reduce((a, s) => a + (qty.get(s.id) ?? 0) * s.priceCents, 0) +
    chosen.reduce((a, [, c]) => a + toCents(c.amount), 0);

  const items: PickedItem[] = [
    ...[...qty.entries()].map(([serviceId, quantity]) => ({ serviceId, quantity })),
    ...chosen.map(([serviceId, c]) => ({
      serviceId,
      quantity: 1,
      priceCents: toCents(c.amount),
      note: c.note.trim() || undefined,
    })),
  ];

  // a note written without an amount: they meant to add it and left it half done
  const amountMissing = [...special.values()].some((c) => c.note.trim() && !(toCents(c.amount) > 0));

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      wide
      footer={
        <>
          <div className="mr-auto flex items-baseline gap-2 min-w-0">
            <span className="text-[15px] text-ink-2">{t('common.total')}</span>
            <span className="text-[26px] font-semibold tracking-[-0.03em] tabular-nums">
              <AnimatedNumber value={totalCents} format={(v) => euros(Math.round(v), lang)} />
            </span>
          </div>
          <div className="flex gap-2.5 items-center flex-wrap justify-end">
            {extraFooter}
            <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button size="lg" onClick={() => onSave(items)} disabled={busy || items.length === 0 || amountMissing}>
              {t('work.saveSession')}
            </Button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2">
        {priced.map((s, i) => {
          const count = qty.get(s.id) ?? 0;
          const selected = count > 0;
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onClick={() => setCount(s.id, selected ? 0 : 1)}
              onKeyDown={(e) => e.key === 'Enter' && setCount(s.id, selected ? 0 : 1)}
              style={stagger(i)}
              className={`stagger relative rounded-2xl border p-4 text-left cursor-pointer select-none touch-manipulation min-h-28 flex flex-col justify-between transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out-expo active:scale-[.97] ${
                selected
                  ? 'border-accent bg-accent-soft shadow-[0_0_0_1px_var(--accent),0_10px_28px_-14px_rgb(0_113_227/.7)]'
                  : 'border-line bg-surface hover:border-line-strong hover:-translate-y-0.5 hover:shadow-card'
              } ${s.inactive ? 'opacity-70' : ''}`}
            >
              <AnimatePresence>
                {selected && (
                  <motion.span
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, transition: { duration: 0.12 } }}
                    transition={{ type: 'spring', bounce: 0.5, duration: 0.45 }}
                    className="absolute top-3 right-3 grid place-items-center size-6 rounded-full bg-accent text-white"
                  >
                    <Check size={13} weight="bold" />
                  </motion.span>
                )}
              </AnimatePresence>
              <div className="pr-7 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">
                {serviceName(s, lang)}
              </div>
              <div className="flex items-center justify-between gap-2 mt-3 min-h-9">
                <span className={`font-medium tabular-nums ${selected ? 'text-accent-text' : 'text-ink-2'}`}>
                  {euros(s.priceCents, lang)}
                </span>
                {selected && (
                  <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      aria-label="−"
                      className={stepBtn}
                      onClick={() => setCount(s.id, count - 1)}
                    >
                      <Minus size={15} weight="bold" />
                    </button>
                    <span className="relative w-7 h-7 overflow-hidden text-center text-[17px] font-semibold text-ink tabular-nums">
                      <AnimatePresence initial={false} mode="popLayout">
                        <motion.span
                          key={count}
                          className="absolute inset-0 grid place-items-center"
                          initial={{ y: 14, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -14, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        >
                          {count}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                    <button
                      type="button"
                      aria-label="+"
                      className={stepBtn}
                      onClick={() => setCount(s.id, count + 1)}
                    >
                      <Plus size={15} weight="bold" />
                    </button>
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/*
          Full width and dashed on purpose: this one has no price of its own, so
          it should not look like just another tile in the price list.
        */}
        {specials.map((s, i) => {
          const entry = special.get(s.id) ?? { amount: '', note: '' };
          const active = toCents(entry.amount) > 0;
          return (
            <div
              key={s.id}
              style={stagger(priced.length + i)}
              className={`stagger col-span-2 sm:col-span-3 rounded-2xl border-[1.5px] border-dashed p-4 transition-colors duration-200 ${
                active ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface'
              }`}
            >
              <div className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">
                {serviceName(s, lang)}
              </div>
              <div className="text-[14px] text-ink-2 mt-0.5">{t('work.customHint')}</div>

              <div className="flex flex-col sm:flex-row gap-3 mt-3">
                <div className="relative sm:w-48 shrink-0 order-first">
                  {/*
                    text, not number: Turkish and German write "35,50" and a number
                    input throws the comma away without a word, leaving 0 €.
                  */}
                  <TextInput
                    type="text"
                    inputMode="decimal"
                    className="pr-9 text-right text-xl font-semibold tabular-nums"
                    value={entry.amount}
                    placeholder={amountInput(0, lang)}
                    aria-label={t('work.customAmount')}
                    onChange={(e) => editSpecial(s.id, { amount: e.target.value })}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-2 text-xl font-semibold">
                    €
                  </span>
                </div>
                <TextInput
                  className="sm:grow"
                  value={entry.note}
                  maxLength={60}
                  placeholder={t('work.customNotePlaceholder')}
                  onChange={(e) => editSpecial(s.id, { note: e.target.value })}
                />
              </div>
            </div>
          );
        })}
      </div>

      <ErrorText code={error ?? (amountMissing ? 'amount_required' : null)} />
    </Modal>
  );
}
