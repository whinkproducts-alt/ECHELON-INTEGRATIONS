// DEV ONLY. Fixture answers for the preview harness. Names and people here are obviously fake.
// This file is only reachable through /dev-preview, which 404s unless NODE_ENV is 'development'.

export type PreviewState = 'ready' | 'loading' | 'error' | 'empty';
export interface Mocked { status: number; body: unknown; delayMs?: number }

const iso = (ms: number) => new Date(ms).toISOString();

const CONTACTS = [
  { id: 'c1', name: 'Avery Fixture', email: 'avery@example.test', phone: '+14035550101', company: 'Fixture Labs', tags: ['client', 'calgary'], source: 'manual', notes: null, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'c2', name: 'Jordan Placeholder', email: 'jordan@example.test', phone: '+14035550102', company: null, tags: ['vendor', 'telegram:123456'], source: 'vcard', notes: null, createdAt: '2026-10-02T10:00:00.000Z' },
  { id: 'c3', name: 'Sam Sample', email: null, phone: '+14035550103', company: 'Sample & Co', tags: [], source: 'vcard', notes: null, createdAt: '2026-10-03T10:00:00.000Z' },
  { id: 'c4', name: 'Riley Mock', email: 'riley@example.test', phone: null, company: 'Mock Industries', tags: ['advisor'], source: 'manual', notes: null, createdAt: '2026-10-04T10:00:00.000Z' },
];

const CONNECTORS = [
  { id: 'gmail', name: 'Mail', version: '1.0.0', publisher: 'fixture', kind: 'oauth', capabilities: ['mail_read'], permissionClass: 'C', description: 'Fixture connector', iconUrl: null, status: 'available', installed: false, enabled: false },
  { id: 'google_calendar', name: 'Calendar', version: '1.0.0', publisher: 'fixture', kind: 'oauth', capabilities: ['calendar_list'], permissionClass: 'A', description: 'Fixture connector', iconUrl: null, status: 'needs_config', installed: false, enabled: false },
  { id: 'ollama', name: 'Local models', version: '1.0.0', publisher: 'fixture', kind: 'native', capabilities: ['chat'], permissionClass: 'A', description: 'Fixture connector', iconUrl: null, status: 'connected', installed: true, enabled: true },
  { id: 'openclaw', name: 'Gateway', version: '1.0.0', publisher: 'fixture', kind: 'mcp', capabilities: ['tools'], permissionClass: 'C', description: 'Fixture connector', iconUrl: null, status: 'connected', installed: true, enabled: true },
];

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

const LEDGER = [
  { id: 'l1', action: 'injection_blocked', status: 'DENIED', inputSummary: 'user message', outputSummary: 'blocked before model', createdAt: '2026-10-25T08:00:00.000Z' },
  { id: 'l2', action: 'tool_executed', status: 'EXECUTED', inputSummary: 'calendar_list', outputSummary: '', createdAt: '2026-10-25T08:05:00.000Z' },
  { id: 'l3', action: 'approval_hash_mismatch', status: 'DENIED', inputSummary: '', outputSummary: 'hash lock', createdAt: '2026-10-25T08:10:00.000Z' },
];

export interface MockCtx { state: PreviewState; now: () => number; counters: { casl: boolean } }

/** Returns null when the URL is not one the harness knows (the caller answers 404). */
export function answer(method: string, url: URL, body: unknown, ctx: MockCtx): Mocked | null {
  const p = url.pathname;
  const { state } = ctx;
  const isData = p === '/api/contacts' || p === '/api/usage' || p === '/api/connectors' || p === '/api/news' || p === '/api/ledger' || p === '/api/approvals' || p === '/api/memory' || p === '/api/security/status' || p === '/api/board';
  if (isData && method === 'GET') {
    if (state === 'error') return { status: 500, body: { error: 'Fixture error' } };
    if (state === 'loading') return { status: 200, body: {}, delayMs: 600_000 };
  }
  const empty = state === 'empty';

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
      params: { to: '+14035550101', body: 'See you at 3.' }, contentHash: 'fixture', permissionClass: 'C', createdAt: iso(t), expiresAt: iso(t + 30_000),
    }] } };
  }
  if (p === '/api/security/status') return { status: 200, body: { securityEvents: { last24h: { total: empty ? 0 : 2 }, last7d: { total: empty ? 0 : 3 } } } };
  if (p === '/api/news') return { status: 200, body: empty ? { items: [], fetchedAt: iso(ctx.now()) } : NEWS };
  if (p === '/api/usage') return { status: 200, body: usage(url.searchParams.get('range') ?? '7d') };
  if (p === '/api/connectors') return { status: 200, body: { connectors: empty ? [] : CONNECTORS } };
  if (p === '/api/ledger') return { status: 200, body: empty ? [] : LEDGER };
  if (p === '/api/memory') return { status: 200, body: { type: 'semantic', items: empty ? [] : Array.from({ length: 37 }, (_, i) => ({ id: `m${i}` })), nextCursor: null } };
  if (p === '/api/board') return { status: 200, body: { members: [] } };
  return null;
}
