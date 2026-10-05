import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth';
import { ApiError } from '../lib/api';
import { Button, Card, ErrorText, Field, LangSwitch, TextInput } from '../components/ui';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'generic');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-6-safe">
      <Card className="w-full max-w-sm p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">✂️ {t('app.name')}</h1>
          <LangSwitch />
        </div>
        <form onSubmit={onSubmit}>
          <Field label={t('login.username')}>
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              required
            />
          </Field>
          <Field label={t('login.password')}>
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <ErrorText code={error} />
          <Button type="submit" size="lg" className="w-full mt-2" disabled={busy}>
            {t('login.submit')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
