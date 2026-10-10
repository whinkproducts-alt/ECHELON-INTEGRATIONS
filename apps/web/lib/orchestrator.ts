import { prisma } from '@/lib/db';
import { generateCorrelationId } from '@/lib/logger';
import { assembleContext, formatContextForPrompt } from '@/lib/context-engine';
import { buildSystemPrompt } from '@/prompts/build-prompt';
import { checkMetaAuthorization, logSecurityEvent } from '@/lib/permission-engine';
import { scanUserInput, scanForInjectionPatterns } from '@/lib/content-isolation';
import { normaliseMambaMode } from '@/lib/types';
import { readContext, writeDebrief } from '@/lib/agent-memory';

const PERSONA_SWITCH_PATTERNS: Array<{ regex: RegExp; persona: string; mode?: string }> = [
  { regex: /^\/?mamba\b/i, persona: 'MAMBA', mode: 'OBSIDIAN' },
  { regex: /mamba mode/i, persona: 'MAMBA', mode: 'OBSIDIAN' },
  { regex: /activate mamba/i, persona: 'MAMBA', mode: 'OBSIDIAN' },
  { regex: /switch to mamba/i, persona: 'MAMBA', mode: 'OBSIDIAN' },
  { regex: /bring mamba in/i, persona: 'MAMBA', mode: 'OBSIDIAN' },
  { regex: /let mamba look/i, persona: 'MAMBA', mode: 'OBSIDIAN' },
  { regex: /give me mamba/i, persona: 'MAMBA', mode: 'OBSIDIAN' },
  { regex: /mamba,?\s*obsidian\s*mode/i, persona: 'MAMBA', mode: 'OBSIDIAN' },
  { regex: /stand down mamba/i, persona: 'WHINK' },
  { regex: /whink mode/i, persona: 'WHINK' },
  { regex: /switch (back )?to whink/i, persona: 'WHINK' },
  { regex: /return to normal/i, persona: 'WHINK' },
  { regex: /^\/?whink\b/i, persona: 'WHINK' },
];

const FUNCTIONAL_MODE_PATTERNS: Array<{ regex: RegExp; mode: string }> = [
  { regex: /^\/?brief\b/i, mode: 'BRIEF' },
  { regex: /^\/?status\b/i, mode: 'STATUS' },
  { regex: /^\/?exec(utive)?\b/i, mode: 'EXECUTIVE' },
  { regex: /^\/?deep\b/i, mode: 'DEEP' },
  { regex: /^\/?research\b/i, mode: 'RESEARCH' },
  { regex: /^\/?plan\b/i, mode: 'PLAN' },
  { regex: /^\/?next\b/i, mode: 'STATUS' },
];

export interface OrchestratorInput {
  userId: string;
  conversationId: string;
  message: string;
  projectId?: string | null;
}

export interface OrchestratorResult {
  personaSwitched: boolean;
  newPersona?: string;
  newMambaMode?: string | null;
  functionalMode?: string | null;
  systemPrompt: string;
  metaAuthViolation: boolean;
  injectionDetected: boolean;
  /** True when the user message was blocked and must not reach the model. */
  injectionBlocked: boolean;
  /** True when the message tried to grant itself authorisation; must not reach the model. */
  metaAuthBlocked: boolean;
  injectionPatterns: string[];
}

