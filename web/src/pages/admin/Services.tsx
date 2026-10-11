import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PencilSimple, Plus } from '@phosphor-icons/react';
import { api, ApiError } from '../../lib/api';
import { amountInput, euros } from '../../lib/format';
import type { Service } from '../../lib/types';
import {
  Button,
  Card,
  ErrorText,
  Field,
  Modal,
  PageHeader,
  Skeleton,
  Switch,
  TextInput,
  stagger,
} from '../../components/ui';

interface FormState {
  id?: number;
  nameTr: string;
  nameDe: string;
  price: string; // in euros, as typed
  sortOrder: string;
  /** the custom service row: renameable, but it has no price of its own */
  custom?: boolean;
}

const emptyForm: FormState = { nameTr: '', nameDe: '', price: '', sortOrder: '0' };

export default function Services() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [services, setServices] = useState<Service[] | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    api<{ services: Service[] }>('/services?all=1').then((r) => setServices(r.services));

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  // "20,50" and "20.50" both work: the field is text on purpose, because a
  // number input silently discards the comma both languages actually type
  const priceCents = (v: string) => Math.round(parseFloat(v.replace(',', '.')) * 100);

  async function save() {
    if (!form) return;
    const cents = form.custom ? 0 : priceCents(form.price);
    if (!Number.isFinite(cents) || cents < 0) {
      setError('validation');
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      nameTr: form.nameTr.trim(),
      nameDe: form.nameDe.trim(),
      priceCents: cents,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
    };
    try {
      if (form.id) {
        await api(`/services/${form.id}`, { method: 'PATCH', body });
      } else {
        await api('/services', { method: 'POST', body });
      }
      setForm(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'generic');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(s: Service) {
    // the switch moves at once; the refresh afterwards puts it back if the server said no
    setServices((list) => list?.map((x) => (x.id === s.id ? { ...x, active: !s.active } : x)) ?? null);
    try {
      await api(`/services/${s.id}`, { method: 'PATCH', body: { active: !s.active } });
    } finally {
      await refresh().catch(() => {});
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('services.title')}
        description={t('services.priceNote')}
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm);
              setError(null);
            }}
          >
            <Plus size={16} weight="bold" />
            {t('services.add')}
          </Button>
        }
      />

      <Card padding="p-2 sm:p-3">
        {!services ? (
          <div className="flex flex-col gap-2 p-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : (
          <ul>
            {services.map((s, i) => (
              <li
                key={s.id}
                style={stagger(i)}
                className={`stagger group flex items-center gap-3 sm:gap-5 rounded-2xl px-3 sm:px-4 py-3.5 transition-[background-color,opacity] duration-300 hover:bg-fill/50 ${
                  i > 0 ? 'border-t border-line hover:border-transparent' : ''
                } ${s.active ? '' : 'opacity-55'}`}
              >
                <div className="min-w-0 grow">
                  <div className="text-[16px] font-semibold text-ink truncate">{s.nameTr}</div>
                  <div className="text-[14px] text-ink-2 truncate">{s.nameDe}</div>
                </div>
                <div className="text-right shrink-0">
                  {s.custom ? (
                    <span className="text-[14px] text-ink-2">{t('services.customPrice')}</span>
                  ) : (
                    <span className="text-[18px] font-semibold tracking-[-0.02em] tabular-nums">
                      {euros(s.priceCents, lang)}
                    </span>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={t('common.edit')}
                  onClick={() => {
                    setError(null);
                    setForm({
                      id: s.id,
                      nameTr: s.nameTr,
                      nameDe: s.nameDe,
                      price: amountInput(s.priceCents, lang),
                      sortOrder: String(s.sortOrder),
                      custom: s.custom,
                    });
                  }}
                >
                  <PencilSimple size={15} weight="bold" />
                  <span className="hidden sm:inline">{t('common.edit')}</span>
                </Button>
                <div className="flex flex-col items-center gap-1 shrink-0 w-14">
                  <Switch
                    checked={s.active}
                    label={s.active ? t('services.deactivate') : t('services.activate')}
                    onChange={() => toggleActive(s)}
                  />
                  <span className="text-[11px] font-medium text-ink-3">
                    {s.active ? t('services.active') : t('services.inactive')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t('common.edit') : t('services.add')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={save}
              disabled={busy || !form?.nameTr || !form?.nameDe || (!form?.custom && !form?.price)}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        {form && (
          <>
            <Field label={t('services.nameTr')}>
              <TextInput
                value={form.nameTr}
                onChange={(e) => setForm({ ...form, nameTr: e.target.value })}
              />
            </Field>
            <Field label={t('services.nameDe')}>
              <TextInput
                value={form.nameDe}
                onChange={(e) => setForm({ ...form, nameDe: e.target.value })}
              />
            </Field>
            {form.custom ? (
              <p className="mb-4 text-[14px] text-ink-2">{t('services.customNote')}</p>
            ) : (
              <Field label={`${t('services.price')} (€)`}>
                <TextInput
                  type="text"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </Field>
            )}
            <Field label={t('services.order')}>
              <TextInput
                type="number"
                min="0"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </Field>
            <ErrorText code={error} />
          </>
        )}
      </Modal>
    </div>
  );
}
