'use client';
// Wall-clock value for client-only relative text ("renews in 12 days"). Null on the server and first paint.
import * as React from 'react';

export function useNow(): number | null {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);
  return now;
}
