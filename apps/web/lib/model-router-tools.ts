/**
 * Model Router — tool-use layer.
 *
 * One provider-neutral call, `chatWithTools`, implemented for Anthropic (SDK),
 * OpenAI-compatible endpoints including Ollama (fetch, function calling) and
 * Google Gemini (fetch, functionDeclarations). Routes never import this or any
 * provider SDK directly; lib/tool-loop.ts drives it and executes every tool call
 * through executeTool -> checkPermission.
 *
 * Provider resolution mirrors lib/model-router.ts: claude* -> Anthropic,
 * gemini* -> Gemini, anything else -> OpenAI-compatible
 * (OPENAI_COMPATIBLE_BASE_URL, default local Ollama).
 */

import { logger } from '@/lib/logger';
import { localReasoningEffort, isNativeOllamaModel, nativeOllamaUrl, nativeTimeoutMs } from '@/lib/model-router';
import { assertLocalOnly, isLocalOnlyMode, redirectOpt } from '@/lib/local-only';
import { redactForLog } from '@/lib/redact-log';
import { ProviderUserError, ollamaStatusError } from '@/lib/provider-errors';
export { redactForLog };

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type NeutralMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ChatWithToolsOptions {
  messages: NeutralMessage[];
  model: string;
  tools: ToolSpec[];
  apiKey?: string;
  /** Explicit OpenAI-compatible base URL (local fallback). When set, no env or user key is sent. */
  baseUrl?: string;
  maxTokens?: number;
}

export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'other';

export interface ChatWithToolsResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  /** Token counts reported by the provider, when it reports them. */
  usage?: { tokensIn: number; tokensOut: number };
}

/** Thrown when the provider/model rejects the tools parameter. Callers fall back to plain chat. */
export class ToolsUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolsUnsupportedError';
  }
}

/**
 * Build the error for a non-OK provider response. The thrown message carries only provider + status;
 * the (redacted, truncated) body is logged server-side. Tools-unsupported is detected from the body here.
 */
function providerHttpError(provider: string, status: number, errText: string): Error {
  logger.error('model provider error', { provider, status, body: redactForLog(errText) });
  if (status === 400 && /tool|function/i.test(errText)) {
    return new ToolsUnsupportedError(`${provider} rejected tools (status ${status})`);
  }
  return new Error(`${provider} error ${status}`);
}

const FETCH_TIMEOUT_MS = 120_000;
const SAFE_TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

export function providerFor(model: string): 'anthropic' | 'gemini' | 'openai-compatible' {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gemini')) return 'gemini';
  return 'openai-compatible';
}

export async function chatWithTools(opts: ChatWithToolsOptions): Promise<ChatWithToolsResult> {
  assertLocalOnly(opts.model, { apiKey: opts.apiKey, baseUrl: opts.baseUrl });
  const provider = providerFor(opts.model);
  if (provider === 'anthropic') return anthropicWithTools(opts);
  // Providers that restrict function names: names pass through unchanged, but a name
  // that would be rejected outright is dropped (with a warning) rather than breaking the call.
  const tools = opts.tools.filter((t) => {
    if (SAFE_TOOL_NAME.test(t.name)) return true;
    logger.warn('tool name not valid for provider; not offered', { tool: t.name });
    return false;
  });
  if (provider === 'gemini') return geminiWithTools({ ...opts, tools });
  if (isNativeOllamaModel(opts.model, opts.baseUrl)) return nativeOllamaWithTools({ ...opts, tools });
  return openAICompatibleWithTools({ ...opts, tools });
}

// ── Native Ollama (/api/chat) ────────────────────────────────────────────────

let nativeCallSeq = 0;

