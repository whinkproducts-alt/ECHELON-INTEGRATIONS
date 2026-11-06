/** Browser transport contracts; no authentication, routing, or permission shortcuts. */
export class DashboardRequestError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 ? 'Sign in again to continue.' : status === 403 ? 'Access denied.' : status === 429 ? 'Too many requests. Try again shortly.' : 'Service unavailable. Try again.');
  }
}

export async function dashboardJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (!response.ok) throw new DashboardRequestError(response.status);
  return response.json() as Promise<T>;
}

// These are the premium directory identities accepted by /api/persona/switch.
// Directory membership alone does not grant a conversation backend.
export function canConverse(persona: string | null): persona is 'WHINK' | 'MAMBA' {
  return persona === 'WHINK' || persona === 'MAMBA';
}

export const OBSIDIAN_PERSONA = 'MAMBA';
export const CONVERSATION_PERSONAS = ['WHINK', 'MAMBA', 'PETER', 'PAUL', 'MICAH', 'NANDI', 'SCOUT', 'REGISTRATION'] as const;
export type ConversationPersona = typeof CONVERSATION_PERSONAS[number];
export function isConversationPersona(value: unknown): value is ConversationPersona {
  return typeof value === 'string' && CONVERSATION_PERSONAS.some(persona => persona === value);
}

export async function readConversationEvents(
  body: ReadableStream<Uint8Array>, onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let event;
    try { event = JSON.parse(payload); } catch { return; }
    // Keep application errors outside the JSON parsing catch.
    if (event?.type === 'error') throw new Error('The response was interrupted. Check the conversation before sending again.');
    if (event && typeof event === 'object') onEvent(event);
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) consume(line.trim());
      if (done) { if (buffer.trim()) consume(buffer.trim()); break; }
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

export async function readConversationStream(body: ReadableStream<Uint8Array>, onText: (text: string, persona?: string) => void): Promise<void> {
  return readConversationEvents(body, event => {
    if (event.type === 'text' && typeof event.content === 'string') onText(event.content, typeof event.persona === 'string' ? event.persona : undefined);
  });
}
