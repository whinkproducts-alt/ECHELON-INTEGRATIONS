/** Pure speech scheduling, quality and selection rules, shared by worker and request catch-up. */
export type SpeechService = 'whisper-kokoro' | 'voicestudio';
export type SpeechMode = SpeechService | 'auto' | 'legacy';
export const SPEECH_MODES: SpeechMode[] = ['auto', 'whisper-kokoro', 'voicestudio', 'legacy'];
export const KOKORO_VOICES = ['af_heart', 'af_bella', 'af_sky', 'af_nova', 'am_adam', 'am_michael'];
export const FIXTURE_TEXT = 'The local speech service is ready for a clear voice test';
export interface SpeechResult {
  service: SpeechService; configured: boolean; reachable: boolean; modelReady: boolean; healthy: boolean;
  sampleCount: number; coldSttMs: number | null; warmSttMs: number | null; coldTtsMs: number | null; warmTtsMs: number | null;
  scoreMs: number | null; failure: string | null; version: string | null; voices: string[];
}
export function scheduledSpeechDay(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23' }).formatToParts(now);
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  // Before 5am, yesterday's scheduled check is still the current check, even across DST.
  return Number(get('hour')) >= 5 ? day : new Date(Date.parse(day + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
}
export function validTimezone(timezone: string): boolean {
  try { scheduledSpeechDay(new Date(), timezone); return true; } catch { return false; }
}
export function transcriptAccepts(text: string): boolean {
  const words = (value: string) => value.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const expected = words(FIXTURE_TEXT); const actual = words(text);
  const distance = Array.from({ length: expected.length + 1 }, (_, i) => [i, ...Array(actual.length).fill(0)]);
  for (let j = 0; j <= actual.length; j++) distance[0][j] = j;
  for (let i = 1; i <= expected.length; i++) for (let j = 1; j <= actual.length; j++) distance[i][j] = Math.min(distance[i-1][j]+1, distance[i][j-1]+1, distance[i-1][j-1]+Number(expected[i-1] !== actual[j-1]));
  return distance[expected.length][actual.length] / expected.length <= 0.2;
}
export function validatePcmWav(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) + 8 > bytes.length) throw new Error('invalid_audio');
  let channels = 0, rate = 0, width = 0, size = 0, dataOffset = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = view.getUint32(offset + 4, true);
    if (offset + 8 + length > bytes.length) throw new Error('invalid_audio');
    if (tag(offset) === 'fmt ') {
      if (length < 16 || view.getUint16(offset + 8, true) !== 1) throw new Error('unsupported_audio');
      channels = view.getUint16(offset + 10, true); rate = view.getUint32(offset + 12, true); width = view.getUint16(offset + 22, true);
    }
    if (tag(offset) === 'data') { size = length; dataOffset = offset + 8; }
    offset += 8 + length + length % 2;
  }
  if (![1,2].includes(channels) || width !== 16 || rate < 8000 || rate > 96000 || size % (channels * 2)) throw new Error('unsupported_audio');
  const duration = size / (rate * channels * 2);
  if (duration < 0.15 || duration > 30) throw new Error('invalid_audio_duration');
  let nonSilent = false;
  for (let offset = dataOffset; offset < dataOffset + size; offset += 2) if (Math.abs(view.getInt16(offset, true)) >= 32) { nonSilent = true; break; }
  if (!nonSilent) throw new Error('silent_audio');
  return duration;
}
export function chooseHealthy(results: SpeechResult[], previous?: string | null): SpeechService | null {
  const healthy = results.filter(r => r.healthy && r.scoreMs !== null).sort((a,b) => a.scoreMs! - b.scoreMs!);
  if (!healthy[0]) return null;
  const retained = healthy.find(r => r.service === previous);
  return retained && retained.scoreMs! <= healthy[0].scoreMs! * 1.2 ? retained.service : healthy[0].service;
}
export function canonicalSpeaker(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raw)) return 'whink';
  return raw.toLowerCase();
}
export function stableVoice(speaker: string, voices: string[]): string {
  if (!voices.length) throw new Error('No voice configured');
  if (speaker === 'whink') return voices[0];
  if (speaker === 'mamba') return voices[Math.min(1, voices.length - 1)];
  let hash = 2166136261;
  for (const char of speaker) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return voices[hash % voices.length];
}
