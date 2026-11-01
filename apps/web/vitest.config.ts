import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['lib/__tests__/**/*.test.ts'],
    // Each test file gets an isolated module registry — required for vi.doMock to work correctly
    isolate: true,
    // Mock @prisma/client globally so tests run without a generated Prisma engine binary
    setupFiles: ['lib/__tests__/setup/prisma-mock.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
