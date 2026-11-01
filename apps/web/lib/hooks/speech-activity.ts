/**
 * Tracks whether any text-to-speech is playing or queued, so the microphone is
 * never open while the app (or a model reply) is talking. Every TTS path in the
 * app must wrap playback in beginSpeech()/endSpeech().
 */
let active = 0;
const listeners = new Set<(speaking: boolean) => void>();

function notify(): void {
  const speaking = isSpeechActive();
  listeners.forEach((l) => l(speaking));
}

export function beginSpeech(): void {
  active += 1;
  notify();
}

export function endSpeech(): void {
  active = Math.max(0, active - 1);
  notify();
}

export function isSpeechActive(): boolean {
  if (active > 0) return true;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    return window.speechSynthesis.speaking || window.speechSynthesis.pending;
  }
  return false;
}

export function subscribeSpeech(fn: (speaking: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
