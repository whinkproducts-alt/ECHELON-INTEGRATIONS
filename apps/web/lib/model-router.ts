/**
 * Model Router — the single gateway to all LLM providers.
 * Routes to Anthropic, Google Gemini, or any OpenAI-compatible endpoint (Ollama, etc.)
 * based on the model string. Never import a provider SDK from a route; use this instead.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Signals used by selectModel() to pick the cheapest model that can handle the task.
 * All fields are optional; omit any you don't know.
 */
export interface ModelSelectionHints {
  /** 'haiku' | 'sonnet' | 'opus' — force a tier regardless of scoring */
  forceTier?: 'haiku' | 'sonnet' | 'opus';
  /** Active persona. MAMBA adversarial work always gets Opus. */
  persona?: 'WHINK' | 'MAMBA';
  /** Expected output length in tokens. >2000 bumps the tier. */
  estimatedOutputTokens?: number;
  /**
   * Caller-supplied complexity score (0–10).
   * 0–3 → Haiku, 4–6 → Sonnet, 7–10 → Opus.
   * When omitted the router scores from message content automatically.
   */
  complexityScore?: number;
}

// Claude 5 model IDs
const MODEL_HAIKU = 'claude-haiku-5-5';
const MODEL_SONNET = 'claude-sonnet-5-5';
const MODEL_OPUS = 'claude-opus-5-5';

// Keywords that raise the complexity tier
const HIGH_COMPLEXITY_PATTERNS =
  /\b(architect|design decision|tradeoff|security|migration|strategy|analyze|evaluation|critique)\b/i;
