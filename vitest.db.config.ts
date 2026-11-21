import { defineConfig } from "vitest/config";

/**
 * Database integration tests need a migrated Postgres. They are kept out of
 * `npm run test` so the unit suite stays runnable without a database; CI runs
 * `npm run test:db` after `db:migrate:ci`.
 */
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
