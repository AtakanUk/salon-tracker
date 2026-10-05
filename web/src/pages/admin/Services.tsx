import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { amountInput, euros } from '../../lib/format';
import type { Service } from '../../lib/types';
import { Badge, Button, Card, ErrorText, Field, Modal, Spinner, TextInput, tableCols } from '../../components/ui';

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
    await api(`/services/${s.id}`, { method: 'PATCH', body: { active: !s.active } });
    await refresh();
  }

  if (!services) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t('services.title')}</h1>
        <Button onClick={() => { setForm(emptyForm); setError(null); }}>
          + {t('services.add')}
        </Button>
      </div>
      <p className="text-sm text-slate-500 -mt-2">{t('services.priceNote')}</p>

      <Card className="overflow-x-auto">
        <table className={`w-full text-sm [font-variant-numeric:tabular-nums] ${tableCols}`}>
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 font-medium">{t('services.nameTr')}</th>
              <th className="py-2 font-medium">{t('services.nameDe')}</th>
              <th className="py-2 font-medium text-right">{t('services.price')}</th>
              <th className="py-2 font-medium text-center">{t('sessions.status')}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} className={`border-b border-slate-100 ${s.active ? '' : 'opacity-60'}`}>
                <td className="py-2.5 font-semibold text-slate-800">{s.nameTr}</td>
                <td className="py-2.5 text-slate-600">{s.nameDe}</td>
                <td className="py-2.5 text-right font-semibold text-slate-800">
                  {s.custom ? (
                    <span className="font-normal text-slate-500">{t('services.customPrice')}</span>
                  ) : (
                    euros(s.priceCents, lang)
                  )}
                </td>
                <td className="py-2.5 text-center">
                  <Badge color={s.active ? 'green' : 'slate'}>
                    {s.active ? t('services.active') : t('services.inactive')}
                  </Badge>
                </td>
                <td className="py-2.5 text-right whitespace-nowrap">
                  <Button
                    variant="secondary"
                    size="sm"
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
                    {t('common.edit')}
                  </Button>{' '}
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(s)}>
                    {s.active ? t('services.deactivate') : t('services.activate')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
              <p className="mb-3 text-sm text-slate-500">{t('services.customNote')}</p>
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
