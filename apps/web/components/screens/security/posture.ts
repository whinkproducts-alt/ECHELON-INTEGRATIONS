// Pure posture logic. Built only from fields the status API actually returned.
// A missing or unreadable fact is "not_reported". It is never counted as passing.
export type FactState = 'ok' | 'attention' | 'waiting' | 'not_reported';

export interface Fact { id: string; label: string; state: FactState; detail: string }

interface EventSummary { injectionBlocks?: number; hashLockFailures?: number; crossTenantAttempts?: number; other?: number; total?: number }
export interface SecurityStatus {
  generatedAt?: string;
  headers?: { enforcedByProxy?: string[]; hstsActive?: boolean; csp?: { nonceBasedScripts?: boolean; frameAncestorsNone?: boolean; objectSrcNone?: boolean } };
  pendingClassCApprovals?: number;
  securityEvents?: { last24h?: EventSummary; last7d?: EventSummary };
  dependencyAudit?: { status?: string; ranAt?: string; vulnerabilities?: { critical?: number; high?: number; moderate?: number; low?: number } };
  secretsScan?: { status?: string; ranAt?: string; findings?: number; envFiles?: number; envFilesIgnoredByGit?: boolean };
  githubSettings?: string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const day = (iso?: string) => (typeof iso === 'string' ? iso.slice(0, 10) : 'unknown date');

export function computeFacts(s: SecurityStatus): Fact[] {
  const out: Fact[] = [];

  const p = s.pendingClassCApprovals;
  out.push(!isNum(p)
    ? { id: 'approvals', label: 'Pending Class C approvals', state: 'not_reported', detail: 'Not reported.' }
    : p === 0
      ? { id: 'approvals', label: 'Pending Class C approvals', state: 'ok', detail: 'None waiting.' }
      : { id: 'approvals', label: 'Pending Class C approvals', state: 'waiting', detail: `${p} awaiting approval. Each expires 30 seconds after it was raised.` });

  const e24 = s.securityEvents?.last24h?.total;
  out.push(!isNum(e24)
    ? { id: 'events', label: 'Security events, 24 hours', state: 'not_reported', detail: 'Not reported.' }
    : e24 === 0
      ? { id: 'events', label: 'Security events, 24 hours', state: 'ok', detail: 'None recorded.' }
      : { id: 'events', label: 'Security events, 24 hours', state: 'attention', detail: `${e24} recorded. Each one was blocked or refused; review the timeline.` });

  const h = s.headers;
  const csp = h?.csp;
  if (!h || !csp || !Array.isArray(h.enforcedByProxy)) out.push({ id: 'headers', label: 'Security headers and CSP', state: 'not_reported', detail: 'Not reported.' });
  else {
    const failing = [csp.nonceBasedScripts === false && 'scripts are not nonce based', csp.frameAncestorsNone === false && 'framing is allowed', csp.objectSrcNone === false && 'object embeds are allowed'].filter(Boolean);
    const unknown = [csp.nonceBasedScripts, csp.frameAncestorsNone, csp.objectSrcNone].some((v) => typeof v !== 'boolean');
    out.push(failing.length > 0
      ? { id: 'headers', label: 'Security headers and CSP', state: 'attention', detail: `Check failed: ${failing.join(', ')}.` }
      : unknown || h.enforcedByProxy.length === 0
        ? { id: 'headers', label: 'Security headers and CSP', state: 'not_reported', detail: 'Only partly reported.' }
        : { id: 'headers', label: 'Security headers and CSP', state: 'ok', detail: `${h.enforcedByProxy.length} headers set by the proxy. HSTS ${h.hstsActive ? 'active' : 'off (not an https deployment)'}.` });
  }

  const a = s.dependencyAudit;
  if (!a || a.status === 'never_run' || a.status === 'unreadable' || a.status === undefined) {
    out.push({ id: 'audit', label: 'Dependency audit', state: 'not_reported', detail: a?.status === 'unreadable' ? 'The last report could not be read.' : 'Never run. See "Run before relying on it" in the security notes.' });
  } else {
    const v = a.vulnerabilities ?? {};
    const bad = (v.critical ?? 0) + (v.high ?? 0);
    out.push({ id: 'audit', label: 'Dependency audit', state: bad > 0 ? 'attention' : 'ok', detail: `Run ${day(a.ranAt)}: ${v.critical ?? 0} critical, ${v.high ?? 0} high, ${v.moderate ?? 0} moderate, ${v.low ?? 0} low.` });
  }

  const sc = s.secretsScan;
  if (!sc || sc.status === 'never_run' || sc.status === undefined) out.push({ id: 'secrets', label: 'Secrets scan', state: 'not_reported', detail: 'Never run. See "Run before relying on it" in the security notes.' });
  else out.push({ id: 'secrets', label: 'Secrets scan', state: sc.status === 'clean' ? 'ok' : 'attention', detail: sc.status === 'clean' ? `Run ${day(sc.ranAt)}: no findings.` : `Run ${day(sc.ranAt)}: ${sc.findings ?? 0} findings, ${sc.envFiles ?? 0} env files.` });

  if (typeof sc?.envFilesIgnoredByGit === 'boolean') out.push({ id: 'env', label: '.env files ignored by git', state: sc.envFilesIgnoredByGit ? 'ok' : 'attention', detail: sc.envFilesIgnoredByGit ? 'A .gitignore rule covers them.' : 'No rule found. Add one.' });
  else out.push({ id: 'env', label: '.env files ignored by git', state: 'not_reported', detail: 'Not reported.' });

  return out;
}

export interface Posture { headline: string; tone: 'accent' | 'ember' | 'neutral'; passing: number; total: number; attention: number; notReported: number }

export function computePosture(facts: Fact[]): Posture {
  const total = facts.length;
  const passing = facts.filter((f) => f.state === 'ok').length;
  const attention = facts.filter((f) => f.state === 'attention').length;
  const waiting = facts.filter((f) => f.state === 'waiting').length;
  const notReported = facts.filter((f) => f.state === 'not_reported').length;
  const headline = attention > 0 ? 'Needs attention' : waiting > 0 ? 'Waiting on you' : notReported === total ? 'Nothing reported' : notReported > 0 ? 'Partly reported' : 'Reported checks pass';
  return { headline, tone: attention > 0 ? 'ember' : notReported === total ? 'neutral' : 'accent', passing, total, attention, notReported };
}
