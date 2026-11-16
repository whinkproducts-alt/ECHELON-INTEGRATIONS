/**
 * Item 42 decision: Marcus tasks carry NO attached documents or memory. The approved content hash covers only
 * title, goal and deadline, so anything else riding on the request would be unapproved and unhashed data.
 * Intake rejects such fields instead of silently ignoring them. If attachments are ever added they must be
 * untrusted data, size-capped and included in the content hash with the task.
 */
export const ATTACHMENT_KEYS = ['attachments', 'attachment', 'documents', 'document', 'files', 'file', 'memory', 'memories', 'context', 'context_documents', 'knowledge'] as const;

export function attachmentKeys(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const keys = Object.keys(body as object).map((k) => k.toLowerCase());
  return ATTACHMENT_KEYS.filter((k) => keys.includes(k));
}
