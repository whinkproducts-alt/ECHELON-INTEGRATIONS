/**
 * Agentic tool loop — wraps the model router with tool execution.
 *
 * On each turn:
 * 1. Call the model with the current message history + tool definitions.
 * 2. If the model returns a tool_use block, execute the tool via tool-registry.
 * 3. Append the tool result to history and call the model again.
 * 4. Repeat until the model returns a text-only response (max 5 iterations).
 * 5. Stream the final text response back to the caller.
 *
 * Only wired for Anthropic today. Gemini and OpenAI-compatible paths fall back
 * to streamChat (no tools) until those SDKs are extended.
 */

import { executeTool } from '@/lib/tool-registry';
import { wrapUntrustedContent, stripFakeUntrustedTags, scanForInjectionPatterns, filterToolResult } from '@/lib/content-isolation';
import { prisma } from '@/lib/db';

const EXTERNAL_TOOLS = new Set(['web_fetch', 'web_search', 'document_search']);
const isExternal = (name: string) => EXTERNAL_TOOLS.has(name) || name.startsWith('openclaw__');

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolLoopOptions {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  tools: ToolDefinition[];
  userId: string;
  persona?: string;
  mambaMode?: string | null;
  model?: string;
  maxTokens?: number;
  correlationId?: string;
  /** Decrypted BYOK API key. Passed to the model router to override the server env key. */
  apiKey?: string;
}

const MAX_TOOL_ITERATIONS = 5;

export async function runToolLoop(opts: ToolLoopOptions): Promise<ReadableStream<Uint8Array>> {
  const model = opts.model ?? process.env.DEFAULT_MODEL ?? 'llama3.1:8b';

  // Non-Anthropic providers: fall back to plain streaming (no tool use yet)
  if (!model.startsWith('claude')) {
    const { streamChat } = await import('@/lib/model-router');
    return streamChat({ messages: opts.messages, model, maxTokens: opts.maxTokens, apiKey: opts.apiKey });
  }

  return runAnthropicToolLoop(opts, model);
}

async function runAnthropicToolLoop(
  opts: ToolLoopOptions,
  model: string,
): Promise<ReadableStream<Uint8Array>> {
  const key = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });
  const encoder = new TextEncoder();

  const systemMsg = opts.messages.find((m) => m.role === 'system');
  const chatMessages: Anthropic.MessageParam[] = opts.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const anthropicTools: Anthropic.Tool[] = opts.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  }));

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      const close = () => { if (!closed) { closed = true; controller.close(); } };

      try {
        let history = [...chatMessages];

        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          const response = await client.messages.create({
            model,
            max_tokens: opts.maxTokens ?? 4000,
            system: systemMsg?.content,
            messages: history,
            tools: anthropicTools,
          });

          // Collect text and tool_use blocks
          const textBlocks = response.content.filter((b) => b.type === 'text');
          const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

          // Stream any text the model produced this turn
          for (const block of textBlocks) {
            if (block.type === 'text' && block.text) {
              send({ type: 'text', content: block.text });
            }
          }

          // If no tool calls, we're done
          if (toolUseBlocks.length === 0 || response.stop_reason !== 'tool_use') {
            send({ type: 'done' });
            close();
            return;
          }

          // Execute each tool call
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of toolUseBlocks) {
            if (block.type !== 'tool_use') continue;
            send({ type: 'tool_call', tool: block.name, input: block.input });

            const result = await executeTool(
              opts.userId,
              block.name,
              block.input,
              opts.persona,
              opts.mambaMode ?? undefined,
              opts.correlationId,
            );

            send({
              type: 'tool_result',
              tool: block.name,
              success: result.success,
              data: result.data ?? result.error,
            });

            // Wrap external tool results to prevent prompt injection
            let toolContent: string;
            if (isExternal(block.name) && result.success) {
              // Correct order: strip fake tags → normalize/filter → scan normalized result → wrap
              const stripped = stripFakeUntrustedTags(JSON.stringify(result.data));
              const filtered = filterToolResult(stripped);
              const scan = scanForInjectionPatterns(filtered);
              let contentForModel: string;
              if (scan.suspicious) {
                void prisma.action.create({
                  data: {
                    userId: opts.userId,
                    initiator: 'system',
                    action: 'tool_result_injection_withheld',
                    tool: block.name,
                    permissionClass: 'A',
                    status: 'FAILED',
                    inputSummary: block.name,
                    outputSummary: scan.patterns.join(', '),
                    correlationId: opts.correlationId ?? 'unknown',
                    latencyMs: 0,
                  },
                }).catch((e: unknown) => console.error('ledger write failed', { error: (e as Error)?.message }));
                contentForModel = `[content withheld: injection patterns detected in tool "${block.name}"]`;
              } else {
                contentForModel = filtered;
              }
              toolContent = wrapUntrustedContent(contentForModel, block.name, result.source ?? block.name);
            } else if (!result.success) {
              const rawErrorContent = `[Tool error: ${result.error ?? 'unknown'}]`;
              const errorContent = isExternal(block.name)
                ? filterToolResult(stripFakeUntrustedTags(rawErrorContent))
                : rawErrorContent;
              toolContent = isExternal(block.name)
                ? wrapUntrustedContent(errorContent, block.name, block.name)
                : errorContent;
            } else {
              toolContent = JSON.stringify(result.data);
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: toolContent,
            });
          }

          // Append assistant turn + tool results to history
          history = [
            ...history,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ];
        }

        // Hit max iterations — model is stuck in a tool loop
        send({ type: 'error', error: 'Tool loop exceeded maximum iterations' });
      } catch (err: any) {
        send({ type: 'error', error: err?.message ?? 'Tool loop failed' });
      } finally {
        close();
      }
    },
  });
}

