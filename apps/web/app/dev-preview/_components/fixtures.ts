// DEV ONLY. Fixture answers for the preview harness. Names and people here are obviously fake.
// This file is only reachable through /dev-preview, which 404s unless NODE_ENV is 'development'.

export type PreviewState = 'ready' | 'loading' | 'error' | 'empty';
export interface Mocked { status: number; body: unknown; delayMs?: number }

import catalog from '@/config/connectors.catalog.json';

const iso = (ms: number) => new Date(ms).toISOString();

const CONTACTS = [
  { id: 'c1', name: 'Avery Fixture', email: 'avery.fixture@example.test', phone: '+14035550101', company: 'Fixture Labs', tags: ['client', 'calgary', 'telegram:123456'], source: 'manual', notes: null, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'c2', name: 'Jordan Placeholder', email: 'jordan@example.test', phone: '+14035550102', company: 'Placeholder Freight', tags: ['vendor'], source: 'vcard', notes: null, createdAt: '2026-10-02T10:00:00.000Z' },
  { id: 'c3', name: 'Sam Sample', email: null, phone: '+14035550103', company: 'Sample & Co', tags: ['investor'], source: 'vcard', notes: null, createdAt: '2026-10-03T10:00:00.000Z' },
  { id: 'c4', name: 'Riley Mock', email: 'riley@example.test', phone: null, company: 'Mock Industries', tags: ['advisor', 'legal'], source: 'manual', notes: null, createdAt: '2026-10-04T10:00:00.000Z' },
  { id: 'c5', name: 'Morgan Dummy', email: 'morgan.dummy@example.test', phone: '+14035550105', company: 'Dummy Capital', tags: ['investor', 'edmonton'], source: 'manual', notes: null, createdAt: '2026-10-05T10:00:00.000Z' },
  { id: 'c6', name: 'Casey Notional', email: 'casey@example.test', phone: '+14035550106', company: null, tags: ['family'], source: 'manual', notes: null, createdAt: '2026-10-06T10:00:00.000Z' },
  { id: 'c7', name: 'Taylor Imaginary', email: 'taylor@example.test', phone: '+14035550107', company: 'Imaginary Works', tags: ['client'], source: 'vcard', notes: null, createdAt: '2026-10-07T10:00:00.000Z' },
  { id: 'c8', name: 'Quinn Faux', email: 'quinn.faux@example.test', phone: null, company: 'Faux Media', tags: ['press'], source: 'vcard', notes: null, createdAt: '2026-10-08T10:00:00.000Z' },
];

// Statuses mimic what the registry computes from evidence; the entries themselves come from the real catalog.
const STATUS_BY_ID: Record<string, string> = {
  ollama: 'connected', openclaw: 'connected', anythingllm: 'connected', twilio: 'connected', telegram: 'connected', whatsapp: 'needs_config',
  x: 'connected', instagram: 'available', tiktok: 'available', slack: 'available', github: 'connected', figma: 'available', notion: 'available', linear: 'available',
  stripe_readonly: 'needs_config',
};
const CONNECTORS = (catalog.connectors as Array<Record<string, unknown>>).map((e) => {
  const { evidence: _evidence, ...manifest } = e;
  void _evidence;
  const status = STATUS_BY_ID[String(e.id)] ?? 'unavailable';
  return { iconUrl: null, ...manifest, status, installed: status === 'connected', enabled: status === 'connected' };
});

function usage(range: string) {
  const days = range === '30d' ? 30 : 7;
  const daily = Array.from({ length: days }, (_, i) => ({
    day: new Date(Date.UTC(2026, 9, 25 - (days - 1 - i))).toISOString().slice(0, 10),
    tokensIn: 4000 + ((i * 3719) % 9000), tokensOut: 1500 + ((i * 2113) % 4000), costMicros: 90000 + ((i * 7919) % 120000),
  }));
  return {
    range, daily,
    byModel: [
      { model: 'fixture-large', provider: 'fixture', tokensIn: 52000, tokensOut: 21000, costMicros: 1200000, calls: 41 },
      { model: 'fixture-local', provider: 'local', tokensIn: 18000, tokensOut: 7000, costMicros: 0, calls: 19 },
    ],
    budget: { state: 'soft', used: 410000, limit: 500000, softPct: 80, hardPct: 100, resetsAt: '2026-11-01T00:00:00.000Z' },
    connectivity: 'online',
  };
}

