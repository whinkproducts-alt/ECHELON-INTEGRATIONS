'use client';

export interface ApprovalRequest {
  action: string;
  risk: string;
  summary: string;
}

const APPROVE_WORDS = ['approved', 'approve', 'yes', 'go ahead', 'confirm', 'do it'];
const DENY_WORDS = ['denied', 'deny', 'no', 'stop', 'cancel', 'reject'];
const TIMEOUT_MS = 30_000;

/**
 * Speaks the EAR summary via server TTS (falls back to browser synthesis),
 * then listens for a spoken decision via server STT (falls back to Web Speech).
 * Returns 'approved', 'denied', or 'timeout'.
 */
export async function speakApprovalRequest(
  ear: ApprovalRequest,
): Promise<'approved' | 'denied' | 'timeout'> {
  const text =
    `Approval required. Action: ${ear.action}. ` +
    `Risk level: ${ear.risk}. ` +
    `Summary: ${ear.summary}. ` +
    `Say "approved" to allow or "denied" to reject.`;

  await speakServer(text);
  return listenForDecision();
}

async function speakServer(text: string): Promise<void> {
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
    // 501 = no TTS provider, fall through to browser
    if (res.status !== 501) throw new Error(`TTS ${res.status}`);
  } catch { /* fall through */ }

  // Browser synthesis fallback
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  await new Promise<void>((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

function listenForDecision(): Promise<'approved' | 'denied' | 'timeout'> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve('timeout'); return; }

    const SpeechRecognitionCtor =
      (window as Window & typeof globalThis & { webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
      (window as Window & typeof globalThis & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    // Server STT path (MediaRecorder)
    if (!SpeechRecognitionCtor && typeof MediaRecorder !== 'undefined') {
      listenServerStt(TIMEOUT_MS).then(resolve);
      return;
    }

    if (!SpeechRecognitionCtor) { resolve('timeout'); return; }

    const recognition = new SpeechRecognitionCtor() as SpeechRecognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;

    let resolved = false;
    const finish = (result: 'approved' | 'denied' | 'timeout') => {
      if (resolved) return;
      resolved = true;
      try { recognition.stop(); } catch { /* ignore */ }
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => finish('timeout'), TIMEOUT_MS);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = 0; i < event.results.length; i++) {
        for (let j = 0; j < event.results[i].length; j++) {
          const heard = event.results[i][j].transcript.toLowerCase().trim();
          if (APPROVE_WORDS.some((w) => heard.includes(w))) { finish('approved'); return; }
          if (DENY_WORDS.some((w) => heard.includes(w))) { finish('denied'); return; }
        }
      }
    };

    recognition.onerror = () => finish('timeout');
    recognition.onend = () => { if (!resolved) finish('timeout'); };
    recognition.start();
  });
}

async function listenServerStt(timeoutMs: number): Promise<'approved' | 'denied' | 'timeout'> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    const transcript = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, timeoutMs);

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        clearTimeout(timer);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mimeType });
        try {
          const form = new FormData();
          form.append('audio', blob, 'audio.webm');
          const res = await fetch('/api/voice/stt', { method: 'POST', body: form });
          if (res.ok) { const d = await res.json(); resolve(d.text ?? ''); return; }
        } catch { /* ignore */ }
        resolve('');
      };
      recorder.start();
    });

    const heard = transcript.toLowerCase().trim();
    if (APPROVE_WORDS.some((w) => heard.includes(w))) return 'approved';
    if (DENY_WORDS.some((w) => heard.includes(w))) return 'denied';
    return 'timeout';
  } catch {
    return 'timeout';
  }
}
