'use client';

import { beginSpeech, endSpeech, isSpeechActive } from '@/lib/hooks/speech-activity';

const SPEECH_LOCAL_ONLY = process.env.NEXT_PUBLIC_WHINK_LOCAL_ONLY === 'true';

export interface ApprovalRequest {
  /** Server approval id. The caller must act on exactly this id with the decision endpoint. */
  id: string;
  tool: string | null;
  summary: string;
}

export type SpokenDecision = 'approve' | 'deny' | 'unclear';

/** Minimum recogniser confidence before a spoken approve is accepted. Deny has no floor. */
export const APPROVE_MIN_CONFIDENCE = 0.7;
const MAX_CAPTURE_MS = 15_000;

const DENY_TOKENS = new Set([
  'no', 'not', "don't", 'dont', 'deny', 'denied', 'stop', 'cancel', 'never',
  'reject', 'wait', "can't", 'cant', 'cannot', "won't", 'wont',
]);

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

/** Lowercase, strip punctuation (keeping apostrophes), collapse whitespace. */
export function normalizeTranscript(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/(\d)[,.](?=\d)/g, '$1')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fail-safe classifier for a spoken approval decision.
 * - Any negation/deny token anywhere in the utterance => 'deny' (checked first, no confidence floor).
 * - Approve only on the exact full utterance "approve <code>" / "approved <code>", where the code is
 *   the card's 4-digit confirmation code spoken as digits or number words, and confidence >= 0.7.
 * - Everything else => 'unclear' (treated as a timeout: nothing is sent).
 */
export function classifySpokenDecision(
  transcript: string,
  confidence: number,
  expectedCode: string,
): SpokenDecision {
  const tokens = normalizeTranscript(transcript).split(' ').filter(Boolean);
  if (tokens.some((t) => DENY_TOKENS.has(t))) return 'deny';

  if (!/^\d{4}$/.test(expectedCode)) return 'unclear';
  if (!Number.isFinite(confidence) || confidence < APPROVE_MIN_CONFIDENCE) return 'unclear';
  if (tokens.length < 2 || (tokens[0] !== 'approve' && tokens[0] !== 'approved')) return 'unclear';

  let spoken = '';
  for (const t of tokens.slice(1)) {
    if (/^\d+$/.test(t)) spoken += t;
    else if (t in DIGIT_WORDS) spoken += DIGIT_WORDS[t];
    else return 'unclear';
  }
  return spoken === expectedCode ? 'approve' : 'unclear';
}

/** 4-digit confirmation code. Client-side only: never sent to the server or the model. */
export function generateConfirmationCode(): string {
  const buf = new Uint32Array(1);
  const limit = 4294967296 - (4294967296 % 10000); // rejection sampling, no modulo bias
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return String(buf[0] % 10000).padStart(4, '0');
}

/** The text spoken when an approval is requested. It must never contain the code. */
export function buildApprovalPrompt(ear: Pick<ApprovalRequest, 'tool' | 'summary'>): string {
  const name = ear.tool ? `Action: ${ear.tool}. ` : '';
  return (
    `Approval required. ${name}${ear.summary}. ` +
    `Say approve followed by the code on screen, or say deny. This applies to this request only.`
  );
}

/** Speaks the approval prompt. Does NOT listen: the user decides via push-to-talk on the card. */
export async function speakApprovalRequest(ear: ApprovalRequest): Promise<void> {
  await speakServer(buildApprovalPrompt(ear));
}

async function speakServer(text: string): Promise<void> {
  beginSpeech();
  try {
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
        await new Promise<void>((resolve) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
          audio.play().catch(() => resolve());
        });
        return;
      }
      if (res.status !== 501) throw new Error(`TTS ${res.status}`);
    } catch { /* fall through to browser synthesis */ }

    if (SPEECH_LOCAL_ONLY) return; // Local-Only: no browser synthesis (may use network voices)
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    await new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  } finally {
    endSpeech();
  }
}

export interface DecisionCapture {
  /** Stop capturing and classify what was heard. */
  stop: () => Promise<SpokenDecision>;
  /** Stop and discard everything heard. Resolves stop() as 'unclear'. */
  abort: () => void;
}

