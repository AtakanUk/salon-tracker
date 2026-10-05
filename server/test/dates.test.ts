import { describe, expect, it } from 'vitest';
import { addDaysStr, dayKey, monthKey, startOfDayUtc, weekKey } from '../src/lib/dates.js';

const TZ = 'Europe/Berlin';

describe('startOfDayUtc', () => {
  it('returns local midnight as a UTC instant', () => {
    expect(startOfDayUtc('2026-01-15', TZ).toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(startOfDayUtc('2026-07-15', TZ).toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });

  it('handles the days daylight saving time starts and ends', () => {
    // clocks go forward at 02:00 on 29 March 2026, midnight is still winter time
    expect(startOfDayUtc('2026-03-29', TZ).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(startOfDayUtc('2026-03-30', TZ).toISOString()).toBe('2026-03-29T22:00:00.000Z');
    // clocks go back at 03:00 on 25 October 2026, midnight is still summer time
    expect(startOfDayUtc('2026-10-25', TZ).toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(startOfDayUtc('2026-10-26', TZ).toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
});

describe('dayKey / monthKey / weekKey', () => {
  it('puts a late-evening UTC instant on the next local day', () => {
    const lateEvening = new Date('2026-07-14T22:30:00Z'); // 00:30 on the 15th in Berlin
    expect(dayKey(lateEvening, TZ)).toBe('2026-07-15');
    expect(dayKey(lateEvening, 'UTC')).toBe('2026-07-14');
  });

  it('puts New Year’s Eve after 23:00 UTC into January', () => {
    expect(monthKey(new Date('2026-12-31T23:30:00Z'), TZ)).toBe('2027-01');
  });

  it('starts weeks on Monday', () => {
    expect(weekKey(new Date('2026-10-05T10:00:00Z'), TZ)).toBe('2026-10-05'); // Monday
    expect(weekKey(new Date('2026-10-11T10:00:00Z'), TZ)).toBe('2026-10-05'); // Sunday
    expect(weekKey(new Date('2026-10-11T22:30:00Z'), TZ)).toBe('2026-10-12'); // already Monday locally
  });
});

describe('addDaysStr', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDaysStr('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDaysStr('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysStr('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysStr('2026-03-01', -1)).toBe('2026-02-28');
  });
});
