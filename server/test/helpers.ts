import bcrypt from 'bcryptjs';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { Role } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { dayKey } from '../src/lib/dates.js';

export { prisma };

export const testApp = () => buildApp({ logger: false });

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "SessionItem", "Session", "Service", "User" RESTART IDENTITY CASCADE',
  );
}

let counter = 0;

/** A user straight in the database, plus a cookie that signs them in. */
export async function createUser(
  app: FastifyInstance,
  opts: { name?: string; username?: string; role?: Role; password?: string } = {},
) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      name: opts.name ?? `User ${counter}`,
      username: opts.username ?? `user${counter}`,
      role: opts.role ?? 'EMPLOYEE',
      // low cost factor: these hashes only have to survive the test run
      passwordHash: await bcrypt.hash(opts.password ?? 'correct-horse', 4),
    },
  });
  return { user, cookie: `token=${app.jwt.sign({ sub: user.id })}` };
}

export function createService(
  opts: { name?: string; priceCents?: number; custom?: boolean; active?: boolean } = {},
) {
  const name = opts.name ?? 'Haircut';
  return prisma.service.create({
    data: {
      nameTr: name,
      nameDe: name,
      priceCents: opts.priceCents ?? 2000,
      custom: opts.custom ?? false,
      active: opts.active ?? true,
    },
  });
}

/** `app.inject` with the session cookie and a JSON body. */
export function call(
  app: FastifyInstance,
  method: InjectOptions['method'],
  url: string,
  cookie?: string,
  payload?: object,
) {
  return app.inject({ method, url, headers: cookie ? { cookie } : {}, payload });
}

export interface PickedItem {
  serviceId: number;
  quantity: number;
  priceCents?: number;
  note?: string;
}

/** Start and finish a session the way the tablet does; returns the finished session. */
export async function recordSession(app: FastifyInstance, cookie: string, items: PickedItem[]) {
  const start = await call(app, 'POST', '/api/sessions/start', cookie);
  if (start.statusCode !== 201) throw new Error(`start failed: ${start.body}`);
  const id = start.json().session.id as number;
  const finish = await call(app, 'POST', `/api/sessions/${id}/finish`, cookie, { items });
  if (finish.statusCode !== 200) throw new Error(`finish failed: ${finish.body}`);
  return finish.json().session;
}

/** Today's date in the salon's time zone, the way the stats endpoints expect it. */
export const today = () => dayKey(new Date(), 'Europe/Berlin');
