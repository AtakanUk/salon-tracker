import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import {
  dateInputValue,
  dateTimeInputValue,
  euros,
  fmtDate,
  fmtTime,
  itemLabel,
} from '../../lib/format';
import type { PickedItem, Service, Session, SessionStatus, User } from '../../lib/types';
import {
  Badge,
  Button,
  Card,
  ErrorText,
  Field,
  Modal,
  Select,
  Spinner,
  TextInput,
  tableCols,
} from '../../components/ui';
import ServicePicker from '../../components/ServicePicker';

interface RecordForm {
  id?: number;
  employeeId: string;
  startedAt: string;
  finishedAt: string;
}

const PAGE_SIZE = 20;

const statusBadge: Record<SessionStatus, { color: 'green' | 'red' | 'blue'; key: string }> = {
  COMPLETED: { color: 'green', key: 'sessions.statusCompleted' },
  CANCELLED: { color: 'red', key: 'sessions.statusCancelled' },
  ACTIVE: { color: 'blue', key: 'sessions.statusActive' },
};

export default function Sessions() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const today = dateInputValue(new Date());

  const [from, setFrom] = useState(dateInputValue(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(today);
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [users, setUsers] = useState<User[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [data, setData] = useState<{ total: number; sessions: Session[] } | null>(null);
  const [editing, setEditing] = useState<Session | null>(null);
  const [cancelling, setCancelling] = useState<Session | null>(null);
  const [removing, setRemoving] = useState<Session | null>(null);
  const [form, setForm] = useState<RecordForm | null>(null);
  const [newItems, setNewItems] = useState<RecordForm | null>(null); // step 2 of "add record"
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const liveUsers = users.filter((u) => !u.deleted);

  useEffect(() => {
    api<{ users: User[] }>('/users').then((r) => setUsers(r.users)).catch(() => {});
    api<{ services: Service[] }>('/services').then((r) => setServices(r.services)).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams({ from, to, page: String(page), pageSize: String(PAGE_SIZE) });
    if (employeeId) params.set('employeeId', employeeId);
    if (status) params.set('status', status);
    const r = await api<{ total: number; sessions: Session[] }>(`/sessions?${params}`);
    setData(r);
  }, [from, to, employeeId, status, page]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  async function saveItems(items: PickedItem[]) {
    if (!editing) return;
    setBusy(true);
    setPickerError(null);
    try {
      await api(`/sessions/${editing.id}/items`, { method: 'PATCH', body: { items } });
      setEditing(null);
      await refresh();
    } catch (e) {
      setPickerError(e instanceof ApiError ? e.code : 'generic');
    } finally {
      setBusy(false);
    }
  }

  async function cancelSession() {
    if (!cancelling) return;
    setBusy(true);
    try {
      await api(`/sessions/${cancelling.id}/cancel`, { method: 'POST' });
      setCancelling(null);
      await refresh();
    } catch {
      // list refresh will show the actual state
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      after?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'generic');
    } finally {
      setBusy(false);
    }
  }

  /** Existing record: save employee/time. New record: move on to picking the services. */
  function submitForm() {
    if (!form) return;
    if (!form.id) {
      setNewItems(form);
      setForm(null);
      return;
    }
    run(
      () =>
        api(`/sessions/${form.id}`, {
          method: 'PATCH',
          body: {
            employeeId: Number(form.employeeId),
            startedAt: new Date(form.startedAt).toISOString(),
            finishedAt: form.finishedAt ? new Date(form.finishedAt).toISOString() : null,
          },
        }),
      () => setForm(null),
    );
  }

  async function createSession(items: PickedItem[]) {
    if (!newItems) return;
    setBusy(true);
    setPickerError(null);
    try {
      await api('/sessions', {
        method: 'POST',
        body: {
          employeeId: Number(newItems.employeeId),
          startedAt: new Date(newItems.startedAt).toISOString(),
          finishedAt: new Date(newItems.finishedAt).toISOString(),
          items,
        },
      });
      setNewItems(null);
      await refresh();
    } catch (e) {
      setPickerError(e instanceof ApiError ? e.code : 'generic');
    } finally {
      setBusy(false);
    }
  }

  function openAdd() {
    const now = new Date();
    setError(null);
    setForm({
      employeeId: String(liveUsers[0]?.id ?? ''),
      startedAt: dateTimeInputValue(new Date(now.getTime() - 30 * 60_000)),
      finishedAt: dateTimeInputValue(now),
    });
  }

  function openEdit(s: Session) {
    setError(null);
    setForm({
      id: s.id,
      employeeId: String(s.employeeId),
      startedAt: dateTimeInputValue(new Date(s.startedAt)),
      finishedAt: s.finishedAt ? dateTimeInputValue(new Date(s.finishedAt)) : '',
    });
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800">{t('sessions.title')}</h1>
        <Button onClick={openAdd} disabled={liveUsers.length === 0}>
          + {t('sessions.add')}
        </Button>
      </div>

      {/* filters */}
      <Card className="flex flex-wrap items-center gap-2">
        <TextInput
          type="date"
          value={from}
          max={to}
          onChange={(e) => { setFrom(e.target.value); setPage(1); }}
          className="!w-auto !py-1.5"
        />
        <span className="text-slate-400">–</span>
        <TextInput
          type="date"
          value={to}
          min={from}
          onChange={(e) => { setTo(e.target.value); setPage(1); }}
          className="!w-auto !py-1.5"
        />
        <Select
          value={employeeId}
          onChange={(e) => { setEmployeeId(e.target.value); setPage(1); }}
          className="!py-1.5 text-sm"
        >
          <option value="">{t('sessions.employee')}: {t('common.all')}</option>
          {/* deleted staff stay listed: their past records are still in here */}
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.deleted ? `${u.name} (${t('employees.deletedShort')})` : u.name}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="!py-1.5 text-sm"
        >
          <option value="">{t('sessions.status')}: {t('common.all')}</option>
          <option value="COMPLETED">{t('sessions.statusCompleted')}</option>
          <option value="CANCELLED">{t('sessions.statusCancelled')}</option>
          <option value="ACTIVE">{t('sessions.statusActive')}</option>
        </Select>
        <span className="grow" />
        <a
          href={`/api/export/sessions.xlsx?from=${from}&to=${to}`}
          download
          className="px-3 py-1.5 rounded-xl text-sm font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        >
          ⬇ {t('sessions.excel')}
        </a>
      </Card>

      {!data ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-8 w-8" />
        </div>
      ) : data.sessions.length === 0 ? (
        <Card className="text-center text-slate-500 py-10">{t('sessions.empty')}</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className={`w-full text-sm [font-variant-numeric:tabular-nums] ${tableCols}`}>
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 font-medium">{t('sessions.date')}</th>
                <th className="py-2 font-medium">{t('sessions.employee')}</th>
                <th className="py-2 font-medium">{t('sessions.items')}</th>
                <th className="py-2 font-medium text-right">{t('sessions.duration')}</th>
                <th className="py-2 font-medium text-right">{t('common.total')}</th>
                <th className="py-2 font-medium text-center">{t('sessions.status')}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 align-top">
                  <td className="py-2.5 whitespace-nowrap text-slate-600">
                    {fmtDate(s.startedAt, lang)}{' '}
                    <span className="text-slate-400">{fmtTime(s.startedAt, lang)}</span>
                  </td>
                  <td className="py-2.5 font-semibold text-slate-800">{s.employee?.name}</td>
                  <td className="py-2.5 text-slate-600 max-w-72">
                    {s.items?.map((i) => itemLabel(i, lang)).join(', ')}
                    {s.editedAt && (
                      <span className="ml-1 text-amber-600 text-xs">({t('sessions.edited')})</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-slate-600 whitespace-nowrap">
                    {s.durationMinutes !== null ? `${s.durationMinutes} ${t('work.minutes')}` : '–'}
                  </td>
                  <td className="py-2.5 text-right font-semibold text-slate-800">
                    {euros(s.totalCents, lang)}
                  </td>
                  <td className="py-2.5 text-center">
                    <Badge color={statusBadge[s.status].color}>{t(statusBadge[s.status].key)}</Badge>
                  </td>
                  <td className="py-2.5">
                    <div className="flex gap-1.5 justify-end flex-wrap">
                      {s.status === 'COMPLETED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => { setEditing(s); setPickerError(null); }}
                        >
                          {t('sessions.items')}
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => openEdit(s)}>
                        {t('common.edit')}
                      </Button>
                      {s.status === 'COMPLETED' && (
                        <Button variant="ghost" size="sm" onClick={() => setCancelling(s)}>
                          {t('sessions.cancelSession')}
                        </Button>
                      )}
                      <Button
                        variant="dangerOutline"
                        size="sm"
                        onClick={() => { setError(null); setRemoving(s); }}
                      >
                        {t('sessions.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between pt-3">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ← {t('sessions.prev')}
            </Button>
            <span className="text-sm text-slate-500">
              {page} / {pages} · {data.total}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              {t('sessions.next')} →
            </Button>
          </div>
        </Card>
      )}

      {editing && (
        <ServicePicker
          services={services}
          title={`${t('sessions.editItems')} · ${editing.employee?.name} · ${fmtDate(editing.startedAt, lang)}`}
          initial={editing.items}
          busy={busy}
          error={pickerError}
          onSave={saveItems}
          onClose={() => setEditing(null)}
        />
      )}

      {/* step 2 of adding a record: which services were performed */}
      {newItems && (
        <ServicePicker
          services={services}
          title={t('sessions.add')}
          busy={busy}
          error={pickerError}
          onSave={createSession}
          onClose={() => setNewItems(null)}
        />
      )}

      {/* add / edit the record itself: who and when */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t('sessions.editRecord') : t('sessions.add')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={submitForm}
              disabled={busy || !form?.employeeId || !form?.startedAt || (!form?.id && !form?.finishedAt)}
            >
              {form?.id ? t('common.save') : t('sessions.pickServices')}
            </Button>
          </>
        }
      >
        {form && (
          <>
            <Field label={t('sessions.employee')}>
              <Select
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                className="w-full"
              >
                {liveUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('sessions.startedAt')}>
              <TextInput
                type="datetime-local"
                value={form.startedAt}
                onChange={(e) => setForm({ ...form, startedAt: e.target.value })}
              />
            </Field>
            <Field label={t('sessions.finishedAt')}>
              <TextInput
                type="datetime-local"
                value={form.finishedAt}
                onChange={(e) => setForm({ ...form, finishedAt: e.target.value })}
              />
            </Field>
            {!form.id && <p className="text-sm text-slate-500 mb-2">{t('sessions.addHint')}</p>}
            <ErrorText code={error} />
          </>
        )}
      </Modal>

      {/* permanent delete */}
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t('sessions.confirmDeleteTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                removing &&
                run(() => api(`/sessions/${removing.id}`, { method: 'DELETE' }), () => setRemoving(null))
              }
            >
              {t('sessions.delete')}
            </Button>
          </>
        }
      >
        {removing && (
          <>
            <p className="text-sm text-slate-700 mb-2">
              {t('sessions.confirmDeleteText', {
                date: fmtDate(removing.startedAt, lang),
                name: removing.employee?.name ?? '',
                total: euros(removing.totalCents, lang),
              })}
            </p>
            <p className="text-sm text-slate-500">{t('sessions.deleteHint')}</p>
            <ErrorText code={error} />
          </>
        )}
      </Modal>

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title={t('sessions.confirmCancelTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)} disabled={busy}>
              {t('common.no')}
            </Button>
            <Button variant="danger" onClick={cancelSession} disabled={busy}>
              {t('common.yes')}
            </Button>
          </>
        }
      >
        <p className="text-slate-600">{t('sessions.confirmCancelText')}</p>
      </Modal>
    </div>
  );
}
