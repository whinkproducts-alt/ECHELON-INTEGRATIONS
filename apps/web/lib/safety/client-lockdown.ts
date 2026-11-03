'use client';
/**
 * Browser side of R07 lockdown. The server is the authority; this only makes the browser stop its own
 * microphone, camera and audio as soon as it learns of a lockdown, and refuse to start them again.
 * Media code subscribes with onClientLockdown and checks isClientLockedDown before acquiring a device.
 */
export const LOCKDOWN_EVENT = 'echelon:lockdown';

let locked = false;
const tracks = new Set<MediaStreamTrack>();

export function isClientLockedDown(): boolean {
  return locked;
}

/** Register a live microphone or camera track so lockdown can stop it even if its owner forgets. */
export function trackMedia(stream: MediaStream): void {
  stream.getTracks().forEach((t) => {
    tracks.add(t);
    t.addEventListener('ended', () => tracks.delete(t), { once: true });
  });
}

export function setClientLockdown(next: boolean): void {
  if (typeof window === 'undefined') return;
  const changed = locked !== next;
  locked = next;
  if (next) {
    tracks.forEach((t) => { try { t.stop(); } catch { /* already stopped */ } });
    tracks.clear();
    try { window.speechSynthesis?.cancel(); } catch { /* unsupported */ }
  }
  if (changed) window.dispatchEvent(new CustomEvent(LOCKDOWN_EVENT, { detail: { locked: next } }));
}

export function onClientLockdown(fn: (locked: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = (e: Event) => fn(Boolean((e as CustomEvent<{ locked: boolean }>).detail?.locked));
  window.addEventListener(LOCKDOWN_EVENT, h);
  return () => window.removeEventListener(LOCKDOWN_EVENT, h);
}