// Apex keywords that alone justify Opus (+3 bonus)
const APEX_PATTERNS = /\b(threat model|adversar|multi-step|synthesize|root cause)\b/i;
const CODE_PATTERNS = /```|import |function |class |async |await |SELECT |UPDATE |CREATE TABLE/i;
const SIMPLE_PATTERNS =
  /^(what is|who is|when did|define |list the|how many|yes or no|summarize this in one|translate)\b/i;

/**
 * Selects the cheapest Claude 5 model that can handle the task.
 *
 * Tier mapping:
 *   Haiku 5.5  — factual Q&A, formatting, short outputs (<300 tokens), no code, no reasoning
 *   Sonnet 5.5 — standard coding, analysis, multi-turn conversation (default)
 *   Opus 5.5   — MAMBA, complex architecture, security reviews, score ≥ 7
 */
export function selectModel(messages: ChatMessage[], hints: ModelSelectionHints = {}): string {
  if (hints.forceTier === 'haiku') return MODEL_HAIKU;
  if (hints.forceTier === 'opus') return MODEL_OPUS;
  if (hints.forceTier === 'sonnet') return MODEL_SONNET;

  // MAMBA adversarial work always needs the most capable model
  if (hints.persona === 'MAMBA') return MODEL_OPUS;

  let score: number;

  if (hints.complexityScore !== undefined) {
    score = hints.complexityScore;
  } else {
    score = scoreMessages(messages);
  }

  // Large expected output bumps the score
  if ((hints.estimatedOutputTokens ?? 0) > 2000) score += 2;

  if (score <= 3) return MODEL_HAIKU;
  if (score <= 6) return MODEL_SONNET;
  return MODEL_OPUS;
}

function scoreMessages(messages: ChatMessage[]): number {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const text = lastUser?.content ?? '';
  const totalChars = messages.reduce((n, m) => n + m.content.length, 0);

  let score = 4; // default: Sonnet territory

  // Long conversation history = more context = more complex
  if (totalChars > 8000) score += 1;
  if (totalChars > 20000) score += 1;

  // Latest message signals
  if (HIGH_COMPLEXITY_PATTERNS.test(text)) score += 2;
  if (APEX_PATTERNS.test(text)) score += 3;
  if (CODE_PATTERNS.test(text)) score += 1;
  if (SIMPLE_PATTERNS.test(text)) score -= 2;
  if (text.length < 80 && !CODE_PATTERNS.test(text)) score -= 1;

  return Math.max(0, Math.min(10, score));
}

export interface StreamChatOptions {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Per-user BYOK API key, decrypted. If provided, overrides the server env key. */
  apiKey?: string;
  /**
   * When model is omitted, these hints drive automatic model selection
   * via selectModel(). If both model and hints are provided, model wins.
   */
  hints?: ModelSelectionHints;
}

/**
 * Returns a ReadableStream of SSE lines.
 * Each chunk is a line in the format:
 *   data: {"type":"text","content":"..."}
 * Followed by a final:
 *   data: {"type":"done"}
 *
 * On error the stream emits:
 *   data: {"type":"error","error":"..."}
 */
export async function streamChat(opts: StreamChatOptions): Promise<ReadableStream<Uint8Array>> {
  const model =
    opts.model ??
    (opts.hints ? selectModel(opts.messages, opts.hints) : null) ??
    process.env.DEFAULT_MODEL ??
    'llama3.1:8b';
  const maxTokens = opts.maxTokens ?? 4000;
  const temperature = opts.temperature ?? 0.7;

  if (model.startsWith('claude')) {
    return streamAnthropic(opts.messages, model, maxTokens, temperature, opts.apiKey);
  }
  if (model.startsWith('gemini')) {
    return streamGemini(opts.messages, model, maxTokens, temperature);
  }
  return streamOpenAICompatible(opts.messages, model, maxTokens, temperature, opts.apiKey);
}

/**
 * Non-streaming single completion. Returns the text response.
 * Used for background tasks like auto memory extraction.
 * Throws on error.
 */
export async function chatOnce(opts: StreamChatOptions): Promise<string> {
  const model =
    opts.model ??
    (opts.hints ? selectModel(opts.messages, opts.hints) : null) ??
    process.env.DEFAULT_MODEL ??
    'llama3.1:8b';
  const maxTokens = opts.maxTokens ?? 512;
  const temperature = opts.temperature ?? 0.0;

  if (model.startsWith('claude')) {
    return chatOnceAnthropic(opts.messages, model, maxTokens, temperature, opts.apiKey);
  }
  if (model.startsWith('gemini')) {
    return chatOnceGemini(opts.messages, model, maxTokens, temperature);
  }
  return chatOnceOpenAICompatible(opts.messages, model, maxTokens, temperature, opts.apiKey);
}

async function chatOnceAnthropic(
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
  userApiKey?: string,
): Promise<string> {
  const key = userApiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemMsg?.content,
    messages: chatMessages,
  });
  return res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
}

async function chatOnceGemini(
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genai = new GoogleGenerativeAI(key);
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');
  const history = chatMessages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const lastMessage = chatMessages[chatMessages.length - 1];
  const genModel = genai.getGenerativeModel({
    model,
    systemInstruction: systemMsg?.content,
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  });
  const chat = genModel.startChat({ history });
  const result = await chat.sendMessage(lastMessage?.content ?? '');
  return result.response.text();
}

async function chatOnceOpenAICompatible(
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
  userApiKey?: string,
): Promise<string> {
  const baseUrl =
    (process.env.OPENAI_COMPATIBLE_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '');
  const apiKey = userApiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? 'ollama';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, stream: false, max_tokens: maxTokens, temperature }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenAI-compatible endpoint error ${response.status}: ${errText}`);
  }
  const json = await response.json();
  return json?.choices?.[0]?.message?.content ?? '';
}

// ── Anthropic ────────────────────────────────────────────────────────────────

async function streamAnthropic(
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
  userApiKey?: string,
): Promise<ReadableStream<Uint8Array>> {
  const key = userApiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  // Lazy import so the SDK is never loaded in non-Anthropic paths
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  // Anthropic keeps system separate from messages
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = await client.messages.stream({
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemMsg?.content,
          messages: chatMessages,
        });

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const chunk = JSON.stringify({ type: 'text', content: event.delta.text });
            controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: err?.message ?? 'Anthropic stream failed' })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });
}

// ── Google Gemini ────────────────────────────────────────────────────────────

