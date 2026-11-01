/** C4: only lib/openclaw-client.ts (and its tests) know the gateway transport. */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

describe('gateway transport boundary (C4)', () => {
  it('OPENCLAW_URL and @modelcontextprotocol appear only in lib/openclaw-client.ts and tests', () => {
    const root = path.resolve(__dirname, '../..');
    let out = '';
    try {
      out = execFileSync('grep', ['-rlE', 'OPENCLAW_URL|@modelcontextprotocol', 'app', 'lib', '--include=*.ts', '--include=*.tsx'], { cwd: root, encoding: 'utf8' });
    } catch (e) {
      // grep exits 1 when nothing matches; anything else is a real failure
      if ((e as { status?: number }).status !== 1) throw e;
    }
    const files = out.split('\n').filter(Boolean).filter((f) => !f.includes('__tests__/'));
    expect(files).toEqual(['lib/openclaw-client.ts']);
  });
});
