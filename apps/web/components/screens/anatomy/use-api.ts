'use client';
// Tiny read-only fetch hook shared by the Kernel and Today screens. SSR safe: starts as 'loading', and only the
// .then callbacks set state. A non-2xx answer or a network failure is 'unavailable', so callers can say
// "not reported" instead of inventing a number.
import { useEffect, useState } from 'react';

export type ApiState<T> = { state: 'loading' } | { state: 'unavailable' } | { state: 'ok'; data: T };

export function useApi<T = unknown>(url: string): ApiState<T> {
  const [result, setResult] = useState<ApiState<T>>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<T>; })
      .then((data) => { if (live) setResult({ state: 'ok', data }); })
      .catch(() => { if (live) setResult({ state: 'unavailable' }); });
    return () => { live = false; };
  }, [url]);
  return result;
}

export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const asRecord = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
export const fmtInt = (n: number) => new Intl.NumberFormat('en-US').format(n);
