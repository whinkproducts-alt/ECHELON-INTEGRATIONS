import { prisma } from '@/lib/db';
import { logger, generateCorrelationId } from '@/lib/logger';
import { assembleContext, formatContextForPrompt } from '@/lib/context-engine';
import { buildSystemPrompt } from '@/prompts/build-prompt';
import { checkMetaAuthorization, logSecurityEvent } from '@/lib/permission-engine';
import { scanForInjectionPatterns } from '@/lib/content-isolation';

const PERSONA_SWITCH_PATTERNS: Array<{ regex: RegExp; persona: string; mode?: string }> = [
  { regex: /^\/?mamba\b/i, persona: 'MAMBA', mode: 'WHITE' },
  { regex: /mamba mode/i, persona: 'MAMBA', mode: 'WHITE' },
  { regex: /activate mamba/i, persona: 'MAMBA', mode: 'WHITE' },
  { regex: /switch to mamba/i, persona: 'MAMBA', mode: 'WHITE' },
  { regex: /bring mamba in/i, persona: 'MAMBA', mode: 'WHITE' },
  { regex: /let mamba look/i, persona: 'MAMBA', mode: 'WHITE' },
  { regex: /give me mamba/i, persona: 'MAMBA', mode: 'WHITE' },
  { regex: /mamba,?\s*white\s*mode/i, persona: 'MAMBA', mode: 'WHITE' },
  { regex: /mamba,?\s*grey\s*mode/i, persona: 'MAMBA', mode: 'GREY' },
  { regex: /mamba,?\s*gray\s*mode/i, persona: 'MAMBA', mode: 'GREY' },
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
}

export async function processInput(input: OrchestratorInput): Promise<OrchestratorResult> {
  const { userId, conversationId, message, projectId } = input;
  const correlationId = generateCorrelationId();

  // 1. Check for meta-authorization attempts
  const metaAuthViolation = checkMetaAuthorization(message);
  if (metaAuthViolation) {
    await logSecurityEvent(userId, 'META_AUTH_ATTEMPT', `User attempted meta-authorization: "${message.substring(0, 200)}"`, correlationId);
  }

  // 2. Check for injection patterns
  const injectionScan = scanForInjectionPatterns(message);

  // 3. Detect persona switch
  let personaSwitched = false;
  let newPersona: string | undefined;
  let newMambaMode: string | null | undefined;

  for (const pattern of PERSONA_SWITCH_PATTERNS) {
    if (pattern.regex.test(message)) {
      personaSwitched = true;
      newPersona = pattern.persona;
      newMambaMode = pattern.mode ?? null;
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
  const activeMambaMode = newMambaMode !== undefined ? newMambaMode : (personaState?.mambaMode ?? null);
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
  const context = await assembleContext(userId, conversationId, projectId, correlationId);
  const contextStr = formatContextForPrompt(context);

  // 7. Get user profile
  const profile = await prisma.userProfile.findUnique({ where: { userId } });

  // 8. Build system prompt
  const systemPrompt = buildSystemPrompt({
    persona: activePersona,
    mambaMode: activeMambaMode,
    functionalMode: activeFunctionalMode,
    retrievedContext: contextStr || undefined,
    userProfile: profile ? { displayName: profile.displayName, timezone: profile.timezone } : undefined,
  });

  return {
    personaSwitched,
    newPersona: activePersona,
    newMambaMode: activeMambaMode,
    functionalMode: activeFunctionalMode,
    systemPrompt,
    metaAuthViolation,
    injectionDetected: injectionScan.suspicious,
  };
}
