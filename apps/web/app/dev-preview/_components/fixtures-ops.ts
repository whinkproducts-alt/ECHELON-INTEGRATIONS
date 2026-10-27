// DEV ONLY. Fixture answers for the operations screens: approvals history, ledger explorer, system health,
// meeting quick start. Shapes follow lib/ledger-search.ts, lib/system-health.ts and the quick-start route.
// Everything here is obviously fake. Preview states: ready, loading, error, empty (for the meeting screen,
// ready = a room is configured, empty = no meeting server configured).

interface Ctx { state: 'ready' | 'loading' | 'error' | 'empty'; now: () => number }
interface Mocked { status: number; body: unknown; delayMs?: number }

const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;

// ---- approvals history ----
type Row = { kind: string; tool: string | null; summary: string; params: unknown; status: string; protectedCategory: 'money' | 'proprietary' | null; ageMin: number; result?: unknown };
const APPROVALS: Row[] = [
  { kind: 'tool_call', tool: 'payment_send', summary: 'Pay fixture invoice INV-0001 (made-up amount)', params: { to: 'Fixture Supplier Ltd', amount: '100.00', currency: 'CAD', apiKey: '[redacted]' }, status: 'EXECUTED', protectedCategory: 'money', ageMin: 12, result: { success: true, data: 'sent (fixture)' } },
  { kind: 'tool_call', tool: 'email_send', summary: 'Email the fixture board pack to a fixture address', params: { to: 'someone@example.test', subject: 'Board pack', attachments: ['board-pack.pdf'] }, status: 'DENIED', protectedCategory: 'proprietary', ageMin: 55 },
  { kind: 'scheduled_post', tool: 'gateway_social_post', summary: 'Post a fixture announcement to X at 09:00', params: { text: 'Fixture announcement. Nothing real here.' }, status: 'EXPIRED', protectedCategory: null, ageMin: 190 },
  { kind: 'ear', tool: null, summary: 'Outside request: fixture calendar invite', params: { action: 'calendar_invite', with: 'fixture@example.test' }, status: 'FAILED', protectedCategory: null, ageMin: 420, result: { success: false, error: 'not sent: not_configured' } },
  { kind: 'autonomy_change', tool: 'autonomy_set', summary: 'Raise autonomy level to 2', params: { level: 2 }, status: 'APPROVED', protectedCategory: null, ageMin: 900 },
];
const approvalItem = (r: Row, i: number, now: number) => ({
  id: `apr_fixture_${i + 1}`, kind: r.kind, tool: r.tool, summary: r.summary, params: r.params, permissionClass: 'C',
  protected: r.protectedCategory !== null, category: r.protectedCategory, status: r.status, persona: 'WHINK',
  correlationId: `corr_fixture_${i + 1}`, createdAt: iso(now - r.ageMin * MIN), expiresAt: iso(now - r.ageMin * MIN + 30_000),
  decidedAt: ['DENIED', 'EXECUTED', 'APPROVED', 'FAILED'].includes(r.status) ? iso(now - r.ageMin * MIN + 9_000) : null,
  expiredAt: r.status === 'EXPIRED' ? iso(now - r.ageMin * MIN + 30_000) : null,
  executedAt: ['EXECUTED', 'FAILED'].includes(r.status) ? iso(now - r.ageMin * MIN + 10_000) : null,
  decidedBy: ['DENIED', 'EXECUTED', 'APPROVED', 'FAILED'].includes(r.status) ? 'user_fixture' : null,
  outcome: { status: r.status, result: r.result ?? null },
});

