import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { MIN_PASSWORD_LENGTH } from '../lib/password';
import { Button, ErrorText, Field, Modal, TextInput } from './ui';

/** Anyone changing their own password: needs the current one, works for staff and admins alike. */
export default function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function close() {
    setCurrent('');
    setNext('');
    setRepeat('');
    setError(null);
    setDone(false);
    onClose();
  }

  async function save() {
    if (next.length < MIN_PASSWORD_LENGTH) return setError('password_too_short');
    if (next !== repeat) return setError('password_mismatch');
    setBusy(true);
    setError(null);
    try {
      await api('/auth/me/password', {
        method: 'PATCH',
        body: { currentPassword: current, newPassword: next },
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'generic');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('account.changePassword')}
      footer={
        done ? (
          <Button onClick={close}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={busy || !current || !next}>
              {t('common.save')}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p className="py-2 text-emerald-700 font-semibold">{t('account.changed')}</p>
      ) : (
        <>
          <Field label={t('account.currentPassword')}>
            <TextInput
              type="password"
              value={current}
              autoComplete="current-password"
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label={t('account.newPassword')}>
            <TextInput
              type="password"
              value={next}
              autoComplete="new-password"
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label={t('account.repeatPassword')}>
            <TextInput
              type="password"
              value={repeat}
              autoComplete="new-password"
              onChange={(e) => setRepeat(e.target.value)}
            />
          </Field>
          <ErrorText code={error} />
        </>
      )}
    </Modal>
  );
}
