import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const cfg = createRequire(import.meta.url)('../../next.config.js');

describe('next.config headers', () => {
  it('reset and forgot pages send Referrer-Policy: no-referrer after the global rule', async () => {
    const rules = await cfg.headers();
    const idx = rules.findIndex((r: any) => r.source.includes('reset-password') && r.source.includes('forgot-password'));
    expect(idx).toBeGreaterThan(rules.findIndex((r: any) => r.source === '/:path*'));
    expect(rules[idx].headers).toEqual([{ key: 'Referrer-Policy', value: 'no-referrer' }]);
  });
});
