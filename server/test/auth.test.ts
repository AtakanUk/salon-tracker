import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call, createUser, prisma, resetDb, testApp, today } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

const login = (username: string, password: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { username, password } });

describe('login', () => {
  it('sets an httpOnly cookie on success', async () => {
    await createUser(app, { username: 'ali', password: 'makas-4821' });
    // usernames are matched case-insensitively and trimmed, as typed on a tablet
    const res = await login('  Ali ', 'makas-4821');
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toMatch(/^token=.+HttpOnly/);
  });

  it('gives the same answer for a wrong password and an unknown user', async () => {
    await createUser(app, { username: 'ali', password: 'makas-4821' });
    const wrong = await login('ali', 'makas-0000');
    const unknown = await login('nobody', 'makas-4821');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
  });

  it('locks out a deactivated account, including its existing cookie', async () => {
    const { user, cookie } = await createUser(app, { username: 'ali', password: 'makas-4821' });
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });

    expect((await login('ali', 'makas-4821')).statusCode).toBe(401);
    expect((await call(app, 'GET', '/api/auth/me', cookie)).statusCode).toBe(401);
  });

  it('rate-limits by the address the proxy saw, not one the client made up', async () => {
    await createUser(app, { username: 'ali', password: 'makas-4821' });
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      // a client can put anything into X-Forwarded-For; the proxy appends the real address
      const res = await login('ali', 'wrong-password', {
        'x-forwarded-for': `10.0.0.${i}, 203.0.113.7`,
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe('roles', () => {
  it('keeps employees out of the owner’s endpoints', async () => {
    const { cookie } = await createUser(app);
    const range = `from=${today()}&to=${today()}`;
    for (const url of [`/api/stats/overview?${range}`, '/api/users', '/api/system/status']) {
      expect((await call(app, 'GET', url, cookie)).statusCode).toBe(403);
    }
  });

  it('requires a session for everything but login and health', async () => {
    expect((await call(app, 'GET', '/api/sessions/board')).statusCode).toBe(401);
    expect((await call(app, 'GET', '/api/health')).statusCode).toBe(200);
  });

  it('sends the security headers', async () => {
    const res = await call(app, 'GET', '/api/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
