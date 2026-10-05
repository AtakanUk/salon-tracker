/**
 * The database the tests run against. Defaults to a "friseur_test" database on
 * the local development server (npm run dev:db); CI points it at its own service.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433/friseur_test';
