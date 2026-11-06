'use client';
// DEV ONLY. Replaces window.fetch for /api/* with fixtures while the preview is mounted. Installed during the first
// client render (guarded, so the server never touches window) so children's effects see it, and removed on unmount.
import * as React from 'react';
import { answer, type PreviewState } from './fixtures';

const pendingRestore = new Map<typeof fetch, ReturnType<typeof setTimeout>>();

export function MockFetch({ state, screen, children }: { state: PreviewState; screen?: string; children: React.ReactNode }) {
  const [{ original, mock }] = React.useState<{ original: typeof fetch | null; mock: typeof fetch | null }>(() => {
    if (typeof window === 'undefined') return { original: null, mock: null };
    const real = window.fetch.bind(window);
    const ctx = { state, screen, fault: new URLSearchParams(window.location.search).get('fault'), now: () => Date.now(), counters: { casl: false } };
    const mocked = async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, window.location.origin);
      if (!url.pathname.startsWith('/api/')) return real(input, init);
      const method = (init?.method ?? 'GET').toUpperCase();
      let body: unknown = null;
      if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = null; } }
      const hit = answer(method, url, body, ctx);
      if (hit?.delayMs) await new Promise((r) => setTimeout(r, hit.delayMs));
      const res = hit ?? { status: 404, body: { error: 'No fixture for this endpoint' } };
      return new Response(res.sse ? String(res.body) : JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': res.sse ? 'text/event-stream' : 'application/json' } });
    };
    window.fetch = mocked;
    return { original: real, mock: mocked as typeof fetch };
  });
  // React strict mode runs mount, cleanup, mount. Restoring synchronously would leave children's second fetch on the
  // real network, so the restore is deferred and cancelled by the re-mount.
  React.useEffect(() => {
    if (!original || !mock) return;
    window.fetch = mock;
    const t = pendingRestore.get(mock);
    if (t) { clearTimeout(t); pendingRestore.delete(mock); }
    return () => { pendingRestore.set(mock, setTimeout(() => { if (window.fetch === mock) window.fetch = original; }, 50)); };
  }, [original, mock]);
  return <>{children}</>;
}
