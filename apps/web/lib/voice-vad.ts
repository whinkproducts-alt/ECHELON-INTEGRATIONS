/**
 * End-of-speech detection for hands-free voice. Feed it the microphone level (RMS, 0 to 1) about ten times a second.
 * It learns the room's noise floor first, then reports when the speaker has finished or never started.
 */
export const VAD = { calibrateMs: 400, silenceMs: 1400, noSpeechMs: 9000, unreadableMs: 1500, minThreshold: 0.02, maxThreshold: 0.08 } as const;

export type VadVerdict = 'continue' | 'end' | 'no-speech' | 'unreadable';

export function createVad(startedAt: number) {
  let floor = 0, count = 0, peak = 0, voiced = false, lastVoice = 0;
  return (level: number, now: number): VadVerdict => {
    peak = Math.max(peak, level);
    if (now - startedAt < VAD.calibrateMs) { floor = (floor * count + level) / (count + 1); count++; return 'continue'; }
    // A context the browser kept suspended reads flat zero. That is not silence, so the user ends the turn instead.
    if (now - startedAt > VAD.unreadableMs && peak === 0) return 'unreadable';
    if (level > Math.min(VAD.maxThreshold, Math.max(VAD.minThreshold, floor * 3))) { voiced = true; lastVoice = now; }
    if (voiced && now - lastVoice > VAD.silenceMs) return 'end';
    if (!voiced && now - startedAt > VAD.noSpeechMs) return 'no-speech';
    return 'continue';
  };
}