// ---- ledger ----
const LEDGER: Array<[string, string, string | null, string, string, string, string, number, string | null]> = [
  // action, status, tool, persona, initiator, input, output, ageMin, category
  ['injection_blocked', 'DENIED', null, 'WHINK', 'system', 'user message', 'blocked before model: planted instruction', 3, null],
  ['tool_executed', 'EXECUTED', 'calendar_list', 'WHINK', 'user', 'calendar_list', 'ok', 8, null],
  ['approval_requested', 'AWAITING_APPROVAL', 'payment_send', 'WHINK', 'system', 'payment_send', 'waiting for approval', 12, 'money'],
  ['approval_hash_mismatch', 'DENIED', 'email_send', 'WHINK', 'system', 'email_send', 'hash lock: parameters changed after approval', 40, 'proprietary'],
  ['memory_auto_written', 'EXECUTED', null, 'WHINK', 'system', 'semantic', 'prefers morning meetings', 70, null],
  ['tool_executed', 'EXECUTED', 'document_search', 'MAMBA', 'user', 'document_search', '3 chunks', 95, null],
  ['action_blocked', 'DENIED', 'social_post', 'WHINK', 'user', 'social_post', 'Class C needs approval at every level', 140, null],
  ['tool_failed', 'FAILED', 'gateway_list_issues', 'WHINK', 'user', 'list issues', 'gateway unavailable', 190, null],
];
const ledgerItem = (r: (typeof LEDGER)[number], i: number, now: number) => ({
  id: `led_fixture_${String(i + 1).padStart(4, '0')}_abcdef`, createdAt: iso(now - r[7] * MIN), action: r[0], tool: r[2], status: r[1], persona: r[3],
  mambaMode: r[3] === 'MAMBA' ? 'OBSIDIAN' : null, initiator: r[4], permissionClass: r[0] === 'approval_requested' ? 'C' : 'A',
  confirmationMethod: null, inputSummary: r[5], outputSummary: r[6], correlationId: `corr_fixture_${(i % 4) + 1}`, latencyMs: 20 + i * 7,
  protected: r[8] !== null, category: r[8], approvalId: r[8] ? 'apr_fixture_1' : null,
});

function health(now: number) {
  return {
    scope: 'operator', checkedAt: iso(now), uptimeSec: 93_784, version: 'fixture-0000000',
    checks: {
      database: { status: 'ok', latencyMs: 4 },
      modelProviders: { status: 'ok', latencyMs: 0, providers: ['fixture-cloud-a'] },
      localModel: { status: 'down', latencyMs: 1500, detail: 'timeout' },
      gateway: { status: 'not_configured', latencyMs: 0 },
      recall: { status: 'unknown', latencyMs: 31, detail: 'no workspaces returned (unreachable or empty)' },
      worker: { status: 'degraded', latencyMs: 6, lastHeartbeatAgeSec: 240 },
      migrations: { status: 'ok', latencyMs: 9, applied: 42, onDisk: 42, pending: 0 },
    },
  };
}

