import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  PointerEvent,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, animate, motion, useDragControls } from 'motion/react';
import { CaretDown, CheckCircle, WarningCircle, X } from '@phosphor-icons/react';
import { useAuth } from '../auth';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { Locale } from '../lib/types';

/** The confident arrival curve used everywhere: fast start, long soft landing. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const SPRING = { type: 'spring', bounce: 0.18, duration: 0.5 } as const;

/** `style={stagger(i)}` on an element with className="stagger": the i-th item of a list. */
export const stagger = (i: number) => ({ '--i': i }) as CSSProperties;

const btnVariants = {
  primary:
    'shine bg-accent text-white hover:bg-accent-hover shadow-[inset_0_1px_0_rgb(255_255_255/.22),0_1px_2px_rgb(0_0_0/.12),0_8px_20px_-8px_rgb(0_113_227/.6)]',
  go: 'shine bg-go text-white hover:bg-go-hover shadow-[inset_0_1px_0_rgb(255_255_255/.22),0_1px_2px_rgb(0_0_0/.12),0_10px_28px_-10px_rgb(31_143_69/.7)]',
  secondary: 'bg-fill text-ink hover:bg-fill-strong',
  danger:
    'shine bg-danger text-white hover:brightness-110 shadow-[inset_0_1px_0_rgb(255_255_255/.2),0_1px_2px_rgb(0_0_0/.12),0_8px_20px_-8px_rgb(215_0_21/.55)]',
  dangerOutline: 'bg-danger-soft text-danger-text hover:bg-danger/15',
  ghost: 'text-ink-2 hover:bg-fill hover:text-ink',
};