export async function processInput(input: OrchestratorInput): Promise<OrchestratorResult> {
  const { userId, conversationId, message, projectId } = input;
  const correlationId = generateCorrelationId();

  // 1. Check for meta-authorization attempts
  const metaAuthViolation = checkMetaAuthorization(message);
  if (metaAuthViolation) {
    await logSecurityEvent(userId, 'META_AUTH_ATTEMPT', `User attempted meta-authorization: "${message.substring(0, 200)}"`, correlationId);
    // Blocked: no persona switch, no context assembly, nothing reaches the model.
    const current = await prisma.personaState.findUnique({ where: { userId } });
    const persona = current?.activePersona ?? 'WHINK';
    return {
      personaSwitched: false,
      newPersona: persona,
      newMambaMode: normaliseMambaMode(current?.mambaMode, persona),
      functionalMode: current?.functionalMode ?? null,
      systemPrompt: '',
      metaAuthViolation: true,
      injectionDetected: false,
      injectionBlocked: false,
      metaAuthBlocked: true,
      injectionPatterns: [],
    };
  }

  // 2. Check for injection patterns in user input (tighter regexes, caller decides to block)
  const injectionScan = scanUserInput(message);
  if (injectionScan.suspicious) {
    await logSecurityEvent(
      userId,
      'INJECTION_ATTEMPT',
      `Injection patterns detected (${injectionScan.patterns.join(', ')}): "${message.substring(0, 200)}"`,
      correlationId,
      'DENIED'
    );
    // Blocked: no persona switch, no context assembly, nothing reaches the model.
    const current = await prisma.personaState.findUnique({ where: { userId } });
    const persona = current?.activePersona ?? 'WHINK';
    return {
      personaSwitched: false,
      newPersona: persona,
      newMambaMode: normaliseMambaMode(current?.mambaMode, persona),
      functionalMode: current?.functionalMode ?? null,
      systemPrompt: '',
      metaAuthViolation,
      injectionDetected: true,
      injectionBlocked: true,
      metaAuthBlocked: false,
      injectionPatterns: injectionScan.patterns,
    };
  }

  // 3. Detect persona switch
  let personaSwitched = false;
  let newPersona: string | undefined;
  let newMambaMode: string | null | undefined;

  for (const pattern of PERSONA_SWITCH_PATTERNS) {
    if (pattern.regex.test(message)) {
      personaSwitched = true;
      newPersona = pattern.persona;
      newMambaMode = normaliseMambaMode(pattern.mode, pattern.persona);
      // Update persona state in DB
      await prisma.personaState.upsert({
        where: { userId },
        update: {
          activePersona: newPersona,
          mambaMode: newMambaMode,
          activationSource: 'user',
          activatedAt: new Date(),
        },
        create: {
          userId,
          activePersona: newPersona,
          mambaMode: newMambaMode,
          activationSource: 'user',
        },
      });
      break;
    }
  }

  // 4. Detect functional mode
  let functionalMode: string | null = null;
  for (const pattern of FUNCTIONAL_MODE_PATTERNS) {
    if (pattern.regex.test(message)) {
      functionalMode = pattern.mode;
      break;
    }
  }

  // 5. Get current persona state
  const personaState = await prisma.personaState.findUnique({ where: { userId } });
  const activePersona = newPersona ?? personaState?.activePersona ?? 'WHINK';
  const activeMambaMode = normaliseMambaMode(
    newMambaMode !== undefined ? newMambaMode : personaState?.mambaMode,
    activePersona,
  );
  const activeFunctionalMode = functionalMode ?? personaState?.functionalMode ?? null;

  // Update functional mode if changed
  if (functionalMode) {
    await prisma.personaState.upsert({
      where: { userId },
      update: { functionalMode },
      create: { userId, activePersona, functionalMode },
    });
  }

  // 6. Assemble context
  const context = await assembleContext(userId, conversationId, projectId, correlationId, message);
  const contextStr = formatContextForPrompt(context);

  // 6b. Read agent lessons (CAI) — scoped by accountId for tenant isolation
  const agentId = activePersona === 'MAMBA' ? 'mamba' : 'whink';
  const taskTypeDomain = activeFunctionalMode?.toLowerCase() ?? 'general';
  // TODO: when User model has an accountId field, use it here. For now, userId is the accountId.
  const userForAccount = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  const accountId = userForAccount?.id ?? userId;
  const agentLessons = await readContext(agentId, 'conversation', taskTypeDomain, 10, accountId);

  // 7. Get user profile
  const profile = await prisma.userProfile.findUnique({ where: { userId } });

  // 8. Build system prompt
  const agentContextStr = agentLessons.length > 0
    ? agentLessons
        .map((l, i) => `${i + 1}. [${l.outcome}] ${l.lesson}`)
        .join('\n')
    : undefined;

  const systemPrompt = buildSystemPrompt({
    persona: activePersona,
    mambaMode: activeMambaMode,
    functionalMode: activeFunctionalMode,
    retrievedContext: contextStr || undefined,
    userProfile: profile ? { displayName: profile.displayName, timezone: profile.timezone } : undefined,
    agentContext: agentContextStr,
  });

  return {
    personaSwitched,
    newPersona: activePersona,
    newMambaMode: activeMambaMode,
    functionalMode: activeFunctionalMode,
    systemPrompt,
    metaAuthViolation,
    injectionDetected: injectionScan.suspicious,
    injectionBlocked: false,
    metaAuthBlocked: false,
    injectionPatterns: [],
  };
}

