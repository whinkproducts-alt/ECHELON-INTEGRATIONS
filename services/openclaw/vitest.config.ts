import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts', 'upstreams/social/test/**/*.test.ts'] },
});
