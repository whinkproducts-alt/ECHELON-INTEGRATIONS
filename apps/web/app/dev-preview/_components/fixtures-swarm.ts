// DEV ONLY. Fixture answers for the Skill Library, Swarm Control and Standing Roster screens.
// Shapes follow app/api/skills, lib/swarm/service.ts and app/api/worker/status/route.ts. Everything here is obviously fake.
// Swarm run ids: contain "planned" for a run awaiting start, "done" for a finished run, anything else is running.
import roster from '@/config/standing-roster.json';

interface Ctx { state: 'ready' | 'loading' | 'error' | 'empty'; now: () => number }
interface Mocked { status: number; body: unknown; delayMs?: number }

const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;

// ---- skills ----
type Status = 'QUEUED' | 'SCANNING' | 'REJECTED_SECURITY' | 'ASSESSING' | 'ACCEPTED' | 'REJECTED_VALUE' | 'WAITING_MODEL' | 'FAILED';
const SKILLS: Array<{ id: string; name: string; filename: string; status: Status; ageMin: number; scan?: number; findings?: number; committee?: [number, number] }> = [
  { id: 'sk_fixture_1', name: 'Fixture negotiation playbook', filename: 'negotiation-playbook.md', status: 'ACCEPTED', ageMin: 120, scan: 0, findings: 0, committee: [3, 4.3] },
  { id: 'sk_fixture_2', name: 'Fixture planted instructions', filename: 'planted.txt', status: 'REJECTED_SECURITY', ageMin: 90, scan: 130, findings: 4 },
  { id: 'sk_fixture_3', name: 'Fixture shopping list', filename: 'shopping.txt', status: 'REJECTED_VALUE', ageMin: 80, scan: 0, findings: 0, committee: [0, 1.7] },
  { id: 'sk_fixture_4', name: 'Fixture onboarding checklist', filename: 'onboarding.yaml', status: 'ASSESSING', ageMin: 3, scan: 3, findings: 1 },
  { id: 'sk_fixture_5', name: 'Fixture pricing sheet', filename: 'pricing.json', status: 'SCANNING', ageMin: 1 },
  { id: 'sk_fixture_6', name: 'Fixture meeting template', filename: 'meeting.md', status: 'QUEUED', ageMin: 0 },
  { id: 'sk_fixture_7', name: 'Fixture waiting skill', filename: 'waiting.md', status: 'WAITING_MODEL', ageMin: 40, scan: 0, findings: 0 },
  { id: 'sk_fixture_8', name: 'Fixture broken write', filename: 'broken.md', status: 'FAILED', ageMin: 30, scan: 0, findings: 0, committee: [2, 4] },
];
const REASON: Partial<Record<Status, string>> = {
  ACCEPTED: 'Accepted: 3 of 3 approved, mean value 4.3.',
  REJECTED_SECURITY: 'Deterministic scan blocked this skill (injection_override, permission_grant).',
  REJECTED_VALUE: 'Committee did not accept: 0 of 3 approved, mean value 1.7 (needs 2 approvals and 3.5).',
  WAITING_MODEL: 'No model is configured. Waiting; not accepted.',
  FAILED: 'Accepted by the committee but memory could not be written.',
};
const skillListItem = (s: (typeof SKILLS)[number], now: number) => ({
  id: s.id, name: s.name, filename: s.filename, sizeBytes: 4200, status: s.status,
  decision: s.status === 'ACCEPTED' ? 'accepted' : s.status === 'WAITING_MODEL' ? 'waiting_model' : s.status === 'FAILED' ? 'failed' : REASON[s.status] ? s.status.toLowerCase() : null,
  reason: REASON[s.status] ?? null, attempts: s.status === 'WAITING_MODEL' ? 2 : 1,
  createdAt: iso(now - s.ageMin * MIN), updatedAt: iso(now - Math.max(0, s.ageMin - 1) * MIN),
  memoryCount: s.status === 'ACCEPTED' ? 6 : 0,
  scan: s.scan === undefined ? null : { verdict: s.scan >= 60 ? 'critical' : s.findings ? 'flagged' : 'clean', score: s.scan, counts: { CRITICAL: s.scan >= 100 ? 1 : 0, HIGH: s.scan >= 100 ? 1 : 0, MEDIUM: s.findings && s.scan < 100 ? 1 : 0, LOW: s.scan >= 100 ? 2 : 0 } },
  committeeSummary: s.committee ? { approvals: s.committee[0], meanScore: s.committee[1] } : null,
});
const MEMBERS = [
  { id: 'director.executive', name: 'Fixture Director One', directorate: 'Executive Office & Corporate Strategy' },
  { id: 'director.engineering', name: 'Fixture Director Two', directorate: 'Engineering & Technology' },
  { id: 'director.data', name: 'Fixture Director Three', directorate: 'Data & Artificial Intelligence' },
];
function skillDetail(id: string, now: number) {
  const s = SKILLS.find((x) => x.id === id) ?? SKILLS[0];
  const item = skillListItem(s, now);
  const approve = s.committee ? s.committee[0] : 0;
  return {
    submission: {
      id: s.id, name: s.name, filename: s.filename, sha256: 'fixture', sizeBytes: 4200, status: s.status, decision: item.decision, reason: item.reason,
      memoryIds: s.status === 'ACCEPTED' ? ['m1', 'm2'] : [], attempts: 1, createdAt: item.createdAt, updatedAt: item.updatedAt,
      scanReport: s.scan === undefined ? null : {
        version: 1, verdict: item.scan?.verdict, score: s.scan, counts: item.scan?.counts, truncated: false,
        findings: s.scan && s.scan >= 60 ? [
          { rule: 'injection_override', severity: 'CRITICAL', category: 'injection', message: 'Text tells the reader to ignore its rules (fixture).', line: 4 },
          { rule: 'permission_grant', severity: 'HIGH', category: 'permissions', message: 'Text claims to grant new permissions (fixture).', line: 9 },
        ] : [],
        agent: s.status === 'REJECTED_SECURITY' || s.status === 'ASSESSING' || s.committee
          ? { id: 'agent.fixture.sec', name: 'Fixture Security Lead', verdict: { verdict: s.status === 'REJECTED_SECURITY' ? 'malicious' : 'clean', findings: s.status === 'REJECTED_SECURITY' ? ['Tries to override rules'] : [], confidence: 0.92 } } : undefined,
      },
      committee: s.committee ? {
        threshold: 3.5, minApprovals: 2, approvals: s.committee[0], meanScore: s.committee[1],
        members: MEMBERS.map((m, i) => ({ ...m, vote: { valueScore: s.committee![1] >= 3.5 ? 4 + (i % 2) * 0.0 : 2, approve: i < approve, reasons: [i < approve ? 'Specific, reusable and relevant (fixture).' : 'Too generic to keep as reference (fixture).'] } })),
      } : null,
    },
  };
}

