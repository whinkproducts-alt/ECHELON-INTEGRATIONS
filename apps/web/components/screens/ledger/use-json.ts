'use client';
// Tiny fetch hook shared by the operations screens (ledger, approvals, system). No setState runs
// synchronously inside the effect: loading is derived by comparing the stored result key with the
// current request key (SSR safety rule). `at` is the client time the answer arrived, set inside the
// promise callback, so it is never read during render on the server.
import * as React from 'react';

export interface JsonResult<T> {
  loading: boolean;
  /** HTTP status; 0 means the request never completed. */
  status: number;
  data: T | null;
  /** Client epoch ms when the answer arrived, or null while loading. */
  at: number | null;
}

export function useJson<T>(url: string | null, nonce = 0): JsonResult<T> {
  const key = `${url ?? ''}#${nonce}`;
  const [res, setRes] = React.useState<{ key: string; status: number; data: T | null; at: number } | null>(null);
  React.useEffect(() => {
    if (!url) return;
    const ac = new AbortController();
    fetch(url, { signal: ac.signal, cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(async (r) => {
        let data: T | null = null;
        try { data = (await r.json()) as T; } catch { data = null; }
        if (!ac.signal.aborted) setRes({ key, status: r.status, data, at: Date.now() });
      })
      .catch(() => { if (!ac.signal.aborted) setRes({ key, status: 0, data: null, at: Date.now() }); });
    return () => ac.abort();
  }, [url, key]);
  if (!url) return { loading: false, status: 0, data: null, at: null };
  if (!res || res.key !== key) return { loading: true, status: 0, data: null, at: null };
  return { loading: false, status: res.status, data: res.data, at: res.at };
}
