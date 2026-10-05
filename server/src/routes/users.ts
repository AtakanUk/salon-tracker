import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { Prisma, SessionStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { displayUsername, publicUser } from '../lib/serialize.js';
import { HttpError } from '../lib/errors.js';
import { MIN_PASSWORD_LENGTH } from '../lib/password.js';

const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(100);

const usernameSchema = z
  .string()
  .min(2)
  .max(30)
  .regex(/^[a-zA-Z0-9._-]+$/)
  .transform((v) => v.toLowerCase());

const createSchema = z.object({
  name: z.string().min(1).max(60),
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(['ADMIN', 'EMPLOYEE']).default('EMPLOYEE'),
  locale: z.enum(['tr', 'de', 'en']).default('tr'),
});

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  username: usernameSchema.optional(),
  password: passwordSchema.optional(),
  role: z.enum(['ADMIN', 'EMPLOYEE']).optional(),
  locale: z.enum(['tr', 'de', 'en']).optional(),
  active: z.boolean().optional(),
});

const idParam = (req: { params: unknown }) =>
  z.coerce.number().int().parse((req.params as { id: string }).id);

/** A dangling ACTIVE session could never be finished, so block the change while one is open. */
async function assertNotBusy(employeeId: number) {
  const open = await prisma.session.findFirst({
    where: { employeeId, status: SessionStatus.ACTIVE },
    select: { id: true },
  });
  if (open) throw new HttpError(409, 'employee_busy');
}

export default async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireAdmin);

  app.get('/', async () => {
    // live accounts first (active before inactive), deleted ones last
    const users = await prisma.user.findMany({
      orderBy: [{ deletedAt: { sort: 'asc', nulls: 'first' } }, { active: 'desc' }, { name: 'asc' }],
    });
    return { users: users.map(publicUser) };
  });

  app.post('/', async (req, reply) => {
    const body = createSchema.parse(req.body);
    try {
      const user = await prisma.user.create({
        data: {
          name: body.name,
          username: body.username,
          passwordHash: await bcrypt.hash(body.password, 10),
          role: body.role,
          locale: body.locale,
        },
      });
      reply.code(201);
      return { user: publicUser(user) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpError(409, 'username_taken');
      }
      throw e;
    }
  });

  app.patch('/:id', async (req) => {
    const id = idParam(req);
    const body = updateSchema.parse(req.body);

    if (id === req.currentUser.id && (body.active === false || body.role === 'EMPLOYEE')) {
      throw new HttpError(400, 'cannot_modify_self');
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.deletedAt) throw new HttpError(404, 'not_found');
    if (body.active === false && target.active) await assertNotBusy(id);

    const data: Prisma.UserUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.username !== undefined) data.username = body.username;
    if (body.role !== undefined) data.role = body.role;
    if (body.locale !== undefined) data.locale = body.locale;
    if (body.active !== undefined) data.active = body.active;
    if (body.password !== undefined) data.passwordHash = await bcrypt.hash(body.password, 10);

    try {
      const user = await prisma.user.update({ where: { id }, data });
      return { user: publicUser(user) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpError(409, 'username_taken');
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new HttpError(404, 'not_found');
      }
      throw e;
    }
  });

  /**
   * Soft delete: the row survives so every past session keeps showing this
   * person's name. The username gets a "#<id>" suffix so it can be reused.
   */
  app.delete('/:id', async (req) => {
    const id = idParam(req);
    if (id === req.currentUser.id) throw new HttpError(400, 'cannot_modify_self');

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.deletedAt) throw new HttpError(404, 'not_found');
    await assertNotBusy(id);

    const user = await prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        active: false,
        // password hash is kept on purpose: restoring must not require a reset
        username: `${target.username}#${id}`,
      },
    });
    return { user: publicUser(user) };
  });

  /** What a permanent delete would destroy - shown in the confirmation dialog. */
  app.get('/:id/impact', async (req) => {
    const id = idParam(req);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, 'not_found');

    const sessions = await prisma.session.findMany({
      where: { employeeId: id },
      select: { startedAt: true, status: true, items: { select: { priceCentsSnapshot: true, quantity: true } } },
      orderBy: { startedAt: 'asc' },
    });
    const completed = sessions.filter((s) => s.status === SessionStatus.COMPLETED);
    return {
      sessionCount: sessions.length,
      revenueCents: completed.reduce(
        (a, s) => a + s.items.reduce((b, i) => b + i.priceCentsSnapshot * i.quantity, 0),
        0,
      ),
      firstAt: sessions[0]?.startedAt ?? null,
      lastAt: sessions.at(-1)?.startedAt ?? null,
    };
  });

  /**
   * Permanent delete: the row and every session it owns are gone for good.
   * Only offered for accounts that were already soft-deleted, so destroying
   * history always takes two deliberate steps.
   */
  app.delete('/:id/permanent', async (req) => {
    const id = idParam(req);
    if (id === req.currentUser.id) throw new HttpError(400, 'cannot_modify_self');

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, 'not_found');
    if (!user.deletedAt) throw new HttpError(409, 'not_deleted_yet');

    const [items, sessions] = await prisma.$transaction([
      prisma.sessionItem.deleteMany({ where: { session: { employeeId: id } } }),
      prisma.session.deleteMany({ where: { employeeId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);
    req.log.warn(`user ${id} (${user.name}) permanently deleted with ${sessions.count} sessions`);
    return { deletedSessions: sessions.count, deletedItems: items.count };
  });

  app.post('/:id/restore', async (req) => {
    const id = idParam(req);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || !target.deletedAt) throw new HttpError(404, 'not_found');

    try {
      const user = await prisma.user.update({
        where: { id },
        data: { deletedAt: null, active: true, username: displayUsername(target) },
      });
      return { user: publicUser(user) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // someone took the old username in the meantime
        throw new HttpError(409, 'username_taken');
      }
      throw e;
    }
  });
}
