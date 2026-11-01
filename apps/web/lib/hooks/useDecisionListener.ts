'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { startDecisionCapture, type DecisionCapture } from '@/lib/spoken-approval';
import { subscribeSpeech } from '@/lib/hooks/speech-activity';

export const UNCLEAR_MESSAGE = "Didn't catch that — nothing was sent.";
export const SPEAKING_MESSAGE = 'Still speaking. Wait for it to finish, then try again.';
export const NO_MIC_MESSAGE = 'Voice input is not available here. Use the buttons.';

interface Options {
  code: string;
  /** Called only for a clear approve or deny. 'unclear' never reaches this. */
  onDecision: (d: 'approve' | 'deny') => void;
  disabled: boolean;
}

/** Push-to-talk decision capture for one approval card. */
export function useDecisionListener({ code, onDecision, disabled }: Options) {
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const captureRef = useRef<DecisionCapture | null>(null);

  const begin = useCallback(() => {
    if (disabled || captureRef.current) return;
    const cap = startDecisionCapture(code);
    if (!cap) {
      setMessage(typeof window !== 'undefined' && window.speechSynthesis?.speaking ? SPEAKING_MESSAGE : NO_MIC_MESSAGE);
      return;
    }
    captureRef.current = cap;
    setMessage(null);
    setListening(true);
  }, [code, disabled]);

  const end = useCallback(() => {
    const cap = captureRef.current;
    if (!cap) return;
    captureRef.current = null;
    setListening(false);
    void cap.stop().then((d) => {
      if (d === 'unclear') setMessage(UNCLEAR_MESSAGE);
      else onDecision(d);
    });
  }, [onDecision]);

  /** Enter toggles: start if idle, stop if listening. */
  const toggle = useCallback(() => {
    if (captureRef.current) end(); else begin();
  }, [begin, end]);

  // Never listen while anything is being spoken: discard capture the moment TTS starts.
  useEffect(() => {
    return subscribeSpeech((speaking) => {
      if (!speaking) return;
      const cap = captureRef.current;
      if (!cap) return;
      captureRef.current = null;
      cap.abort();
      setListening(false);
      setMessage(SPEAKING_MESSAGE);
    });
  }, []);

  // Kill the mic if the card goes away or stops being actionable.
  useEffect(() => {
    if (disabled) { captureRef.current?.abort(); captureRef.current = null; }
  }, [disabled]);
  useEffect(() => {
    return () => { captureRef.current?.abort(); captureRef.current = null; };
  }, []);

  return { listening: listening && !disabled, message, begin, end, toggle };
}