// ---- swarm ----
const ROLES: Array<[string, number]> = [['lead', 1], ['integrator', 6], ['redteam', 3], ['reviewer', 10], ['worker', 30]];
const ESTIMATE = {
  agents: 50, workPackages: 30, roles: { lead: 1, integrator: 6, redteam: 3, reviewer: 10, worker: 30 }, expectedCalls: 55, maxCalls: 150,
  tokens: 238000, tokensIn: 150000, tokensOut: 88000, criticalPath: 4, concurrency: 8, etaSeconds: 840, plannerTokens: 6200,
};
function planTasks() {
  let n = 0;
  return ROLES.flatMap(([role, count]) => Array.from({ length: count }, (_, i) => {
    n += 1;
    return { lane: `${role}-${i + 1}`, role, agentId: `fixture.agent.${n}`, agentName: `Fixture Agent ${n}`, fit: n % 3 === 0 ? 'generalist' : 'matched', title: `${role} lane ${i + 1}: made-up work package`, covers: [], dependsOn: [] };
  }));
}
function runView(id: string, now: number) {
  const planned = id.includes('planned');
  const done = id.includes('done');
  return {
    id, title: 'Fixture initiative: map a made-up market', status: planned ? 'PLANNED' : done ? 'DONE' : 'RUNNING', agents: 50, projectId: null, subsidiary: null,
    estimate: ESTIMATE, tokenCap: 357000, tokensUsed: planned ? 0 : done ? 231000 : 96000, cancelRequested: false, stopReason: null,
    startedAt: planned ? null : iso(now - 12 * MIN), finishedAt: done ? iso(now - MIN) : null, createdAt: iso(now - 20 * MIN),
  };
}
function runDetail(id: string, now: number) {
  const view = runView(id, now);
  const tasks = planTasks().map((t, i) => {
    const status = view.status === 'PLANNED' ? 'PENDING' : view.status === 'DONE' ? (i === 7 ? 'FAILED' : i === 8 ? 'SKIPPED' : 'DONE') : i < 22 ? 'DONE' : i < 30 ? 'RUNNING' : i === 31 ? 'FAILED' : 'PENDING';
    return { ...t, status, attempts: status === 'FAILED' ? 3 : 1, tokens: status === 'DONE' ? 3700 : 0, error: status === 'FAILED' ? 'Model returned an invalid answer (fixture)' : null };
  });
  const counts: Record<string, number> = { PENDING: 0, RUNNING: 0, DONE: 0, FAILED: 0, SKIPPED: 0 };
  for (const t of tasks) counts[t.status] += 1;
  return {
    run: view, counts, tasks,
    learnings: Array.from({ length: view.status === 'PLANNED' ? 0 : 6 }, (_, i) => ({ lane: `worker-${i + 1}`, agentId: `fixture.agent.${i + 11}`, text: `Fixture learning ${6 - i}: a made-up regional pattern. <b>Markup</b> stays text.`, confidence: 0.7, createdAt: iso(now - (i + 1) * MIN) })),
    tokens: { estimated: ESTIMATE.tokens, actual: view.tokensUsed, cap: view.tokenCap },
    result: view.status === 'DONE' ? 'Fixture report\n\nSummary: nothing real was analysed.\n\n1. Made-up finding one\n2. Made-up finding two' : null,
    resultUntrusted: true,
  };
}

