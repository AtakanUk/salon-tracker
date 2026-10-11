import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  CaretRight,
  Check,
  Copy,
  Key,
  PencilSimple,
  Plus,
  Trash,
} from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import { api, ApiError } from '../../lib/api';
import { MIN_PASSWORD_LENGTH, generatePassword } from '../../lib/password';
import { euros, fmtDate } from '../../lib/format';
import { colorMap, useChartTheme } from '../../lib/palette';
import type { Role, User } from '../../lib/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EASE_OUT,
  ErrorText,
  Field,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Switch,
  TextInput,
  stagger,
} from '../../components/ui';

interface FormState {
  id?: number;
  name: string;
  username: string;
  password: string;
  role: Role;
  active: boolean;
}

/** What a permanent delete would destroy, fetched before asking for confirmation. */
interface Impact {
  sessionCount: number;
  revenueCents: number;
  firstAt: string | null;
  lastAt: string | null;
}

const emptyForm: FormState = { name: '', username: '', password: '', role: 'EMPLOYEE', active: true };

// Mirrors usernameSchema in server/src/routes/users.ts. Turkish letters and
// spaces are what people reach for first, and the server only ever answered
// "gecersiz bilgi" without saying which field it meant.
const USERNAME_RE = /^[a-zA-Z0-9._-]{2,30}$/;

/** A field's rule, spelled out under it, so it is read before a save is refused. */
const Hint = ({ text }: { text: string }) => (
  <span className="block text-[13px] text-ink-3 mt-1.5">{text}</span>
);

// clipboard needs a secure context; over plain http (local testing) it is missing
const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;

