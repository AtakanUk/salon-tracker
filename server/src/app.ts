import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { HttpError } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import serviceRoutes from './routes/services.js';
import sessionRoutes from './routes/sessions.js';
import statsRoutes from './routes/stats.js';
import systemRoutes from './routes/system.js';
import exportRoutes from './routes/exports.js';
import { pushError } from './lib/errorlog.js';

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger === false
      ? false
      : {
          level: config.isProd ? 'info' : 'debug',
          // human-readable single-line logs; rotation is handled by Docker
          transport: config.logPretty
            ? {
                target: 'pino-pretty',
                options: {
                  translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                  ignore: 'pid,hostname,reqId',
                  singleLine: true,
                },
              }
            : undefined,
        },
    // exactly one proxy in front of us (tailscale serve, or caddy in public mode).
    // `true` would trust the whole X-Forwarded-For chain, letting a client forge its
    // own IP and get a fresh rate-limit bucket on every login attempt.
    trustProxy: 1,
  });

  // Applied in both publish modes, so the app is safe on its own and does not
  // depend on whatever sits in front of it.
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"], // also covers the service worker (worker-src)
        scriptSrc: ["'self'"],
        // React writes style attributes; those count as inline styles
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    // only meaningful over HTTPS; in dev it would pin http://localhost to https
    strictTransportSecurity: config.isProd
      ? { maxAge: 31536000, includeSubDomains: true }
      : false,
    crossOriginEmbedderPolicy: false, // not needed, and it breaks nothing to leave off
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  await app.register(cookie);
  await app.register(jwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'token', signed: false },
  });
  await app.register(rateLimit, { global: false });

  app.decorate('authenticate', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user || !user.active || user.deletedAt) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    req.currentUser = user;
  });

  app.decorate('requireAdmin', async (req, reply) => {
    if (req.currentUser?.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'forbidden' });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'validation', details: err.issues });
    }
    const fastifyErr = err as { statusCode?: number; code?: string };
    if (typeof fastifyErr.statusCode === 'number' && fastifyErr.statusCode < 500) {
      return reply.code(fastifyErr.statusCode).send({ error: fastifyErr.code ?? 'bad_request' });
    }
    req.log.error(err);
    pushError({
      time: new Date().toISOString(),
      method: req.method,
      url: req.url,
      message: err instanceof Error ? err.message : String(err),
    });
    return reply.code(500).send({ error: 'internal' });
  });

  app.get('/api/health', async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(serviceRoutes, { prefix: '/api/services' });
  await app.register(sessionRoutes, { prefix: '/api/sessions' });
  await app.register(statsRoutes, { prefix: '/api/stats' });
  await app.register(systemRoutes, { prefix: '/api/system' });
  await app.register(exportRoutes, { prefix: '/api/export' });

  // Serve the built web app (production). In dev, Vite serves it with a proxy.
  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  }

  return app;
}
