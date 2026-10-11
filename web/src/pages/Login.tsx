import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useAnimate } from 'motion/react';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { useAuth } from '../auth';
import { ApiError } from '../lib/api';
import {
  Aurora,
  BrandMark,
  Button,
  EASE_OUT,
  ErrorText,
  Field,
  LangSwitch,
  Spinner,
  TextInput,
} from '../components/ui';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [card, animateCard] = useAnimate<HTMLFormElement>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'generic');
      // the "no" shake of a wrong password, before the message is even read
      animateCard(card.current, { x: [0, -12, 10, -7, 5, -2, 0] }, { duration: 0.5, ease: 'easeOut' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative isolate min-h-dvh overflow-hidden flex flex-col p-6-safe">
      <Aurora />
      <div className="flex justify-end">
        <LangSwitch />
      </div>

      <div className="grow grid place-items-center py-10">
        <div className="w-full max-w-[380px]">
          <div className="flex flex-col items-center text-center mb-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.6, rotate: -14 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: 'spring', bounce: 0.45, duration: 0.9 }}
              className="relative"
            >
              <span className="absolute inset-[-30%] rounded-full bg-accent/25 blur-2xl animate-breathe" />
              <BrandMark className="relative size-16" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.12 }}
              className="mt-6 text-[34px] font-semibold tracking-[-0.035em] leading-none"
            >
              {t('app.name')}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-2.5 text-[15px] text-ink-2"
            >
              {t('login.title')}
            </motion.p>
          </div>

          <motion.form
            ref={card}
            onSubmit={onSubmit}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.2 }}
            className="glass rounded-[1.75rem] border border-line [box-shadow:var(--highlight),var(--shadow-raised)] p-6 sm:p-7"
          >
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
              <span className="relative block">
                <TextInput
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center size-8 rounded-full text-ink-3 hover:text-ink hover:bg-fill transition-colors"
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </Field>
            <ErrorText code={error} />
            <Button type="submit" size="lg" className="w-full mt-2" disabled={busy}>
              {busy ? <Spinner className="size-5 border-white/35 border-t-white" /> : t('login.submit')}
            </Button>
          </motion.form>
        </div>
      </div>
    </div>
  );
}