/** Returns null when the URL is not one of the operations endpoints. */
export function answerOps(method: string, url: URL, _body: unknown, ctx: Ctx): Mocked | null {
  void _body;
  const p = url.pathname;
  const now = ctx.now();
  const isGet = method === 'GET';
  const watched = p === '/api/approvals/history' || /^\/api\/approvals\/history\/[^/]+$/.test(p) || p === '/api/ledger/search' || p === '/api/ledger/search/facets' || p === '/api/system/health';
  if (watched && isGet) {
    if (ctx.state === 'error') return { status: 500, body: { error: 'Fixture error' } };
    if (ctx.state === 'loading') return { status: 200, body: {}, delayMs: 600_000 };
  }
  const empty = ctx.state === 'empty';

  const detail = p.match(/^\/api\/approvals\/history\/([^/]+)$/);
  if (detail && isGet) {
    const idx = Number(detail[1].replace('apr_fixture_', '')) - 1;
    const row = APPROVALS[idx];
    if (!row) return { status: 404, body: { error: 'Not found' } };
    const a = approvalItem(row, idx, now);
    const t0 = Date.parse(a.createdAt);
    const ledger = [
      { id: 'led_t1', createdAt: iso(t0), action: 'approval_requested', tool: row.tool, status: 'AWAITING_APPROVAL', persona: 'WHINK', initiator: 'system', inputSummary: null, outputSummary: 'waiting for approval', correlationId: a.correlationId },
      ...(a.decidedAt ? [{ id: 'led_t2', createdAt: a.decidedAt, action: row.status === 'DENIED' ? 'approval_denied' : 'approval_approved', tool: row.tool, status: row.status === 'DENIED' ? 'DENIED' : 'APPROVED', persona: 'WHINK', initiator: 'user', inputSummary: null, outputSummary: null, correlationId: a.correlationId }] : []),
      ...(a.executedAt ? [{ id: 'led_t3', createdAt: a.executedAt, action: 'tool_executed', tool: row.tool, status: row.status === 'FAILED' ? 'FAILED' : 'EXECUTED', persona: 'WHINK', initiator: 'system', inputSummary: null, outputSummary: row.status === 'FAILED' ? 'not sent: not_configured' : 'ok', correlationId: a.correlationId }] : []),
      ...(row.status === 'EXPIRED' ? [{ id: 'led_t4', createdAt: a.expiredAt!, action: 'approval_expired', tool: row.tool, status: 'EXPIRED', persona: 'WHINK', initiator: 'system', inputSummary: null, outputSummary: 'nothing ran', correlationId: a.correlationId }] : []),
    ];
    return { status: 200, body: { approval: a, ledger } };
  }
  if (p === '/api/approvals/history' && isGet) {
    const f = url.searchParams;
    if (empty) return { status: 200, body: { items: [], nextCursor: null } };
    let items = APPROVALS.map((r, i) => approvalItem(r, i, now));
    if (f.get('status')) items = items.filter((x) => x.status === f.get('status'));
    if (f.get('category')) items = items.filter((x) => x.category === f.get('category'));
    if (f.get('kind')) items = items.filter((x) => x.kind === f.get('kind'));
    // Two pages so "Load more" can be exercised: the first call returns three rows and a cursor.
    if (!f.get('status') && !f.get('category') && !f.get('kind')) {
      return f.get('cursor') ? { status: 200, body: { items: items.slice(3), nextCursor: null } } : { status: 200, body: { items: items.slice(0, 3), nextCursor: 'fixture-page-2' } };
    }
    return { status: 200, body: { items, nextCursor: null } };
  }
  if (p === '/api/ledger/search/facets' && isGet) {
    return { status: 200, body: {
      windowDays: 90,
      actions: empty ? [] : [{ value: 'tool_executed', count: 120 }, { value: 'injection_blocked', count: 3 }, { value: 'approval_requested', count: 14 }, { value: 'memory_auto_written', count: 41 }],
      statuses: empty ? [] : [{ value: 'EXECUTED', count: 160 }, { value: 'DENIED', count: 9 }, { value: 'AWAITING_APPROVAL', count: 1 }, { value: 'FAILED', count: 2 }],
      personas: empty ? [] : [{ value: 'WHINK', count: 150 }, { value: 'MAMBA', count: 22 }, { value: null, count: 4 }],
      initiators: empty ? [] : [{ value: 'user', count: 100 }, { value: 'system', count: 76 }],
      categories: [{ value: 'money', count: empty ? 0 : 5 }, { value: 'proprietary', count: empty ? 0 : 7 }],
    } };
  }
  if (p === '/api/ledger/search' && isGet) {
    if (empty) return { status: 200, body: { items: [], nextCursor: null } };
    const f = url.searchParams;
    let items = LEDGER.map((r, i) => ledgerItem(r, i, now));
    if (f.get('action')) items = items.filter((x) => x.action === f.get('action'));
    if (f.get('status')) items = items.filter((x) => x.status === f.get('status'));
    if (f.get('persona')) items = items.filter((x) => x.persona === f.get('persona'));
    if (f.get('initiator')) items = items.filter((x) => x.initiator === f.get('initiator'));
    if (f.get('category')) items = items.filter((x) => x.category === f.get('category'));
    if (f.get('correlationId')) items = items.filter((x) => x.correlationId === f.get('correlationId'));
    if (f.get('q')) { const q = f.get('q')!.toLowerCase(); items = items.filter((x) => x.action.includes(q) || (x.inputSummary ?? '').toLowerCase().includes(q) || (x.outputSummary ?? '').toLowerCase().includes(q)); }
    const unfiltered = [...f.keys()].every((k) => k === 'limit' || k === 'cursor');
    if (unfiltered) return f.get('cursor') ? { status: 200, body: { items: items.slice(5), nextCursor: null } } : { status: 200, body: { items: items.slice(0, 5), nextCursor: 'fixture-page-2' } };
    return { status: 200, body: { items, nextCursor: null } };
  }
  if (p === '/api/system/health' && isGet) return { status: 200, body: empty ? { scope: 'user', checkedAt: iso(now), checks: { database: { status: 'ok' } } } : health(now) };
  if (p === '/api/meetings/quick-start' && method === 'POST') {
    if (ctx.state === 'error') return { status: 500, body: { error: 'Fixture error' } };
    const email = (_body as { assistantEmail?: string } | null)?.assistantEmail ?? 'host@example.test';
    return empty
      ? { status: 200, body: { meetingUrl: null, fallback: { email, message: 'Meeting room not configured yet. (fixture)' } } }
      : { status: 200, body: { meetingUrl: 'https://meet.example.test/0123456789abcdef0123456789abcdef01234567', fallback: { email, message: 'Room ready. (fixture)' } } };
  }
  return null;
}
