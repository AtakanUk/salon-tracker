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

describe('deleting an employee', () => {
  it('keeps their name and revenue in past statistics', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const deniz = await createUser(app, { name: 'Deniz', username: 'deniz' });
    const haircut = await createService({ priceCents: 2000 });
    await recordSession(app, deniz.cookie, [{ serviceId: haircut.id, quantity: 1 }]);

    const overview = () =>
      call(app, 'GET', `/api/stats/overview?from=${today()}&to=${today()}`, admin.cookie);
    const before = (await overview()).json();

    const res = await call(app, 'DELETE', `/api/users/${deniz.user.id}`, admin.cookie);
    expect(res.statusCode).toBe(200);

    const after = (await overview()).json();
    expect(after).toEqual(before);
    expect(after.byEmployee[0]).toMatchObject({ name: 'Deniz', revenueCents: 2000 });
    expect((await call(app, 'GET', '/api/auth/me', deniz.cookie)).statusCode).toBe(401);
  });

  it('frees the username, and restoring refuses to take it back from someone else', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const old = await createUser(app, { name: 'Deniz', username: 'deniz' });
    await call(app, 'DELETE', `/api/users/${old.user.id}`, admin.cookie);

    const fresh = await call(app, 'POST', '/api/users', admin.cookie, {
      name: 'Deniz Y.',
      username: 'deniz',
      password: 'koltuk-1234',
    });
    expect(fresh.statusCode).toBe(201);

    const restore = await call(app, 'POST', `/api/users/${old.user.id}/restore`, admin.cookie);
    expect(restore.statusCode).toBe(409);
    expect(restore.json()).toEqual({ error: 'username_taken' });
  });

  it('can be undone with the old username and password', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const old = await createUser(app, { username: 'deniz', password: 'koltuk-1234' });
    await call(app, 'DELETE', `/api/users/${old.user.id}`, admin.cookie);

    const restore = await call(app, 'POST', `/api/users/${old.user.id}/restore`, admin.cookie);
    expect(restore.json().user).toMatchObject({ username: 'deniz', deleted: false, active: true });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'deniz', password: 'koltuk-1234' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('is refused for your own account and for someone with a customer in the chair', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const busy = await createUser(app);
    await call(app, 'POST', '/api/sessions/start', busy.cookie);

    const self = await call(app, 'DELETE', `/api/users/${admin.user.id}`, admin.cookie);
    expect(self.json()).toEqual({ error: 'cannot_modify_self' });

    const other = await call(app, 'DELETE', `/api/users/${busy.user.id}`, admin.cookie);
    expect(other.json()).toEqual({ error: 'employee_busy' });
  });

  it('only allows a permanent delete after a normal one', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const target = await createUser(app);
    const haircut = await createService();
    await recordSession(app, target.cookie, [{ serviceId: haircut.id, quantity: 1 }]);

    const tooEarly = await call(app, 'DELETE', `/api/users/${target.user.id}/permanent`, admin.cookie);
    expect(tooEarly.json()).toEqual({ error: 'not_deleted_yet' });

    await call(app, 'DELETE', `/api/users/${target.user.id}`, admin.cookie);
    const purge = await call(app, 'DELETE', `/api/users/${target.user.id}/permanent`, admin.cookie);
    expect(purge.json()).toEqual({ deletedSessions: 1, deletedItems: 1 });
    expect(await prisma.session.count()).toBe(0);
  });
});