const NEWS = {
  fetchedAt: '2026-10-25T12:00:00.000Z',
  items: [
    'Fixture headline one: markets move on a placeholder report',
    'Fixture headline two: a made-up chip maker ships a made-up chip',
    'Fixture headline three: regulators publish an imaginary framework',
    'Fixture headline four: local startup raises a notional round',
    'Fixture headline five: <b>markup</b> in a title stays plain text',
    'Fixture headline six: this one should not appear on Today',
  ].map((title, i) => ({ title, link: i === 2 ? 'javascript:alert(1)' : `https://example.test/story-${i + 1}`, pubDate: '2026-10-25T09:00:00.000Z', source: 'Fixture Wire', excerpt: '' })),
};

const LEDGER_ROWS: Array<[string, string, string, string, number]> = [
  ['injection_blocked', 'DENIED', 'user message', 'blocked before model: planted instruction', 5],
  ['tool_executed', 'EXECUTED', 'calendar_list', 'ok', 12],
  ['approval_hash_mismatch', 'DENIED', 'contact_message', 'hash lock: parameters changed after approval', 38],
  ['memory_auto_written', 'EXECUTED', 'semantic', 'prefers morning meetings', 70],
  ['tool_executed', 'EXECUTED', 'document_search', '3 chunks', 95],
  ['action_blocked', 'DENIED', 'social_post', 'Class C needs approval at every level', 140],
  ['tool_executed', 'EXECUTED', 'gateway_github_list_issues', 'ok', 190],
  ['memory_auto_skipped', 'EXECUTED', 'external content', 'turn read external content', 240],
];
const ledger = (now: number) => LEDGER_ROWS.map(([action, status, inputSummary, outputSummary, min], i) => ({
  id: `l${i + 1}`, action, status, inputSummary, outputSummary, createdAt: iso(now - min * 60_000),
}));


// ---- Subsidiaries and project reports. Fake, dev-only. Shapes follow the ProjectCard contract; the report shape is a best guess. ----
const SUB_IDS = ['consult', 'real-estate', 'trades', 'apps', 'frontliners'] as const;
const SUB_NAMES: Record<string, string> = { consult: 'Whink Consult', 'real-estate': 'Whink Real Estate', trades: 'Whink Trades & Investments', apps: 'Whink Apps', frontliners: 'Whink Frontliners' };

