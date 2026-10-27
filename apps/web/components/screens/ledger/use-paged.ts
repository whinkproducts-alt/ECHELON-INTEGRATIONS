'use client';
// Cursor paged list hook for GET routes that answer { items, nextCursor }. The first page loads from
// `url`; loadMore() appends the next page with `cursor=<nextCursor>`. Changing `url` or `nonce`
// starts over. No setState runs synchronously inside the effect (SSR safety rule).
import * as React from 'react';

interface PagedState<T> {
  key: string;
  status: number;
  items: T[];
  next: string | null;
  busy: boolean;
  moreError: boolean;
}

export interface Paged<T> {
  loading: boolean;
  /** HTTP status of the first page; 0 means the request never completed. */
  status: number;
  items: T[];
  hasMore: boolean;
  loadingMore: boolean;
  moreError: boolean;
  loadMore: () => void;
}

function pageUrl(url: string, cursor: string | null): string {
  if (!cursor) return url;
  return `${url}${url.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}`;
}

function parse<T>(data: unknown): { items: T[]; next: string | null } | null {
  if (typeof data !== 'object' || data === null) return null;
  const o = data as { items?: unknown; nextCursor?: unknown };
  if (!Array.isArray(o.items)) return null;
  return { items: o.items as T[], next: typeof o.nextCursor === 'string' && o.nextCursor ? o.nextCursor : null };
}

export function usePaged<T>(url: string, nonce = 0): Paged<T> {
  const key = `${url}#${nonce}`;
  const [st, setSt] = React.useState<PagedState<T> | null>(null);

  React.useEffect(() => {
    const ac = new AbortController();
    fetch(url, { signal: ac.signal, cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(async (r) => {
        let data: unknown = null;
        try { data = await r.json(); } catch { data = null; }
        const p = r.ok ? parse<T>(data) : null;
        if (ac.signal.aborted) return;
        // A 200 with an unexpected body is treated as a failed load, never as an empty list.
        setSt({ key, status: r.ok && !p ? 502 : r.status, items: p?.items ?? [], next: p?.next ?? null, busy: false, moreError: false });
      })
      .catch(() => { if (!ac.signal.aborted) setSt({ key, status: 0, items: [], next: null, busy: false, moreError: false }); });
    return () => ac.abort();
  }, [url, key]);

  const cur = st && st.key === key ? st : null;
  const next = cur?.next ?? null;
  const busy = cur?.busy ?? false;

  const loadMore = React.useCallback(() => {
    if (!next || busy) return;
    setSt((s) => (s && s.key === key ? { ...s, busy: true, moreError: false } : s));
    fetch(pageUrl(url, next), { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(async (r) => {
        let data: unknown = null;
        try { data = await r.json(); } catch { data = null; }
        const p = r.ok ? parse<T>(data) : null;
        setSt((s) => {
          if (!s || s.key !== key) return s;
          if (!p) return { ...s, busy: false, moreError: true };
          return { ...s, items: [...s.items, ...p.items], next: p.next, busy: false, moreError: false };
        });
      })
      .catch(() => setSt((s) => (s && s.key === key ? { ...s, busy: false, moreError: true } : s)));
  }, [next, busy, key, url]);

  if (!cur) return { loading: true, status: 0, items: [], hasMore: false, loadingMore: false, moreError: false, loadMore };
  return { loading: false, status: cur.status, items: cur.items, hasMore: cur.next !== null, loadingMore: cur.busy, moreError: cur.moreError, loadMore };
}
