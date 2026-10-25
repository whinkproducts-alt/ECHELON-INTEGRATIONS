export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { processInput, debriefTurn } from '@/lib/orchestrator';
import { runToolLoop, STANDARD_TOOLS, isExternalTool } from '@/lib/tool-loop';
import { logger, generateCorrelationId } from '@/lib/logger';
import { runTaskGate } from '@/lib/task-gate';
import { scanForInjectionPatterns } from '@/lib/content-isolation';
import { isApprovalMessage, BARE_APPROVAL_REPLY } from '@/lib/approval-handler';
import { createApproval } from '@/lib/approvals';
import { writeMemory } from '@/lib/memory-engine';
import { chatOnce } from '@/lib/model-router';
import { decryptKey } from '@/lib/key-encryption';
import { recordActionSafe } from '@/lib/ledger';
import { resolveChatTools } from '@/lib/gateway-chat';
import { assertOwnedProject, hasProjectId } from '@/lib/project-access';
import { normaliseMambaMode } from '@/lib/types';
import { setWorkingMemory, getWorkingMemory } from '@/lib/working-memory';

const TAINT_TTL_SECONDS = 300; // 5 minutes
function taintKey(conversationId: string) { return `__taint__:${conversationId}`; }

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const messages = await prisma.message.findMany({
    where: { conversationId: id, conversation: { userId: session.user.id } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(messages);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: conversationId } = await params;
  const correlationId = generateCorrelationId();

  try {
    const body = await req.json();
    const userMessage = body?.message ?? '';
    const rawProjectId = body?.projectId ?? null;
    const requestedModel = body?.model as string | undefined;

    // Verify conversation ownership
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: session.user.id },
    });
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    let projectId: string | null = null;
    if (hasProjectId(rawProjectId)) {
      projectId = await assertOwnedProject(session.user.id, rawProjectId);
      if (!projectId) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Process through orchestrator FIRST — before saving the user message
    const orchResult = await processInput({
      userId: session.user.id,
      conversationId,
      message: userMessage,
      projectId: projectId ?? conv.projectId,
    });

    // Block injection attempts — do not save user message, do not forward to model.
    // The orchestrator already wrote the DENIED ledger row.
    if (orchResult.injectionBlocked) {
      // M1: Persist a taint flag so the next turn in this conversation upgrades Class A/B tools to C.
      void setWorkingMemory(session.user.id, taintKey(conversationId), new Date().toISOString(), TAINT_TTL_SECONDS).catch(() => {});
      const patterns = orchResult.injectionPatterns;
      const refusal = `I didn't act on that message \u2014 it contains instruction patterns I treat as an injection attempt: ${patterns.join(', ')}.`;
      const enc = new TextEncoder();
      const blockedPersona = orchResult.newPersona ?? 'WHINK';
      return new Response(
        new ReadableStream({
          start(ctrl) {
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'text', content: refusal, persona: blockedPersona })}\n\n`));
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'security', event: 'injection_blocked', patterns })}\n\n`));
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done', persona: blockedPersona })}\n\n`));
            ctrl.close();
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } }
      );
    }

    // Block meta-authorization attempts — do not save user message
    if (orchResult.metaAuthBlocked || orchResult.metaAuthViolation) {
      const blocked = 'I won\'t treat a message as authorisation \u2014 approvals only come through the approval flow.';
      const enc = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(ctrl) {
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'text', content: blocked, persona: orchResult.newPersona ?? 'WHINK' })}\n\n`));
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'security', event: 'meta_auth_blocked' })}\n\n`));
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done', persona: orchResult.newPersona ?? 'WHINK' })}\n\n`));
            ctrl.close();
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } }
      );
    }

    // Save user message (only after passing all block checks)
    const personaState = await prisma.personaState.findUnique({ where: { userId: session.user.id } });
    await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: userMessage,
        persona: personaState?.activePersona ?? 'WHINK',
      },
    });

    // Handle persona switch announcement
    let switchAnnouncement = '';
    if (orchResult.personaSwitched) {
      switchAnnouncement = orchResult.newPersona === 'MAMBA' ? 'MAMBA active.' : 'WHINK active.';
    }

    // Get conversation history for context — most recent 50, in chronological order
    const history = (await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })).reverse();

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: orchResult.systemPrompt },
      ...(history ?? []).map((m: any) => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
    ];

    // Update conversation title from first message
    if ((history?.length ?? 0) <= 1) {
      const titleSnippet = userMessage.substring(0, 60) + (userMessage.length > 60 ? '...' : '');
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: titleSnippet },
      });
    }

    // ── Approval Handler ─────────────────────────────────────────────────────
    // A chat message never approves anything. Bare approval phrases get a pointer to the
    // approval card; approvals are decided by id through /api/approvals/[id]/decision.
    if (isApprovalMessage(userMessage)) {
      const approvalPersona = orchResult.newPersona ?? 'WHINK';
      await prisma.message.create({
        data: { conversationId, role: 'assistant', content: BARE_APPROVAL_REPLY, persona: approvalPersona },
      });
      const approvalEncoder = new TextEncoder();
      const approvalStream = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(approvalEncoder.encode(`data: ${JSON.stringify({ type: 'text', content: BARE_APPROVAL_REPLY, persona: approvalPersona })}\n\n`));
          ctrl.enqueue(approvalEncoder.encode(`data: ${JSON.stringify({ type: 'done', persona: approvalPersona })}\n\n`));
          ctrl.close();
        },
      });
      return new Response(approvalStream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
      });
    }
    // ── End Approval Handler ──────────────────────────────────────────────────

        // ── Org-Kit Task Gate ────────────────────────────────────────────────────
    // If this message is a task directive, build an Execution Authorization
    // Request and return it immediately. Execution is blocked until Victor
    // approves.
    const gateOutcome = runTaskGate(userMessage, orchResult.newPersona ?? 'WHINK');
    if (gateOutcome.intercepted) {
      const earContent = gateOutcome.formattedResponse;

      // Persist the EAR as an assistant message
      await prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: earContent,
          persona: orchResult.newPersona ?? 'WHINK',
        },
      });

      // Log the authorization request
      await recordActionSafe({
        userId: session.user.id,
        initiator: 'user',
        persona: orchResult.newPersona ?? 'WHINK',
        action: 'execution_authorization_request',
        permissionClass: 'S',
        confirmationMethod: 'human_required',
        status: 'AWAITING_APPROVAL',
        validationResult: JSON.stringify(gateOutcome.ear),
        inputSummary: userMessage,
        outputSummary: earContent,
        correlationId,
      });

      // Store the EAR as an approval request (decided by id, 30 s expiry)
      let earApproval: Awaited<ReturnType<typeof createApproval>> | null = null;
      try {
        earApproval = await createApproval({
          userId: session.user.id,
          kind: 'ear',
          params: gateOutcome.ear,
          persona: orchResult.newPersona ?? 'WHINK',
          correlationId,
          conversationId,
          permissionClass: 'C',
        });
      } catch (e) {
        logger.error('EAR approval creation failed', { correlationId, error: (e as Error)?.message });
      }

      // Stream the EAR back
      const earEncoder = new TextEncoder();
      const earStream = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(earEncoder.encode(`data: ${JSON.stringify({ type: 'text', content: earContent, persona: orchResult.newPersona ?? 'WHINK', earIntercepted: true })}

`));
          if (earApproval) {
            ctrl.enqueue(earEncoder.encode(`data: ${JSON.stringify({ type: 'approval_required', approval: earApproval })}

`));
          }
          ctrl.enqueue(earEncoder.encode(`data: ${JSON.stringify({ type: 'done', persona: orchResult.newPersona ?? 'WHINK' })}

`));
          ctrl.close();
        },
      });

      return new Response(earStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    // ── End Task Gate ────────────────────────────────────────────────────────

        // Stream from tool loop (falls back to plain streamChat for non-Anthropic)
    const activePersona = orchResult.newPersona ?? 'WHINK';
    const activeMambaMode = normaliseMambaMode(orchResult.newMambaMode, activePersona);

    // Resolve model: request body > user preference > env default
    const userPrefs = await prisma.userPreference.findUnique({ where: { userId: session.user.id } });
    const resolvedModel = requestedModel ?? userPrefs?.preferredModel ?? process.env.DEFAULT_MODEL ?? 'llama3.1:8b';

    // Load BYOK key for the resolved provider, if one is stored
    let byokApiKey: string | undefined;
    try {
      const provider = resolvedModel.startsWith('claude') ? 'anthropic'
        : resolvedModel.startsWith('gpt') || resolvedModel.startsWith('o1') || resolvedModel.startsWith('o3') ? 'openai'
        : null;
      if (provider) {
        const storedKey = await prisma.userApiKey.findUnique({
          where: { userId_provider: { userId: session.user.id, provider } },
        });
        if (storedKey) byokApiKey = decryptKey(storedKey.encryptedKey);
      }
    } catch { /* non-blocking — fall back to server key */ }

    // M1: Check if a prior injection-blocked turn left a taint flag for this conversation.
    let conversationTainted = false;
    try {
      conversationTainted = !!(await getWorkingMemory(session.user.id, taintKey(conversationId)));
    } catch { /* non-blocking */ }

    // Standard tools plus any gateway tools (cached). Gateway down means standard tools only.
    const chatTools = await resolveChatTools({
      userId: session.user.id,
      standardTools: STANDARD_TOOLS,
      persona: activePersona,
      correlationId,
    });

    let routerStream: ReadableStream<Uint8Array>;
    try {
      routerStream = await runToolLoop({
        messages,
        tools: chatTools,
        userId: session.user.id,
        persona: activePersona,
        mambaMode: activeMambaMode,
        model: resolvedModel,
        apiKey: byokApiKey,
        correlationId,
        conversationTainted,
      });
    } catch (err: any) {
      logger.error('Model router error', { correlationId, error: err?.message });
      return NextResponse.json({ error: 'LLM API failed' }, { status: 502 });
    }

    // Create streaming response
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullContent = switchAnnouncement ? switchAnnouncement + '\n\n' : '';
    let memoryWriteCalledInLoop = false;
    let toolRanThisTurn = false;
    // M3: any external read this turn (web, documents, any gateway tool incl. social DMs and feeds).
    let externalContentThisTurn = false;

    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const close = () => { if (!closed) { closed = true; controller.close(); } };
        try {
          // Send switch announcement first if present
          if (switchAnnouncement) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: switchAnnouncement + '\n\n', persona: activePersona, mambaMode: activeMambaMode })}\n\n`));
          }

          const reader = routerStream.getReader();

          let partialRead = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            partialRead += decoder.decode(value, { stream: true });
            const lines = partialRead.split('\n');
            partialRead = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'done') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', persona: activePersona, mambaMode: activeMambaMode })}\n\n`));
                } else if (parsed.type === 'text' && parsed.content) {
                  fullContent += parsed.content;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: parsed.content, persona: activePersona, mambaMode: activeMambaMode })}\n\n`));
                } else if (parsed.type === 'tool_call') {
                  if (typeof parsed.tool === 'string' && isExternalTool(parsed.tool)) externalContentThisTurn = true;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_call', tool: parsed.tool, input: parsed.input, persona: activePersona })}\n\n`));
                } else if (parsed.type === 'tool_result') {
                  if (parsed.tool === 'memory_write') memoryWriteCalledInLoop = true;
                  if (typeof parsed.tool === 'string' && isExternalTool(parsed.tool)) externalContentThisTurn = true;
                  toolRanThisTurn = true;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_result', tool: parsed.tool, success: parsed.success, persona: activePersona })}\n\n`));
                } else if (parsed.type === 'approval_required' && parsed.approval) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'approval_required', approval: parsed.approval })}\n\n`));
                } else if (parsed.type === 'security') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'security', event: parsed.event, tool: parsed.tool, patterns: parsed.patterns })}\n\n`));
                } else if (parsed.type === 'error') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: parsed.error ?? 'LLM error' })}\n\n`));
                }
              } catch {
                // skip unparseable lines
              }
            }
          }

          // M1: If external content was read this turn, persist the taint flag so the next
          // turn upgrades Class A/B tools to C, just as the injection-block path does.
          // Awaited (not fire-and-forget) so the flag is durable before the response closes.
          if (externalContentThisTurn) {
            try {
              await setWorkingMemory(session.user.id, taintKey(conversationId), Date.now().toString(), TAINT_TTL_SECONDS);
            } catch { /* non-blocking — taint write failure is not fatal */ }
          }

          // Save assistant message
          await prisma.message.create({
            data: {
              conversationId,
              role: 'assistant',
              content: fullContent,
              persona: activePersona,
              mambaMode: activeMambaMode,
              functionalMode: orchResult.functionalMode,
            },
          });

          // Auto memory extraction (detached — does not block the response)
          // Skipped when external content was read: the assistant text may restate it, and auto-saved
          // memory from an injected page or DM would be a persistence channel for the attacker.
          if (!memoryWriteCalledInLoop && !toolRanThisTurn && !externalContentThisTurn && fullContent.length > 100) {
            const autoMemoryUserId = session.user.id;
            const autoMemoryConvId = conversationId;
            const autoMemoryContent = fullContent;
            const autoMemoryUserMsg = userMessage;
            void (async () => {
              try {
                const extractModel = process.env.EXTRACTION_MODEL ?? process.env.DEFAULT_MODEL ?? 'llama3.1:8b';

                // Fetch 5 most recent semantic memories to help the model skip duplicates
                const recentMemories = await prisma.memorySemantic.findMany({
                  where: { userId: autoMemoryUserId, supersededBy: null },
                  orderBy: { createdAt: 'desc' },
                  take: 5,
                  select: { statement: true },
                });
                const recentStatements = recentMemories.map((m) => `- ${m.statement}`).join('\n');
                const dedupeHint = recentStatements
                  ? `\n\nAlready stored (skip if similar):\n${recentStatements}`
                  : '';

                const extractPrompt = `You are a Memory Extraction Agent. Extract memories into these categories:
