/**
 * Hermes Client — communicates with Hermes Agent's local gateway.
 *
 * Hermes runs a local OpenAI-compatible proxy at http://localhost:3001/proxy
 * that handles provider selection, credential rotation, and cost tracking.
 */

const HERMES_GATEWAY = process.env.HERMES_GATEWAY_URL ?? 'http://localhost:3001/proxy';

export interface HermesChatOptions {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  apiKey?: string;
  baseUrl?: string;
  signal?: AbortSignal;
  hints?: {
    forceTier?: 'haiku' | 'sonnet' | 'opus';
    persona?: 'WHINK' | 'MAMBA';
    estimatedOutputTokens?: number;
    complexityScore?: number;
  };
}

export interface HermesChatResult {
  text: string;
  toolCalls?: Array<{ id: string; name: string; input: unknown }>;
  usage?: { tokensIn: number; tokensOut: number };
  stopReason?: string;
}

export interface HermesStreamOptions extends HermesChatOptions {
  stream: true;
}

/**
 * Single completion through Hermes gateway.
 */
export async function hermesChatOnce(opts: HermesChatOptions): Promise<HermesChatResult> {
  const response = await fetch(`${HERMES_GATEWAY}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model ?? 'auto',
      messages: opts.messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      tools: opts.tools,
      stream: false,
      // Pass ECHELON-specific hints as metadata
      metadata: {
        echelon: true,
        persona: opts.hints?.persona,
        forceTier: opts.hints?.forceTier,
        complexityScore: opts.hints?.complexityScore,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'Unknown error');
    throw new Error(`Hermes chat error ${response.status}: ${err}`);
  }

  const json = await response.json();
  const choice = json.choices?.[0];
  if (!choice) throw new Error('No response from Hermes');

  return {
    text: choice.message?.content ?? '',
    toolCalls: choice.message?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name,
      input: JSON.parse(tc.function?.arguments ?? '{}'),
    })),
    usage: json.usage ? { tokensIn: json.usage.prompt_tokens, tokensOut: json.usage.completion_tokens } : undefined,
    stopReason: choice.finish_reason,
  };
}

/**
 * Streaming chat through Hermes gateway.
 */
export async function hermesStreamChat(opts: HermesChatOptions): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(`${HERMES_GATEWAY}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model ?? 'auto',
      messages: opts.messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      tools: opts.tools,
      stream: true,
      metadata: {
        echelon: true,
        persona: opts.hints?.persona,
        forceTier: opts.hints?.forceTier,
        complexityScore: opts.hints?.complexityScore,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'Unknown error');
    throw new Error(`Hermes stream error ${response.status}: ${err}`);
  }

  return response.body!;
}

/**
 * Chat with tools through Hermes (non-streaming, returns parsed result).
 */
export async function hermesChat(opts: HermesChatOptions & { tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }): Promise<HermesChatResult> {
  return hermesChatOnce({ ...opts, tools: opts.tools });
}

/**
 * Generate embeddings through Hermes gateway.
 */
export async function hermesEmbed(opts: { text: string }): Promise<number[]> {
  const response = await fetch(`${HERMES_GATEWAY}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nomic-embed-text',
      input: opts.text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Hermes embed error ${response.status}`);
  }

  const json = await response.json();
  return json.data?.[0]?.embedding ?? [];
}

/**
 * Get available models from Hermes.
 */
export async function hermesModels(): Promise<Array<{ id: string; provider: string }>> {
  const response = await fetch(`${HERMES_GATEWAY}/models`);
  if (!response.ok) return [];
  const json = await response.json();
  return json.data ?? [];
}