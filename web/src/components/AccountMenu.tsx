import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { CaretDown, Key, SignOut } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useAuth } from '../auth';
import { Avatar, LangSwitch, SPRING } from './ui';
import ChangePasswordModal from './ChangePasswordModal';

const itemCls =
  'flex w-full items-center gap-3 rounded-xl px-3 h-10 text-[14px] font-medium text-left transition-colors cursor-pointer';

export function MenuLink({ to, icon: I, children }: { to: string; icon: Icon; children: ReactNode }) {
  return (
    <Link to={to} role="menuitem" className={`${itemCls} text-ink hover:bg-fill`}>
      <I size={18} className="text-ink-2" />
      {children}
    </Link>
  );
}

/**
 * The signed-in person, behind their initials: language, password, sign out,
 * plus whatever links the page adds (the other screen, for an owner).
 */
export default function AccountMenu({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-10 pl-1 pr-2.5 rounded-full hover:bg-fill transition-colors cursor-pointer"
      >
        <Avatar name={user.name} />
        <span className="text-[14px] font-medium text-ink hidden lg:inline max-w-32 truncate">{user.name}</span>
        <CaretDown
          size={12}
          weight="bold"
          className={`text-ink-3 transition-transform duration-300 ease-out-expo ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.94, y: -6, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } }}
            transition={SPRING}
            style={{ transformOrigin: 'top right' }}
            onClick={(e) => (e.target as HTMLElement).closest('a,[role=menuitem]') && setOpen(false)}
            className="absolute right-0 top-full mt-2 w-72 z-50 rounded-2xl border border-line bg-raised/92 backdrop-blur-xl shadow-raised p-2"
          >
            <div className="flex items-center gap-3 px-2.5 pt-1.5 pb-3">
              <Avatar name={user.name} className="size-10 text-[14px]" />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold truncate">{user.name}</div>
                <div className="text-[13px] text-ink-3 truncate">@{user.username}</div>
              </div>
            </div>
            <div className="px-1 pb-2">
              <LangSwitch stretch />
            </div>
            <div className="h-px bg-line mx-1 mb-1" />
            {children}
            <button
              type="button"
              role="menuitem"
              className={`${itemCls} text-ink hover:bg-fill`}
              onClick={() => setChangingPassword(true)}
            >
              <Key size={18} className="text-ink-2" />
              {t('account.changePassword')}
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${itemCls} text-danger-text hover:bg-danger-soft`}
              onClick={logout}
            >
              <SignOut size={18} />
              {t('common.logout')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ChangePasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />
    </div>
  );
}
