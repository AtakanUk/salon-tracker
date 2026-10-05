import type { FastifyInstance } from 'fastify';
import { Prisma, SessionStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sessionOut } from '../lib/serialize.js';
import { HttpError } from '../lib/errors.js';
import { DATE_RE, addDaysStr, dayKey, startOfDayUtc } from '../lib/dates.js';
import { config } from '../config.js';

/** How long an employee may correct/cancel a completed session. */
export const EDIT_WINDOW_MS = 30 * 60 * 1000;

const itemsSchema = z
  .array(
    z.object({
      serviceId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(20),
      // both are only honoured for a `custom` service, see itemRow()
      priceCents: z.number().int().min(1).max(1_000_000).optional(),
      note: z.string().max(60).optional(),
    }),
  )
  .min(1)
  .max(30);

type PickedItem = z.infer<typeof itemsSchema>[number];

/**
 * One item row, with its price locked in.
 *
 * A normal service is always priced from the database and never from the
 * request - otherwise an employee could name their own price for a haircut.
 * The custom service is the exception it was created for: its amount and
 * note come from whoever is filling in the record.
 *
 * `listPrice` is what this service costs right now, or what it cost when the
 * record was first saved (corrections keep the original snapshot).
 */
function itemRow(item: PickedItem, service: { custom: boolean }, listPrice: number) {
  if (!service.custom) {
    return { serviceId: item.serviceId, quantity: item.quantity, priceCentsSnapshot: listPrice };
  }
  if (item.priceCents === undefined) throw new HttpError(400, 'amount_required');
  return {
    serviceId: item.serviceId,
    quantity: item.quantity,
    priceCentsSnapshot: item.priceCents,
    note: item.note?.trim() || null,
  };
}

const includeItems = { items: { include: { service: true } } } as const;

/** Instants come from the browser as ISO strings (the UI shows local time everywhere). */
const instant = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'invalid_date')
  .transform((v) => new Date(v));

function idParam(req: { params: unknown }): number {
  return z.coerce.number().int().parse((req.params as { id: string }).id);
}

function withinEditWindow(finishedAt: Date | null): boolean {
  return !!finishedAt && Date.now() - finishedAt.getTime() <= EDIT_WINDOW_MS;
}

