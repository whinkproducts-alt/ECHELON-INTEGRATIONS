/**
 * Agentic tool loop — wraps the model router with tool execution, for every provider.
 *
 * On each turn:
 * 1. Call the model (via chatWithTools in the model router) with history + tool definitions.
 * 2. If the model requests tool calls, run each through executeTool (checkPermission + ledger).
 * 3. Append the (wrapped, if external) results and call the model again.
 * 4. Repeat until a text-only response (max MAX_TOOL_ITERATIONS).
 *
 * SSE events: text, tool_call, tool_result, approval_required, security, done, error.
 * If the provider rejects tools (e.g. a small local model), falls back to plain streamChat.
 */

import { executeTool } from '@/lib/tool-registry';
import { wrapUntrustedContent, stripFakeUntrustedTags, scanForInjectionPatterns, filterToolResult } from '@/lib/content-isolation';
import { recordActionSafe } from '@/lib/ledger';
import { chatWithTools, ToolsUnsupportedError, redactForLog, type NeutralMessage } from '@/lib/model-router-tools';
import { logger } from '@/lib/logger';
import { streamChat } from '@/lib/model-router';

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
export const MAX_TOOL_CALLS_PER_TURN = 8;

export async function runToolLoop(opts: ToolLoopOptions): Promise<ReadableStream<Uint8Array>> {
  const model = opts.model ?? process.env.DEFAULT_MODEL ?? 'llama3.1:8b';
  const encoder = new TextEncoder();

  // Fail fast (before streaming starts) when the Anthropic key is missing, as before.
  if (model.startsWith('claude') && !(opts.apiKey ?? process.env.ANTHROPIC_API_KEY)) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: object) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };
      const close = () => { if (!closed) { closed = true; controller.close(); } };

      try {
        const offered = new Set(opts.tools.map((t) => t.name));
        let history: NeutralMessage[] = opts.messages.map((m) => ({ role: m.role, content: m.content }) as NeutralMessage);

        // L7: at most one approval per run.
        let approvalPending = false;

        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          let response;
          try {
            response = await chatWithTools({
              messages: history,
              model,
              tools: opts.tools,
              apiKey: opts.apiKey,
              maxTokens: opts.maxTokens,
            });
          } catch (err) {
            if (err instanceof ToolsUnsupportedError && iter === 0) {
              // Nothing has been emitted yet: fall back to plain streaming, no tools.
              const plain = await streamChat({ messages: opts.messages, model, maxTokens: opts.maxTokens, apiKey: opts.apiKey });
              const reader = plain.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!closed) controller.enqueue(value);
              }
              return;
            }
            throw err;
          }

          if (response.text) send({ type: 'text', content: response.text });

          if (response.toolCalls.length === 0 || response.stopReason !== 'tool_use') {
            send({ type: 'done' });
            return;
          }

          history = [...history, { role: 'assistant', content: response.text, toolCalls: response.toolCalls }];

          for (let idx = 0; idx < response.toolCalls.length; idx++) {
            const call = response.toolCalls[idx];
            send({ type: 'tool_call', tool: call.name, input: call.input });

            // Only tools offered to the model may run; and cap calls per response.
            const refusal = !offered.has(call.name)
              ? 'tool not offered'
              : idx >= MAX_TOOL_CALLS_PER_TURN
                ? 'per-turn tool call cap'
                : null;
            if (refusal) {
              await recordActionSafe({
                userId: opts.userId,
                initiator: 'system',
                persona: opts.persona,
                mambaMode: opts.mambaMode ?? undefined,
                tool: call.name.substring(0, 100),
                action: 'tool_execution_denied',
                permissionClass: 'C',
                status: 'DENIED',
                inputSummary: JSON.stringify(call.input ?? {}).substring(0, 500),
                outputSummary: refusal,
                correlationId: opts.correlationId ?? 'unknown',
                latencyMs: 0,
              });
              send({ type: 'tool_result', tool: call.name, success: false, data: refusal });
              history = [...history, { role: 'tool', toolCallId: call.id, name: call.name, content: `[Tool error: ${refusal}]` }];
              continue;
            }

            // Every tool call goes through executeTool -> checkPermission -> ledger.
            const result = await executeTool(
              opts.userId,
              call.name,
              call.input,
              opts.persona,
              opts.mambaMode ?? undefined,
              opts.correlationId,
              { approvalAlreadyPending: approvalPending },
            );

            if (result.approvalRequired) {
              approvalPending = true;
              send({ type: 'approval_required', approval: result.approvalRequired });
              send({ type: 'tool_result', tool: call.name, success: false, data: 'awaiting approval' });
              history = [...history, {
                role: 'tool',
                toolCallId: call.id,
                name: call.name,
                content: 'Awaiting human approval. Do not retry; the user will decide.',
              }];
              continue;
            }

            send({
              type: 'tool_result',
              tool: call.name,
              success: result.success,
              data: result.data ?? result.error,
            });

            // Wrap external tool results to prevent prompt injection
            let toolContent: string;
            if (isExternal(call.name) && result.success) {
              // Correct order: strip fake tags -> normalize/filter -> scan normalized result -> wrap
              const stripped = stripFakeUntrustedTags(JSON.stringify(result.data));
              const filtered = filterToolResult(stripped);
              const scan = scanForInjectionPatterns(filtered);
              let contentForModel: string;
              if (scan.suspicious) {
                await recordActionSafe({
                  userId: opts.userId,
                  initiator: 'system',
                  action: 'tool_result_injection_withheld',
                  tool: call.name,
                  permissionClass: 'A',
                  status: 'FAILED',
                  inputSummary: call.name,
                  outputSummary: scan.patterns.join(', '),
                  correlationId: opts.correlationId ?? 'unknown',
                  latencyMs: 0,
                });
                send({ type: 'security', event: 'tool_result_withheld', tool: call.name, patterns: scan.patterns });
                contentForModel = `[content withheld: injection patterns detected in tool "${call.name}"]`;
              } else {
                contentForModel = filtered;
              }
              toolContent = wrapUntrustedContent(contentForModel, call.name, result.source ?? call.name);
            } else if (!result.success) {
              const rawErrorContent = `[Tool error: ${result.error ?? 'unknown'}]`;
              const errorContent = isExternal(call.name)
                ? filterToolResult(stripFakeUntrustedTags(rawErrorContent))
                : rawErrorContent;
              toolContent = isExternal(call.name)
                ? wrapUntrustedContent(errorContent, call.name, call.name)
                : errorContent;
            } else {
              toolContent = JSON.stringify(result.data);
            }

            history = [...history, { role: 'tool', toolCallId: call.id, name: call.name, content: toolContent }];
          }

          // The human must decide before the model acts again this turn.
          if (approvalPending) {
            send({ type: 'done' });
            return;
          }
        }

        // Hit max iterations — model is stuck in a tool loop
        send({ type: 'error', error: 'Tool loop exceeded maximum iterations' });
      } catch (err: any) {
        // Never forward provider/upstream error text to the client.
        logger.error('tool loop failed', { userId: opts.userId, error: redactForLog(String(err?.message ?? err)) });
        const status = /\b([1-5]\d\d)\b/.exec(String(err?.message ?? ''))?.[1];
        send({ type: 'error', error: status ? `Model provider error (${status})` : 'Model provider error' });
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

/**
 * Built-in scheduling tool. Class C: it only ever queues an approval. Not part of STANDARD_TOOLS:
 * lib/gateway-chat.ts offers it only when the user has an active X connection.
 */
export const SOCIAL_SCHEDULE_TOOL: ToolDefinition = {
  name: 'social_schedule_post',
  description: 'Schedule a post on X for a future time. The user must approve the exact text and time before it is saved, and the post is sent later only if the content is unchanged.',
  inputSchema: {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: ['x'] },
      text: { type: 'string', description: 'Post text, up to 280 characters' },
      send_at: { type: 'string', description: 'ISO 8601 date-time in the future, with a timezone offset' },
    },
    required: ['platform', 'text', 'send_at'],
  },
};
