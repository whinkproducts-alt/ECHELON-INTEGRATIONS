/** Deterministic input reduction: no summarizer call, content cache or change to model authority. */
export interface BudgetMessage { role: 'system' | 'user' | 'assistant'; content: string }
export function charBudget(name: string, fallback: number, env: Record<string, string | undefined> = process.env): number {
  const raw = env[name];
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1024 && n <= 320_000 ? n : fallback;
}
export function recallCharBudget(): number { return charBudget('WHINK_RECALL_MAX_CHARS', 8000); }

/** Keep every system instruction and the complete latest user exchange; drop oldest whole exchanges only.
 * This is a character target, not an exact tokenizer/window guarantee. Mandatory input may exceed it.
 */
export function budgetConversation<T extends BudgetMessage>(input: readonly T[], maxChars = charBudget('WHINK_CHAT_MAX_CHARS', 24000)) {
  const system = input.filter((m) => m.role === 'system');
  const groups: T[][] = [];
  for (const m of input) {
    if (m.role === 'system') continue;
    if (m.role === 'user' || !groups.length) groups.push([]);
    groups[groups.length - 1].push(m);
  }
  const size = (ms: readonly T[]) => ms.reduce((n, m) => n + m.content.length, 0);
  const kept: T[][] = groups.length ? [groups[groups.length - 1]] : [];
  let chars = size(system) + size(kept.flat());
  for (let i = groups.length - 2; i >= 0; i--) {
    const cost = size(groups[i]);
    if (chars + cost > maxChars) break;
    kept.unshift(groups[i]); chars += cost;
  }
  const messages = [...system, ...kept.flat()];
  return { messages, originalChars: size(input), retainedChars: chars,
    omittedMessages: input.length - messages.length, mandatoryOverTarget: chars > maxChars };
}
