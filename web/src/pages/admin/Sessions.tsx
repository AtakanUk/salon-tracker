import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'motion/react';
import {
  CaretLeft,
  CaretRight,
  DownloadSimple,
  ListPlus,
  PencilSimple,
  Plus,
  Prohibit,
  Receipt,
  Trash,
} from '@phosphor-icons/react';
import { api, ApiError } from '../../lib/api';
import {
  dateInputValue,
  dateTimeInputValue,
  euros,
  fmtDate,
  fmtTime,
  itemLabel,
} from '../../lib/format';
import { colorMap, useChartTheme } from '../../lib/palette';
import type { PickedItem, Service, Session, SessionStatus, User } from '../../lib/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  TableWrap,
  TextInput,
  stagger,
  tableCls,
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

const pillInput = 'w-auto! h-9! rounded-full! text-[14px]';

/** A row action: an icon with its name in the tooltip and for screen readers. */
function IconAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid place-items-center size-8 rounded-full cursor-pointer transition-[background-color,color,transform] duration-200 active:scale-90 ${
        danger ? 'text-danger-text hover:bg-danger-soft' : 'text-ink-2 hover:text-ink hover:bg-fill'
      }`}
    >
      {children}
    </button>
  );
}

export default function Sessions() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const today = dateInputValue(new Date());
  const chart = useChartTheme();

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
  const colors = useMemo(() => colorMap(users.map((u) => u.id), chart.categorical), [users, chart]);

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
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('sessions.title')}
        actions={
          <>
            <a
              href={`/api/export/sessions.xlsx?from=${from}&to=${to}`}
              download
              className="inline-flex items-center gap-2 min-h-10 px-4 rounded-full bg-fill text-ink text-[15px] font-semibold hover:bg-fill-strong transition-[background-color,transform] duration-200 active:scale-[.97]"
            >
              <DownloadSimple size={16} weight="bold" />
              {t('sessions.excel')}
            </a>
            <Button onClick={openAdd} disabled={liveUsers.length === 0}>
              <Plus size={16} weight="bold" />
              {t('sessions.add')}
            </Button>
          </>
        }
      />

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2.5 animate-enter">
        <TextInput
          type="date"
          value={from}
          max={to}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          className={pillInput}
        />
        <span className="text-ink-3">–</span>
        <TextInput
          type="date"
          value={to}
          min={from}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          className={pillInput}
        />
        <Select
          size="sm"
          value={employeeId}
          onChange={(e) => {
            setEmployeeId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">
            {t('sessions.employee')}: {t('common.all')}
          </option>
          {/* deleted staff stay listed: their past records are still in here */}
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.deleted ? `${u.name} (${t('employees.deletedShort')})` : u.name}
            </option>
          ))}
        </Select>
        <Select
          size="sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">
            {t('sessions.status')}: {t('common.all')}
          </option>
          <option value="COMPLETED">{t('sessions.statusCompleted')}</option>
          <option value="CANCELLED">{t('sessions.statusCancelled')}</option>
          <option value="ACTIVE">{t('sessions.statusActive')}</option>
        </Select>
      </div>

      {!data ? (
        <Card spotlight={false}>
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        </Card>
      ) : data.sessions.length === 0 ? (
        <Card>
          <EmptyState icon={<Receipt size={22} />}>{t('sessions.empty')}</EmptyState>
        </Card>
      ) : (
        <Card className="animate-enter">
          <TableWrap>
            <table className={tableCls}>
              <thead>
                <tr className="text-left">
                  <th>{t('sessions.date')}</th>
                  <th>{t('sessions.employee')}</th>
                  <th>{t('sessions.items')}</th>
                  <th className="text-right">{t('sessions.duration')}</th>
                  <th className="text-right">{t('common.total')}</th>
                  <th className="text-center">{t('sessions.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s, i) => (
                  <tr key={s.id} className="stagger align-middle" style={stagger(i)}>
                    <td className="whitespace-nowrap">
                      <div className="font-medium text-ink">{fmtDate(s.startedAt, lang)}</div>
                      <div className="text-[13px] text-ink-3">{fmtTime(s.startedAt, lang)}</div>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2.5 font-semibold text-ink whitespace-nowrap">
                        <Avatar
                          name={s.employee?.name ?? '?'}
                          color={colors.get(s.employeeId)}
                          className="size-7 text-[11px]"
                        />
                        {s.employee?.name}
                      </span>
                    </td>
                    <td className="text-ink-2 min-w-48 max-w-80">
                      {s.items?.map((it) => itemLabel(it, lang)).join(', ')}
                      {s.editedAt && (
                        <span className="ml-1.5 text-warn-text text-[12px] font-medium">({t('sessions.edited')})</span>
                      )}
                    </td>
                    <td className="text-right text-ink-2 whitespace-nowrap">
                      {s.durationMinutes !== null ? `${s.durationMinutes} ${t('work.minutes')}` : '–'}
                    </td>
                    <td className="text-right font-semibold text-ink whitespace-nowrap">{euros(s.totalCents, lang)}</td>
                    <td className="text-center">
                      <Badge color={statusBadge[s.status].color} dot pulse={s.status === 'ACTIVE'}>
                        {t(statusBadge[s.status].key)}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex gap-0.5 justify-end">
                        {s.status === 'COMPLETED' && (
                          <IconAction
                            label={t('sessions.editItems')}
                            onClick={() => {
                              setEditing(s);
                              setPickerError(null);
                            }}
                          >
                            <ListPlus size={17} weight="bold" />
                          </IconAction>
                        )}
                        <IconAction label={t('sessions.editRecord')} onClick={() => openEdit(s)}>
                          <PencilSimple size={17} weight="bold" />
                        </IconAction>
                        {s.status === 'COMPLETED' && (
                          <IconAction label={t('sessions.cancelSession')} onClick={() => setCancelling(s)}>
                            <Prohibit size={17} weight="bold" />
                          </IconAction>
                        )}
                        <IconAction
                          danger
                          label={t('sessions.delete')}
                          onClick={() => {
                            setError(null);
                            setRemoving(s);
                          }}
                        >
                          <Trash size={17} weight="bold" />
                        </IconAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="flex items-center justify-between gap-3 pt-4 mt-1 border-t border-line">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <CaretLeft size={14} weight="bold" />
              {t('sessions.prev')}
            </Button>
            <span className="text-[13px] text-ink-2 tabular-nums">
              {page} / {pages} · {data.total}
            </span>
            <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              {t('sessions.next')}
              <CaretRight size={14} weight="bold" />
            </Button>
          </div>
        </Card>
      )}

      <AnimatePresence>
        {editing && (
          <ServicePicker
            key="edit"
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
            key="new"
            services={services}
            title={t('sessions.add')}
            busy={busy}
            error={pickerError}
            onSave={createSession}
            onClose={() => setNewItems(null)}
          />
        )}
      </AnimatePresence>

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
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
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
            {!form.id && <p className="text-[14px] text-ink-2 mb-2">{t('sessions.addHint')}</p>}
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
          <div className="pb-2">
            <p className="text-[15px] text-ink mb-2">
              {t('sessions.confirmDeleteText', {
                date: fmtDate(removing.startedAt, lang),
                name: removing.employee?.name ?? '',
                total: euros(removing.totalCents, lang),
              })}
            </p>
            <p className="text-[14px] text-ink-2">{t('sessions.deleteHint')}</p>
            <ErrorText code={error} />
          </div>
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
        <p className="text-[15px] text-ink-2 pb-2">{t('sessions.confirmCancelText')}</p>
      </Modal>
    </div>
  );
}
