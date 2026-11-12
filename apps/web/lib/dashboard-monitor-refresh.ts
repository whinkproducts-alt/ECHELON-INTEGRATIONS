/** Publish each independent section as soon as it settles, ignoring cancelled work. */
export async function loadMonitorSection<T>(
  load: () => Promise<T>, signal: AbortSignal,
  success: (value: T) => void, failure: (reason: unknown) => void,
): Promise<void> {
  try {
    const value = await load();
    if (!signal.aborted) success(value);
  } catch (reason) {
    if (!signal.aborted) failure(reason);
  }
}

/** Hidden panels stay mounted for state preservation, but own no background timers. */
export function startMonitorPolling(
  active: boolean, load: (signal: AbortSignal) => Promise<void>, tick: () => void,
): { refresh: () => void; stop: () => void } {
  let controller = new AbortController();
  let stopped = false;
  const refresh = () => {
    if (stopped || !active || document.hidden) return;
    if (controller.signal.aborted) controller = new AbortController();
    void load(controller.signal);
  };
  if (!active) return { refresh, stop: () => { stopped = true; controller.abort(); } };
  const visibility = () => {
    if (document.hidden) controller.abort();
    else refresh();
  };
  const kick = setTimeout(refresh, 0);
  const poll = setInterval(refresh, 30_000);
  const clock = setInterval(() => { if (!document.hidden) tick(); }, 1000);
  document.addEventListener('visibilitychange', visibility);
  return {
    refresh,
    stop: () => {
      stopped = true;
      controller.abort();
      clearTimeout(kick); clearInterval(poll); clearInterval(clock);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
