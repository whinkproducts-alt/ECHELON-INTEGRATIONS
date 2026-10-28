'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { beginSpeech, endSpeech } from '@/lib/hooks/speech-activity';

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

export interface VoiceSupport {
  stt: boolean;
  tts: boolean;
  /** true when STT is via server (MediaRecorder → /api/voice/stt) rather than browser Web Speech */
  serverStt: boolean;
}

export interface UseVoiceReturn {
  startListening: () => void;
  stopListening: () => Promise<string>;
  speak: (text: string) => Promise<void>;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  supported: VoiceSupport;
  /** 0–1 amplitude derived from live AnalyserNode on TTS audio, 0 when not speaking */
  lipSyncAmplitude: number;
  /** Set when speech is switched off on purpose (Local-Only mode), to show the user why. */
  voiceNotice?: string | null;
}

/**
 * Local-Only mode (NEXT_PUBLIC_WHINK_LOCAL_ONLY, set together with WHINK_LOCAL_ONLY). Browser speech recognition
 * (for example Chrome's webkitSpeechRecognition) sends audio to a vendor's servers and some browser voices are
 * network voices, so neither is used. Speech then goes only through the server routes, which allow a loopback service.
 */
const LOCAL_ONLY_CLIENT = process.env.NEXT_PUBLIC_WHINK_LOCAL_ONLY === 'true';
export const SPEECH_NOTICE = 'Speech is not available in Local-Only mode';

export function useVoice(): UseVoiceReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lipSyncAmplitude, setLipSyncAmplitude] = useState(0);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const [supported] = useState<VoiceSupport>(() => {
    if (typeof window === 'undefined') return { stt: false, tts: false, serverStt: false };
    const hasSpeechRecognition = !LOCAL_ONLY_CLIENT && (
      typeof window.SpeechRecognition !== 'undefined' ||
      typeof window.webkitSpeechRecognition !== 'undefined');
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
    const hasSpeechSynthesis = LOCAL_ONLY_CLIENT || typeof window.speechSynthesis !== 'undefined';
    return {
      stt: hasSpeechRecognition || hasMediaRecorder,
      tts: hasSpeechSynthesis,
      serverStt: !hasSpeechRecognition && hasMediaRecorder,
    };
  });

  // ── Browser Web Speech path ───────────────────────────────────────────────
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const resolveListenRef = useRef<((t: string) => void) | null>(null);
  const accumulatedRef = useRef('');

  // ── MediaRecorder path (server STT fallback) ──────────────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const resolveServerSttRef = useRef<((t: string) => void) | null>(null);

  // ── Lipsync (AnalyserNode on TTS audio) ──────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  /** Start RAF loop reading RMS from analyser and writing to lipSyncAmplitude. */
  const startLipSync = useCallback((analyser: AnalyserNode) => {
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      // Compute RMS (root mean square) of signal centred on 128
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buf.length);
      // Scale: rms typically peaks ~0.3 for loud speech, map to 0–1 clamped
      setLipSyncAmplitude(Math.min(rms * 3.5, 1));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopLipSync = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLipSyncAmplitude(0);
    // Close AudioContext to release hardware resource
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopLipSync();
    };
  }, [stopLipSync]);

  const startListening = useCallback(() => {
    if (isListening) return;

    const SpeechRecognitionCtor =
      typeof window !== 'undefined'
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : null;

    // ── Web Speech path ───────────────────────────────────────────────────
    if (SpeechRecognitionCtor) {
      accumulatedRef.current = '';
      setTranscript('');

      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        if (final) accumulatedRef.current += final;
        setTranscript(accumulatedRef.current + interim);
      };

      recognition.onend = () => {
        setIsListening(false);
        const t = accumulatedRef.current;
        setTranscript(t);
        resolveListenRef.current?.(t);
        resolveListenRef.current = null;
      };

      recognition.onerror = () => {
        setIsListening(false);
        resolveListenRef.current?.(accumulatedRef.current);
        resolveListenRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
      return;
    }

    // ── MediaRecorder → server STT path ──────────────────────────────────
    if (typeof MediaRecorder === 'undefined') return;

    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((stream) => {
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsListening(false);

        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        let text = '';
        try {
          const form = new FormData();
          form.append('audio', blob, 'audio.webm');
          const res = await fetch('/api/voice/stt', { method: 'POST', body: form });
          if (res.ok) {
            const data = await res.json();
            text = data.text ?? '';
          } else if (res.status === 503 && LOCAL_ONLY_CLIENT) {
            setVoiceNotice(SPEECH_NOTICE);
          }
        } catch { /* non-blocking */ }

        setTranscript(text);
        resolveServerSttRef.current?.(text);
        resolveServerSttRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
    }).catch(() => {
      // Microphone denied — silently fail
    });
  }, [isListening]);

  const stopListening = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      // MediaRecorder path
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        resolveServerSttRef.current = resolve;
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
        return;
      }
      // Web Speech path
      if (!recognitionRef.current) {
        resolve(accumulatedRef.current);
        return;
      }
      resolveListenRef.current = resolve;
      recognitionRef.current.stop();
    });
  }, []);

  // ── TTS: server first, browser fallback ──────────────────────────────────
  const speakInner = useCallback(async (text: string): Promise<void> => {

    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        // ── Wire up AnalyserNode for lipsync ───────────────────────────
        let didStartLipSync = false;
        try {
          if (typeof AudioContext !== 'undefined') {
            const ctx = new AudioContext();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.6;
            const source = ctx.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(ctx.destination);
            audioCtxRef.current = ctx;
            analyserRef.current = analyser;

            audio.addEventListener('play', () => {
              if (ctx.state === 'suspended') ctx.resume().catch(() => {});
              startLipSync(analyser);
              didStartLipSync = true;
            }, { once: true });
          }
        } catch {
          // Web Audio unavailable — lipsync degrades gracefully to CSS pulse
        }

        setIsSpeaking(true);
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('Audio playback error'));
          audio.play().catch(reject);
        });

        if (didStartLipSync) stopLipSync();
        URL.revokeObjectURL(url);
        setIsSpeaking(false);
        return;
      }

      // 501 = no TTS provider configured, fall through to browser
      if (res.status !== 501) {
        throw new Error(`TTS server error ${res.status}`);
      }
    } catch {
      // Fall through to browser synthesis
    }

    // Local-Only: no browser synthesis fallback.
    if (LOCAL_ONLY_CLIENT) { setVoiceNotice(SPEECH_NOTICE); return; }
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    setIsSpeaking(true);
    // Browser synthesis: no audio element access, simulate amplitude with a simple sine wave
    const startTime = Date.now();
    const simTick = () => {
      const t = (Date.now() - startTime) / 1000;
      // Modulate between 0.3–0.8 at ~4 Hz to suggest mouth movement
      const sim = 0.55 + 0.25 * Math.sin(t * Math.PI * 8);
      setLipSyncAmplitude(sim);
    };
    const simInterval = setInterval(simTick, 50);

    await new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });

    clearInterval(simInterval);
    setLipSyncAmplitude(0);
    setIsSpeaking(false);
  }, [startLipSync, stopLipSync]);

  const speak = useCallback(async (text: string): Promise<void> => {
    if (!text.trim()) return;
    beginSpeech();
    try {
      await speakInner(text);
    } finally {
      endSpeech();
    }
  }, [speakInner]);

  return { startListening, stopListening, speak, isListening, isSpeaking, transcript, supported, lipSyncAmplitude, voiceNotice };
}
