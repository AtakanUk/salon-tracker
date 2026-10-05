import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/errors.js';

const createSchema = z.object({
  nameTr: z.string().min(1).max(80),
  nameDe: z.string().min(1).max(80),
  priceCents: z.number().int().min(0).max(1_000_000),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const updateSchema = createSchema.partial().extend({
  active: z.boolean().optional(),
});

export default async function serviceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Employees get the active price list; admins can request all with ?all=1
  app.get('/', async (req) => {
    const all = (req.query as { all?: string }).all === '1' && req.currentUser.role === 'ADMIN';
    const services = await prisma.service.findMany({
      where: all ? {} : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return { services };
  });

  app.post('/', { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const service = await prisma.service.create({
      data: { ...body, sortOrder: body.sortOrder ?? 0 },
    });
    reply.code(201);
    return { service };
  });

  app.patch('/:id', { preHandler: [app.requireAdmin] }, async (req) => {
    const id = z.coerce.number().int().parse((req.params as { id: string }).id);
    const body = updateSchema.parse(req.body);
    try {
      const service = await prisma.service.update({ where: { id }, data: body });
      return { service };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new HttpError(404, 'not_found');
      }
      throw e;
    }
  });
}