// ---- worker ----
function workerStatus(ctx: Ctx) {
  const now = ctx.now();
  const rows = roster.roster as Array<{ key: string; job: string | null; enabled: boolean }>;
  const enabled = rows.filter((r) => r.enabled && r.job);
  if (ctx.state === 'empty') return { enabled: true, heartbeatAgeSeconds: null, rosterSize: rows.length, enabledCount: enabled.length, jobs: [] };
  return {
    enabled: true, heartbeatAgeSeconds: 7, rosterSize: rows.length, enabledCount: enabled.length,
    jobs: enabled.map((r, i) => ({
      jobKey: `${r.job}:${r.key}`, lastRunAt: i % 9 === 8 ? null : iso(now - (i + 1) * 4 * MIN), lastStatus: i % 9 === 8 ? null : i % 7 === 6 ? 'FAILED' : 'SUCCESS',
      nextRunAt: iso(now + (i + 2) * 6 * MIN), runs: 3 + i,
    })),
  };
}

export function answerSwarm(method: string, url: URL, _body: unknown, ctx: Ctx): Mocked | null {
  void _body;
  const p = url.pathname;
  const now = ctx.now();
  const mine = p === '/api/skills' || p === '/api/swarm' || p === '/api/worker/status' || /^\/api\/(skills|swarm)\/[^/]+$/.test(p) || /^\/api\/swarm\/[^/]+\/(start|cancel)$/.test(p);
  if (!mine) return null;
  if (method === 'GET') {
    if (ctx.state === 'error') return { status: 500, body: { error: 'Fixture error' } };
    if (ctx.state === 'loading') return { status: 200, body: {}, delayMs: 600_000 };
  }
  const empty = ctx.state === 'empty';

  if (p === '/api/worker/status') return { status: 200, body: workerStatus(ctx) };

  if (p === '/api/skills') {
    if (method === 'GET') return { status: 200, body: { submissions: empty ? [] : SKILLS.map((s) => skillListItem(s, now)) } };
    // The harness cannot read multipart bodies, so uploads answer with a fixed rejection list.
    return { status: 400, body: { error: 'No files accepted', rejected: [] } };
  }
  const sk = p.match(/^\/api\/skills\/([^/]+)$/);
  if (sk) return method === 'DELETE' ? { status: 200, body: { deleted: true } } : { status: 200, body: skillDetail(sk[1], now) };

  if (p === '/api/swarm') {
    if (method === 'GET') return { status: 200, body: { runs: empty ? [] : ['run_fixture_running', 'run_fixture_planned', 'run_fixture_done'].map((id) => runView(id, now)) } };
    const overspend = typeof (_body as { initiative?: string } | null)?.initiative === 'string' && (_body as { initiative: string }).initiative.toLowerCase().includes('budget');
    return { status: 201, body: {
      run: runView('run_fixture_planned_new', now),
      budget: overspend
        ? { state: 'ok', projectedState: 'hard', flag: 'red', used: 410000, limit: 500000, estimatedTokens: ESTIMATE.tokens }
        : { state: 'ok', projectedState: 'soft', flag: 'amber', used: 190000, limit: 400000, estimatedTokens: ESTIMATE.tokens },
      tasks: planTasks(),
    } };
  }
  const act = p.match(/^\/api\/swarm\/([^/]+)\/(start|cancel)$/);
  if (act) return act[2] === 'start' ? { status: 202, body: { run: runView(act[1].replace('planned', 'running'), now), budget: null } } : { status: 200, body: { status: 'CANCELLING' } };
  const sw = p.match(/^\/api\/swarm\/([^/]+)$/);
  if (sw) return { status: 200, body: empty ? { ...runDetail(sw[1], now), tasks: [], counts: { PENDING: 0, RUNNING: 0, DONE: 0, FAILED: 0, SKIPPED: 0 }, learnings: [] } : runDetail(sw[1], now) };
  return null;
}
