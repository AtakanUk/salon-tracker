const INTL_LOCALES: Record<string, string> = { tr: 'tr-TR', de: 'de-DE', en: 'en-GB' };

export const intlLocale = (lang: string) => INTL_LOCALES[lang] ?? 'en-GB';

export function euros(cents: number, lang: string): string {
  return new Intl.NumberFormat(intlLocale(lang), {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

/** 19 -> "19%", "%19" or "19 %" depending on the language. */
export function percent(value: number, lang: string): string {
  return new Intl.NumberFormat(intlLocale(lang), { style: 'percent', maximumFractionDigits: 0 }).format(value / 100);
}

export function decimal(value: number, lang: string, digits = 1): string {
  return new Intl.NumberFormat(intlLocale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function eurosCompact(cents: number, lang: string): string {
  return new Intl.NumberFormat(intlLocale(lang), {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

export function fmtTime(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function fmtDate(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

export function fmtDateTime(iso: string, lang: string): string {
  return `${fmtDate(iso, lang)} ${fmtTime(iso, lang)}`;
}

/**
 * The price list is kept in the salon's two languages, Turkish and German.
 * The English interface shows the German names.
 */
export function serviceName(s: { nameTr: string; nameDe: string }, lang: string): string {
  return lang === 'tr' ? s.nameTr : s.nameDe;
}

/** How one item of a record reads in a list: "Haarschnitt ×2", "Sonderleistung (bridal updo)". */
export function itemLabel(
  i: { nameTr: string; nameDe: string; note?: string | null; quantity: number },
  lang: string,
): string {
  return `${serviceName(i, lang)}${i.note ? ` (${i.note})` : ''}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`;
}

/**
 * An amount the way people type it into a text field: "35,50" in Turkish and
 * German, "35.50" in English. Read back with either separator.
 */
export function amountInput(cents: number, lang: string): string {
  const fixed = (cents / 100).toFixed(2);
  return lang === 'en' ? fixed : fixed.replace('.', ',');
}

/** YYYY-MM-DD of a date in the browser's local time. */
export function dateInputValue(d: Date): string {
  return new Intl.DateTimeFormat('en-CA').format(d);
}

/** YYYY-MM-DDTHH:mm for <input type="datetime-local">, in the browser's local time. */
export function dateTimeInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
