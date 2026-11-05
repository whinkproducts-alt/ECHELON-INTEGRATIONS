/**
 * Hermes Model Adapter — routes all ECHELON model calls through Hermes Agent.
 *
 * This replaces direct provider SDK calls (Anthropic, Google, OpenAI) with Hermes's
 * provider-agnostic routing. All model calls go through Hermes's gateway, which
 * handles provider selection, credential rotation, cost tracking, and fallback.
 */

import { hermesChat, hermesChatOnce, hermesStreamChat, hermesEmbed } from './hermes-client';

export interface HermesModelOptions {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
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
  usage?: { tokensIn: number; tokensOut: number };
}

/**
 * Stream chat through Hermes. Returns SSE stream.
 */
export async function streamChat(opts: HermesModelOptions): Promise<ReadableStream<Uint8Array>> {
  return hermesStreamChat({
    messages: opts.messages,
    model: opts.model,
    maxTokens: opts.maxTokens ?? 4000,
    temperature: opts.temperature ?? 0.7,
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    signal: opts.signal,
    hints: opts.hints,
  });
}

/**
 * Single completion through Hermes.
 */
export async function chatOnce(opts: HermesModelOptions): Promise<string> {
  const result = await hermesChatOnce({
    messages: opts.messages,
    model: opts.model,
    maxTokens: opts.maxTokens ?? 512,
    temperature: opts.temperature ?? 0.0,
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    signal: opts.signal,
    hints: opts.hints,
  });
  return result.text;
}

/**
 * Chat with tools through Hermes.
 */
export async function chatWithTools(opts: {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model: string;
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
}): Promise<{ text: string; toolCalls?: Array<{ id: string; name: string; input: unknown }>; usage?: { tokensIn: number; tokensOut: number }; stopReason?: string }> {
  return hermesChat({
    messages: opts.messages,
    model: opts.model,
    tools: opts.tools,
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    maxTokens: opts.maxTokens,
  });
}

/**
 * Generate embeddings through Hermes.
 */
export async function embed(opts: { text: string }): Promise<number[]> {
  return hermesEmbed({ text: opts.text });
}

/**
 * Verify a local analysis model through Hermes's local provider check.
 */
export async function verifyLocalAnalysisModel(model: string, baseUrl: string): Promise<boolean> {
  // Hermes handles local model verification internally
  try {
    const result = await hermesChatOnce({
      messages: [{ role: 'user', content: 'test' }],
      model,
      maxTokens: 1,
      temperature: 0,
      baseUrl,
    });
    return result.text.length > 0;
  } catch {
    return false;
  }
}