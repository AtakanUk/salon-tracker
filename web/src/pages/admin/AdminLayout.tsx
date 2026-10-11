import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { ChartPieSlice, DeviceTablet, HardDrives, Receipt, Tag, UsersThree } from '@phosphor-icons/react';
import { BrandMark, EASE_OUT, SPRING } from '../../components/ui';
import AccountMenu, { MenuLink } from '../../components/AccountMenu';
import HealthBanner from '../../components/HealthBanner';

const tabs = [
  { to: '/admin', key: 'nav.dashboard', end: true, icon: ChartPieSlice },
  { to: '/admin/services', key: 'nav.services', icon: Tag },
  { to: '/admin/employees', key: 'nav.employees', icon: UsersThree },
  { to: '/admin/sessions', key: 'nav.sessions', icon: Receipt },
  { to: '/admin/system', key: 'nav.system', icon: HardDrives },
];

/** True once the page has scrolled, so the header can lift off the content. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return scrolled;
}

export default function AdminLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const scrolled = useScrolled();

  return (
    <div className="min-h-dvh">
      <header
        className={`glass sticky top-0 z-40 pt-safe px-safe border-b transition-[border-color,box-shadow] duration-300 ${
          scrolled ? 'border-line shadow-[0_8px_30px_-12px_rgb(0_0_0/.18)]' : 'border-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <Link to="/admin" className="flex items-center gap-2.5 shrink-0 rounded-xl">
            <BrandMark className="size-8" />
            <span className="text-[17px] font-semibold tracking-[-0.02em]">{t('app.name')}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5 mx-auto">
            {tabs.map(({ to, key, end, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 h-9 px-3.5 rounded-full text-[14px] font-medium whitespace-nowrap transition-colors duration-200 ${
                    isActive ? 'text-ink' : 'text-ink-2 hover:text-ink'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="admin-nav"
                        transition={SPRING}
                        className="absolute inset-0 rounded-full bg-fill shadow-[inset_0_0_0_1px_var(--line)]"
                      />
                    )}
                    <Icon size={17} weight={isActive ? 'fill' : 'bold'} className="relative hidden lg:block" />
                    <span className="relative">{t(key)}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto md:ml-0 flex items-center gap-1">
            <AccountMenu>
              <MenuLink to="/work" icon={DeviceTablet}>
                {t('nav.workScreen')}
              </MenuLink>
            </AccountMenu>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto pt-6 px-4-safe pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10">
        {/* silent unless the server needs attention - shown on every admin page */}
        <HealthBanner />
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
        >
          <Outlet />
        </motion.div>
      </main>

      {/* phones: the sections sit under the thumb, iOS-style */}
      <nav className="md:hidden glass fixed bottom-0 inset-x-0 z-40 border-t border-line pb-safe px-safe">
        <div className="grid grid-cols-5 h-[62px]">
          {tabs.map(({ to, key, end, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors ${
                  isActive ? 'text-accent-text' : 'text-ink-2'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="tab-bar"
                      transition={SPRING}
                      className="absolute top-1.5 h-8 w-14 rounded-full bg-accent-soft"
                    />
                  )}
                  <Icon size={22} weight={isActive ? 'fill' : 'regular'} className="relative" />
                  <span className="relative max-w-full truncate px-1">{t(key)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