/**
 * Standard tool definitions available to the model in every conversation.
 * Class A tools (memory read/write, entity operations) are always offered.
 * Class B/C tools are offered only when autonomy level supports them.
 */
export const STANDARD_TOOLS: ToolDefinition[] = [
  {
    name: 'memory_read',
    description: 'Search WHINK memory for relevant facts, episodes, or hypotheses.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        projectId: { type: 'string', description: 'Optional project scope' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_write',
    description: 'Write a new memory: a semantic fact, episodic event, procedural rule, or hypothesis.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['semantic', 'episodic', 'procedural', 'hypothesis'] },
        statement: { type: 'string', description: 'The memory content' },
        source: { type: 'string', description: 'Where this came from (e.g. conversation, user)' },
        confidence: { type: 'number', description: 'Confidence 0–1 (hypothesis max 0.4)' },
        projectId: { type: 'string' },
      },
      required: ['type', 'statement', 'source'],
    },
  },
  {
    name: 'memory_correct',
    description: 'Correct an existing memory by superseding the old statement with a new one.',
    inputSchema: {
      type: 'object',
      properties: {
        oldStatement: { type: 'string' },
        newStatement: { type: 'string' },
        projectId: { type: 'string' },
      },
      required: ['oldStatement', 'newStatement'],
    },
  },
  {
    name: 'entity_create',
    description: 'Create a new entity (person, company, project, concept) in the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['PERSON', 'COMPANY', 'PROJECT', 'CONCEPT', 'PLACE', 'EVENT'] },
        aliases: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number' },
        metadata: { type: 'object' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'task_create',
    description: 'Create a task in a project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        dueDate: { type: 'string', description: 'ISO 8601 date string' },
      },
      required: ['projectId', 'title'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information, news, or facts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: 'Number of results (max 10, default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch the content of a URL and return its text or JSON. Use after web_search to read a specific page.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL starting with http or https' },
      },
      required: ['url'],
    },
  },
  {
    name: 'calendar_list',
    description: "List Victor's upcoming calendar events.",
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'How many days ahead to look (default 7, max 30)' },
      },
    },
  },
  {
    name: 'calendar_create',
    description: "Create a calendar event for Victor.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        startAt: { type: 'string', description: 'ISO 8601 datetime' },
        endAt: { type: 'string', description: 'ISO 8601 datetime' },
        description: { type: 'string' },
        location: { type: 'string' },
        allDay: { type: 'boolean' },
      },
      required: ['title', 'startAt'],
    },
  },
  {
    name: 'document_search',
    description: "Search Victor's document library for relevant information, research, or reference material.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for' },
        workspace: { type: 'string', description: 'Optional workspace slug to scope the search' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'note_write',
    description: "Save a note or capture an idea for Victor.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['content'],
    },
  },
];
