import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Builds and seeds the dedicated `ems_e2e` database.
 *
 * This runs as a `pretest` step rather than as a Playwright `globalSetup`
 * because the API refuses to start when its database is unreachable (a
 * deliberate fail-fast in server.ts). The schema therefore has to exist before
 * Playwright launches the `webServer` processes, and a pretest script is the
 * only place that ordering is guaranteed.
 *
 * The database is rebuilt every run so the suite always starts from the
 * documented demo dataset and one run's approvals can never change what the
 * next run asserts. It is a separate database from the development one on
 * purpose: a run can never damage the demo data a reviewer is looking at.
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://ems:ems_local_password@localhost:5433/ems_e2e?schema=public'

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../Employee Management Platform BackEnd')
const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL }

console.log('[e2e] preparing the acceptance database…')
// `db push` rather than `migrate deploy`: the suite wants a schema matching the
// current schema.prisma and does not care about migration history. Prisma
// creates the database itself if it does not exist yet.
//
// Deliberately no `--force-reset`: the seed script already truncates and
// rebuilds the demo data on every run, so the reset flag would add a
// destructive operation that buys nothing.
execSync('npx prisma db push --skip-generate', { cwd: backend, env, stdio: 'inherit' })
execSync('npm run db:seed', { cwd: backend, env, stdio: 'inherit' })
console.log('[e2e] acceptance database ready.')
