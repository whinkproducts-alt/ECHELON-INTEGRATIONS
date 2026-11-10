import { isLoopbackUrl } from '@/lib/local-only';

/** Sidecar bearer tokens must never be forwarded to a remote URL or redirect. */
export function localSpeechHeaders(url: string, enabled: boolean): Record<string, string> {
  if (!enabled) return {};
  const token = process.env.LOCAL_SPEECH_TOKEN?.trim();
  if (!isLoopbackUrl(url) || !token || token.length < 32) throw new Error('Local speech configuration unavailable');
  return { Authorization: `Bearer ${token}` };
}

export function audioFilename(type: string): string {
  const mime = type.split(';')[0].toLowerCase();
  return `audio.${({ 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3' } as Record<string, string>)[mime] ?? 'webm'}`;
}