/** Loopback-only, no Authorization header, no cloud or per-user key ever sent here. */
async function nativeOllamaWithTools(opts: ChatWithToolsOptions): Promise<ChatWithToolsResult> {
  const url = nativeOllamaUrl();
  if (!url) throw new Error('Ollama native endpoint unavailable');

  const callNames = new Map<string, string>();
  const messages = opts.messages.map((m) => {
    if (m.role === 'assistant') {
      if (m.toolCalls?.length) {
        for (const tc of m.toolCalls) callNames.set(tc.id, tc.name);
        return {
          role: 'assistant',
          content: m.content,
          tool_calls: m.toolCalls.map((tc) => ({ function: { name: tc.name, arguments: tc.input } })),
        };
      }
      return { role: 'assistant', content: m.content };
    }
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, tool_name: callNames.get(m.toolCallId) ?? m.name };
    }
    return { role: m.role, content: m.content };
  });

  const body: Record<string, unknown> = {
    model: opts.model,
    messages,
    stream: false,
    think: false,
    // Ollama's default context is 4k on < 24 GiB machines and silently drops the oldest tokens.
    options: { num_predict: opts.maxTokens ?? 4000, num_ctx: Number(process.env.WHINK_OLLAMA_NUM_CTX) || 8192 },
    keep_alive: process.env.WHINK_OLLAMA_KEEP_ALIVE || '30m',
  };
  if (opts.tools.length > 0) {
    body.tools = opts.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // A redirect would forward the request body (the whole conversation) to another host.
      redirect: 'error',
      signal: AbortSignal.timeout(nativeTimeoutMs()),
    });
  } catch (e) {
    if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') throw e; // callers see the real timeout
    throw new ProviderUserError('Ollama is not reachable. Is it running?');
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    const friendly = ollamaStatusError(response.status, errText, opts.model);
    if (friendly) { logger.error('model provider error', { provider: 'Ollama', status: response.status, body: redactForLog(errText) }); throw friendly; }
    throw providerHttpError('Ollama', response.status, errText);
  }
  const json: any = await response.json();
  const msg = json?.message ?? {};
  const toolCalls: ToolCall[] = (Array.isArray(msg.tool_calls) ? msg.tool_calls : [])
    .filter((tc: any) => tc?.function?.name)
    .map((tc: any) => ({
      // Unique across the whole run: a counter, not just the index within this reply.
      id: `call_${nativeCallSeq++}`,
      name: tc.function.name,
      input: parseArgs(tc.function.arguments),
    }));
  const stopReason: StopReason =
    toolCalls.length > 0 ? 'tool_use' : json?.done_reason === 'length' ? 'max_tokens' : 'end';
  return {
    text: typeof msg.content === 'string' ? msg.content : '',
    toolCalls,
    stopReason,
    usage: { tokensIn: Number(json?.prompt_eval_count) || 0, tokensOut: Number(json?.eval_count) || 0 },
  };
}

// ── Anthropic ────────────────────────────────────────────────────────────────

async function anthropicWithTools(opts: ChatWithToolsOptions): Promise<ChatWithToolsResult> {
  const key = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const system = opts.messages.find((m) => m.role === 'system');
  const msgs: Array<{ role: 'user' | 'assistant'; content: any }> = [];
  for (const m of opts.messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') {
      msgs.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      if (m.toolCalls?.length) {
        const blocks: any[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const tc of m.toolCalls) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        msgs.push({ role: 'assistant', content: blocks });
      } else {
        msgs.push({ role: 'assistant', content: m.content });
      }
    } else {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) last.content.push(block);
      else msgs.push({ role: 'user', content: [block] });
    }
  }

  const response: any = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4000,
    system: system?.content,
    messages: msgs,
    tools: opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as any,
    })),
  });

  const blocks: any[] = response.content ?? [];
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  const toolCalls: ToolCall[] = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
  const stopReason: StopReason =
    toolCalls.length > 0 && response.stop_reason === 'tool_use' ? 'tool_use'
    : response.stop_reason === 'max_tokens' ? 'max_tokens'
    : response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence' ? 'end'
    : toolCalls.length > 0 ? 'other' : 'end';
  return {
    text,
    toolCalls: stopReason === 'tool_use' ? toolCalls : [],
    stopReason,
    usage: { tokensIn: Number(response.usage?.input_tokens) || 0, tokensOut: Number(response.usage?.output_tokens) || 0 },
  };
}

// ── OpenAI-compatible (Ollama /v1, vLLM, OpenAI, ...) ────────────────────────

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