- episodic: time-bound events with dates
- semantic: timeless facts about Victor or his work
- procedural: how-tos, preferences, standing instructions
Return JSON array: [{ "type": "episodic"|"semantic"|"procedural", "statement": string, "confidence": number }]. Rules: one fact per memory, atomic, from Victor's perspective, normalize relative dates to absolute, return [] if nothing worth storing.${dedupeHint}

User: ${autoMemoryUserMsg}
Assistant: ${autoMemoryContent}`;

                const result = await chatOnce({
                  messages: [{ role: 'user', content: extractPrompt }],
                  model: extractModel,
                  maxTokens: 512,
                  temperature: 0,
                });
                let items: Array<{ type: string; statement: string; confidence?: number }> = [];
                try {
                  const trimmed = result.trim().replace(/^```json\n?|```$/g, '').trim();
                  items = JSON.parse(trimmed);
                } catch { /* ignore parse error */ }
                if (!Array.isArray(items)) return;
                for (const item of items.slice(0, 3)) {
                  if (!item || typeof item.statement !== 'string' || item.statement.length < 5) continue;
                  // Scan each extracted fact before persisting
                  const factScan = scanForInjectionPatterns(item.statement);
                  if (factScan.suspicious) continue;
                  const memType = ['episodic', 'procedural'].includes(item.type) ? item.type as 'episodic' | 'procedural' : 'semantic';
                  await writeMemory({
                    userId: autoMemoryUserId,
                    type: memType,
                    statement: item.statement,
                    source: 'conversation',
                    sourceId: autoMemoryConvId,
                    confidence: typeof item.confidence === 'number' ? Math.min(Math.max(item.confidence, 0), 1) : 0.75,
                    epistemicStatus: 'INFERRED',
                  });
                }
              } catch { /* non-blocking — never surface */ }
            })();
          }

          // CAI auto-debrief (fire-and-forget)
          if (fullContent.length > 100) {
            void debriefTurn({
              userId: session.user.id,
              agentId: activePersona === 'MAMBA' ? 'mamba' : 'whink',
              userMessage,
              assistantResponse: fullContent,
              accountId: session.user.id,
              externalToolRan: toolRanThisTurn || externalContentThisTurn,
            });
          }

          // Update conversation timestamp
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
          });

          // Log action
          await recordActionSafe({
            userId: session.user.id,
            initiator: 'user',
            persona: activePersona,
            mambaMode: activeMambaMode,
            action: 'conversation_response',
            permissionClass: 'A',
            confirmationMethod: 'auto',
            status: 'VALIDATED',
            inputSummary: userMessage,
            // Never put text that may restate DMs or feed content into the ledger.
            outputSummary: externalContentThisTurn
              ? `[response withheld from ledger: external content was read this turn; ${fullContent.length} chars]`
              : fullContent,
            correlationId,
          });

        } catch (error: any) {
          logger.error('Stream error', { correlationId, error: error?.message });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Stream failed' })}\n\n`));
        } finally {
          close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    logger.error('Conversation error', { correlationId, error: error?.message });
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}
