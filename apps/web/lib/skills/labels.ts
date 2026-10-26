/** Recall label for memory rows created from uploaded skills. Pure helper shared with context-engine. */
export const SKILL_SOURCE_TYPE = 'skill_upload';
export const SKILL_RECALL_LABEL = 'uploaded skill (untrusted reference)';

export function semanticEnvelopeSource(sourceType: string | null | undefined): string {
  return sourceType === SKILL_SOURCE_TYPE ? SKILL_RECALL_LABEL : 'memory_semantic';
}

/**
 * Allow-list of memory sources whose text is trusted: written by the user, a user correction, or
 * auto extraction (which never runs on tainted turns). Anything else (skill_upload, news, swarm,
 * worker_brief, integration, null, a source added tomorrow) taints the turn that recalls it.
 */
const TRUSTED_SOURCES = new Set(['user', 'manual', 'correction', 'auto', 'conversation', 'mamba']);

export function isTrustedSource(source: string | null | undefined): boolean {
  return typeof source === 'string' && TRUSTED_SOURCES.has(source.trim().toLowerCase());
}

/** True when recalling a memory with this source must set externalContentThisTurn. */
export function isTaintingSourceType(source: string | null | undefined): boolean {
  return !isTrustedSource(source);
}
