/**
 * Model Router — the single gateway to all LLM providers.
 * Routes to Anthropic, Google Gemini, or any OpenAI-compatible endpoint (Ollama, etc.)
 * based on the model string. Never import a provider SDK from a route; use this instead.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChatOptions {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Per-user BYOK API key, decrypted. If provided, overrides the server env key. */
  apiKey?: string;
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
  const model = opts.model ?? process.env.DEFAULT_MODEL ?? 'llama3.1:8b';
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
  const model = opts.model ?? process.env.DEFAULT_MODEL ?? 'llama3.1:8b';
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
