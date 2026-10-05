import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import i18n from './i18n';
import { api } from './lib/api';
import type { Locale, User } from './lib/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setLocale: (locale: Locale) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then((r) => {
        setUser(r.user);
        i18n.changeLanguage(r.user.locale);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api<{ user: User }>('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    setUser(r.user);
    i18n.changeLanguage(r.user.locale);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const setLocale = useCallback(
    (locale: Locale) => {
      i18n.changeLanguage(locale);
      if (user) {
        // fire and forget; the preference is also kept in localStorage
        api<{ user: User }>('/auth/me/locale', { method: 'PATCH', body: { locale } })
          .then((r) => setUser(r.user))
          .catch(() => {});
      }
    },
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setLocale }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
