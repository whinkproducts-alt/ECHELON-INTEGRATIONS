'use client';
// Tiny fetch hook. No setState runs synchronously inside the effect: loading is derived by
// comparing the stored result key with the current request key (SSR safety rule).
import * as React from 'react';

export interface JsonResult<T> {
  loading: boolean;
  /** HTTP status; 0 means the request never completed. */
  status: number;
  data: T | null;
}

export function useJson<T>(url: string | null, nonce = 0): JsonResult<T> {
  const key = `${url ?? ''}#${nonce}`;
  const [res, setRes] = React.useState<{ key: string; status: number; data: T | null } | null>(null);
  React.useEffect(() => {
    if (!url) return;
    const ac = new AbortController();
    fetch(url, { signal: ac.signal, cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(async (r) => {
        let data: T | null = null;
        try { data = (await r.json()) as T; } catch { data = null; }
        if (!ac.signal.aborted) setRes({ key, status: r.status, data });
      })
      .catch(() => { if (!ac.signal.aborted) setRes({ key, status: 0, data: null }); });
    return () => ac.abort();
  }, [url, key]);
  if (!url) return { loading: false, status: 0, data: null };
  if (!res || res.key !== key) return { loading: true, status: 0, data: null };
  return { loading: false, status: res.status, data: res.data };
}
