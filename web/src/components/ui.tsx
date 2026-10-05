import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth';
import type { Locale } from '../lib/types';

const btnVariants = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300',
  secondary:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300',
  dangerOutline:
    'bg-white text-red-600 border border-red-300 hover:bg-red-50 active:bg-red-100 disabled:text-red-300',
  ghost: 'text-slate-600 hover:bg-slate-200 active:bg-slate-300',
};

const btnSizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-base rounded-xl',
  lg: 'px-6 py-4 text-xl rounded-2xl',
  xl: 'px-8 py-7 text-3xl rounded-3xl',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof btnVariants;
  size?: keyof typeof btnSizes;
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`font-semibold transition-colors select-none touch-manipulation ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
      {...props}
    />
  );
}

/**
 * Column spacing for data tables. Without it the cells touch each other on
 * narrow screens ("EmployeeServicesDuration"); the last column stays flush right.
 */
export const tableCols = '[&_th]:pr-4 [&_td]:pr-4 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0';

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`bg-white rounded-2xl shadow-sm p-4 ${className}`}>{children}</div>;
}

export function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600 ${className}`}
    />
  );
}

export function FullScreenSpinner() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <Spinner className="h-10 w-10" />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4-safe">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        className={`relative bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90dvh] flex flex-col`}
      >
        {title && (
          <div className="px-5 pt-5 pb-2 text-lg font-bold text-slate-800">{title}</div>
        )}
        <div className="px-5 py-2 overflow-y-auto grow">{children}</div>
        {footer && <div className="px-5 py-4 flex gap-3 justify-end border-t border-slate-100">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 ${props.className ?? ''}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 ${props.className ?? ''}`}
    />
  );
}

const badgeColors = {
  green: 'bg-emerald-100 text-emerald-800',
  red: 'bg-red-100 text-red-700',
  slate: 'bg-slate-200 text-slate-600',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-sky-100 text-sky-800',
};

export function Badge({ color = 'slate', children }: { color?: keyof typeof badgeColors; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeColors[color]}`}>
      {children}
    </span>
  );
}

export function ErrorText({ code }: { code: string | null }) {
  const { t } = useTranslation();
  if (!code) return null;
  const key = `errors.${code}`;
  const msg = t(key);
  return (
    <p className="text-sm font-medium text-red-600 my-2">
      {msg === key ? t('errors.generic') : msg}
    </p>
  );
}

export function LangSwitch({ className = '' }: { className?: string }) {
  const { i18n } = useTranslation();
  const { setLocale } = useAuth();
  const current = i18n.language;
  return (
    <div className={`inline-flex rounded-xl border border-slate-300 overflow-hidden ${className}`}>
      {(['tr', 'de', 'en'] as Locale[]).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLocale(lang)}
          className={`px-3 py-1.5 text-sm font-bold uppercase ${
            current === lang ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-100'
          }`}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
