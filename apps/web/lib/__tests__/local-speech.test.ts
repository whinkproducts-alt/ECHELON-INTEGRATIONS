import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioFilename, localSpeechHeaders } from '@/lib/local-speech';
import { pcm16Wav, recorderMime } from '@/lib/voice-audio';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('local speech transport', () => {
  it('requires a token and exact loopback before forwarding credentials', () => {
    vi.stubEnv('LOCAL_SPEECH_TOKEN', 'test-only-' + 'x'.repeat(32));
    expect(localSpeechHeaders('http://127.0.0.1:8765', true)).toHaveProperty('Authorization');
    for (const url of ['http://host.docker.internal:8765', 'https://127.0.0.1.evil.com', 'https://external.example']) {
      expect(() => localSpeechHeaders(url, true)).toThrow();
    }
    vi.stubEnv('LOCAL_SPEECH_TOKEN', '');
    expect(() => localSpeechHeaders('http://localhost:8765', true)).toThrow();
    expect(localSpeechHeaders('https://old-provider.example', false)).toEqual({});
  });
  it('preserves Safari and WAV file extensions', () => {
    expect(audioFilename('audio/mp4')).toBe('audio.m4a');
    expect(audioFilename('audio/wav')).toBe('audio.wav');
    expect(audioFilename('audio/webm;codecs=opus')).toBe('audio.webm');
  });
});

describe('portable microphone audio', () => {
  it('negotiates Safari MP4 when opus is unavailable', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (type: string) => type === 'audio/mp4' });
    expect(recorderMime()).toBe('audio/mp4');
  });
  it('encodes real PCM16 mono 16kHz WAV with bounded duration', () => {
    const view = new DataView(pcm16Wav(new Float32Array(48000).fill(0.5), 48000));
    expect(view.byteLength).toBe(44 + 16000 * 2);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getInt16(44, true)).toBe(16383);
    expect(() => pcm16Wav(new Float32Array(16000 * 61), 16000)).toThrow();
  });
});
