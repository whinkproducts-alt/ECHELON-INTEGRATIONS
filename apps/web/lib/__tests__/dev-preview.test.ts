import { afterEach, describe, expect, it, vi } from 'vitest';

// The client module pulls in the whole dashboard shell; the page only needs it as an element type.
vi.mock('../../app/dev-preview/_components/preview-client', () => ({ PreviewClient: () => null }));

async function render(env: string) {
  vi.stubEnv('NODE_ENV', env);
  const mod = await import('../../app/dev-preview/[screen]/page');
  return mod.default({ params: Promise.resolve({ screen: 'contacts' }), searchParams: Promise.resolve({}) });
}

describe('dev-preview page', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('404s in production', async () => {
    await expect(render('production')).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_HTTP_ERROR_FALLBACK;404') });
  });

  it('404s in test and any non-development mode', async () => {
    await expect(render('test')).rejects.toMatchObject({ digest: expect.stringContaining('404') });
  });
});
