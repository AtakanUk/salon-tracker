import { gzipSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildJsonExport } from '../src/backup/json.js';
import { importJsonBackup, parseJsonBackup } from '../src/backup/import.js';
import { call, createService, createUser, prisma, recordSession, resetDb, testApp } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

describe('parseJsonBackup', () => {
  it('explains what went wrong when people pick the wrong file', () => {
    const zip = Buffer.from('PK\u0003\u0004 rest of a zip');
    expect(() => parseJsonBackup(zip)).toThrow(expect.objectContaining({ code: 'zip_selected' }));
    expect(() => parseJsonBackup(Buffer.from('not gzip'))).toThrow(
      expect.objectContaining({ code: 'invalid_backup_file' }),
    );
    const wrongFormat = gzipSync(JSON.stringify({ format: 2, sessions: [] }));
    expect(() => parseJsonBackup(wrongFormat)).toThrow(
      expect.objectContaining({ code: 'invalid_backup_file' }),
    );
  });
});

describe('JSON backup round trip', () => {
  it('restores only what is missing, and running it twice changes nothing', async () => {
    const { cookie } = await createUser(app);
    const haircut = await createService();
    const kept = await recordSession(app, cookie, [{ serviceId: haircut.id, quantity: 1 }]);
    const lost = await recordSession(app, cookie, [{ serviceId: haircut.id, quantity: 2 }]);

    const backup = await buildJsonExport();

    // after the backup: one record is lost, another one is corrected
    await prisma.session.delete({ where: { id: lost.id } });
    await prisma.sessionItem.updateMany({ where: { sessionId: kept.id }, data: { quantity: 5 } });

    const first = await importJsonBackup(parseJsonBackup(backup));
    expect(first.added).toEqual({ users: 0, services: 0, sessions: 1, items: 1, total: 2 });
    // existing rows are never overwritten by the older copy
    expect((await prisma.sessionItem.findFirst({ where: { sessionId: kept.id } }))?.quantity).toBe(5);

    const second = await importJsonBackup(parseJsonBackup(backup));
    expect(second.added.total).toBe(0);
  });

  it('brings back a permanently deleted employee with all their records', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const leaver = await createUser(app, { name: 'Hasan' });
    const haircut = await createService();
    await recordSession(app, leaver.cookie, [{ serviceId: haircut.id, quantity: 1 }]);
    const backup = await buildJsonExport();

    await call(app, 'DELETE', `/api/users/${leaver.user.id}`, admin.cookie);
    await call(app, 'DELETE', `/api/users/${leaver.user.id}/permanent`, admin.cookie);

    const summary = await importJsonBackup(parseJsonBackup(backup));
    expect(summary.added).toMatchObject({ users: 1, sessions: 1, items: 1 });
    expect((await prisma.user.findUnique({ where: { id: leaver.user.id } }))?.name).toBe('Hasan');
  });

  it('moves the id sequences past the restored rows', async () => {
    const { user, cookie } = await createUser(app);
    const haircut = await createService();
    await recordSession(app, cookie, [{ serviceId: haircut.id, quantity: 1 }]);
    const backup = await buildJsonExport();

    await resetDb();
    await importJsonBackup(parseJsonBackup(backup));

    // without the setval() in the importer this would collide with the restored id 1
    const next = await prisma.session.create({ data: { employeeId: user.id } });
    expect(next.id).toBeGreaterThan(1);
  });
});

describe('cleanup', () => {
  it('refuses to delete old records without a fresh backup', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const res = await call(app, 'POST', '/api/system/cleanup', admin.cookie, {
      before: '2026-01-01',
      confirm: 'DELETE',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'backup_required' });
  });
});
