import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv, checkEnv } from './readiness.mjs';
test('flags missing and malformed settings without echoing values', () => {
  const rows = checkEnv(parseEnv('DATABASE_URL=x\nAUTH_SECRET=short\nENCRYPTION_KEY=nothex\n'));
  const bad = rows.filter(([, ok]) => !ok).map(([n]) => n);
  assert.deepEqual(bad.sort(), ['AUTH_SECRET length >= 32', 'ENCRYPTION_KEY is 64 hex', 'env WHINK_OWNER_EMAILS'].sort());
  assert.ok(!JSON.stringify(rows).includes('nothex'));
});
test('good env passes', () => {
  const e = `DATABASE_URL=x\nAUTH_SECRET=${'a'.repeat(40)}\nENCRYPTION_KEY=${'b'.repeat(64)}\nWHINK_OWNER_EMAILS=o@e.test\n`;
  assert.ok(checkEnv(parseEnv(e)).every(([, ok]) => ok));
});
