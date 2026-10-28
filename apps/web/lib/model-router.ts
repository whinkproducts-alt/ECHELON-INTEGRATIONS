/**
 * Model Router — the single gateway to all LLM providers.
 * Routes to Anthropic, Google Gemini, or any OpenAI-compatible endpoint (Ollama, etc.)
 * based on the model string. Never import a provider SDK from a route; use this instead.
 */

import { assertLocalOnly, isLocalOnlyMode, isLoopbackUrl, redirectOpt } from '@/lib/local-only';
import { redactForLog } from '@/lib/redact-log';
import { ollamaStatusError } from '@/lib/provider-errors';
import { logger } from '@/lib/logger';

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
   * Explicit OpenAI-compatible base URL, used by the local fallback to target Ollama. When set,
   * no env or per-user key is sent (a placeholder is used), so a cloud key can never reach it.
   */
  baseUrl?: string;
  /**
   * When model is omitted, these hints drive automatic model selection
   * via selectModel(). If both model and hints are provided, model wins.
   */
  hints?: ModelSelectionHints;
}

/**
 * Ollama's OpenAI-compatible /v1 endpoint uses reasoning_effort to control
 * Qwen thinking. The native /api/chat endpoint accepts think:false, but the
 * OpenAI-compatible endpoint ignores that field on current Ollama releases.
 * Keep this policy local-only so cloud OpenAI-compatible providers are never
 * sent an Ollama-specific option.
 */
export function localReasoningEffort(baseUrl: string): 'none' | undefined {
  return isLocalUrl(baseUrl) ? 'none' : undefined;
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
    'wink-qwen3.5-9b-8k';
  const maxTokens = opts.maxTokens ?? 4000;
  const temperature = opts.temperature ?? 0.7;
  assertLocalOnly(model, { apiKey: opts.apiKey, baseUrl: opts.baseUrl });

  if (model.startsWith('claude')) {
    return streamAnthropic(opts.messages, model, maxTokens, temperature, opts.apiKey);
  }
  if (model.startsWith('gemini')) {
    return streamGemini(opts.messages, model, maxTokens, temperature);
  }
  return streamOpenAICompatible(opts.messages, model, maxTokens, temperature, opts.apiKey, opts.baseUrl);
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
  assertLocalOnly(model, { apiKey: opts.apiKey, baseUrl: opts.baseUrl });

  if (model.startsWith('claude')) {
    return chatOnceAnthropic(opts.messages, model, maxTokens, temperature, opts.apiKey);
  }
  if (model.startsWith('gemini')) {
    return chatOnceGemini(opts.messages, model, maxTokens, temperature);
  }
  if (isNativeOllamaModel(model, opts.baseUrl)) {
    return chatOnceNativeOllama(opts.messages, model, maxTokens, temperature);
  }
  return chatOnceOpenAICompatible(opts.messages, model, maxTokens, temperature, opts.apiKey, opts.baseUrl);
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
  explicitBaseUrl?: string,
): Promise<string> {
  const baseUrl = (explicitBaseUrl ?? process.env.OPENAI_COMPATIBLE_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '');
  const apiKey = explicitBaseUrl || isLocalOnlyMode() ? 'ollama' : (userApiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? 'ollama');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    ...redirectOpt(baseUrl),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      max_tokens: maxTokens,
      temperature,
      ...(localReasoningEffort(baseUrl) ? { reasoning_effort: localReasoningEffort(baseUrl), think: false } : {}),
    }),
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
 *  3. Nothing configured → returns null (no silent paid-cloud fallback)
 *
 * Returns null (never throws) when unconfigured, unreachable, or the vector fails
 * dimension/finiteness validation.
 */
