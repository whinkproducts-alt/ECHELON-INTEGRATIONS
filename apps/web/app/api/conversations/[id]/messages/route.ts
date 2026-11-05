export const dynamic = 'force-dynamic';
import { isLocalOnlyMode, localOnlyViolation, localModelNameForLocalOnly } from '@/lib/local-only';
import { getSafetyState, ledgerLockdownBlock, LOCKDOWN_MESSAGE } from '@/lib/safety/lockdown';
import { budgetConversation } from '@/lib/model-router/context-budget';
import { activeProfile, paidAdmission, planRoute } from '@/lib/model-router/priority';
import { orderedFromPlan, type HandoffStop, type OrderedCandidate } from '@/lib/model-router/ordered-dispatch';
import { localDefaultModel } from '@/lib/model-router/registry';
import { isModelAllowed, isModelNameShape } from '@/lib/model-policy';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { processInput, debriefTurn } from '@/lib/orchestrator';
import { runToolLoop, STANDARD_TOOLS, isExternalTool } from '@/lib/tool-loop';
import { logger, generateCorrelationId } from '@/lib/logger';
import { runTaskGate } from '@/lib/task-gate';
import { isApprovalMessage, BARE_APPROVAL_REPLY } from '@/lib/approval-handler';
import { createApproval } from '@/lib/approvals';
import { extractAndStoreMemories, recordCompletedTurn } from '@/lib/auto-memory';
import { decryptKey } from '@/lib/key-encryption';
import { recordActionSafe } from '@/lib/ledger';
import { resolveChatTools } from '@/lib/gateway-chat';
import { DispatchBlockedError } from '@/lib/model-router/admission';
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
    const requestedModel = isModelNameShape(body?.model) ? body.model : undefined;

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
    const savedUserMessage = await prisma.message.create({
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
      switchAnnouncement = orchResult.newPersona === 'MAMBA' ? 'MAMBA active.' : 'Assistant active.';
    }

    // Get conversation history for context — most recent 50, in chronological order
    const history = (await prisma.message.findMany({
      where: { conversationId, conversation: { userId: session.user.id }, createdAt: { lt: savedUserMessage.createdAt } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })).reverse();

    const unbudgetedMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: orchResult.systemPrompt },
      ...(history ?? []).map((m: any) => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      })),
      // Anchor to this request; concurrent submissions must not replace the latest user input.
      { role: 'user', content: userMessage },
    ];

    // Update conversation title from first message
    if ((history?.length ?? 0) === 0) {
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
    const defaultModel = localDefaultModel();
    let resolvedModel = requestedModel ?? userPrefs?.preferredModel ?? defaultModel;

    // R07: read the lockdown state once for this turn (fails closed). R04: when the request names no model, the
    // Founder's active priority profile decides the whole eligible order, not only the first name. A manual
    // handoff or no eligible choice is shown as a blocked result, never silently replaced by a paid or trial model.
    const safety = await getSafetyState(session.user.id);
    let modelOrder: OrderedCandidate[] | undefined;
    let handoffAfter: HandoffStop | undefined;
    if (!requestedModel) {
      const profile = await activeProfile(session.user.id).catch(() => null);
      if (profile) {
        const plan = planRoute(profile.choices, {
          lockedDown: safety.lockedDown, localOnly: isLocalOnlyMode(), dataClass: 'private', needsTools: true,
          needsStream: false, paidAdmitted: paidAdmission(),
        });
        const ordered = orderedFromPlan(plan);
        const first = plan.steps[0];
        await recordActionSafe({
          userId: session.user.id, initiator: 'user', persona: orchResult.newPersona ?? 'WHINK',
          action: 'model_route_selected', tool: 'model_priority', permissionClass: 'A', status: first?.type === 'auto' ? 'VALIDATED' : 'DENIED',
          correlationId, inputSummary: `profile=${profile.id} rev=${profile.revision} chosen=${first?.entry.id ?? 'none'} order=${ordered.candidates.map((c) => c.id).join('>') || 'none'} skipped=${plan.skipped.map((x) => `${x.id}:${x.reason}`).join(',') || 'none'}`.slice(0, 500),
        });
        if (!first || ordered.candidates.length === 0) {
          if (first?.type === 'handoff') {
            return NextResponse.json({ error: `${first.entry.label} is a manual handoff. Open it from Settings > Model priority, or choose Skip to continue with the next model.`, code: 'MODEL_ROUTE_HANDOFF', handoffUrl: first.entry.handoffUrl ?? null, skipped: plan.skipped }, { status: 409 });
          }
          return NextResponse.json({ error: 'No model in your priority list can take this request right now.', code: 'MODEL_ROUTE_BLOCKED', skipped: plan.skipped }, { status: 409 });
        }
        modelOrder = [];
        for (const candidate of ordered.candidates) {
          let key: string | undefined;
          const provider = candidate.model.startsWith('claude') ? 'anthropic'
            : candidate.model.startsWith('gpt') || candidate.model.startsWith('o1') || candidate.model.startsWith('o3') ? 'openai'
            : null;
          if (provider) {
            try {
              const storedKey = await prisma.userApiKey.findUnique({ where: { userId_provider: { userId: session.user.id, provider } } });
              if (storedKey) key = decryptKey(storedKey.encryptedKey);
            } catch { /* a missing key skips spend; it does not borrow another model's key */ }
          }
          modelOrder.push({ ...candidate, apiKey: key });
        }
        resolvedModel = modelOrder[0].model;
        handoffAfter = ordered.handoff ?? undefined;
      }
    }

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

    // A model the user asked for (or saved as a preference) is used only if it is on the operator's
    // allow-list or the user pays for it with their own key. Otherwise use the operator's default.
    // A saved priority order is already a registry choice; collapsing it here would discard second and third.
    if (!modelOrder && resolvedModel !== defaultModel && !isModelAllowed(resolvedModel, { hasOwnKey: Boolean(byokApiKey) })) {
      await recordActionSafe({
        userId: session.user.id, initiator: 'user', persona: orchResult.newPersona ?? 'WHINK',
        action: 'model_not_allowed', tool: 'model_policy', permissionClass: 'A', status: 'DENIED',
        correlationId, inputSummary: `requested model ${String(resolvedModel).slice(0, 100)} is not on the allow-list; using the default`,
      });
      resolvedModel = defaultModel;
      byokApiKey = undefined;
    }

    // Local-Only mode: model calls may only go to a model on this machine. A cloud model, a per-user
    // key or a non-loopback endpoint is replaced by the local default and the swap is ledgered.
    if (modelOrder && isLocalOnlyMode()) {
      const kept = modelOrder.filter((c) => !localOnlyViolation(c.model, { apiKey: c.apiKey }));
      if (kept.length !== modelOrder.length) {
        await recordActionSafe({
          userId: session.user.id, initiator: 'user', persona: orchResult.newPersona ?? 'WHINK',
          action: 'model_not_allowed', tool: 'model_policy', permissionClass: 'A', status: 'DENIED',
          correlationId, inputSummary: 'reason=local_only a saved cloud choice was dropped; later local choices remain',
        });
      }
      if (kept.length === 0) {
        return NextResponse.json({ error: 'No model in your priority list can take this request right now.', code: 'MODEL_ROUTE_BLOCKED' }, { status: 409 });
      }
      modelOrder = kept.map((c) => ({ ...c, apiKey: undefined }));
      resolvedModel = modelOrder[0].model;
      byokApiKey = undefined;
    } else if (localOnlyViolation(resolvedModel, { apiKey: byokApiKey })) {
      await recordActionSafe({
        userId: session.user.id, initiator: 'user', persona: orchResult.newPersona ?? 'WHINK',
        action: 'model_not_allowed', tool: 'model_policy', permissionClass: 'A', status: 'DENIED',
        correlationId, inputSummary: `reason=local_only requested model ${String(resolvedModel).slice(0, 100)} is not local; using the local model`,
      });
      resolvedModel = localModelNameForLocalOnly();
      byokApiKey = undefined;
    }

    // R07 lockdown: no cloud model and no per-user key. Use the local model; if even that would leave the machine
    // (non-loopback endpoint), refuse the turn.
    if (safety.lockedDown && modelOrder) {
      const lockEnv = { ...process.env, WHINK_LOCAL_ONLY: 'true' };
      const kept = modelOrder.filter((c) => !localOnlyViolation(c.model, { apiKey: c.apiKey }, lockEnv) && !localOnlyViolation(c.model, {}, lockEnv));
      if (kept.length !== modelOrder.length) {
        await recordActionSafe({
          userId: session.user.id, initiator: 'user', persona: orchResult.newPersona ?? 'WHINK',
          action: 'model_not_allowed', tool: 'model_policy', permissionClass: 'A', status: 'DENIED',
          correlationId, inputSummary: 'reason=lockdown a saved cloud choice was dropped',
        });
      }
      if (kept.length === 0 || kept.some((c) => localOnlyViolation(c.model, {}, lockEnv))) {
        await ledgerLockdownBlock(session.user.id, 'chat_model', correlationId);
        return NextResponse.json({ error: LOCKDOWN_MESSAGE, code: 'LOCKDOWN_ACTIVE' }, { status: 423 });
      }
      modelOrder = kept.map((c) => ({ ...c, apiKey: undefined }));
      resolvedModel = modelOrder[0].model;
      byokApiKey = undefined;
    } else if (safety.lockedDown) {
      const lockEnv = { ...process.env, WHINK_LOCAL_ONLY: 'true' };
      if (localOnlyViolation(resolvedModel, { apiKey: byokApiKey }, lockEnv)) {
        resolvedModel = localModelNameForLocalOnly(lockEnv);
        byokApiKey = undefined;
        await recordActionSafe({
          userId: session.user.id, initiator: 'user', persona: orchResult.newPersona ?? 'WHINK',
          action: 'model_not_allowed', tool: 'model_policy', permissionClass: 'A', status: 'DENIED',
          correlationId, inputSummary: 'reason=lockdown cloud model replaced by the local model',
        });
      }
      if (localOnlyViolation(resolvedModel, {}, lockEnv)) {
        await ledgerLockdownBlock(session.user.id, 'chat_model', correlationId);
        return NextResponse.json({ error: LOCKDOWN_MESSAGE, code: 'LOCKDOWN_ACTIVE' }, { status: 423 });
      }
    }

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

    const inputBudget = budgetConversation(unbudgetedMessages);
    const messages = inputBudget.messages;
    if (inputBudget.omittedMessages || inputBudget.mandatoryOverTarget) {
      await recordActionSafe({ userId: session.user.id, initiator: 'system', persona: activePersona,
        action: 'model_context_budgeted', tool: 'model_router', permissionClass: 'A', status: 'VALIDATED', correlationId,
        inputSummary: JSON.stringify({ originalChars: inputBudget.originalChars, retainedChars: inputBudget.retainedChars,
          omittedMessages: inputBudget.omittedMessages, mandatoryOverTarget: inputBudget.mandatoryOverTarget }) });
    }

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
        modelOrder,
        handoffAfter,
        correlationId,
        conversationTainted,
        initialTaint: orchResult.externalContentThisTurn === true,
      });
    } catch (err: any) {
      if (err instanceof DispatchBlockedError) {
        return NextResponse.json({ error: 'This request was not admitted.', code: err.code }, { status: 409 });
      }
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
    let externalContentThisTurn = orchResult.externalContentThisTurn === true;

    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const close = () => { if (!closed) { closed = true; controller.close(); } };
        try {
          // Send switch announcement first if present
          if (switchAnnouncement) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: switchAnnouncement + '\n\n', persona: activePersona, mambaMode: activeMambaMode })}\n\n`));
          }

          // Emit citation events for document blended items (C10)
          const docItems = (orchResult.blendedItems ?? []).filter((it: any) => it.type === 'document' && it.documentName);
          for (const item of docItems) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'citation', documentName: item.documentName, page: item.page ?? null, chunkId: item.id ?? null, score: item.score ?? null })}\n\n`));
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
          const assistantMessage = await prisma.message.create({
            data: {
              conversationId,
              role: 'assistant',
              content: fullContent,
              persona: activePersona,
              mambaMode: activeMambaMode,
              functionalMode: orchResult.functionalMode,
            },
          });

          // Completed-turn record: detached, never awaited, failures never reach the user. Follows the
          // same rules as extraction (skips tainted and external-content turns; MAMBA goes to hypotheses).
          void recordCompletedTurn({
            userId: session.user.id,
            conversationId,
            messageId: assistantMessage.id,
            userMessage,
            assistantReply: fullContent,
            persona: activePersona,
            projectId: projectId ?? conv.projectId,
            correlationId,
            externalContentThisTurn,
            conversationTainted,
            injectionBlocked: false,
          }).catch(() => { /* detached — never surface */ });

          // B1 — Auto memory extraction (detached — does not block the response).
          // Skipped when a tool wrote memory, a tool ran, or external content was read this turn.
          if (!memoryWriteCalledInLoop && !toolRanThisTurn && !externalContentThisTurn && fullContent.length > 100) {
            void extractAndStoreMemories({
              userId: session.user.id,
              conversationId,
              messageId: assistantMessage.id,
              userMessage,
              assistantReply: fullContent,
              persona: activePersona,
              correlationId,
              conversationTainted,
              injectionBlocked: false,
            }).catch(() => { /* detached — never surface */ });
          }

          // CAI auto-debrief (fire-and-forget)
          if (!conversationTainted && fullContent.length > 100) {
            void debriefTurn({
              userId: session.user.id,
              agentId: activePersona.toLowerCase(),
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