export default function Employees() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user: me } = useAuth();
  const chart = useChartTheme();
  const [users, setUsers] = useState<User[] | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [reset, setReset] = useState<{ user: User; password: string; done: boolean } | null>(null);
  const [remove, setRemove] = useState<User | null>(null);
  const [purge, setPurge] = useState<{ user: User; impact: Impact | null } | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => api<{ users: User[] }>('/users').then((r) => setUsers(r.users));

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  // the same color each person has in the dashboard's charts
  const colors = useMemo(() => colorMap((users ?? []).map((u) => u.id), chart.categorical), [users, chart]);

  /** Runs a mutation, refreshes the list, and keeps the error in whichever modal is open. */
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

  /**
   * The same two rules the server enforces, checked here so a form that cannot
   * be saved says why. They used to sit in the button's `disabled` instead,
   * which made a hand-typed short password look like a broken button: nothing
   * happened and nothing appeared on screen, while a generated password
   * (always ten characters) went straight through.
   */
  const save = () => {
    if (!form) return;
    const username = form.username.trim();
    const password = form.password.trim();
    if (!USERNAME_RE.test(username)) return setError('username_invalid');
    if (!form.id && password.length < MIN_PASSWORD_LENGTH) return setError('password_too_short');

    run(() => {
      if (form.id) {
        const body: Record<string, unknown> = {
          name: form.name.trim(),
          username,
          role: form.role,
          active: form.active,
        };
        if (password) body.password = password;
        return api(`/users/${form.id}`, { method: 'PATCH', body });
      }
      // a new account starts in the language the owner is using; each person can switch later
      return api('/users', {
        method: 'POST',
        body: { name: form.name.trim(), username, password, role: form.role, locale: lang },
      });
    }, () => setForm(null));
  };

  /** The same trap in the reset dialog: too short and the button just sat there. */
  const resetPassword = () => {
    if (!reset) return;
    const password = reset.password.trim();
    if (password.length < MIN_PASSWORD_LENGTH) return setError('password_too_short');
    // carry the trimmed value into the success screen, so what gets read out to
    // the employee is exactly what was saved
    run(
      () => api(`/users/${reset.user.id}`, { method: 'PATCH', body: { password } }),
      () => setReset({ ...reset, password, done: true }),
    );
  };

  const live = users?.filter((u) => !u.deleted) ?? [];
  const deleted = users?.filter((u) => u.deleted) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('employees.title')}
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm);
              setError(null);
            }}
          >
            <Plus size={16} weight="bold" />
            {t('employees.add')}
          </Button>
        }
      />

      <Card padding="p-2 sm:p-3">
        {!users ? (
          <div className="flex flex-col gap-2 p-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : (
          <ul>
            {live.map((u, i) => (
              <li
                key={u.id}
                style={stagger(i)}
                className={`stagger flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-3 sm:px-4 py-3.5 transition-colors duration-200 hover:bg-fill/50 ${
                  i > 0 ? 'border-t border-line hover:border-transparent' : ''
                }`}
              >
                <div className={`flex items-center gap-3 min-w-0 grow ${u.active ? '' : 'opacity-55'}`}>
                  <Avatar name={u.name} color={colors.get(u.id)} className="size-11 text-[15px]" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[16px] font-semibold text-ink">{u.name}</span>
                      {u.role === 'ADMIN' && (
                        <Badge color="blue">{t('employees.roleAdmin')}</Badge>
                      )}
                      <Badge color={u.active ? 'green' : 'red'} dot>
                        {u.active ? t('employees.active') : t('employees.inactive')}
                      </Badge>
                    </div>
                    <div className="text-[14px] text-ink-2 truncate">@{u.username}</div>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap ml-14 sm:ml-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setError(null);
                      setForm({
                        id: u.id,
                        name: u.name,
                        username: u.username,
                        password: '',
                        role: u.role,
                        active: u.active,
                      });
                    }}
                  >
                    <PencilSimple size={15} weight="bold" />
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setError(null);
                      setCopied(false);
                      setReset({ user: u, password: generatePassword(), done: false });
                    }}
                  >
                    <Key size={15} weight="bold" />
                    {t('employees.resetPassword')}
                  </Button>
                  {u.id !== me?.id && (
                    <Button
                      variant="dangerOutline"
                      size="sm"
                      onClick={() => {
                        setError(null);
                        setRemove(u);
                      }}
                    >
                      <Trash size={15} weight="bold" />
                      {t('employees.delete')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {deleted.length > 0 && (
        <Card padding="p-2 sm:p-3" spotlight={false}>
          <button
            type="button"
            aria-expanded={showDeleted}
            className="w-full flex items-center gap-2.5 rounded-xl px-3 h-11 text-left text-[15px] font-semibold text-ink-2 hover:text-ink hover:bg-fill/50 transition-colors cursor-pointer"
            onClick={() => setShowDeleted((v) => !v)}
          >
            <CaretRight
              size={14}
              weight="bold"
              className={`transition-transform duration-300 ease-out-expo ${showDeleted ? 'rotate-90' : ''}`}
            />
            {t('employees.deletedAccounts')}
            <span className="ml-1 inline-grid place-items-center min-w-6 h-6 px-1.5 rounded-full bg-fill text-[12px] text-ink-2">
              {deleted.length}
            </span>
          </button>
          <AnimatePresence initial={false}>
            {showDeleted && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <p className="text-[13px] text-ink-2 px-3 pt-1 pb-2">{t('employees.deletedNote')}</p>
                <ul>
                  {deleted.map((u) => (
                    <li
                      key={u.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 border-t border-line"
                    >
                      <div className="flex items-center gap-3 min-w-0 grow opacity-70">
                        <Avatar name={u.name} className="size-9 text-[13px]" />
                        <div className="min-w-0">
                          <div className="text-[15px] font-semibold text-ink">{u.name}</div>
                          <div className="text-[13px] text-ink-2 truncate">@{u.username}</div>
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => run(() => api(`/users/${u.id}/restore`, { method: 'POST' }))}
                        >
                          <ArrowCounterClockwise size={15} weight="bold" />
                          {t('employees.restore')}
                        </Button>
                        <Button
                          variant="dangerOutline"
                          size="sm"
                          disabled={busy}
                          onClick={async () => {
                            setError(null);
                            setPurge({ user: u, impact: null });
                            try {
                              setPurge({ user: u, impact: await api<Impact>(`/users/${u.id}/impact`) });
                            } catch {
                              // confirmation still works, just without the numbers
                            }
                          }}
                        >
                          <Trash size={15} weight="bold" />
                          {t('employees.purge')}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="px-3">
                  <ErrorText code={!form && !reset && !remove ? error : null} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      {/* create / edit */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t('common.edit') : t('employees.add')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={busy || !form?.name.trim() || !form?.username.trim()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {form && (
          <>
            <Field label={t('employees.name')}>
              <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t('employees.username')}>
              <TextInput
                value={form.username}
                autoCapitalize="none"
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
              <Hint text={t('employees.usernameHint')} />
            </Field>
            {!form.id && (
              <Field label={t('employees.password')}>
                <div className="flex gap-2">
                  <TextInput
                    value={form.password}
                    autoComplete="new-password"
                    className="font-mono"
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setForm({ ...form, password: generatePassword() })}
                  >
                    <ArrowsClockwise size={16} weight="bold" />
                    {t('employees.regenerate')}
                  </Button>
                </div>
                <Hint text={t('employees.passwordHint', { min: MIN_PASSWORD_LENGTH })} />
              </Field>
            )}
            <Field label={t('employees.role')}>
              <Select
                value={form.role}
                disabled={form.id === me?.id}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="w-full"
              >
                <option value="EMPLOYEE">{t('employees.roleEmployee')}</option>
                <option value="ADMIN">{t('employees.roleAdmin')}</option>
              </Select>
            </Field>
            {form.id && form.id !== me?.id && (
              <div className="flex items-center justify-between gap-3 mb-4 rounded-xl bg-fill/60 px-3.5 py-2.5">
                <span className="text-[15px] font-medium text-ink">{t('employees.active')}</span>
                <Switch
                  checked={form.active}
                  label={t('employees.active')}
                  onChange={(active) => setForm({ ...form, active })}
                />
              </div>
            )}
            <ErrorText code={error} />
          </>
        )}
      </Modal>

      {/* reset password */}
      <Modal
        open={!!reset}
        onClose={() => setReset(null)}
        title={`${t('employees.resetPassword')} · ${reset?.user.name ?? ''}`}
        footer={
          reset?.done ? (
            <Button onClick={() => setReset(null)}>{t('common.close')}</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setReset(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button disabled={busy} onClick={resetPassword}>
                {t('common.save')}
              </Button>
            </>
          )
        }
      >
        {reset && !reset.done && (
          <>
            <Field label={t('employees.newPassword')}>
              <div className="flex gap-2">
                <TextInput
                  value={reset.password}
                  autoComplete="new-password"
                  className="font-mono"
                  onChange={(e) => setReset({ ...reset, password: e.target.value })}
                />
                <Button
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => setReset({ ...reset, password: generatePassword() })}
                >
                  <ArrowsClockwise size={16} weight="bold" />
                  {t('employees.regenerate')}
                </Button>
              </div>
              <Hint text={t('employees.passwordHint', { min: MIN_PASSWORD_LENGTH })} />
            </Field>
            <ErrorText code={error} />
          </>
        )}
        {reset?.done && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="pb-2"
          >
            <p className="text-[15px] text-ink-2 mb-3">{t('employees.passwordNotice')}</p>
            {/* monospace: l/1 and O/0 must not be mixed up when it is read out */}
            <div className="rounded-2xl bg-fill py-5 text-center font-mono text-[26px] font-semibold tracking-[0.06em] text-ink select-all">
              {reset.password}
            </div>
            {canCopy && (
              <Button
                variant="secondary"
                className="w-full mt-3"
                onClick={() => {
                  navigator.clipboard.writeText(reset.password).then(() => setCopied(true));
                }}
              >
                {copied ? (
                  <Check size={16} weight="bold" className="text-go-text" />
                ) : (
                  <Copy size={16} weight="bold" />
                )}
                {copied ? t('employees.copied') : t('employees.copy')}
              </Button>
            )}
          </motion.div>
        )}
      </Modal>

      {/* permanent delete: account AND every record it owns */}
      <Modal
        open={!!purge}
        onClose={() => setPurge(null)}
        title={purge ? `${purge.user.name} · ${t('employees.purge')}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPurge(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                purge &&
                run(
                  () => api(`/users/${purge.user.id}/permanent`, { method: 'DELETE' }),
                  () => setPurge(null),
                )
              }
            >
              {t('employees.purgeConfirm')}
            </Button>
          </>
        }
      >
        {purge && (
          <div className="pb-2">
            <p className="text-[15px] text-ink mb-3">{t('employees.purgeText', { name: purge.user.name })}</p>
            {purge.impact && (
              <div className="rounded-2xl bg-danger-soft p-3.5 text-[14px] text-danger-text mb-3">
                <div className="font-semibold mb-1">{t('employees.purgeImpact')}</div>
                <div className="tabular-nums">
                  {t('employees.purgeRecords', { count: purge.impact.sessionCount })} ·{' '}
                  {euros(purge.impact.revenueCents, lang)}
                </div>
                {purge.impact.firstAt && purge.impact.lastAt && (
                  <div className="opacity-80">
                    {fmtDate(purge.impact.firstAt, lang)} – {fmtDate(purge.impact.lastAt, lang)}
                  </div>
                )}
              </div>
            )}
            <p className="text-[14px] text-ink-2">{t('employees.purgeHint')}</p>
            <ErrorText code={error} />
          </div>
        )}
      </Modal>

      {/* delete (with deactivate as the safer option) */}
      <Modal
        open={!!remove}
        onClose={() => setRemove(null)}
        title={remove ? `${remove.name} · ${t('employees.delete')}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemove(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            {remove?.active && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  remove &&
                  run(
                    () => api(`/users/${remove.id}`, { method: 'PATCH', body: { active: false } }),
                    () => setRemove(null),
                  )
                }
              >
                {t('employees.deactivate')}
              </Button>
            )}
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                remove &&
                run(
                  () => api(`/users/${remove.id}`, { method: 'DELETE' }),
                  () => setRemove(null),
                )
              }
            >
              {t('employees.delete')}
            </Button>
          </>
        }
      >
        {remove && (
          <div className="pb-2">
            <p className="text-[15px] text-ink mb-3">{t('employees.confirmDeleteText', { name: remove.name })}</p>
            <p className="text-[14px] text-ink-2">
              {remove.active ? t('employees.deactivateHint') : t('employees.restoreHint')}
            </p>
            <ErrorText code={error} />
          </div>
        )}
      </Modal>
    </div>
  );
}
