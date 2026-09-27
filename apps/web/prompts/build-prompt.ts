import { SYSTEM_CONSTITUTION, PROMPT_VERSION } from './system-constitution';
import { SECURITY_POLICY } from './security-policy';
import { WHINK_PERSONA } from './persona-whink';
import { MAMBA_PERSONA } from './persona-mamba';
import { MAMBA_MODES } from './mamba-modes';
import { FUNCTIONAL_MODES } from './functional-modes';

export interface PromptContext {
  persona: string;
  mambaMode?: string | null;
  functionalMode?: string | null;
  retrievedContext?: string;
  availableTools?: string;
  userProfile?: { displayName?: string | null; timezone?: string };
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const layers: string[] = [];

  // Layer 1: Constitution
  layers.push(SYSTEM_CONSTITUTION);

  // Layer 2: Security Policy
  layers.push(SECURITY_POLICY);

  // Layer 3: Active Persona
  if (ctx.persona === 'MAMBA') {
    layers.push(MAMBA_PERSONA);
  } else {
    layers.push(WHINK_PERSONA);
  }

  // Layer 4: MAMBA Mode (if active)
  if (ctx.persona === 'MAMBA' && ctx.mambaMode) {
    const modePrompt = MAMBA_MODES[ctx.mambaMode];
    if (modePrompt) layers.push(modePrompt);
  }

  // Layer 5: Functional Mode
  if (ctx.functionalMode) {
    const funcPrompt = FUNCTIONAL_MODES[ctx.functionalMode];
    if (funcPrompt) layers.push(funcPrompt);
  }

  // Layer 6: Retrieved Context
  if (ctx.retrievedContext) {
    layers.push(`RETRIEVED CONTEXT:\n${ctx.retrievedContext}`);
  }

  // Layer 7: Available Tools
  if (ctx.availableTools) {
    layers.push(`AVAILABLE TOOLS:\n${ctx.availableTools}`);
  }

  // User profile context
  if (ctx.userProfile?.displayName) {
    layers.push(`The user's name is ${ctx.userProfile.displayName}. Their timezone is ${ctx.userProfile?.timezone ?? 'UTC'}.`);
  }

  layers.push(`Prompt version: ${PROMPT_VERSION}`);

  return layers.join('\n\n---\n\n');
}