const DEBRIEF_EXTRACTION_PROMPT = `Given this exchange, extract a structured lesson for the agent knowledge base.
Return JSON: { "domain": string, "taskType": string, "lesson": string, "outcome": "success"|"failure"|"partial" }
Domain examples: "conversation", "memory", "planning", "research", "task-management"
TaskType examples: "general", "research", "planning", "delegation", "recall"
Keep lesson under 200 chars. Return {} if nothing worth storing.

User: {userMessage}
Assistant: {assistantResponse}`;

/**
 * Fire-and-forget debrief after a completed turn.
 * Calls a small model via the model router to extract a lesson and writes it to agent_knowledge.
 * Never blocks the response — call with void and no await.
 * Skipped entirely when externalToolRan is true (tool results may have tainted the response).
 */
export function debriefTurn(params: {
  userId: string;
  agentId: string;
  userMessage: string;
  assistantResponse: string;
  accountId: string;
  externalToolRan?: boolean;
}): void {
  void (async () => {
    try {
      // Skip debrief when external tool content may have tainted the assistant response
      if (params.externalToolRan) return;

      const { chatOnce } = await import('@/lib/model-router');

      const prompt = DEBRIEF_EXTRACTION_PROMPT
        .replace('{userMessage}', params.userMessage.substring(0, 500))
        .replace('{assistantResponse}', params.assistantResponse.substring(0, 500));

      // Scan both inputs before sending to extraction
      const lessonScan = scanForInjectionPatterns(params.assistantResponse.substring(0, 500));
      if (lessonScan.suspicious) {
        await logSecurityEvent(params.userId, 'DEBRIEF_INJECTION_BLOCKED', `Debrief blocked: ${params.assistantResponse.substring(0, 200)}`, 'debrief');
        return;
      }

      const raw = await chatOnce({
        messages: [{ role: 'user', content: prompt }],
        model: process.env.EXTRACTION_MODEL ?? process.env.DEFAULT_MODEL ?? 'llama3.1:8b',
        maxTokens: 256,
        temperature: 0,
      });

      let parsed: Record<string, string>;
      try {
        parsed = JSON.parse(raw.trim());
      } catch {
        return;
      }

      const { domain, taskType, lesson, outcome } = parsed;
      if (!domain || !taskType || !lesson || !outcome) return;
      if (!['success', 'failure', 'partial'].includes(outcome)) return;
      if (lesson.length > 200) return;

      // Scan extracted lesson before persisting
      const extractedScan = scanForInjectionPatterns(lesson);
      if (extractedScan.suspicious) {
        await logSecurityEvent(params.userId, 'DEBRIEF_INJECTION_BLOCKED', `Lesson blocked: ${lesson.substring(0, 200)}`, 'debrief');
        return;
      }

      await writeDebrief({
        agentId: params.agentId,
        domain,
        taskType,
        lesson,
        outcome: outcome as 'success' | 'failure' | 'partial',
        accountId: params.accountId,
      });
    } catch {
      // Non-blocking — swallow all errors
    }
  })();
}
