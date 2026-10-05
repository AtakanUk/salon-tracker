import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call, createService, createUser, prisma, resetDb, testApp } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

async function completedAt(employeeId: number, serviceId: number, startedAt: string, priceCents = 2000) {
  const start = new Date(startedAt);
  return prisma.session.create({
    data: {
      employeeId,
      startedAt: start,
      finishedAt: new Date(start.getTime() + 30 * 60_000),
      status: 'COMPLETED',
      items: { create: [{ serviceId, quantity: 1, priceCentsSnapshot: priceCents }] },
    },
  });
}

describe('statistics', () => {
  it('cuts days at the salon’s midnight, not at UTC midnight', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const { user } = await createUser(app);
    const haircut = await createService();
    // 23:30 UTC on 1 March is 00:30 on 2 March in Berlin
    await completedAt(user.id, haircut.id, '2026-03-01T23:30:00Z');
    await completedAt(user.id, haircut.id, '2026-03-01T10:00:00Z');

    const res = await call(
      app,
      'GET',
      '/api/stats/timeseries?from=2026-03-01&to=2026-03-02&granularity=day',
      admin.cookie,
    );
    expect(res.json().rows.map((r: { bucket: string; sessionCount: number }) => [r.bucket, r.sessionCount]))
      .toEqual([
        ['2026-03-01', 1],
        ['2026-03-02', 1],
      ]);
  });

  it('splits revenue per employee and per service', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const ali = await createUser(app, { name: 'Ali' });
    const mehmet = await createUser(app, { name: 'Mehmet' });
    const haircut = await createService({ name: 'Haircut' });
    const beard = await createService({ name: 'Beard', priceCents: 1200 });
    await completedAt(ali.user.id, haircut.id, '2026-03-02T09:00:00Z', 2000);
    await completedAt(ali.user.id, beard.id, '2026-03-02T10:00:00Z', 1200);
    await completedAt(mehmet.user.id, haircut.id, '2026-03-02T11:00:00Z', 1800);

    const res = await call(app, 'GET', '/api/stats/overview?from=2026-03-02&to=2026-03-02', admin.cookie);
    const body = res.json();
    expect(body).toMatchObject({ revenueCents: 5000, sessionCount: 3, avgDurationMinutes: 30 });
    expect(body.byEmployee.map((e: { name: string; revenueCents: number }) => [e.name, e.revenueCents]))
      .toEqual([
        ['Ali', 3200],
        ['Mehmet', 1800],
      ]);
    expect(body.byService.find((s: { nameDe: string }) => s.nameDe === 'Haircut')).toMatchObject({
      count: 2,
      revenueCents: 3800,
    });
  });

  it('rejects malformed dates', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const res = await call(app, 'GET', '/api/stats/overview?from=2026-3-1&to=2026-03-02', admin.cookie);
    expect(res.statusCode).toBe(400);
  });
});
