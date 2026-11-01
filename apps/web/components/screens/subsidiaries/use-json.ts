'use client';
// Read-only fetch hook. State is only set inside .then callbacks (SSR rule). Distinguishes 404 from other failures.
import * as React from 'react';

export type JsonState<T> = { state: 'loading' } | { state: 'notfound' } | { state: 'error' } | { state: 'ok'; data: T };

type Settled<T> = Exclude<JsonState<T>, { state: 'loading' }>;

export function useJson<T>(url: string): { result: JsonState<T>; retry: () => void } {
  const [tick, setTick] = React.useState(0);
  const [done, setDone] = React.useState<{ key: string; value: Settled<T> } | null>(null);
  const key = `${url}#${tick}`;
  React.useEffect(() => {
    let live = true;
    const ok = (data: T): Settled<T> => ({ state: 'ok', data });
    fetch(url)
      .then((r): Promise<Settled<T>> => {
        if (r.status === 404) return Promise.resolve({ state: 'notfound' });
        if (!r.ok) return Promise.resolve({ state: 'error' });
        return r.json().then(ok);
      })
      .catch((): Settled<T> => ({ state: 'error' }))
      .then((value) => { if (live) setDone({ key, value }); });
    return () => { live = false; };
  }, [url, key]);
  const result: JsonState<T> = done && done.key === key ? done.value : { state: 'loading' };
  return { result, retry: () => setTick((n) => n + 1) };
}
