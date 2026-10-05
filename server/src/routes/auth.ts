import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { publicUser } from '../lib/serialize.js';
import { HttpError } from '../lib/errors.js';
import { config } from '../config.js';
import { MIN_PASSWORD_LENGTH } from '../lib/password.js';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const COOKIE_MAX_AGE = 60 * 24 * 60 * 60; // 60 days, tablets stay logged in

export default async function authRoutes(app: FastifyInstance) {
  app.post(
    '/login',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { username, password } = loginSchema.parse(req.body);
      const user = await prisma.user.findUnique({
        where: { username: username.trim().toLowerCase() },
      });
      if (
        !user ||
        !user.active ||
        user.deletedAt ||
        !(await bcrypt.compare(password, user.passwordHash))
      ) {
        return reply.code(401).send({ error: 'invalid_credentials' });
      }
      const token = await reply.jwtSign({ sub: user.id }, { expiresIn: '60d' });
      reply.setCookie('token', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProd,
        maxAge: COOKIE_MAX_AGE,
      });
      return { user: publicUser(user) };
    },
  );

  app.post('/logout', async (_req, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { ok: true };
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (req) => ({
    user: publicUser(req.currentUser),
  }));

  app.patch(
    '/me/password',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { currentPassword, newPassword } = z
        .object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(100),
        })
        .parse(req.body);

      const ok = await bcrypt.compare(currentPassword, req.currentUser.passwordHash);
      if (!ok) throw new HttpError(400, 'wrong_password');

      await prisma.user.update({
        where: { id: req.currentUser.id },
        data: { passwordHash: await bcrypt.hash(newPassword, 10) },
      });
      return { ok: true };
    },
  );

  app.patch('/me/locale', { preHandler: [app.authenticate] }, async (req) => {
    const { locale } = z.object({ locale: z.enum(['tr', 'de', 'en']) }).parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.currentUser.id },
      data: { locale },
    });
    return { user: publicUser(user) };
  });
}