/**
 * Starts capturing one spoken decision (push-to-talk: caller stops it on release).
 * Returns null if speech is playing or no recogniser exists. Only the top alternative is used.
 *
 * Echo cancellation: the Web Speech API opens its own microphone and accepts no
 * MediaStream or constraints, so echoCancellation/noiseSuppression cannot be applied there
 * (the browser applies its own processing). The server-STT fallback below does request them.
 * Because of that limit the real protections are: no capture while any TTS plays, push-to-talk
 * only, and the on-screen code that is never spoken.
 */
export function startDecisionCapture(expectedCode: string): DecisionCapture | null {
  if (typeof window === 'undefined' || isSpeechActive()) return null;

  const w = window as Window & typeof globalThis & { webkitSpeechRecognition?: SpeechRecognitionConstructor };
  // Local-Only: browser recognition sends audio to a vendor, so it is not used.
  const Ctor = SPEECH_LOCAL_ONLY ? undefined : (w.SpeechRecognition ?? w.webkitSpeechRecognition);

  if (Ctor) return captureWebSpeech(new Ctor(), expectedCode);
  if (typeof MediaRecorder !== 'undefined' && navigator.mediaDevices) return captureServerStt(expectedCode);
  return null;
}

function captureWebSpeech(recognition: SpeechRecognition, expectedCode: string): DecisionCapture {
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  let transcript = '';
  let confidence = 0;
  let aborted = false;
  let settle: (d: SpokenDecision) => void = () => {};
  const done = new Promise<SpokenDecision>((resolve) => { settle = resolve; });
  const limit = setTimeout(() => { try { recognition.stop(); } catch { /* ignore */ } }, MAX_CAPTURE_MS);

  const finish = () => {
    clearTimeout(limit);
    settle(aborted ? 'unclear' : classifySpokenDecision(transcript, confidence, expectedCode));
  };

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const parts: string[] = [];
    let minConf = 1;
    for (let i = 0; i < event.results.length; i++) {
      const top = event.results[i][0]; // top alternative only
      parts.push(top.transcript);
      minConf = Math.min(minConf, top.confidence);
    }
    transcript = parts.join(' ');
    confidence = minConf;
  };
  recognition.onerror = () => { transcript = ''; confidence = 0; finish(); };
  recognition.onend = finish;

  try { recognition.start(); } catch { settle('unclear'); }

  return {
    stop: () => {
      try { recognition.stop(); } catch { finish(); }
      return done;
    },
    abort: () => {
      aborted = true;
      try { recognition.abort(); } catch { finish(); }
    },
  };
}

function captureServerStt(expectedCode: string): DecisionCapture {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let aborted = false;
  let stopRequested = false;
  const chunks: Blob[] = [];
  let settle: (d: SpokenDecision) => void = () => {};
  const done = new Promise<SpokenDecision>((resolve) => { settle = resolve; });

  const release = () => { stream?.getTracks().forEach((t) => t.stop()); };

  navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    .then((s) => {
      stream = s;
      if (aborted) { release(); settle('unclear'); return; }
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const r = new MediaRecorder(s, { mimeType });
      recorder = r;
      r.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      r.onstop = async () => {
        release();
        if (aborted) { settle('unclear'); return; }
        let text = '';
        try {
          const form = new FormData();
          form.append('audio', new Blob(chunks, { type: mimeType }), 'audio.webm');
          const res = await fetch('/api/voice/stt', { method: 'POST', body: form });
          if (res.ok) { const d = await res.json(); text = typeof d.text === 'string' ? d.text : ''; }
        } catch { /* unclear */ }
        // Server STT reports no confidence: 0 means it can deny but never approve (fail safe).
        settle(classifySpokenDecision(text, 0, expectedCode));
      };
      r.start();
      if (stopRequested) r.stop();
      setTimeout(() => { if (r.state !== 'inactive') r.stop(); }, MAX_CAPTURE_MS);
    })
    .catch(() => settle('unclear'));

  return {
    stop: () => {
      stopRequested = true;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      return done;
    },
    abort: () => {
      aborted = true;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      else if (!recorder && !stream) settle('unclear');
    },
  };
}