async function openAICompatibleWithTools(opts: ChatWithToolsOptions): Promise<ChatWithToolsResult> {
  const baseUrl = (opts.baseUrl ?? process.env.OPENAI_COMPATIBLE_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '');
  const apiKey = opts.baseUrl || isLocalOnlyMode() ? 'ollama' : (opts.apiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? 'ollama');

  const messages = opts.messages.map((m) => {
    if (m.role === 'assistant') {
      if (m.toolCalls?.length) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          })),
        };
      }
      return { role: 'assistant', content: m.content };
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    }
    return { role: m.role, content: m.content };
  });

  const body: Record<string, unknown> = {
    model: opts.model,
    messages,
    stream: false,
    max_tokens: opts.maxTokens ?? 4000,
  };
  const reasoningEffort = localReasoningEffort(baseUrl);
  if (reasoningEffort) {
    body.reasoning_effort = reasoningEffort;
    body.think = false;
  }
  if (opts.tools.length > 0) {
    body.tools = opts.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    ...redirectOpt(baseUrl),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw providerHttpError('OpenAI-compatible endpoint', response.status, errText);
  }
  const json: any = await response.json();
  const choice = json?.choices?.[0];
  const msg = choice?.message ?? {};
  const toolCalls: ToolCall[] = (msg.tool_calls ?? [])
    .filter((tc: any) => tc?.function?.name)
    .map((tc: any, i: number) => ({
      id: tc.id || `call_${i}`,
      name: tc.function.name,
      input: parseArgs(tc.function.arguments),
    }));
  const text = typeof msg.content === 'string' ? msg.content : '';
  const stopReason: StopReason =
    toolCalls.length > 0 ? 'tool_use'
    : choice?.finish_reason === 'length' ? 'max_tokens'
    : 'end';
  return {
    text,
    toolCalls,
    stopReason,
    usage: { tokensIn: Number(json?.usage?.prompt_tokens) || 0, tokensOut: Number(json?.usage?.completion_tokens) || 0 },
  };
}

// ── Google Gemini (REST) ─────────────────────────────────────────────────────

/** Gemini accepts an OpenAPI subset of JSON Schema; drop keys it rejects. */
function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (k === 'additionalProperties' || k === '$schema' || k === 'default') continue;
      out[k] = geminiSchema(v);
    }
    return out;
  }
  return schema;
}

async function geminiWithTools(opts: ChatWithToolsOptions): Promise<ChatWithToolsResult> {
  const key = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const system = opts.messages.find((m) => m.role === 'system');
  const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];
  for (const m of opts.messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content }] });
    } else if (m.role === 'assistant') {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls ?? []) parts.push({ functionCall: { name: tc.name, args: tc.input } });
      if (parts.length === 0) parts.push({ text: '' });
      contents.push({ role: 'model', parts });
    } else {
      const part = { functionResponse: { name: m.name, response: { result: m.content } } };
      const last = contents[contents.length - 1];
      if (last && last.role === 'user' && last.parts.every((p) => p.functionResponse)) last.parts.push(part);
      else contents.push({ role: 'user', parts: [part] });
    }
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: opts.maxTokens ?? 4000 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system.content }] };
  if (opts.tools.length > 0) {
    body.tools = [{
      functionDeclarations: opts.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: geminiSchema(t.inputSchema),
      })),
    }];
  }

  // Key goes in a header, never in the URL, so it cannot leak through URL logging.
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw providerHttpError('Gemini', response.status, errText);
  }
  const json: any = await response.json();
  const cand = json?.candidates?.[0];
  const parts: any[] = cand?.content?.parts ?? [];
  const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
  const toolCalls: ToolCall[] = parts
    .filter((p) => p.functionCall?.name)
    .map((p, i) => ({
      id: `gemini_call_${i}`,
      name: p.functionCall.name,
      input: parseArgs(p.functionCall.args),
    }));
  const stopReason: StopReason =
    toolCalls.length > 0 ? 'tool_use' : cand?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end';
  return {
    text,
    toolCalls,
    stopReason,
    usage: { tokensIn: Number(json?.usageMetadata?.promptTokenCount) || 0, tokensOut: Number(json?.usageMetadata?.candidatesTokenCount) || 0 },
  };
}