const btnSizes = {
  sm: 'min-h-8 px-3.5 py-1 text-[13px] gap-1.5 rounded-full',
  md: 'min-h-10 px-5 py-2 text-[15px] gap-2 rounded-full',
  lg: 'min-h-12 px-6 py-2.5 text-[17px] gap-2 rounded-full',
  xl: 'min-h-20 px-8 py-5 text-3xl gap-3 rounded-[2rem]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof btnVariants;
  size?: keyof typeof btnSizes;
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`relative isolate inline-flex items-center justify-center text-center leading-tight font-semibold tracking-[-0.01em] overflow-hidden select-none touch-manipulation cursor-pointer transition-[background-color,color,box-shadow,transform,filter,opacity] duration-200 ease-out-expo active:scale-[.97] disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
      {...props}
    />
  );
}

/**
 * Data tables. Cells get padding on both sides so a hovered row reads as one
 * band; wrap the table in TableWrap, which pulls it out by the same amount so
 * the first column still lines up with the card's heading.
 */
export const tableCls =
  'w-full text-[14px] [font-variant-numeric:tabular-nums] [&_th]:px-3 [&_td]:px-3 [&_th]:py-2.5 [&_th]:text-[13px] [&_th]:font-medium [&_th]:text-ink-3 [&_th]:whitespace-nowrap [&_td]:py-3 [&_tbody_tr]:border-t [&_tbody_tr]:border-line [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-fill/40';

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-3 overflow-x-auto">{children}</div>;
}

/** Writes the pointer position into --mx/--my for the .spotlight border. */
function trackPointer(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse') return;
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

export function Card({
  className = '',
  padding = 'p-5 sm:p-6',
  spotlight = true,
  style,
  children,
}: {
  className?: string;
  padding?: string;
  spotlight?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      onPointerMove={spotlight ? trackPointer : undefined}
      style={style}
      className={`bg-surface rounded-[1.375rem] border border-line shadow-card ${spotlight ? 'spotlight' : ''} ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

/** Heading of a card; `aside` sits on the right (a toggle, a count). */
export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{children}</h2>
      {aside}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-x-4 gap-y-3 flex-wrap animate-enter">
      <div className="min-w-0">
        <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.03em] leading-[1.1] text-ink text-balance">
          {title}
        </h1>
        {description && <p className="mt-1.5 text-[15px] text-ink-2 max-w-[65ch] text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/** The salon's mark: the app icon's scissors, drawn in place so it follows the theme. */
export function BrandMark({ className = 'size-9' }: { className?: string }) {
  return (
    <span
      className={`relative inline-grid place-items-center shrink-0 rounded-[28%] bg-[linear-gradient(160deg,#3a3a3e,#111113)] shadow-[inset_0_1px_0_rgb(255_255_255/.18),0_4px_12px_-4px_rgb(0_0_0/.4)] ${className}`}
    >
      <svg viewBox="0 0 100 100" className="size-[78%]" aria-hidden="true">
        <g stroke="#ffffff" strokeLinecap="round" fill="none">
          <path d="M50 54 34.5 20M50 54 65.5 20" strokeWidth="6" />
          <path d="M50 54 39.5 66M50 54 60.5 66" strokeWidth="4.8" />
          <circle cx="36" cy="73" r="9.5" strokeWidth="5.4" />
          <circle cx="64" cy="73" r="9.5" strokeWidth="5.4" />
        </g>
        <circle cx="50" cy="54" r="5" fill="#30d158" />
      </svg>
    </span>
  );
}

/** Drifting light for full-screen pages; the parent needs `relative isolate overflow-hidden`. */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return (
    <span
      role="status"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-fill-strong border-t-accent ${className}`}
    />
  );
}

export function FullScreenSpinner() {
  return (
    <div className="min-h-dvh grid place-items-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 }}
        className="flex flex-col items-center gap-5"
      >
        <BrandMark className="size-14" />
        <Spinner />
      </motion.div>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** A centered note for "nothing here", with an icon so it reads as a state, not a glitch. */
export function EmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-10 px-4 animate-enter">
      <span className="grid place-items-center size-12 rounded-2xl bg-fill text-ink-2">{icon}</span>
      <p className="text-[15px] text-ink-2 max-w-[40ch] text-pretty">{children}</p>
    </div>
  );
}

/**
 * Counts from the previous value to the new one. The text is written straight
 * into the DOM on every frame instead of through React state, so a running
 * count costs no re-renders.
 */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const fmt = useRef(format);
  fmt.current = format;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.textContent = fmt.current(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration: 1.1,
      ease: EASE_OUT,
      onUpdate: (v) => {
        node.textContent = fmt.current(v);
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value]);

  return <span ref={ref} />;
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
  const { t } = useTranslation();
  // a bottom sheet on phones (thumb reach, drag down to close), a centered dialog elsewhere
  const sheet = useMediaQuery('(max-width: 639px)');
  const drag = useDragControls();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  // portaled to <body>: a page wrapper that animates with transform would
  // otherwise become the containing block of this fixed overlay
  return createPortal(
    <AnimatePresence propagate>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4-safe">
          <motion.div
            className="absolute inset-0 bg-black/35 backdrop-blur-[6px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.3 }}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            drag={sheet ? 'y' : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
            initial={sheet ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 14, filter: 'blur(6px)' }}
            animate={sheet ? { y: 0 } : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={
              sheet
                ? { y: '100%', transition: { duration: 0.25, ease: 'easeIn' } }
                : { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.16 } }
            }
            transition={sheet ? { type: 'spring', bounce: 0.1, duration: 0.5 } : SPRING}
            className={`relative w-full outline-none bg-raised text-ink shadow-raised border border-line flex flex-col max-h-[92dvh] sm:max-h-[90dvh] rounded-t-[1.75rem] sm:rounded-[1.75rem] pb-safe sm:pb-0 ${
              wide ? 'sm:max-w-3xl' : 'sm:max-w-md'
            }`}
          >
            {sheet && (
              <div
                className="flex justify-center pt-2.5 pb-1 cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={(e) => drag.start(e)}
              >
                <span className="h-1.5 w-10 rounded-full bg-fill-strong" />
              </div>
            )}
            <div className="flex items-start justify-between gap-3 px-6 pt-4 sm:pt-6 pb-2">
              {title && (
                <h2 id={titleId} className="text-[20px] font-semibold tracking-[-0.02em] leading-tight text-balance">
                  {title}
                </h2>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
                className="ml-auto -mr-2 -mt-1 grid place-items-center size-8 shrink-0 rounded-full bg-fill text-ink-2 hover:text-ink hover:bg-fill-strong transition-colors"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
            <div className="px-6 py-2 overflow-y-auto grow overscroll-contain">{children}</div>
            {footer && (
              <div className="px-6 py-4 flex gap-2.5 justify-end flex-wrap border-t border-line">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-[13px] font-medium text-ink-2 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const fieldCls =
  'bg-field text-ink border border-line-strong shadow-[inset_0_1px_2px_rgb(0_0_0/.04)] transition-[border-color,box-shadow] duration-200 ease-out-expo hover:border-ink-3/60 focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 disabled:opacity-50 disabled:cursor-not-allowed';

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-11 rounded-xl px-3.5 text-[15px] placeholder:text-ink-3 ${fieldCls} ${className}`}
    />
  );
}

export function Select({
  className = '',
  size = 'md',
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { size?: 'sm' | 'md' }) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <select
        {...props}
        className={`w-full appearance-none cursor-pointer pr-9 ${
          size === 'sm' ? 'h-9 rounded-full pl-3.5 text-[13px] font-medium' : 'h-11 rounded-xl pl-3.5 text-[15px]'
        } ${fieldCls}`}
      />
      <CaretDown
        size={13}
        weight="bold"
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3"
      />
    </span>
  );
}

