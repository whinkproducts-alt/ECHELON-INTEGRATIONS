'use client';

import { useState, useRef, useCallback } from 'react';

// Augment window for non-standard browser APIs
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export interface VoiceSupport {
  stt: boolean;
  tts: boolean;
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
  // Detect browser support synchronously on first render (client-only)
  const [supported] = useState<VoiceSupport>(() => {
    if (typeof window === 'undefined') return { stt: false, tts: false };
    const hasSpeechRecognition =
      typeof window.SpeechRecognition !== 'undefined' ||
      typeof window.webkitSpeechRecognition !== 'undefined';
    const hasSpeechSynthesis = typeof window.speechSynthesis !== 'undefined';
    return { stt: hasSpeechRecognition, tts: hasSpeechSynthesis };
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const resolveListenRef = useRef<((t: string) => void) | null>(null);
  const accumulatedRef = useRef('');

  const startListening = useCallback(() => {
    if (isListening) return;

    const SpeechRecognitionCtor =
      typeof window !== 'undefined'
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : null;
    if (!SpeechRecognitionCtor) return;

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
      if (final) {
        accumulatedRef.current += final;
      }
      setTranscript(accumulatedRef.current + interim);
    };

    recognition.onend = () => {
      setIsListening(false);
      const t = accumulatedRef.current;
      setTranscript(t);
      if (resolveListenRef.current) {
        resolveListenRef.current(t);
        resolveListenRef.current = null;
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      if (resolveListenRef.current) {
        resolveListenRef.current(accumulatedRef.current);
        resolveListenRef.current = null;
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  const stopListening = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      if (!recognitionRef.current) {
        resolve(accumulatedRef.current);
        return;
      }
      resolveListenRef.current = resolve;
      recognitionRef.current.stop();
    });
  }, []);

  const speak = useCallback(async (text: string): Promise<void> => {
    if (!text.trim()) return;

    // Try server TTS first
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

      // 501 means fall back to browser
      if (res.status !== 501) {
        throw new Error(`TTS server error ${res.status}`);
      }
    } catch {
      // Fall through to browser synthesis
    }

    // Browser SpeechSynthesis fallback
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