async function streamGemini(
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
): Promise<ReadableStream<Uint8Array>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genai = new GoogleGenerativeAI(key);

  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');

  // Map to Gemini content format
  const history = chatMessages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const lastMessage = chatMessages[chatMessages.length - 1];

  const genModel = genai.getGenerativeModel({
    model,
    systemInstruction: systemMsg?.content,
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  });

  const chat = genModel.startChat({ history });

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await chat.sendMessageStream(lastMessage?.content ?? '');

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`),
            );
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: err?.message ?? 'Gemini stream failed' })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });
}

// ── Embeddings ───────────────────────────────────────────────────────────────

/**
 * Generate an embedding vector for the given text. Routes to the provider
 * configured via EMBEDDING_MODEL (default: "ollama/nomic-embed-text").
 *
 * Priority order:
 *  1. EMBEDDINGS_URL is set → OpenAI-compatible endpoint (backward compat)
 *  2. EMBEDDING_MODEL is set → parsed as "provider/model"
 *     - "ollama/<model>" → POST OLLAMA_URL/api/embeddings
 *     - "openai/<model>" → OpenAI embeddings endpoint (requires OPENAI_API_KEY)
 *  3. OPENAI_API_KEY is set and EMBEDDINGS_URL is not → OpenAI text-embedding-3-small
 *  4. Default fallback → Ollama OpenAI-compat endpoint at localhost:11434/v1
 *
 * Returns null (never throws) when the provider is unreachable or returns an error.
 */
export async function embed(opts: { text: string }): Promise<number[] | null> {
  const embeddingsUrl = process.env.EMBEDDINGS_URL;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const embeddingModel = process.env.EMBEDDING_MODEL;

  // 1. Explicit EMBEDDINGS_URL — OpenAI-compatible
  if (embeddingsUrl) {
    const model = process.env.EMBEDDINGS_MODEL ?? 'nomic-embed-text';
    const apiKey = process.env.EMBEDDINGS_API_KEY;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch(`${embeddingsUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: opts.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.[0]?.embedding ?? null;
  }

  // 2. EMBEDDING_MODEL in "provider/model" format
  if (embeddingModel) {
    const slashIdx = embeddingModel.indexOf('/');
    const provider = slashIdx >= 0 ? embeddingModel.slice(0, slashIdx) : embeddingModel;
    const model = slashIdx >= 0 ? embeddingModel.slice(slashIdx + 1) : embeddingModel;

    if (provider === 'ollama') {
      const ollamaBase = (process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/$/, '');
      const res = await fetch(`${ollamaBase}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: opts.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return Array.isArray(json?.embedding) ? (json.embedding as number[]) : null;
    }

    if (provider === 'openai') {
      if (!openaiApiKey) return null;
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiApiKey}` },
        body: JSON.stringify({ model, input: opts.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data?.[0]?.embedding ?? null;
    }
  }

  // 3. OPENAI_API_KEY without EMBEDDINGS_URL — OpenAI text-embedding-3-small
  if (openaiApiKey) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiApiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: opts.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.[0]?.embedding ?? null;
  }

  // 4. Default: Ollama OpenAI-compatible endpoint
  const defaultModel = process.env.EMBEDDINGS_MODEL ?? 'nomic-embed-text';
  const res = await fetch('http://localhost:11434/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: defaultModel, input: opts.text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data?.[0]?.embedding ?? null;
}

// ── OpenAI-compatible (Ollama, local, etc.) ──────────────────────────────────

async function streamOpenAICompatible(
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
  userApiKey?: string,
): Promise<ReadableStream<Uint8Array>> {
  const baseUrl =
    (process.env.OPENAI_COMPATIBLE_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '');
  const apiKey = userApiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? 'ollama';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenAI-compatible endpoint error ${response.status}: ${errText}`);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
          return;
        }

        let partial = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          partial += decoder.decode(value, { stream: true });
          const lines = partial.split('\n');
          partial = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed?.choices?.[0]?.delta?.content ?? '';
              if (content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'text', content })}\n\n`),
                );
              }
            } catch {
              // skip unparseable lines
            }
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', error: err?.message ?? 'Stream failed' })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });
}
