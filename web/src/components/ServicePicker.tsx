import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { amountInput, euros, serviceName } from '../lib/format';
import type { PickedItem, Service, SessionItem } from '../lib/types';
import { Button, ErrorText, Modal, TextInput } from './ui';

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
    <Modal open onClose={onClose} title={title} wide>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2">
        {priced.map((s) => {
          const count = qty.get(s.id) ?? 0;
          const selected = count > 0;
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => setCount(s.id, selected ? 0 : 1)}
              onKeyDown={(e) => e.key === 'Enter' && setCount(s.id, selected ? 0 : 1)}
              className={`rounded-2xl border-2 p-4 text-left transition-colors cursor-pointer select-none touch-manipulation min-h-24 flex flex-col justify-between ${
                selected
                  ? 'border-emerald-600 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              } ${s.inactive ? 'opacity-70' : ''}`}
            >
              <div className="font-semibold text-slate-800 text-lg leading-tight">
                {serviceName(s, lang)}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-slate-500 font-medium">{euros(s.priceCents, lang)}</span>
                {selected && (
                  <span
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="w-9 h-9 rounded-full bg-white border border-emerald-300 text-emerald-700 text-xl font-bold leading-none"
                      onClick={() => setCount(s.id, count - 1)}
                    >
                      −
                    </button>
                    <span className="w-7 text-center font-bold text-emerald-800 text-lg">
                      {count}
                    </span>
                    <button
                      type="button"
                      className="w-9 h-9 rounded-full bg-white border border-emerald-300 text-emerald-700 text-xl font-bold leading-none"
                      onClick={() => setCount(s.id, count + 1)}
                    >
                      +
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
        {specials.map((s) => {
          const entry = special.get(s.id) ?? { amount: '', note: '' };
          const active = toCents(entry.amount) > 0;
          return (
            <div
              key={s.id}
              className={`col-span-2 sm:col-span-3 rounded-2xl border-2 border-dashed p-4 transition-colors ${
                active ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300 bg-white'
              }`}
            >
              <div className="font-semibold text-slate-800 text-lg leading-tight">
                {serviceName(s, lang)}
              </div>
              <div className="text-sm text-slate-500">{t('work.customHint')}</div>

              <div className="flex flex-col sm:flex-row gap-3 mt-3">
                <div className="relative sm:w-48 shrink-0 order-first">
                  {/*
                    text, not number: Turkish and German write "35,50" and a number
                    input throws the comma away without a word, leaving 0 €.
                  */}
                  <TextInput
                    type="text"
                    inputMode="decimal"
                    className="pr-9 text-right text-xl font-bold"
                    value={entry.amount}
                    placeholder={amountInput(0, lang)}
                    aria-label={t('work.customAmount')}
                    onChange={(e) => editSpecial(s.id, { amount: e.target.value })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl font-bold">
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
      <div className="flex items-center justify-between gap-3 py-4 sticky bottom-0 bg-white">
        <div className="text-2xl font-bold text-slate-800">
          {t('common.total')}: {euros(totalCents, lang)}
        </div>
        <div className="flex gap-3 items-center">
          {extraFooter}
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            size="lg"
            onClick={() => onSave(items)}
            disabled={busy || items.length === 0 || amountMissing}
          >
            {t('work.saveSession')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
