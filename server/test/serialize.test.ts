import { describe, expect, it } from 'vitest';
import type { Service, Session, SessionItem, User } from '@prisma/client';
import { displayUsername, publicUser, sessionOut } from '../src/lib/serialize.js';

const user = (over: Partial<User> = {}): User => ({
  id: 7,
  name: 'Deniz',
  username: 'deniz',
  passwordHash: 'hash',
  role: 'EMPLOYEE',
  locale: 'en',
  active: true,
  createdAt: new Date('2026-07-01T08:00:00Z'),
  deletedAt: null,
  ...over,
});

const service = (over: Partial<Service> = {}): Service => ({
  id: 1,
  nameTr: 'Saç kesimi',
  nameDe: 'Haarschnitt',
  priceCents: 2200,
  sortOrder: 0,
  active: true,
  custom: false,
  createdAt: new Date('2026-07-01T08:00:00Z'),
  ...over,
});

describe('displayUsername', () => {
  it('hides the #id suffix of a deleted account', () => {
    expect(displayUsername(user({ username: 'deniz#7', deletedAt: new Date() }))).toBe('deniz');
  });

  it('leaves live accounts alone', () => {
    expect(displayUsername(user())).toBe('deniz');
  });
});

describe('publicUser', () => {
  it('never exposes the password hash', () => {
    expect(publicUser(user())).not.toHaveProperty('passwordHash');
    expect(publicUser(user({ deletedAt: new Date() })).deleted).toBe(true);
  });
});

describe('sessionOut', () => {
  it('totals the snapshot prices, not the current list price', () => {
    const items: (SessionItem & { service: Service })[] = [
      // the list says 22.00 now, the record was saved at 20.00
      { id: 1, sessionId: 1, serviceId: 1, priceCentsSnapshot: 2000, quantity: 2, note: null, service: service() },
      {
        id: 2,
        sessionId: 1,
        serviceId: 9,
        priceCentsSnapshot: 3550,
        quantity: 1,
        note: 'bridal updo',
        service: service({ id: 9, custom: true, priceCents: 0 }),
      },
    ];
    const session: Session = {
      id: 1,
      employeeId: 7,
      startedAt: new Date('2026-07-14T09:00:00Z'),
      finishedAt: new Date('2026-07-14T09:42:00Z'),
      status: 'COMPLETED',
      editedAt: null,
    };

    const out = sessionOut({ ...session, items });
    expect(out.totalCents).toBe(2 * 2000 + 3550);
    expect(out.durationMinutes).toBe(42);
    expect(out.items?.[1]).toMatchObject({ custom: true, note: 'bridal updo', priceCents: 3550 });
  });

  it('has no duration while the customer is still in the chair', () => {
    const out = sessionOut({
      id: 2,
      employeeId: 7,
      startedAt: new Date(),
      finishedAt: null,
      status: 'ACTIVE',
      editedAt: null,
    });
    expect(out.durationMinutes).toBeNull();
    expect(out.totalCents).toBe(0);
  });
});
