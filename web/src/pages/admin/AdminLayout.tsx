import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth';
import { Button, LangSwitch } from '../../components/ui';
import ChangePasswordModal from '../../components/ChangePasswordModal';
import HealthBanner from '../../components/HealthBanner';

const tabs = [
  { to: '/admin', key: 'nav.dashboard', end: true },
  { to: '/admin/services', key: 'nav.services' },
  { to: '/admin/employees', key: 'nav.employees' },
  { to: '/admin/sessions', key: 'nav.sessions' },
  { to: '/admin/system', key: 'nav.system' },
  { to: '/work', key: 'nav.workScreen' },
];

export default function AdminLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);

  return (
    <div className="min-h-dvh">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 pt-safe px-safe">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-lg font-bold text-slate-800">✂️ {t('app.name')}</div>
          <nav className="flex gap-1 overflow-x-auto order-last w-full sm:order-none sm:w-auto">
            {tabs.map(({ to, key, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap ${
                    isActive ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {t(key)}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 hidden sm:inline">{user?.name}</span>
            <LangSwitch />
            <Button variant="ghost" size="sm" onClick={() => setChangingPassword(true)}>
              {t('account.password')}
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              {t('common.logout')}
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto pt-4 px-4-safe pb-4-safe">
        {/* silent unless the server needs attention - shown on every admin page */}
        <HealthBanner />
        <Outlet />
      </main>
      <ChangePasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />
    </div>
  );
}