const badgeColors = {
  green: 'bg-go-soft text-go-text',
  red: 'bg-danger-soft text-danger-text',
  slate: 'bg-fill text-ink-2',
  amber: 'bg-warn-soft text-warn-text',
  blue: 'bg-accent-soft text-accent-text',
};

export function Badge({
  color = 'slate',
  dot,
  pulse,
  children,
}: {
  color?: keyof typeof badgeColors;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full h-6 px-2.5 text-[12px] font-semibold whitespace-nowrap ${badgeColors[color]}`}
    >
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && <span className="absolute inset-0 rounded-full bg-current animate-pulse-ring" />}
          <span className="relative size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

/** iOS-style on/off switch; the knob springs across instead of jumping. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[30px] w-[50px] shrink-0 items-center rounded-full p-[2px] cursor-pointer transition-colors duration-300 ease-out-expo disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'justify-end bg-go' : 'justify-start bg-fill-strong'
      }`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
        className="size-[26px] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/.22),0_0_0_.5px_rgb(0_0_0/.04)]"
      />
    </button>
  );
}

/** A live dot: steady when idle, sending out rings while `pulse` is on. */
export function StatusDot({ tone, pulse }: { tone: 'go' | 'danger' | 'warn' | 'idle'; pulse?: boolean }) {
  const bg = { go: 'bg-go-text', danger: 'bg-danger-text', warn: 'bg-warn-text', idle: 'bg-ink-3' }[tone];
  return (
    <span className="relative flex size-2.5 shrink-0">
      {pulse && <span className={`absolute inset-0 rounded-full animate-pulse-ring ${bg}`} />}
      <span className={`relative size-2.5 rounded-full ${bg}`} />
    </span>
  );
}

/** A person's initials on their chart color, so a name reads the same in a table and a chart. */
export function Avatar({ name, color, className = 'size-8 text-[12px]' }: { name: string; color?: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase())
    .join('');
  const tint = color ?? 'var(--ink-3)';
  return (
    <span
      aria-hidden="true"
      className={`inline-grid place-items-center shrink-0 rounded-[32%] font-semibold text-ink ${className}`}
      style={{
        background: `color-mix(in oklab, ${tint} 22%, var(--surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tint} 40%, transparent)`,
      }}
    >
      {initials}
    </span>
  );
}

export function ErrorText({ code }: { code: string | null }) {
  const { t } = useTranslation();
  if (!code) return null;
  const key = `errors.${code}`;
  const msg = t(key);
  return (
    <motion.p
      key={code}
      role="alert"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="flex items-start gap-2 text-[14px] font-medium text-danger-text my-2"
    >
      <WarningCircle size={18} weight="fill" className="shrink-0 mt-px" />
      <span>{msg === key ? t('errors.generic') : msg}</span>
    </motion.p>
  );
}

/** Confirmation after an action ("backup done", "mail sent"). */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <motion.p
      role="status"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING}
      className="inline-flex items-center gap-2 self-start rounded-full bg-go-soft text-go-text px-3.5 py-1.5 text-[14px] font-semibold"
    >
      <CheckCircle size={18} weight="fill" />
      {children}
    </motion.p>
  );
}

/**
 * iOS-style segmented control: the selection is a knob that slides to the
 * chosen option instead of jumping there.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  stretch,
  className = '',
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  /** options share the full width instead of hugging their labels */
  stretch?: boolean;
  className?: string;
  label?: string;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`${stretch ? 'flex' : 'inline-flex'} p-[3px] rounded-full bg-fill ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`relative rounded-full font-semibold whitespace-nowrap cursor-pointer transition-colors duration-200 ${
              size === 'sm' ? 'h-7 px-3 text-[13px]' : 'h-8 px-3.5 text-[14px]'
            } ${stretch ? 'flex-1' : ''} ${active ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}
          >
            {active && (
              <motion.span
                layoutId={`knob-${id}`}
                transition={SPRING}
                className="absolute inset-0 rounded-full bg-[var(--knob,var(--surface))] shadow-[0_1px_2px_rgb(0_0_0/.1),0_3px_10px_-3px_rgb(0_0_0/.16)] [--knob:#fff] dark:[--knob:#5b5b60]"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LangSwitch({ className = '', stretch }: { className?: string; stretch?: boolean }) {
  const { i18n } = useTranslation();
  const { setLocale } = useAuth();
  return (
    <Segmented
      size="sm"
      stretch={stretch}
      className={className}
      value={i18n.language as Locale}
      onChange={(lang) => setLocale(lang)}
      options={(['tr', 'de', 'en'] as Locale[]).map((lang) => ({ value: lang, label: lang.toUpperCase() }))}
    />
  );
}
