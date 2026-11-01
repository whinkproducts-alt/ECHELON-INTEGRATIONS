/**
 * Builds the GitHub issue from the STORED spec only. No model call happens here, so what the
 * approval card shows is exactly what is sent. Pure and deterministic.
 */
import { SECRET_RULES } from '@/lib/secret-scan';
import type { Spec } from '@/lib/change-requests/schema';

export const ISSUE_LABEL = 'change-request';
export const DEFAULT_MENTION = '@claude';

export function buildMention(raw: string | undefined = process.env.CHANGE_REQUEST_BUILD_MENTION): string {
  const t = (raw ?? '').trim();
  return /^@[A-Za-z0-9][A-Za-z0-9_-]{0,38}$/.test(t) ? t : DEFAULT_MENTION;
}

/** Stops stray @mentions in user or model text from notifying anyone. */
function defang(s: string): string {
  return s.replace(/@(?=[A-Za-z0-9])/g, '@​');
}

function fence(text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const f = '`'.repeat(longest + 1);
  return `${f}text\n${text}\n${f}`;
}

export interface IssueSource { title: string; body: string; spec: Spec; risk?: string | null }
export interface BuiltIssue { title: string; body: string }

export function buildIssue(cr: IssueSource, mention: string = buildMention()): BuiltIssue {
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${defang(i)}`).join('\n') : '- none stated');
  const s = cr.spec;
  const body = [
    '## Summary',
    defang(s.summary),
    '',
    '## Original request',
    fence(defang(cr.body)),
    '',
    '## Acceptance criteria',
    list(s.acceptanceCriteria),
    '',
    '## Files likely touched',
    list(s.filesLikelyTouched),
    '',
    '## Risks',
    list(s.risks),
    '',
    `Touches security or money: ${s.touchesSecurityOrMoney ? 'YES, needs security review' : 'no'}`,
    '',
    `${mention} please implement this on a new branch and open a pull request. Do not merge it; a human reviews and merges.`,
  ].join('\n');
  return { title: defang(cr.title).substring(0, 200), body };
}

/** Names of secret patterns found in the text (never the match itself). */
export function secretsIn(text: string): string[] {
  return SECRET_RULES.filter((r) => r.re.test(text)).map((r) => r.name);
}

export function toMarkdown(cr: Omit<IssueSource, 'spec'> & { spec?: Spec | null }, mention = buildMention()): string {
  if (!cr.spec) return `# ${cr.title}\n\n${cr.body}\n`;
  const issue = buildIssue({ ...cr, spec: cr.spec }, mention);
  return `# ${issue.title}\n\n${issue.body}\n`;
}