export async function embed(opts: { text: string }): Promise<number[] | null> {
  // Local-Only: embeddings may only go to a loopback endpoint (never EMBEDDINGS_URL off-machine, never OpenAI).
  // embed() never throws by contract, so a violation is logged and answered with null.
  if (isLocalOnlyMode()) {
    const target = process.env.EMBEDDINGS_URL ? process.env.EMBEDDINGS_URL
      : (process.env.EMBEDDING_MODEL ?? '').startsWith('ollama/') ? (process.env.OLLAMA_URL ?? 'http://localhost:11434') : null;
    if (!target || !isLoopbackUrl(target)) {
      logger.warn('embed refused: Local-Only mode allows only a loopback embeddings endpoint');
      return null;
    }
  }
  const embeddingsUrl = process.env.EMBEDDINGS_URL;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const embeddingModel = process.env.EMBEDDING_MODEL;

  // 1. Explicit EMBEDDINGS_URL — OpenAI-compatible
  if (embeddingsUrl) {
    const model = process.env.EMBEDDINGS_MODEL ?? 'nomic-embed-text';
    const apiKey = process.env.EMBEDDINGS_API_KEY;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    try {
      const res = await fetch(`${embeddingsUrl.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, input: opts.text }),
        ...redirectOpt(embeddingsUrl),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return validateEmbedding(json?.data?.[0]?.embedding);
    } catch {
      return null;
    }
  }

  // 2. EMBEDDING_MODEL in "provider/model" format
  if (embeddingModel) {
    const slashIdx = embeddingModel.indexOf('/');
    const provider = slashIdx >= 0 ? embeddingModel.slice(0, slashIdx) : embeddingModel;
    const model = slashIdx >= 0 ? embeddingModel.slice(slashIdx + 1) : embeddingModel;

    if (provider === 'ollama') {
      const ollamaBase = (process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/$/, '');
      try {
        const res = await fetch(`${ollamaBase}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: opts.text }),
          ...redirectOpt(ollamaBase),
        signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return validateEmbedding(json?.embedding);
      } catch {
        return null;
      }
    }

    if (provider === 'openai') {
      if (!openaiApiKey) return null;
      try {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiApiKey}` },
          body: JSON.stringify({ model, input: opts.text }),
        signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return validateEmbedding(json?.data?.[0]?.embedding);
      } catch {
        return null;
      }
    }
  }

  // Nothing configured — no silent paid-cloud fallback (H5 fix).
  return null;
}

// ── Embed result validation (H5 fix) ─────────────────────────────────────────

const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM ?? '768', 10);

function validateEmbedding(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length !== EMBEDDING_DIM) {
    // eslint-disable-next-line no-console
    console.warn(`[embed] dimension mismatch: got ${raw.length}, expected ${EMBEDDING_DIM}`);
    return null;
  }
  for (const v of raw) {
    if (!Number.isFinite(v)) {
      // eslint-disable-next-line no-console
      console.warn('[embed] non-finite value in embedding vector');
      return null;
    }
  }
  return raw as number[];
}

// ── OpenAI-compatible (Ollama, local, etc.) ──────────────────────────────────

async function streamOpenAICompatible(
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
  userApiKey?: string,
  explicitBaseUrl?: string,
): Promise<ReadableStream<Uint8Array>> {
  const baseUrl = (explicitBaseUrl ?? process.env.OPENAI_COMPATIBLE_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '');
  const apiKey = explicitBaseUrl || isLocalOnlyMode() ? 'ollama' : (userApiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? 'ollama');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    ...redirectOpt(baseUrl),
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
      ...(localReasoningEffort(baseUrl) ? { reasoning_effort: localReasoningEffort(baseUrl), think: false } : {}),
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

// ── Probe targets (used by lib/offline.ts) ───────────────────────────────────

/**
 * Base URL a connectivity probe should hit for a model's provider. Read from the same
 * env the router uses to call the provider, so nothing is hardcoded outside this file.
 */
export function providerProbeUrl(model: string): string {
  if (model.startsWith('claude')) return (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, '');
  if (model.startsWith('gemini')) return (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  return (process.env.OPENAI_COMPATIBLE_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '');
}

/** Loopback, private-range and *.local / docker host names count as local. Anything else is remote. */
export function isLocalUrl(raw: string): boolean {
  let host: string;
  try { host = new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (host === 'localhost' || host === '::1' || host === 'host.docker.internal' || host.endsWith('.local')) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function openAiCompatibleBase(): string {
  return (process.env.OPENAI_COMPATIBLE_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '');
}

/** Cloud providers this deployment has credentials for, as a representative model name each. */
export function configuredCloudModels(): string[] {
  const out: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) out.push('claude');
  if (process.env.GEMINI_API_KEY) out.push('gemini');
  // An OpenAI-style endpoint on a remote host is a cloud provider too.
  if (!isLocalUrl(openAiCompatibleBase())) out.push('openai-compatible');
  return out;
}

/** The Ollama base URL (no path). */
export function ollamaBaseUrl(): string {
  return (process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/$/, '');
}

/** Exact loopback host check on a parsed hostname. No prefix or suffix matching. */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/**
 * Native Ollama /api/chat endpoint, or null when the Ollama target is not loopback.
 * Native transport never leaves the machine, so no credential is ever sent to it.
 */
export function nativeOllamaUrl(): string | null {
  let u: URL;
  try { u = new URL(ollamaBaseUrl()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!isLoopbackHost(u.hostname)) return null;
  return ollamaBaseUrl() + '/api/chat';
}

/**
 * True when the model should use Ollama's native /api/chat: its name starts with one of the
 * WHINK_OLLAMA_NATIVE_MODELS prefixes (default 'gemma', empty string disables), it is not a
 * claude* or gemini* model, and OLLAMA_URL is loopback.
 */
export function isNativeOllamaModel(model: string, baseUrl?: string): boolean {
  const lower = model.toLowerCase();
  if (lower.startsWith('claude') || lower.startsWith('gemini')) return false;
  const raw = process.env.WHINK_OLLAMA_NATIVE_MODELS ?? 'gemma';
  const prefixes = raw.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (!prefixes.some((p) => lower.startsWith(p))) return false;
  if (nativeOllamaUrl() === null) return false;
  // Native only when the effective target IS the loopback Ollama: an explicit base URL, or a configured
  // OPENAI_COMPATIBLE_BASE_URL, that points anywhere else wins and is never silently ignored.
  const effective = baseUrl ?? process.env.OPENAI_COMPATIBLE_BASE_URL;
  if (effective) {
    try { return new URL(effective).origin === new URL(ollamaBaseUrl()).origin; } catch { return false; }
  }
  return true;
}

/** Native Ollama request timeout. WHINK_OLLAMA_TIMEOUT_MS overrides the 120 s default (a cold 9B model can be slow). */
export function nativeTimeoutMs(): number {
  const n = Number(process.env.WHINK_OLLAMA_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 10 ? Math.floor(n) : 120_000;
}

async function chatOnceNativeOllama(
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const url = nativeOllamaUrl();
  if (!url) throw new Error('Ollama native endpoint unavailable');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      think: false,
      options: { num_predict: maxTokens, temperature, num_ctx: Number(process.env.WHINK_OLLAMA_NUM_CTX) || 8192 },
      keep_alive: process.env.WHINK_OLLAMA_KEEP_ALIVE || '30m',
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(nativeTimeoutMs()),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    logger.error('model provider error', { provider: 'ollama-native', status: response.status, body: redactForLog(errText) });
    throw ollamaStatusError(response.status, errText, model) ?? new Error(`Ollama native endpoint error ${response.status}`);
  }
  const json = await response.json();
  return typeof json?.message?.content === 'string' ? json.message.content : '';
}

export function ollamaProbeUrl(): string {
  return ollamaBaseUrl() + '/api/tags';
}

/**
 * True for models served from a remote provider: claude*, gemini*, and any other model name
 * while OPENAI_COMPATIBLE_BASE_URL points off-machine. Only a local base URL makes the
 * OpenAI-style path local.
 */
export function isCloudModel(model: string): boolean {
  if (model.startsWith('claude') || model.startsWith('gemini')) return true;
  return !isLocalUrl(openAiCompatibleBase());
}
