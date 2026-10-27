import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** Seeds one owner and one second user through apps/web/scripts/e2e-seed.ts (idempotent, test-only emails). */
export default async function globalSetup() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set for the e2e run (point it at a throwaway test database).');
  const env = { ...process.env, DIRECT_URL: process.env.DIRECT_URL ?? process.env.DATABASE_URL };
  execFileSync('pnpm', ['--filter', 'app', 'exec', 'tsx', 'scripts/e2e-seed.ts'], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: 'inherit',
  });
}
