/** Recall label for memory rows created from uploaded skills. Pure helper shared with context-engine. */
export const SKILL_SOURCE_TYPE = 'skill_upload';
export const SKILL_RECALL_LABEL = 'uploaded skill (untrusted reference)';

export function semanticEnvelopeSource(sourceType: string | null | undefined): string {
  return sourceType === SKILL_SOURCE_TYPE ? SKILL_RECALL_LABEL : 'memory_semantic';
}
