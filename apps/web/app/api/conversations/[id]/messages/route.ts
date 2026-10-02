export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { processInput } from '@/lib/orchestrator';
import { runToolLoop, STANDARD_TOOLS } from '@/lib/tool-loop';
import { logger, generateCorrelationId } from '@/lib/logger';
import { runTaskGate } from '@/lib/task-gate';
import { handleApproval } from '@/lib/approval-handler';

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
    const projectId = body?.projectId ?? null;

    // Verify conversation ownership
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: session.user.id },
    });
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // Save user message
    const personaState = await prisma.personaState.findUnique({ where: { userId: session.user.id } });
    await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: userMessage,
        persona: personaState?.activePersona ?? 'WHINK',
      },
    });

    // Process through orchestrator
    const orchResult = await processInput({
      userId: session.user.id,
      conversationId,
      message: userMessage,
      projectId: projectId ?? conv.projectId,
    });

    // Block injection attempts — do not forward to model
    if (orchResult.injectionDetected) {
      const blocked = 'Message blocked: injection pattern detected. External content must be submitted through a trusted tool, not pasted directly into chat.';
      await prisma.message.create({
        data: { conversationId, role: 'assistant', content: blocked, persona: orchResult.newPersona ?? 'WHINK' },
      });
      const enc = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(ctrl) {
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'text', content: blocked, persona: orchResult.newPersona ?? 'WHINK' })}\n\n`));
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
            ctrl.close();
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } }
      );
    }

    // Handle persona switch announcement
    let switchAnnouncement = '';
    if (orchResult.personaSwitched) {
      switchAnnouncement = orchResult.newPersona === 'MAMBA' ? 'MAMBA active.' : 'WHINK active.';
    }

    // Handle meta-authorization violation
    if (orchResult.metaAuthViolation) {
      switchAnnouncement = 'Permission changes require the Settings interface. Conversational authorization is not accepted.';
    }

    // Get conversation history for context
    const history = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    const messages = [
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
    // Catches "Approved" / "Go ahead" replies and dispatches the pending EAR.
    const approvalOutcome = await handleApproval(session.user.id, userMessage, orchResult.newPersona ?? 'WHINK');
    if (approvalOutcome.dispatched) {
      const dispatchContent = approvalOutcome.dispatchMessage;

      await prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: dispatchContent,
          persona: orchResult.newPersona ?? 'WHINK',
        },
      });

      const approvalEncoder = new TextEncoder();
      const approvalStream = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(approvalEncoder.encode(`data: ${JSON.stringify({ type: 'text', content: dispatchContent, persona: orchResult.newPersona ?? 'WHINK', agentDispatched: true })}

`));
          ctrl.enqueue(approvalEncoder.encode(`data: ${JSON.stringify({ type: 'done', persona: orchResult.newPersona ?? 'WHINK' })}

`));
          ctrl.close();
        },
      });

      return new Response(approvalStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
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
      await prisma.action.create({
        data: {
          userId: session.user.id,
          initiator: 'user',
          persona: orchResult.newPersona ?? 'WHINK',
          action: 'execution_authorization_request',
          permissionClass: 'S',
          confirmationMethod: 'human_required',
          status: 'AWAITING_APPROVAL',
          validationResult: JSON.stringify(gateOutcome.ear),
          inputSummary: userMessage.substring(0, 500),
          outputSummary: earContent.substring(0, 500),
          correlationId,
        },
      });

      // Stream the EAR back
      const earEncoder = new TextEncoder();
      const earStream = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(earEncoder.encode(`data: ${JSON.stringify({ type: 'text', content: earContent, persona: orchResult.newPersona ?? 'WHINK', earIntercepted: true })}

`));
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
    const activeMambaMode = orchResult.newMambaMode ?? null;

    let routerStream: ReadableStream<Uint8Array>;
    try {
      routerStream = await runToolLoop({
        messages,
        tools: STANDARD_TOOLS,
        userId: session.user.id,
        persona: activePersona,
        mambaMode: activeMambaMode,
        correlationId,
      });
    } catch (err: any) {
      logger.error('Model router error', { correlationId, error: err?.message });
      return NextResponse.json({ error: 'LLM API failed' }, { status: 502 });
    }

    // Create streaming response
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullContent = switchAnnouncement ? switchAnnouncement + '\n\n' : '';

    const stream = new ReadableStream({
      async start(controller) {
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
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_call', tool: parsed.tool, input: parsed.input, persona: activePersona })}\n\n`));
                } else if (parsed.type === 'tool_result') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_result', tool: parsed.tool, success: parsed.success, persona: activePersona })}\n\n`));
                } else if (parsed.type === 'error') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: parsed.error ?? 'LLM error' })}\n\n`));
                }
              } catch {
                // skip unparseable lines
              }
            }
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

          // Update conversation timestamp
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
          });

          // Log action
          await prisma.action.create({
            data: {
              userId: session.user.id,
              initiator: 'user',
              persona: activePersona,
              mambaMode: activeMambaMode,
              action: 'conversation_response',
              permissionClass: 'A',
              confirmationMethod: 'auto',
              status: 'VALIDATED',
              inputSummary: userMessage.substring(0, 500),
              outputSummary: fullContent.substring(0, 500),
              correlationId,
            },
          });

        } catch (error: any) {
          logger.error('Stream error', { correlationId, error: error?.message });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Stream failed' })}\n\n`));
        } finally {
          controller.close();
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
