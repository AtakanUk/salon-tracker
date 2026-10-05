/**
 * Timezone helpers built on Intl so we need no date library.
 * All statistics are grouped by the salon's local calendar (SALON_TZ).
 */

export function tzOffsetMs(tz: string, utcDate: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(utcDate).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - utcDate.getTime();
}

/** UTC instant at which the given local calendar day (YYYY-MM-DD) starts in tz. */
export function startOfDayUtc(dateStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const offset = tzOffsetMs(tz, new Date(guess));
  return new Date(guess - offset);
}

export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Local calendar day (YYYY-MM-DD) of a UTC instant in tz. */
export function dayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
}

export function monthKey(date: Date, tz: string): string {
  return dayKey(date, tz).slice(0, 7);
}

/** Monday (YYYY-MM-DD) of the local week containing the instant. */
export function weekKey(date: Date, tz: string): string {
  const day = dayKey(date, tz);
  const [y, m, d] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const daysFromMonday = (utc.getUTCDay() + 6) % 7;
  return addDaysStr(day, -daysFromMonday);
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
