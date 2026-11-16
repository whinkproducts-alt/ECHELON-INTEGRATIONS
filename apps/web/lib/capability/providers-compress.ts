/**
 * Context compression: budgetConversation (model-router/context-budget.ts) already drops the oldest whole
 * exchanges to fit a character target. This adds a deterministic, model-free digest of what was dropped, so
 * the model knows earlier turns existed. No summariser call, no spend. Digest text is the user's own words
 * only, bracket-stripped, so a dropped untrusted wrapper can never reappear as live markup.
 */
import { budgetConversation, type BudgetMessage } from '@/lib/model-router/context-budget';

export function compressConversation<T extends BudgetMessage>(input: readonly T[], maxChars?: number, digestChars = 600) {
  const r = budgetConversation(input, maxChars);
  if (!r.omittedMessages) return { ...r, digest: null as string | null };
  const kept = new Set<T>(r.messages);
  const dropped = input.filter((m) => !kept.has(m) && m.role === 'user');
  const lines: string[] = [];
  let used = 0;
  for (const m of dropped) {
    const line = `- ${m.content.replace(/[\[\]\r\n]+/g, ' ').trim().slice(0, 100)}`;
    if (used + line.length > digestChars) break;
    lines.push(line); used += line.length;
  }
  const digest = `Earlier in this conversation (${r.omittedMessages} messages omitted to save space). The user had asked:\n${lines.join('\n')}`;
  // Placed after the system messages, before the kept exchanges.
  const sys = r.messages.filter((m) => m.role === 'system');
  const rest = r.messages.filter((m) => m.role !== 'system');
  return { ...r, digest, messages: [...sys, { role: 'system', content: digest } as unknown as T, ...rest] };
}
