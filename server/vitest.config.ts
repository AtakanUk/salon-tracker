import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './test/db-url';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // the API tests share one database, so test files run one after another
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test-secret',
      SALON_TZ: 'Europe/Berlin',
      NODE_ENV: 'test',
    },
  },
});
