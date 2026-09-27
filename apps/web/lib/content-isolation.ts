// Content isolation envelope for prompt injection defense

export function wrapUntrustedContent(content: string, sourceType: string, origin: string): string {
  return `[UNTRUSTED_EXTERNAL_CONTENT source="${sourceType}" from="${origin}"]\n${content}\n[/UNTRUSTED_EXTERNAL_CONTENT]`;
}

// Scan for instruction patterns in external content
export function scanForInjectionPatterns(content: string): { suspicious: boolean; patterns: string[] } {
  const patterns: string[] = [];
  const checks: Array<{ name: string; regex: RegExp }> = [
    { name: 'system_token', regex: /\[?(SYSTEM|ASSISTANT|USER)\]?\s*:/i },
    { name: 'instruction_override', regex: /ignore (previous|all|above) instructions/i },
    { name: 'role_injection', regex: /you are now|new instructions|forget (your|all)/i },
    { name: 'action_command', regex: /(execute|run|perform|send|delete|create)\s+(immediately|now|without)/i },
    { name: 'authorization_claim', regex: /(authorized|permitted|allowed) (to|the following)/i },
    { name: 'system_note', regex: /SYSTEM NOTE|AI ASSISTANT|DO NOT INFORM/i },
  ];

  for (const check of checks) {
    if (check.regex.test(content)) {
      patterns.push(check.name);
    }
  }

  return { suspicious: patterns.length > 0, patterns };
}
