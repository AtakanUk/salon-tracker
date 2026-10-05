import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  call,
  createService,
  createUser,
  prisma,
  recordSession,
  resetDb,
  testApp,
  today,
} from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

describe('starting a customer', () => {
  it('allows one open customer per employee', async () => {
    const { cookie } = await createUser(app);
    const first = await call(app, 'POST', '/api/sessions/start', cookie);
    expect(first.statusCode).toBe(201);

    const second = await call(app, 'POST', '/api/sessions/start', cookie);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'active_session_exists' });
  });

  it('is backed by a partial unique index, so a double tap cannot race past the check', async () => {
    const { user } = await createUser(app);
    await prisma.session.create({ data: { employeeId: user.id } });
    await expect(prisma.session.create({ data: { employeeId: user.id } })).rejects.toMatchObject({
      code: 'P2002',
    });
    // finished sessions do not count
    await prisma.session.updateMany({ data: { status: 'COMPLETED', finishedAt: new Date() } });
    await expect(prisma.session.create({ data: { employeeId: user.id } })).resolves.toBeTruthy();
  });

  it('takes the time from the server, not from the tablet', async () => {
    const { cookie } = await createUser(app);
    const before = Date.now();
    const res = await call(app, 'POST', '/api/sessions/start', cookie, {
      startedAt: '2020-01-01T00:00:00Z',
    });
    const startedAt = new Date(res.json().session.startedAt).getTime();
    expect(startedAt).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('price snapshots', () => {
  it('keeps the price a record was saved with when the price list changes', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const { cookie } = await createUser(app);
    const haircut = await createService({ priceCents: 2000 });

    const old = await recordSession(app, cookie, [{ serviceId: haircut.id, quantity: 1 }]);
    expect(old.totalCents).toBe(2000);

    const update = await call(app, 'PATCH', `/api/services/${haircut.id}`, admin.cookie, {
      priceCents: 2200,
    });
    expect(update.statusCode).toBe(200);

    const fresh = await recordSession(app, cookie, [{ serviceId: haircut.id, quantity: 1 }]);
    expect(fresh.totalCents).toBe(2200);

    const stats = await call(
      app,
      'GET',
      `/api/stats/overview?from=${today()}&to=${today()}`,
      admin.cookie,
    );
    expect(stats.json().revenueCents).toBe(2000 + 2200);
  });

  it('never takes the price of a listed service from the request', async () => {
    const { cookie } = await createUser(app);
    const haircut = await createService({ priceCents: 2000 });

    const session = await recordSession(app, cookie, [
      { serviceId: haircut.id, quantity: 1, priceCents: 1, note: 'my own price' },
    ]);
    expect(session.totalCents).toBe(2000);
    expect(session.items[0].note).toBeNull();
  });

  it('takes amount and note from the request for the custom service only', async () => {
    const { cookie } = await createUser(app);
    const haircut = await createService({ priceCents: 2000 });
    const custom = await createService({ name: 'Custom', priceCents: 0, custom: true });

    const session = await recordSession(app, cookie, [
      { serviceId: haircut.id, quantity: 1 },
      { serviceId: custom.id, quantity: 1, priceCents: 3550, note: '  bridal updo  ' },
    ]);
    expect(session.totalCents).toBe(5550);
    expect(session.items.find((i: { custom: boolean }) => i.custom)).toMatchObject({
      priceCents: 3550,
      note: 'bridal updo',
    });
  });

  it('refuses a custom service without an amount', async () => {
    const { cookie } = await createUser(app);
    const custom = await createService({ name: 'Custom', priceCents: 0, custom: true });
    const start = await call(app, 'POST', '/api/sessions/start', cookie);
    const res = await call(app, 'POST', `/api/sessions/${start.json().session.id}/finish`, cookie, {
      items: [{ serviceId: custom.id, quantity: 1 }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'amount_required' });
  });

  it('refuses a deactivated service', async () => {
    const { cookie } = await createUser(app);
    const retired = await createService({ active: false });
    const start = await call(app, 'POST', '/api/sessions/start', cookie);
    const res = await call(app, 'POST', `/api/sessions/${start.json().session.id}/finish`, cookie, {
      items: [{ serviceId: retired.id, quantity: 1 }],
    });
    expect(res.json()).toEqual({ error: 'unknown_service' });
  });
});

describe('corrections', () => {
  it('keeps the snapshot of items already on the record and prices new ones from today’s list', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const { cookie } = await createUser(app);
    const haircut = await createService({ priceCents: 2000 });
    const beard = await createService({ name: 'Beard', priceCents: 1200 });

    const session = await recordSession(app, cookie, [{ serviceId: haircut.id, quantity: 1 }]);
    await call(app, 'PATCH', `/api/services/${haircut.id}`, admin.cookie, { priceCents: 2500 });

    const res = await call(app, 'PATCH', `/api/sessions/${session.id}/items`, cookie, {
      items: [
        { serviceId: haircut.id, quantity: 1 },
        { serviceId: beard.id, quantity: 1 },
      ],
    });
    expect(res.statusCode).toBe(200);
    const corrected = res.json().session;
    expect(corrected.totalCents).toBe(2000 + 1200);
    expect(corrected.editedAt).not.toBeNull();
  });

  it('closes the correction window for employees after 30 minutes, but not for the owner', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const { cookie } = await createUser(app);
    const haircut = await createService();
    const session = await recordSession(app, cookie, [{ serviceId: haircut.id, quantity: 1 }]);

    await prisma.session.update({
      where: { id: session.id },
      data: { finishedAt: new Date(Date.now() - 31 * 60_000) },
    });

    const items = { items: [{ serviceId: haircut.id, quantity: 2 }] };
    const late = await call(app, 'PATCH', `/api/sessions/${session.id}/items`, cookie, items);
    expect(late.statusCode).toBe(403);
    expect(late.json()).toEqual({ error: 'edit_window_expired' });

    const cancel = await call(app, 'POST', `/api/sessions/${session.id}/cancel`, cookie);
    expect(cancel.statusCode).toBe(403);

    const byOwner = await call(app, 'PATCH', `/api/sessions/${session.id}/items`, admin.cookie, items);
    expect(byOwner.statusCode).toBe(200);
  });

  it('hides other employees’ records', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);
    const haircut = await createService();
    const session = await recordSession(app, alice.cookie, [{ serviceId: haircut.id, quantity: 1 }]);

    const res = await call(app, 'POST', `/api/sessions/${session.id}/cancel`, bob.cookie);
    expect(res.statusCode).toBe(404);
  });

  it('takes cancelled records out of the statistics', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const { cookie } = await createUser(app);
    const haircut = await createService({ priceCents: 2000 });
    await recordSession(app, cookie, [{ serviceId: haircut.id, quantity: 1 }]);
    const mistake = await recordSession(app, cookie, [{ serviceId: haircut.id, quantity: 3 }]);

    await call(app, 'POST', `/api/sessions/${mistake.id}/cancel`, cookie);

    const stats = await call(app, 'GET', `/api/stats/overview?from=${today()}&to=${today()}`, admin.cookie);
    expect(stats.json()).toMatchObject({ revenueCents: 2000, sessionCount: 1 });
  });
});