export default async function sessionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  /**
   * Everything the employee screens need in one call. The start/finish screen
   * uses only `active`; the numbers, the day's list and the correctable last
   * entry are for the "my day" screen - the first one faces customers.
   */
  app.get('/board', async (req) => {
    const userId = req.currentUser.id;
    const todayStart = startOfDayUtc(dayKey(new Date(), config.salonTz), config.salonTz);

    const [active, lastCompleted, todaySessions] = await Promise.all([
      prisma.session.findFirst({
        where: { employeeId: userId, status: SessionStatus.ACTIVE },
      }),
      prisma.session.findFirst({
        where: { employeeId: userId, status: SessionStatus.COMPLETED },
        orderBy: { finishedAt: 'desc' },
        include: includeItems,
      }),
      prisma.session.findMany({
        where: {
          employeeId: userId,
          status: SessionStatus.COMPLETED,
          startedAt: { gte: todayStart },
        },
        include: includeItems,
        // newest first: the day is read backwards from the customer just done
        orderBy: { finishedAt: 'desc' },
      }),
    ]);

    const revenueCents = todaySessions.reduce(
      (a, s) => a + s.items.reduce((b, i) => b + i.priceCentsSnapshot * i.quantity, 0),
      0,
    );

    return {
      active: active ? sessionOut(active) : null,
      lastCompleted: lastCompleted ? sessionOut(lastCompleted) : null,
      lastCompletedEditable: lastCompleted ? withinEditWindow(lastCompleted.finishedAt) : false,
      today: { count: todaySessions.length, revenueCents, sessions: todaySessions.map(sessionOut) },
      // the screen counts elapsed time against startedAt, which is our clock;
      // tablets drift by seconds, so they correct against this
      now: new Date().toISOString(),
    };
  });

  app.post('/start', async (req, reply) => {
    const existing = await prisma.session.findFirst({
      where: { employeeId: req.currentUser.id, status: SessionStatus.ACTIVE },
    });
    if (existing) throw new HttpError(409, 'active_session_exists');
    try {
      const session = await prisma.session.create({
        data: { employeeId: req.currentUser.id },
      });
      reply.code(201);
      return { session: sessionOut(session), now: new Date().toISOString() };
    } catch (e) {
      // partial unique index guards against double-tap races
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpError(409, 'active_session_exists');
      }
      throw e;
    }
  });

  app.post('/:id/finish', async (req) => {
    const id = idParam(req);
    const { items } = z.object({ items: itemsSchema }).parse(req.body);

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || session.employeeId !== req.currentUser.id) throw new HttpError(404, 'not_found');
    if (session.status !== SessionStatus.ACTIVE) throw new HttpError(409, 'not_active');

    const services = await prisma.service.findMany({
      where: { id: { in: items.map((i) => i.serviceId) }, active: true },
    });
    const byId = new Map(services.map((s) => [s.id, s]));
    for (const item of items) {
      if (!byId.has(item.serviceId)) throw new HttpError(400, 'unknown_service');
    }

    // price is snapshotted here: later price-list changes never touch this record
    const updated = await prisma.session.update({
      where: { id },
      data: {
        status: SessionStatus.COMPLETED,
        finishedAt: new Date(),
        items: {
          create: items.map((i) => {
            const svc = byId.get(i.serviceId)!;
            return itemRow(i, svc, svc.priceCents);
          }),
        },
      },
      include: includeItems,
    });
    return { session: sessionOut(updated) };
  });

  app.post('/:id/cancel', async (req) => {
    const id = idParam(req);
    const isAdmin = req.currentUser.role === 'ADMIN';

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || (!isAdmin && session.employeeId !== req.currentUser.id)) {
      throw new HttpError(404, 'not_found');
    }
    if (session.status === SessionStatus.CANCELLED) throw new HttpError(409, 'already_cancelled');
    if (!isAdmin && session.status === SessionStatus.COMPLETED && !withinEditWindow(session.finishedAt)) {
      throw new HttpError(403, 'edit_window_expired');
    }

    const updated = await prisma.session.update({
      where: { id },
      data: {
        status: SessionStatus.CANCELLED,
        editedAt: session.status === SessionStatus.COMPLETED ? new Date() : undefined,
      },
      include: includeItems,
    });
    return { session: sessionOut(updated) };
  });

  /**
   * Replace the items of a completed session (correction).
   * Services already on the session keep their original price snapshot;
   * newly added services are priced at the current price list. A custom item
   * is re-read from the request, so a mistyped amount can be corrected.
   */
  app.patch('/:id/items', async (req) => {
    const id = idParam(req);
    const { items } = z.object({ items: itemsSchema }).parse(req.body);
    const isAdmin = req.currentUser.role === 'ADMIN';

    const session = await prisma.session.findUnique({ where: { id }, include: includeItems });
    if (!session || (!isAdmin && session.employeeId !== req.currentUser.id)) {
      throw new HttpError(404, 'not_found');
    }
    if (session.status !== SessionStatus.COMPLETED) throw new HttpError(409, 'not_completed');
    if (!isAdmin && !withinEditWindow(session.finishedAt)) {
      throw new HttpError(403, 'edit_window_expired');
    }

    const existingSnapshot = new Map(session.items.map((i) => [i.serviceId, i.priceCentsSnapshot]));
    const services = await prisma.service.findMany({
      where: { id: { in: items.map((i) => i.serviceId) } },
    });
    const byId = new Map(services.map((s) => [s.id, s]));
    for (const item of items) {
      const svc = byId.get(item.serviceId);
      // one already on the record may have been deactivated since it was saved;
      // anything newly added has to be something the picker offers today
      const allowed = svc && (existingSnapshot.has(item.serviceId) || isAdmin || svc.active);
      if (!allowed) throw new HttpError(400, 'unknown_service');
    }

    const [, updated] = await prisma.$transaction([
      prisma.sessionItem.deleteMany({ where: { sessionId: id } }),
      prisma.session.update({
        where: { id },
        data: {
          editedAt: new Date(),
          items: {
            create: items.map((i) => {
              const svc = byId.get(i.serviceId)!;
              return itemRow(i, svc, existingSnapshot.get(i.serviceId) ?? svc.priceCents);
            }),
          },
        },
        include: includeItems,
      }),
    ]);
    return { session: sessionOut(updated) };
  });

  /** Admin: browse/filter all sessions. */
  app.get('/', { preHandler: [app.requireAdmin] }, async (req) => {
    const q = z
      .object({
        from: z.string().regex(DATE_RE).optional(),
        to: z.string().regex(DATE_RE).optional(),
        employeeId: z.coerce.number().int().optional(),
        status: z.nativeEnum(SessionStatus).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const where: Prisma.SessionWhereInput = {
      employeeId: q.employeeId,
      status: q.status,
      startedAt: {
        gte: q.from ? startOfDayUtc(q.from, config.salonTz) : undefined,
        lt: q.to ? startOfDayUtc(addDaysStr(q.to, 1), config.salonTz) : undefined,
      },
    };

    const [total, rows] = await Promise.all([
      prisma.session.count({ where }),
      prisma.session.findMany({
        where,
        include: { ...includeItems, employee: true },
        orderBy: { startedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, sessions: rows.map(sessionOut) };
  });

  /** Prices for a session the admin creates or repairs: current list, inactive services allowed. */
  async function priceItems(items: PickedItem[]) {
    const services = await prisma.service.findMany({
      where: { id: { in: items.map((i) => i.serviceId) } },
    });
    const byId = new Map(services.map((s) => [s.id, s]));
    return items.map((i) => {
      const svc = byId.get(i.serviceId);
      if (!svc) throw new HttpError(400, 'unknown_service');
      return itemRow(i, svc, svc.priceCents);
    });
  }

  async function liveEmployee(id: number) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new HttpError(400, 'unknown_employee');
    return user;
  }

  /**
   * Admin: enter a customer that never made it onto a tablet (device was down,
   * someone forgot). Prices come from today's list - there is no price history.
   */
  app.post('/', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const body = z
      .object({
        employeeId: z.number().int().positive(),
        startedAt: instant,
        finishedAt: instant,
        items: itemsSchema,
      })
      .parse(req.body);

    if (body.finishedAt <= body.startedAt) throw new HttpError(400, 'end_before_start');
    await liveEmployee(body.employeeId);

    const session = await prisma.session.create({
      data: {
        employeeId: body.employeeId,
        startedAt: body.startedAt,
        finishedAt: body.finishedAt,
        status: SessionStatus.COMPLETED,
        editedAt: new Date(), // manually entered, not recorded live
        items: { create: await priceItems(body.items) },
      },
      include: { ...includeItems, employee: true },
    });
    reply.code(201);
    return { session: sessionOut(session) };
  });

  /** Admin: fix who the record belongs to, or when it happened. */
  app.patch('/:id', { preHandler: [app.requireAdmin] }, async (req) => {
    const id = idParam(req);
    const body = z
      .object({
        employeeId: z.number().int().positive().optional(),
        startedAt: instant.optional(),
        finishedAt: instant.nullable().optional(),
      })
      .parse(req.body);

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) throw new HttpError(404, 'not_found');

    const startedAt = body.startedAt ?? session.startedAt;
    const finishedAt = body.finishedAt !== undefined ? body.finishedAt : session.finishedAt;
    if (finishedAt && finishedAt <= startedAt) throw new HttpError(400, 'end_before_start');
    if (body.employeeId !== undefined) await liveEmployee(body.employeeId);

    try {
      const updated = await prisma.session.update({
        where: { id },
        data: {
          employeeId: body.employeeId,
          startedAt: body.startedAt,
          finishedAt: body.finishedAt,
          editedAt: new Date(),
        },
        include: { ...includeItems, employee: true },
      });
      return { session: sessionOut(updated) };
    } catch (e) {
      // moving an ACTIVE session onto someone who already has one
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpError(409, 'active_session_exists');
      }
      throw e;
    }
  });

  /** Admin: destroy a record for good (items cascade). Cancelling is the softer option. */
  app.delete('/:id', { preHandler: [app.requireAdmin] }, async (req) => {
    const id = idParam(req);
    try {
      await prisma.session.delete({ where: { id } });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new HttpError(404, 'not_found');
      }
      throw e;
    }
  });
}
