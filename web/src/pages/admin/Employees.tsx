import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth';
import { api, ApiError } from '../../lib/api';
import { MIN_PASSWORD_LENGTH, generatePassword } from '../../lib/password';
import { euros, fmtDate } from '../../lib/format';
import type { Role, User } from '../../lib/types';
import { Badge, Button, Card, ErrorText, Field, Modal, Select, Spinner, TextInput, tableCols } from '../../components/ui';

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
  <span className="block text-xs text-slate-500 mt-1">{text}</span>
);

// clipboard needs a secure context; over plain http (local testing) it is missing
const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;

export default function Employees() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user: me } = useAuth();
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

  if (!users) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const live = users.filter((u) => !u.deleted);
  const deleted = users.filter((u) => u.deleted);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t('employees.title')}</h1>
        <Button onClick={() => { setForm(emptyForm); setError(null); }}>
          + {t('employees.add')}
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className={`w-full text-sm ${tableCols}`}>
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 font-medium">{t('employees.name')}</th>
              <th className="py-2 font-medium">{t('employees.username')}</th>
              <th className="py-2 font-medium text-center">{t('employees.role')}</th>
              <th className="py-2 font-medium text-center">{t('sessions.status')}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {live.map((u) => (
              <tr key={u.id} className={`border-b border-slate-100 ${u.active ? '' : 'opacity-60'}`}>
                <td className="py-2.5 font-semibold text-slate-800">{u.name}</td>
                <td className="py-2.5 text-slate-600">{u.username}</td>
                <td className="py-2.5 text-center">
                  <Badge color={u.role === 'ADMIN' ? 'blue' : 'slate'}>
                    {u.role === 'ADMIN' ? t('employees.roleAdmin') : t('employees.roleEmployee')}
                  </Badge>
                </td>
                <td className="py-2.5 text-center">
                  <Badge color={u.active ? 'green' : 'red'}>
                    {u.active ? t('employees.active') : t('employees.inactive')}
                  </Badge>
                </td>
                <td className="py-2.5">
                  <div className="flex gap-1.5 justify-end flex-wrap">
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
                      {t('employees.resetPassword')}
                    </Button>
                    {u.id !== me?.id && (
                      <Button
                        variant="dangerOutline"
                        size="sm"
                        onClick={() => { setError(null); setRemove(u); }}
                      >
                        {t('employees.delete')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {deleted.length > 0 && (
        <Card>
          <button
            type="button"
            className="w-full text-left text-sm font-semibold text-slate-600"
            onClick={() => setShowDeleted((v) => !v)}
          >
            {showDeleted ? '▾' : '▸'} {t('employees.deletedAccounts')} ({deleted.length})
          </button>
          {showDeleted && (
            <>
              <p className="text-xs text-slate-500 mt-2">{t('employees.deletedNote')}</p>
              <table className={`w-full text-sm mt-2 ${tableCols}`}>
                <tbody>
                  {deleted.map((u) => (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="py-2.5 pr-4 font-semibold text-slate-700 whitespace-nowrap">{u.name}</td>
                      <td className="py-2.5 w-full text-slate-500">{u.username}</td>
                      <td className="py-2.5">
                        <div className="flex gap-1.5 justify-end flex-wrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => run(() => api(`/users/${u.id}/restore`, { method: 'POST' }))}
                          >
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
                            {t('employees.purge')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ErrorText code={!form && !reset && !remove ? error : null} />
            </>
          )}
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
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setForm({ ...form, password: generatePassword() })}
                  >
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
              <label className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="w-5 h-5 accent-emerald-600"
                />
                <span className="text-sm font-medium text-slate-600">{t('employees.active')}</span>
              </label>
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
                  onChange={(e) => setReset({ ...reset, password: e.target.value })}
                />
                <Button
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => setReset({ ...reset, password: generatePassword() })}
                >
                  {t('employees.regenerate')}
                </Button>
              </div>
              <Hint text={t('employees.passwordHint', { min: MIN_PASSWORD_LENGTH })} />
            </Field>
            <ErrorText code={error} />
          </>
        )}
        {reset?.done && (
          <>
            <p className="text-sm text-slate-600 mb-3">{t('employees.passwordNotice')}</p>
            <div className="rounded-xl bg-slate-100 py-4 text-center text-2xl font-bold text-slate-800 tracking-wide select-all">
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
                {copied ? t('employees.copied') : t('employees.copy')}
              </Button>
            )}
          </>
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
          <>
            <p className="text-sm text-slate-700 mb-3">
              {t('employees.purgeText', { name: purge.user.name })}
            </p>
            {purge.impact && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800 mb-3">
                <div className="font-semibold mb-1">{t('employees.purgeImpact')}</div>
                <div>
                  {t('employees.purgeRecords', { count: purge.impact.sessionCount })} ·{' '}
                  {euros(purge.impact.revenueCents, lang)}
                </div>
                {purge.impact.firstAt && purge.impact.lastAt && (
                  <div className="text-red-600">
                    {fmtDate(purge.impact.firstAt, lang)} – {fmtDate(purge.impact.lastAt, lang)}
                  </div>
                )}
              </div>
            )}
            <p className="text-sm text-slate-500">{t('employees.purgeHint')}</p>
            <ErrorText code={error} />
          </>
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
          <>
            <p className="text-sm text-slate-700 mb-3">
              {t('employees.confirmDeleteText', { name: remove.name })}
            </p>
            <p className="text-sm text-slate-500">
              {remove.active ? t('employees.deactivateHint') : t('employees.restoreHint')}
            </p>
            <ErrorText code={error} />
          </>
        )}
      </Modal>
    </div>
  );
}
