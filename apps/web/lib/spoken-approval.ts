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
 * Speaks the EAR (Explicit Approval Request) summary and listens for a spoken decision.
 * Returns 'approved', 'denied', or 'timeout'.
 *
 * Must run in the browser. Import dynamically in server components.
 */
export async function speakApprovalRequest(
  ear: ApprovalRequest,
): Promise<'approved' | 'denied' | 'timeout'> {
  const text =
    `Approval required. Action: ${ear.action}. ` +
    `Risk level: ${ear.risk}. ` +
    `Summary: ${ear.summary}. ` +
    `Say "approved" to allow or "denied" to reject.`;

  // Speak the summary
  await speakBrowser(text);

  // Listen for the decision
  return listenForDecision();
}

function speakBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

function listenForDecision(): Promise<'approved' | 'denied' | 'timeout'> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve('timeout');
      return;
    }

    const SpeechRecognitionCtor =
      (window as Window & typeof globalThis & { webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
      (window as Window & typeof globalThis & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      resolve('timeout');
      return;
    }

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
          if (APPROVE_WORDS.some((w) => heard.includes(w))) {
            finish('approved');
            return;
          }
          if (DENY_WORDS.some((w) => heard.includes(w))) {
            finish('denied');
            return;
          }
        }
      }
    };

    recognition.onerror = () => finish('timeout');
    recognition.onend = () => {
      if (!resolved) finish('timeout');
    };

    recognition.start();
  });
}
