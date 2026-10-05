import type { FastifyInstance } from 'fastify';
import { SessionStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { DATE_RE, addDaysStr, dayKey, monthKey, startOfDayUtc, weekKey } from '../lib/dates.js';
import { config } from '../config.js';

const rangeSchema = z.object({
  from: z.string().regex(DATE_RE),
  to: z.string().regex(DATE_RE),
});

function completedInRange(from: string, to: string) {
  return {
    status: SessionStatus.COMPLETED,
    startedAt: {
      gte: startOfDayUtc(from, config.salonTz),
      lt: startOfDayUtc(addDaysStr(to, 1), config.salonTz),
    },
  };
}

const sessionTotal = (s: { items: { priceCentsSnapshot: number; quantity: number }[] }) =>
  s.items.reduce((a, i) => a + i.priceCentsSnapshot * i.quantity, 0);

export default async function statsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAdmin);

  app.get('/overview', async (req) => {
    const { from, to } = rangeSchema.parse(req.query);
    const sessions = await prisma.session.findMany({
      where: completedInRange(from, to),
      include: { items: { include: { service: true } }, employee: true },
    });

    let revenueCents = 0;
    let durationMs = 0;
    const byEmployee = new Map<
      number,
      { id: number; name: string; revenueCents: number; sessionCount: number; durationMs: number }
    >();
    const byService = new Map<
      number,
      { id: number; nameTr: string; nameDe: string; count: number; revenueCents: number }
    >();

    for (const s of sessions) {
      const total = sessionTotal(s);
      revenueCents += total;
      if (s.finishedAt) durationMs += s.finishedAt.getTime() - s.startedAt.getTime();

      const emp = byEmployee.get(s.employeeId) ?? {
        id: s.employeeId,
        name: s.employee.name,
        revenueCents: 0,
        sessionCount: 0,
        durationMs: 0,
      };
      emp.revenueCents += total;
      emp.sessionCount += 1;
      if (s.finishedAt) emp.durationMs += s.finishedAt.getTime() - s.startedAt.getTime();
      byEmployee.set(s.employeeId, emp);

      for (const item of s.items) {
        const svc = byService.get(item.serviceId) ?? {
          id: item.serviceId,
          nameTr: item.service.nameTr,
          nameDe: item.service.nameDe,
          count: 0,
          revenueCents: 0,
        };
        svc.count += item.quantity;
        svc.revenueCents += item.priceCentsSnapshot * item.quantity;
        byService.set(item.serviceId, svc);
      }
    }

    const avgMin = (ms: number, count: number) => (count ? Math.round(ms / count / 60_000) : 0);
    return {
      revenueCents,
      sessionCount: sessions.length,
      avgDurationMinutes: avgMin(durationMs, sessions.length),
      byEmployee: [...byEmployee.values()]
        .map(({ durationMs: d, ...e }) => ({ ...e, avgDurationMinutes: avgMin(d, e.sessionCount) }))
        .sort((a, b) => b.revenueCents - a.revenueCents),
      byService: [...byService.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    };
  });

  app.get('/timeseries', async (req) => {
    const q = rangeSchema
      .extend({ granularity: z.enum(['day', 'week', 'month']).default('day') })
      .parse(req.query);

    const sessions = await prisma.session.findMany({
      where: completedInRange(q.from, q.to),
      include: { items: true, employee: true },
    });

    const keyFn =
      q.granularity === 'month' ? monthKey : q.granularity === 'week' ? weekKey : dayKey;

    const employees = new Map<number, string>();
    // bucket -> employeeId -> aggregate
    const buckets = new Map<string, Map<number, { revenueCents: number; sessionCount: number }>>();

    for (const s of sessions) {
      employees.set(s.employeeId, s.employee.name);
      const key = keyFn(s.startedAt, config.salonTz);
      const perEmployee = buckets.get(key) ?? new Map();
      const agg = perEmployee.get(s.employeeId) ?? { revenueCents: 0, sessionCount: 0 };
      agg.revenueCents += sessionTotal(s);
      agg.sessionCount += 1;
      perEmployee.set(s.employeeId, agg);
      buckets.set(key, perEmployee);
    }

    const rows = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, perEmployee]) => ({
        bucket,
        employees: [...perEmployee.entries()].map(([id, agg]) => ({ id, ...agg })),
        revenueCents: [...perEmployee.values()].reduce((a, v) => a + v.revenueCents, 0),
        sessionCount: [...perEmployee.values()].reduce((a, v) => a + v.sessionCount, 0),
      }));

    return {
      granularity: q.granularity,
      employees: [...employees.entries()].map(([id, name]) => ({ id, name })),
      rows,
    };
  });
}
