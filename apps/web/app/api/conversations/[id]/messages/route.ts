export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { processInput } from '@/lib/orchestrator';
import { logger, generateCorrelationId } from '@/lib/logger';

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

    // Stream from LLM API
    const llmResponse = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages,
        stream: true,
        max_tokens: 4000,
        temperature: 0.7,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text().catch(() => 'Unknown error');
      logger.error('LLM API error', { correlationId, error: errText });
      return NextResponse.json({ error: 'LLM API failed' }, { status: 502 });
    }

    const activePersona = orchResult.newPersona ?? 'WHINK';
    const activeMambaMode = orchResult.newMambaMode ?? null;

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

          const reader = llmResponse.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }

          let partialRead = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            partialRead += decoder.decode(value, { stream: true });
            const lines = partialRead.split('\n');
            partialRead = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', persona: activePersona, mambaMode: activeMambaMode })}\n\n`));
                  continue;
                }
                try {
                  const parsed = JSON.parse(data);
                  const content = parsed?.choices?.[0]?.delta?.content ?? '';
                  if (content) {
                    fullContent += content;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content, persona: activePersona, mambaMode: activeMambaMode })}\n\n`));
                  }
                } catch {
                  // skip invalid JSON
                }
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
