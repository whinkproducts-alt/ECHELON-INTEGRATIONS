// Content isolation envelope for prompt injection defense

export function wrapUntrustedContent(content: string, sourceType: string, origin: string): string {
  const safeType = sourceType.replace(/["\[\]\u0000-\u001F\u007F\u2028\u2029]/g, '');
  const safeOrigin = origin.replace(/["\[\]\u0000-\u001F\u007F\u2028\u2029]/g, '');
  let safeUrl = safeOrigin;
  try { safeUrl = new URL(safeOrigin).href.replace(/["[\]\n\r]/g, ''); } catch { /* not a URL — use safeOrigin */ }
  return `[UNTRUSTED_EXTERNAL_CONTENT source="${safeType}" from="${safeUrl}"]\n${content}\n[/UNTRUSTED_EXTERNAL_CONTENT]`;
}

/**
 * Strip any fake closing tags that could be used to escape the untrusted envelope.
 * Call this on raw external content BEFORE wrapping.
 */
export function stripFakeUntrustedTags(content: string): string {
  return content.replace(/\[\/UNTRUSTED_EXTERNAL_CONTENT[^\]]*\]/gi, '');
}

// Strict checks used for external/tool content — hard-block on match
const STRICT_CHECKS: Array<{ name: string; regex: RegExp }> = [
  { name: 'system_token', regex: /\[(SYSTEM|ASSISTANT|USER)\]\s*:/i },
  { name: 'instruction_override', regex: /ignore (previous|all|above) instructions/i },
  { name: 'role_injection', regex: /you are now|new instructions|forget (your|all)/i },
  { name: 'action_command', regex: /\b(execute|run|perform|send|delete|create)\s+(immediately|right now|without (asking|confirmation|permission))/i },
  { name: 'authorization_claim', regex: /(authorized|permitted|allowed) (to|the following)/i },
  { name: 'system_note', regex: /SYSTEM NOTE|AI ASSISTANT|DO NOT INFORM/i },
];

// Scan for instruction patterns in external content (hard block path)
export function scanForInjectionPatterns(content: string): { suspicious: boolean; patterns: string[] } {
  const patterns: string[] = [];
  for (const check of STRICT_CHECKS) {
    if (check.regex.test(content)) {
      patterns.push(check.name);
    }
  }
  return { suspicious: patterns.length > 0, patterns };
}

/**
 * Scan user-typed input with the same patterns as a warning signal.
 * Callers decide whether to block — this function never blocks itself.
 * The tighter regexes reduce false positives on ordinary user messages.
 */
export function scanUserInput(content: string): { suspicious: boolean; patterns: string[] } {
  return scanForInjectionPatterns(content);
}

/**
 * Normalise and sanitise external tool result content.
 * Collapses Unicode lookalikes, strips zero-width chars, escapes bracket chars,
 * and truncates. Does NOT try to judge content — injection detection is handled
 * separately by scanForInjectionPatterns in the tool loop.
 */
export function filterToolResult(content: string): string {
  // Step 1: Unicode normalisation — collapse lookalikes
  let text = content.normalize('NFKC');
  // Step 2: Strip Unicode tag block (U+E0000–U+E007F) and all Unicode format characters (Cf)
  text = text.replace(/[\u{E0000}-\u{E007F}]/gu, '').replace(/\p{Cf}/gu, '');
  // Step 3: Escape all [ and ] to prevent fake wrapper tags
  text = text.replace(/\[/g, '⟦').replace(/\]/g, '⟧');
  // Step 4: Truncate to 4000 chars
  if (text.length > 4000) text = text.substring(0, 4000) + '[...truncated]';
  return text;
}
