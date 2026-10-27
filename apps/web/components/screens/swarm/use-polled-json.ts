'use client';
// Polling fetch hook. State is only set inside .then callbacks (SSR rule). Polls while shouldPoll(data) is true,
// pauses while the tab is hidden and fetches again as soon as it becomes visible. A failed poll keeps the last good data.
import * as React from 'react';

export interface PolledJson<T> {
  loading: boolean;
  /** HTTP status of the latest completed request; 0 means it never completed. */
  status: number;
  data: T | null;
  /** True when the latest request failed but earlier data is still shown. */
  stale: boolean;
  reload: () => void;
}

interface Settled<T> { key: string; status: number; data: T | null; stale: boolean }

export function usePolledJson<T>(url: string | null, opts: { intervalMs: number; shouldPoll: (data: T) => boolean }): PolledJson<T> {
  const [nonce, setNonce] = React.useState(0);
  const [res, setRes] = React.useState<Settled<T> | null>(null);
  const shouldRef = React.useRef(opts.shouldPoll);
  const { intervalMs } = opts;
  React.useEffect(() => { shouldRef.current = opts.shouldPoll; });

  React.useEffect(() => {
    if (!url) return;
    const key = url;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let waitingForVisible = false;
    let ac: AbortController | null = null;

    const schedule = (poll: boolean) => {
      if (timer) clearTimeout(timer);
      timer = poll ? setTimeout(tick, intervalMs) : null;
    };
    const run = () => {
      ac?.abort();
      const mine = new AbortController();
      ac = mine;
      fetch(key, { signal: mine.signal, cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(async (r) => {
          let data: T | null = null;
          try { data = (await r.json()) as T; } catch { data = null; }
          if (!live || mine.signal.aborted) return;
          if (r.status === 200 && data) {
            setRes({ key, status: 200, data, stale: false });
            schedule(shouldRef.current(data));
          } else {
            setRes((prev) => (prev && prev.key === key && prev.data ? { ...prev, stale: true } : { key, status: r.status, data: null, stale: false }));
            schedule(r.status >= 500);
          }
        })
        .catch(() => {
          if (!live || mine.signal.aborted) return;
          setRes((prev) => (prev && prev.key === key && prev.data ? { ...prev, stale: true } : { key, status: 0, data: null, stale: false }));
          schedule(true);
        });
    };
    function tick() {
      if (document.hidden) { waitingForVisible = true; return; }
      run();
    }
    const onVisible = () => {
      if (!document.hidden && waitingForVisible) { waitingForVisible = false; run(); }
    };
    document.addEventListener('visibilitychange', onVisible);
    run();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      ac?.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [url, intervalMs, nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);
  if (!url) return { loading: false, status: 0, data: null, stale: false, reload };
  if (!res || res.key !== url) return { loading: true, status: 0, data: null, stale: false, reload };
  return { loading: false, status: res.status, data: res.data, stale: res.stale, reload };
}
