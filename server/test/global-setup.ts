import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { TEST_DATABASE_URL } from './db-url';

/**
 * Runs once before all test files: creates the test database if needed, wipes
 * it, and applies the real migrations - including the hand-written partial
 * unique index that the tests rely on.
 */
export default async function setup() {
  const dbName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  // every test starts by truncating tables; never let that near a real database
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests against "${dbName}": the name must end in _test`);
  }

  const serverUrl = new URL(TEST_DATABASE_URL);
  serverUrl.pathname = '/postgres';
  const server = new PrismaClient({ datasourceUrl: serverUrl.toString() });
  try {
    const exists = await server.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (exists.length === 0) await server.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await server.$disconnect();
  }

  const db = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  try {
    await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await db.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await db.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
