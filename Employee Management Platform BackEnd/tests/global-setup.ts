import { execSync } from 'node:child_process';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://ems:ems_local_password@localhost:5434/ems_test?schema=public';

/**
 * Builds the test schema once per run.
 *
 * `db push` rather than `migrate deploy`: the suite wants a schema matching the
 * current `schema.prisma` and does not care about migration history. No reset
 * flag is used - the test database is a separate container on port 5434 backed
 * by tmpfs, so it starts empty and `push` only ever creates tables. Data between
 * test files is cleared by `resetDatabase()` in the fixture.
 */
export default function setup(): void {
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