interface FxProject { id: string; name: string; goal: string | null; status: string; subsidiary: string | null; done: number; total: number; milestone: [string, string | null] | null; risks: number; questions: number }
const FX_PROJECTS: FxProject[] = [
  { id: 'prj_consult_1', name: 'Fixture ERP rollout', goal: 'Move the fake client onto the fake ERP', status: 'ACTIVE', subsidiary: 'consult', done: 4, total: 10, milestone: ['Pilot go-live', '2026-11-14T00:00:00.000Z'], risks: 2, questions: 1 },
  { id: 'prj_consult_2', name: 'Placeholder security review', goal: null, status: 'ACTIVE', subsidiary: 'consult', done: 1, total: 6, milestone: ['Draft findings', '2026-11-03T00:00:00.000Z'], risks: 0, questions: 2 },
  { id: 'prj_re_1', name: 'Sample duplex flip', goal: 'Resell the imaginary duplex', status: 'ACTIVE', subsidiary: 'real-estate', done: 7, total: 12, milestone: ['Final inspection', '2026-11-20T00:00:00.000Z'], risks: 1, questions: 0 },
  { id: 'prj_trades_1', name: 'Notional equipment lease', goal: 'Lease two pretend excavators', status: 'ACTIVE', subsidiary: 'trades', done: 2, total: 5, milestone: null, risks: 0, questions: 3 },
  { id: 'prj_apps_1', name: 'Mock mobile release', goal: 'Ship version 2 of the demo app', status: 'ACTIVE', subsidiary: 'apps', done: 9, total: 9, milestone: null, risks: 0, questions: 0 },
  { id: 'prj_front_1', name: 'Dummy volunteer rota', goal: 'Cover every fake shift', status: 'ACTIVE', subsidiary: 'frontliners', done: 3, total: 8, milestone: ['Rota published', '2026-11-08T00:00:00.000Z'], risks: 1, questions: 1 },
  { id: 'prj_none_1', name: 'Unassigned scratch idea', goal: null, status: 'ACTIVE', subsidiary: null, done: 0, total: 0, milestone: null, risks: 0, questions: 0 },
  { id: 'prj_apps_2', name: 'Paused fixture portal', goal: null, status: 'PAUSED', subsidiary: 'apps', done: 2, total: 7, milestone: null, risks: 0, questions: 0 },
];
const card = (p: FxProject) => ({
  id: p.id, name: p.name, goal: p.goal, status: p.status, subsidiary: p.subsidiary, updatedAt: '2026-10-24T15:00:00.000Z',
  description: null, openTaskCount: p.total - p.done, createdAt: '2026-09-01T10:00:00.000Z',
  progress: { tasksTotal: p.total, tasksDone: p.done, percent: p.total ? Math.round((p.done / p.total) * 100) : 0 },
  nextMilestone: p.milestone ? { title: p.milestone[0], dueDate: p.milestone[1] } : null,
  openRisks: p.risks, openQuestions: p.questions,
});
const subsidiaryRows = (empty: boolean) => ({
  subsidiaries: SUB_IDS.map((id) => {
    const mine = empty ? [] : FX_PROJECTS.filter((p) => p.subsidiary === id);
    const active = mine.filter((p) => p.status === 'ACTIVE');
    const next = mine.find((p) => p.milestone?.[1]);
    return {
      id, name: SUB_NAMES[id], logo: `/brand/subsidiaries/${id}.webp`, counts: { total: mine.length, active: active.length },
      openTasks: mine.reduce((n, p) => n + p.total - p.done, 0), openRisks: mine.reduce((n, p) => n + p.risks, 0),
      nextMilestone: next?.milestone ? { title: next.milestone[0], dueDate: next.milestone[1], projectId: next.id, projectName: next.name } : null,
    };
  }),
  unassigned: empty ? { total: 0, active: 0 } : { total: 1, active: 1 },
});
const TASK_STATUSES = ['DONE', 'IN_PROGRESS', 'TODO', 'BLOCKED'];
function report(id: string) {
  const p = FX_PROJECTS.find((x) => x.id === id) ?? FX_PROJECTS[0];
  const c = card(p);
  const tasks = Array.from({ length: Math.max(p.total, 6) }, (_, i) => ({
    id: `${p.id}_t${i + 1}`, title: `Fixture task ${i + 1}: ${['scope', 'draft', 'review', 'sign-off', 'handover', 'follow-up'][i % 6]}`,
    status: i < p.done ? 'DONE' : TASK_STATUSES[1 + (i % 3)], priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'][i % 4],
    dueDate: i % 2 ? `2026-11-0${(i % 8) + 1}T00:00:00.000Z` : null, assignee: i % 3 === 0 ? 'Avery Fixture' : null,
  }));
  return {
    project: { id: p.id, name: p.name, goal: p.goal, description: 'Fake project used to preview the report layout. Nothing here is real.', status: p.status, subsidiary: p.subsidiary, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: c.updatedAt },
    subsidiary: p.subsidiary ? { id: p.subsidiary, name: SUB_NAMES[p.subsidiary], logo: `/brand/subsidiaries/${p.subsidiary}.webp` } : null,
    progress: c.progress,
    tasks,
    milestones: [
      { id: 'ms1', title: 'Kick-off', status: 'DONE', targetDate: '2026-09-15T00:00:00.000Z', completedAt: '2026-09-15T00:00:00.000Z' },
      { id: 'ms2', title: p.milestone?.[0] ?? 'Mid-point review', status: 'IN_PROGRESS', targetDate: p.milestone?.[1] ?? '2026-11-01T00:00:00.000Z', completedAt: null },
      { id: 'ms3', title: 'Close-out', status: 'PENDING', targetDate: '2026-12-15T00:00:00.000Z', completedAt: null },
    ],
    decisions: [
      { id: 'd1', title: 'Use the fixture vendor', rationale: 'Cheapest of three imaginary quotes.', decidedBy: 'Avery Fixture', decidedAt: '2026-09-20T00:00:00.000Z' },
      { id: 'd2', title: 'Defer phase two', rationale: 'Budget is a placeholder number.', decidedBy: null, decidedAt: '2026-10-05T00:00:00.000Z' },
    ],
    risks: [
      { id: 'r1', title: 'Vendor delay (fictional)', severity: 'HIGH', likelihood: 'MEDIUM', status: 'OPEN', mitigation: 'Hold a spare vendor.' },
      { id: 'r2', title: 'Scope creep (fictional)', severity: 'MEDIUM', likelihood: 'HIGH', status: 'OPEN', mitigation: null },
      { id: 'r3', title: 'Old closed risk', severity: 'LOW', likelihood: 'LOW', status: 'CLOSED', mitigation: null },
    ],
    openQuestions: [
      { id: 'q1', question: 'Who signs off the fake budget?', status: 'OPEN', assignedTo: 'Jordan Placeholder' },
      { id: 'q2', question: 'Is the pretend deadline fixed?', status: 'OPEN', assignedTo: null },
    ],
    members: [
      { userId: 'u1', name: 'Avery Fixture', role: 'OWNER' },
      { userId: 'u2', name: 'Jordan Placeholder', role: 'MEMBER' },
      { userId: 'u3', name: null, role: 'VIEWER' },
    ],
  };
}

