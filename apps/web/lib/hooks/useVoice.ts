'use client';

import { useState, useRef, useCallback } from 'react';

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
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
}

export function useVoice(): UseVoiceReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');

  const [supported] = useState<VoiceSupport>(() => {
    if (typeof window === 'undefined') return { stt: false, tts: false, serverStt: false };
    const hasSpeechRecognition =
      typeof window.SpeechRecognition !== 'undefined' ||
      typeof window.webkitSpeechRecognition !== 'undefined';
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
    const hasSpeechSynthesis = typeof window.speechSynthesis !== 'undefined';
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

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
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
  const speak = useCallback(async (text: string): Promise<void> => {
    if (!text.trim()) return;

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
        setIsSpeaking(true);
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('Audio playback error'));
          audio.play().catch(reject);
        });
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

    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    setIsSpeaking(true);
    await new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
    setIsSpeaking(false);
  }, []);

  return { startListening, stopListening, speak, isListening, isSpeaking, transcript, supported };
}