const BOARD: unknown[] = [];

export interface MockCtx { state: PreviewState; now: () => number; counters: { casl: boolean } }

/** Returns null when the URL is not one the harness knows (the caller answers 404). */
export function answer(method: string, url: URL, body: unknown, ctx: MockCtx): Mocked | null {
  const p = url.pathname;
  const { state } = ctx;
  const isData = p === '/api/contacts' || p === '/api/usage' || p === '/api/connectors' || p === '/api/news' || p === '/api/ledger' || p === '/api/approvals' || p === '/api/memory' || p === '/api/security/status' || p === '/api/board' || p === '/api/subsidiaries' || p === '/api/projects' || /^\/api\/(subsidiaries\/[^/]+\/projects|projects\/[^/]+(\/report)?)$/.test(p);
  if (isData && method === 'GET') {
    if (state === 'error') return { status: 500, body: { error: 'Fixture error' } };
    if (state === 'loading') return { status: 200, body: {}, delayMs: 600_000 };
  }
  const empty = state === 'empty';

  if (p === '/api/auth/session') return { status: 200, body: {} };
  if (p === '/api/tenant/config') return { status: 200, body: {} };
  if (p === '/api/persona/state') return { status: 200, body: { activePersona: 'WHINK', mambaMode: null, functionalMode: null } };
  if (p === '/api/settings') return { status: 200, body: { profile: { displayName: 'Dev' } } };

  if (p === '/api/contacts') {
    if (method === 'GET') return { status: 200, body: { contacts: empty ? [] : CONTACTS } };
    return { status: 201, body: { contact: { ...(body as object), id: 'new', source: 'manual', createdAt: iso(ctx.now()) } } };
  }
  if (p === '/api/contacts/import') return { status: 200, body: { parsed: 12, imported: 9, duplicates: 3 } };
  const m = p.match(/^\/api\/contacts\/([^/]+)(?:\/(message|call))?$/);
  if (m) {
    if (!m[2]) return { status: 200, body: method === 'DELETE' ? { id: m[1], deleted: true } : { contact: CONTACTS[0] } };
    const c = CONTACTS.find((x) => x.id === m[1]);
    const text = m[2] === 'call' ? String((body as { script?: string })?.script ?? '') : String((body as { body?: string })?.body ?? '');
    const channel = m[2] === 'call' ? 'PHONE_CALL' : String((body as { channel?: string })?.channel ?? 'SMS');
    const created = ctx.now();
    const approval = {
      id: `apr_fixture_${created}`, kind: 'tool_call', tool: m[2] === 'call' ? 'contact_call' : 'contact_message',
      summary: `${m[2] === 'call' ? 'Call' : `Send ${channel} to`} ${c?.name ?? 'contact'}${text ? `: ${text}` : ''}`.slice(0, 300),
      params: { contactId: m[1], contactName: c?.name, channel, to: c?.phone ?? c?.email, [m[2] === 'call' ? 'script' : 'body']: text },
      contentHash: 'fixture', permissionClass: 'C', createdAt: iso(created), expiresAt: iso(created + 30_000),
    };
    return { status: 202, body: { approvalId: approval.id, approval, casl: m[1] === 'c1' ? 'review_consent' : 'prior_relationship', status: 'AWAITING_APPROVAL' } };
  }
  const d = p.match(/^\/api\/approvals\/([^/]+)\/decision$/);
  if (d) {
    const approve = (body as { decision?: string })?.decision === 'approve';
    return approve
      ? { status: 200, body: { id: d[1], status: 'FAILED', result: { success: false, error: 'not sent: not_configured' } } }
      : { status: 200, body: { id: d[1], status: 'DENIED', result: null } };
  }
  if (p === '/api/approvals') {
    const t = ctx.now();
    return { status: 200, body: { approvals: empty ? [] : [{
      id: 'apr_fixture_today', kind: 'tool_call', tool: 'contact_message', summary: 'Send SMS to Avery Fixture: See you at 3.',
      params: { to: '+14035550101', body: 'See you at 3.' }, contentHash: 'fixture', permissionClass: 'C', protected: true, category: 'money', createdAt: iso(t), expiresAt: iso(t + 30_000),
    }] } };
  }
  if (p === '/api/security/status') {
    const now = ctx.now();
    return { status: 200, body: {
      generatedAt: iso(now),
      headers: { enforcedByProxy: ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy'], hstsActive: false, csp: { nonceBasedScripts: true, frameAncestorsNone: true, objectSrcNone: true } },
      pendingClassCApprovals: empty ? 0 : 1,
      securityEvents: {
        last24h: { total: empty ? 0 : 3, injectionBlocks: empty ? 0 : 1, hashLockFailures: empty ? 0 : 1, crossTenantAttempts: 0, other: empty ? 0 : 1 },
        last7d: { total: empty ? 0 : 7, injectionBlocks: empty ? 0 : 3, hashLockFailures: empty ? 0 : 1, crossTenantAttempts: 0, other: empty ? 0 : 3 },
      },
      dependencyAudit: { status: 'ok', ranAt: iso(now - 86_400_000), vulnerabilities: { critical: 0, high: 0, moderate: 2, low: 5 } },
      secretsScan: { status: 'clean', ranAt: iso(now - 86_400_000), findings: 0, envFiles: 1, envFilesIgnoredByGit: true },
      githubSettings: 'not_verifiable_from_code',
    } };
  }
  if (p === '/api/subsidiaries') return { status: 200, body: subsidiaryRows(empty) };
  const sp = p.match(/^\/api\/subsidiaries\/([^/]+)\/projects$/);
  if (sp) return { status: 200, body: { subsidiary: { id: sp[1], name: SUB_NAMES[sp[1]] ?? sp[1] }, projects: empty ? [] : FX_PROJECTS.filter((x) => x.subsidiary === sp[1]).map(card) } };
  if (p === '/api/projects') {
    if (method === 'GET') return { status: 200, body: empty ? [] : FX_PROJECTS.map(card) };
    const b = (body ?? {}) as { name?: string; goal?: string | null; subsidiary?: string };
    if (!b.subsidiary || !(SUB_IDS as readonly string[]).includes(b.subsidiary)) return { status: 400, body: { error: 'Invalid subsidiary' } };
    return { status: 201, body: { id: 'prj_new', name: b.name ?? 'New', goal: b.goal ?? null, status: 'ACTIVE', subsidiary: b.subsidiary, updatedAt: iso(ctx.now()) } };
  }
  const pr = p.match(/^\/api\/projects\/([^/]+)\/report$/);
  if (pr) return { status: 200, body: empty ? { ...report(pr[1]), tasks: [], milestones: [], decisions: [], risks: [], openQuestions: [], members: [] } : report(pr[1]) };
  const pd = p.match(/^\/api\/projects\/([^/]+)$/);
  if (pd) {
    if (method === 'PATCH') return { status: 200, body: { id: pd[1], ...(body as object) } };
    const r = report(pd[1]);
    return { status: 200, body: { ...r.project, tasks: r.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })), risks: r.risks, openQuestions: r.openQuestions, decisions: r.decisions } };
  }
  if (p === '/api/news') return { status: 200, body: empty ? { items: [], fetchedAt: iso(ctx.now()) } : NEWS };
  if (p === '/api/usage') return { status: 200, body: usage(url.searchParams.get('range') ?? '7d') };
  if (p === '/api/connectors') return { status: 200, body: { connectors: empty ? [] : CONNECTORS } };
  if (p === '/api/ledger') return { status: 200, body: empty ? [] : ledger(ctx.now()) };
  if (p === '/api/memory') return { status: 200, body: { type: 'semantic', items: empty ? [] : Array.from({ length: 142 }, (_, i) => ({ id: `m${i}` })), nextCursor: empty ? null : 'next' } };
  if (p === '/api/board') return { status: 200, body: { members: BOARD } };
  return null;
}
