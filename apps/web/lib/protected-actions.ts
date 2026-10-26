/**
 * Protected actions: the single source of truth.
 *
 * Owner rule: anything that moves, commits or authorises money, or that sends, shares,
 * publishes, exports or otherwise discloses secrets or proprietary information to a
 * destination outside the user's own account, needs the owner's explicit approval.
 *
 * A protected action is ALWAYS Class C. Nothing lowers it: not autonomy level, a delegation
 * row, the active persona, a gateway, a plugin manifest or a WHINK-side allow-list.
 * Sending the user's data to the configured model providers as part of normal chat is not
 * covered here; any other egress is.
 *
 * Classification is deterministic and fails closed. Order:
 *   1. explicit protected registry (named tools and capabilities that exist today)
 *   2. explicit local-safe registry (named local tools that keep data inside the account)
 *   3. keyword rules on the name, then the description, then parameter key names
 * Pure module: no I/O, safe to import anywhere (including config loaders).
 */
import webFetchHosts from '@/config/web-fetch-hosts.json';
import { SECRET_RULES } from '@/lib/secret-scan';

export type ProtectedCategory = 'money' | 'proprietary';

export interface ProtectedInput {
  toolName?: string | null;
  capability?: string | null;
  description?: string | null;
  params?: unknown;
  /** True when external content (web, documents, tool results) has entered this turn or conversation. */
  tainted?: boolean;
}

export interface ProtectedClassification {
  protected: boolean;
  category?: ProtectedCategory;
  reason: string;
}

/** Explicit registry. Data, not logic: add a name here to protect it. */
export const PROTECTED_REGISTRY: Readonly<Record<string, { category: ProtectedCategory; reason: string }>> = Object.freeze({
  // Outbound messages and calls
  contact_message: { category: 'proprietary', reason: 'sends a message to a person outside the account' },
  contact_call: { category: 'proprietary', reason: 'places a call to a person outside the account' },
  sms_briefing_send: { category: 'proprietary', reason: 'sends account data to a phone through an SMS provider' },
  // Social and gateway writes (openclaw__<platform>__post, reply, send_dm, follow, publish_*) are caught by the
  // keyword rules below, so no gateway tool name is hardcoded here.
  social_schedule_post: { category: 'proprietary', reason: 'schedules a public post' },
  change_request_submit: { category: 'proprietary', reason: 'sends a change specification (source code and strategy) to GitHub, outside the account' },
  // Connector capabilities that send or write outside the account
  email_send: { category: 'proprietary', reason: 'sends email' },
  chat_send: { category: 'proprietary', reason: 'sends chat messages' },
  sms_send: { category: 'proprietary', reason: 'sends SMS' },
  voice_call: { category: 'proprietary', reason: 'places phone calls' },
  telegram_send: { category: 'proprietary', reason: 'sends Telegram messages' },
  whatsapp_send: { category: 'proprietary', reason: 'sends WhatsApp messages' },
  social_post: { category: 'proprietary', reason: 'publishes social posts' },
  issue_write: { category: 'proprietary', reason: 'writes to an external issue tracker' },
  issues_write: { category: 'proprietary', reason: 'writes to an external issue tracker' },
  notes_write: { category: 'proprietary', reason: 'writes to an external notes service' },
  calendar_write: { category: 'proprietary', reason: 'writes to an external calendar' },
  // Money
  payments_write: { category: 'money', reason: 'creates or changes payments' },
  stripe_refund: { category: 'money', reason: 'refunds money' },
  stripe_charge: { category: 'money', reason: 'charges money' },
  stripe_payout: { category: 'money', reason: 'pays out money' },
  transfer_funds: { category: 'money', reason: 'transfers money' },
  trade_execute: { category: 'money', reason: 'executes a trade' },
  trade_place_order: { category: 'money', reason: 'places a trade order' },
});

/**
 * Local tools and capabilities that keep data inside the user's own account. Explicit so the
 * keyword rules cannot misread them (document_upload goes to the user's own recall workspace,
 * not to a third party). Everything else is judged by the keyword rules.
 */
export const LOCAL_SAFE_REGISTRY: ReadonlySet<string> = new Set([
  'memory_write', 'memory_read', 'memory_correct', 'memory_auto_write', 'memory_auto_write_sensitive',
  'entity_create', 'entity_update', 'task_create',
  'document_search', 'document_upload', 'document_delete',
  'calendar_list', 'calendar_create', 'note_write',
  'board_meeting_create', 'board_minutes_write', 'connector_manage', 'usage_budget_set',
  'contact_create', 'contact_update', 'contact_delete', 'contact_import',
  'worker_memory_write', 'recommendation_write',
  'project_create', 'project_update', 'skill_memory_write', 'skill_intake',
  'contract_create', 'contract_update', 'contract_delete',
  'change_request_create', 'change_request_update', 'change_request_refine', 'change_request_status',
  'meeting_room_create',
  'swarm_plan', 'swarm_start', 'swarm_cancel', 'swarm_memory_write',
  'autonomy_change', 'ear',
  'gesture_open_thread', 'gesture_request_brief', 'gesture_propose_task', 'gesture_select', 'gesture_dismiss',
  'gesture_toggle_overview', 'gesture_pause', 'gesture_wake', 'gesture_next', 'gesture_refresh',
]);


const READ_TOKENS = new Set([
  'read', 'list', 'get', 'search', 'view', 'show', 'describe', 'count', 'status', 'echo', 'sum',
  'find', 'query', 'lookup', 'fetch', 'check', 'info', 'whoami', 'me', 'ping', 'health',
]);
// May follow an action word in a name and keep it a status/lookup: send_status_check, share_link_get.
const READ_SUFFIX = new Set([...READ_TOKENS, 'link', 'history', 'details', 'summary', 'state', 'result', 'results', 'id', 'url']);
const FINAL_READ = new Set(['get', 'list', 'status', 'check', 'read', 'search', 'fetch', 'view', 'count', 'info', 'history', 'summary', 'details']);
const JOINERS = new Set(['and', 'then', 'plus']);

// Action words. Any of these in a name makes it protected unless it is the single action word of a
// pure status/lookup name (see exemptByReadSuffix).
const MONEY_VERBS = new Set([
  'transfer', 'transfers', 'pay', 'pays', 'paying', 'paid', 'payout', 'payouts', 'payroll', 'refund', 'refunds',
  'withdraw', 'withdrawal', 'withdrawals', 'wire', 'purchase', 'purchases', 'subscribe', 'checkout', 'buy', 'sell',
  'charge', 'capture', 'settle', 'deposit', 'remit', 'disburse', 'reimburse', 'spend', 'topup', 'donate', 'tip',
  'mint', 'swap', 'stake', 'bridge',
]);
const EGRESS_VERBS = new Set([
  'share', 'shares', 'publish', 'export', 'exports', 'upload', 'uploads', 'forward', 'forwards', 'send', 'sends',
  'disclose', 'broadcast', 'tweet', 'retweet', 'quote', 'reply', 'follow', 'unfollow', 'dial', 'sync', 'replicate',
  'backup', 'mirror', 'copy', 'move', 'attach', 'deliver', 'emails', 'posts', 'execute', 'fill', 'submit', 'confirm',
  'place', 'commit', 'release', 'authorize', 'authorise',
]);
// A gateway tool runs on someone else's system: any mutation of it is egress.
const EXTERNAL_MUTATION_TOKENS = new Set([
  'create', 'update', 'write', 'delete', 'remove', 'edit', 'push', 'add', 'set', 'modify', 'put', 'patch',
  'merge', 'close', 'invite', 'grant', 'revoke',
]);
// Adjacent-word phrases that are egress on their own.
const EGRESS_PHRASES: Array<[string, string]> = [['grant', 'access'], ['make', 'public'], ['http', 'request']];

// Nouns: protected unless the name is a read with no action word (list_invoices, get_order_status).
const MONEY_NOUNS = new Set([
  'payment', 'payments', 'invoice', 'invoices', 'trade', 'trades', 'order', 'orders', 'bank', 'banking', 'crypto',
  'bitcoin', 'btc', 'eth', 'wallet', 'fund', 'funds', 'funding', 'billing', 'subscription', 'subscriptions',
  'stripe', 'paypal', 'plaid', 'venmo',
]);
const EGRESS_NOUNS = new Set([
  'post', 'email', 'mail', 'sms', 'dm', 'message', 'messages', 'whatsapp', 'telegram', 'slack', 'discord',
  'twitter', 'webhook', 'comment', 'notify', 'phone',
]);

// Description rules: only unambiguous verbs, so ordinary prose does not trip them.
const DESCRIPTION_MONEY = new Set([
  'transfer', 'pay', 'payout', 'refund', 'withdraw', 'wire', 'purchase', 'subscribe', 'checkout', 'buy', 'sell', 'invoice', 'crypto',
]);
const DESCRIPTION_EGRESS = new Set(['send', 'share', 'publish', 'export', 'forward', 'disclose', 'upload', 'email']);

// Parameter key names that mean a payment or an outside recipient. Keys only, never values.
const PARAM_MONEY_KEYS = new Set(['amount', 'iban', 'swift', 'routing_number', 'account_number', 'wallet_address', 'card_number']);
const PARAM_EGRESS_KEYS = new Set([
  'recipient', 'recipients', 'to', 'to_email', 'to_address', 'email', 'emails', 'cc', 'bcc', 'url', 'webhook_url', 'destination',
]);

function tokens(s: string): string[] {
  return s
    .normalize('NFKC')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function normName(s: string): string {
  return s.trim().toLowerCase();
}

function hit(toks: string[], set: ReadonlySet<string>): string | undefined {
  return toks.find((t) => set.has(t));
}

const hasMoneyToken = (toks: string[]) => toks.some((t) => MONEY_VERBS.has(t) || MONEY_NOUNS.has(t));
const prot = (category: ProtectedCategory, reason: string): ProtectedClassification => ({ protected: true, category, reason });

function classifyName(name: string): ProtectedClassification | null {
  const key = normName(name);
  if (!key) return null;
  // Fail closed: a name outside printable ASCII cannot be classified (homoglyphs, hidden characters).
  if (/[^\x20-\x7E]/.test(name)) return prot('proprietary', `${JSON.stringify(key).slice(0, 60)}: non-ASCII tool name cannot be classified`);
  const reg = Object.prototype.hasOwnProperty.call(PROTECTED_REGISTRY, key) ? PROTECTED_REGISTRY[key] : undefined;
  if (reg) return prot(reg.category, `${key}: ${reg.reason}`);
  if (LOCAL_SAFE_REGISTRY.has(key)) return null;

  const toks = tokens(name);
  const isGateway = key.startsWith('openclaw__');
  const verbs: number[] = [];
  toks.forEach((t, i) => {
    if (MONEY_VERBS.has(t) || EGRESS_VERBS.has(t) || (isGateway && EXTERNAL_MUTATION_TOKENS.has(t))) verbs.push(i);
  });
  const phrase = EGRESS_PHRASES.find(([a, b]) => toks.some((t, i) => t === a && toks[i + 1] === b));
  const joined = toks.some((t) => JOINERS.has(t));
  const moneyish = hasMoneyToken(toks);
  const category: ProtectedCategory = moneyish ? 'money' : 'proprietary';

  if (phrase) return prot('proprietary', `${key}: contains "${phrase.join(' ')}"`);
  if (verbs.length > 0) {
    // The one allowed shape: a single action word followed only by read words ending in a read verb.
    const i = verbs[0];
    const exempt = verbs.length === 1 && !joined && i < toks.length - 1
      && toks.slice(i + 1).every((t) => READ_SUFFIX.has(t)) && FINAL_READ.has(toks[toks.length - 1]);
    if (!exempt) return prot(category, `${key}: name contains action word "${toks[i]}"`);
    return null;
  }
  const noun = toks.find((t) => MONEY_NOUNS.has(t) || EGRESS_NOUNS.has(t));
  if (noun) {
    const isRead = toks.some((t) => READ_TOKENS.has(t)) && !joined;
    if (!isRead) return prot(category, `${key}: name refers to "${noun}" and is not a plain read`);
  }
  return null;
}

function classifyDescription(name: string, description: string): ProtectedClassification | null {
  if (tokens(name).some((t) => READ_TOKENS.has(t))) return null;
  const toks = tokens(description);
  const m = hit(toks, DESCRIPTION_MONEY);
  if (m) return prot('money', `description of ${name} mentions "${m}"`);
  const e = hit(toks, DESCRIPTION_EGRESS);
  if (e) return prot('proprietary', `description of ${name} mentions "${e}"`);
  return null;
}

function paramRecords(params: unknown): Array<Record<string, unknown>> {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return [];
  const top = params as Record<string, unknown>;
  const out = [top];
  // Gateway approvals store {args, defHash}.
  if (top.args && typeof top.args === 'object' && !Array.isArray(top.args)) out.push(top.args as Record<string, unknown>);
  return out;
}

function classifyParams(name: string, params: unknown): ProtectedClassification | null {
  for (const rec of paramRecords(params)) {
    const keys = Object.keys(rec).map((k) => k.normalize('NFKC').toLowerCase());
    const m = keys.find((k) => PARAM_MONEY_KEYS.has(k));
    if (m) return prot('money', `${name}: parameter "${m}" indicates a payment`);
    const e = keys.find((k) => PARAM_EGRESS_KEYS.has(k));
    if (e) return prot('proprietary', `${name}: parameter "${e}" indicates an outside recipient or destination`);
  }
  return null;
}

/** Hosts (lowercase) where a web_fetch URL may carry a query string. Data: config/web-fetch-hosts.json. */
export function webFetchHostAllowed(host: string): boolean {
  const list = Array.isArray(webFetchHosts) ? (webFetchHosts as unknown[]) : [];
  return list.some((h) => typeof h === 'string' && h.trim().toLowerCase() === host.toLowerCase());
}

function classifyWebFetch(input: ProtectedInput): ProtectedClassification {
  if (input.tainted) return prot('proprietary', 'web_fetch after external content entered the turn: the URL may carry stolen data');
  const raw = paramRecords(input.params)[0]?.url;
  if (typeof raw !== 'string' || !raw.trim()) return prot('proprietary', 'web_fetch without a readable URL');
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return prot('proprietary', 'web_fetch URL could not be parsed'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return prot('proprietary', 'web_fetch URL is not http or https');
  if (u.username || u.password) return prot('proprietary', 'web_fetch URL carries user info');
  if (u.port) return prot('proprietary', 'web_fetch URL uses a non-default port');
  const allowedHost = webFetchHostAllowed(u.hostname);
  if (!allowedHost && (raw.includes('?') || raw.includes('#') || u.search || u.hash)) {
    return prot('proprietary', 'web_fetch URL carries a query string or fragment on a host that is not allow-listed');
  }
  return { protected: false, reason: 'plain web_fetch on an untainted turn' };
}

const MAX_SEARCH_QUERY = 300;
function classifyWebSearch(input: ProtectedInput): ProtectedClassification {
  const q = paramRecords(input.params)[0]?.query;
  if (typeof q !== 'string') return { protected: false, reason: 'web_search without a query' };
  if (q.length > MAX_SEARCH_QUERY) return prot('proprietary', `web_search query is longer than ${MAX_SEARCH_QUERY} characters`);
  const rule = SECRET_RULES.find((r) => r.re.test(q));
  if (rule) return prot('proprietary', `web_search query contains a secret (${rule.name})`);
  return { protected: false, reason: 'plain web_search' };
}

export function classifyProtected(input: ProtectedInput): ProtectedClassification {
  const names = [input.toolName, input.capability].filter((n): n is string => typeof n === 'string' && n.trim() !== '');
  const seen = new Set<string>();
  const unique = names.map((n) => n.trim()).filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));

  for (const n of unique) {
    if (!/[^\x20-\x7E]/.test(n)) {
      const k = normName(n);
      if (k === 'web_fetch') { const r = classifyWebFetch(input); if (r.protected) return r; continue; }
      if (k === 'web_search') { const r = classifyWebSearch(input); if (r.protected) return r; continue; }
    }
    const r = classifyName(n);
    if (r) return r;
  }
  const unlisted = unique.filter((n) => !LOCAL_SAFE_REGISTRY.has(normName(n)) && !['web_fetch', 'web_search'].includes(normName(n)));
  const label = unlisted[0];
  if (label) {
    if (typeof input.description === 'string' && input.description) {
      const r = classifyDescription(label, input.description);
      if (r) return r;
    }
    const r = classifyParams(label, input.params);
    if (r) return r;
  }
  return { protected: false, reason: 'not a protected action' };
}

/** True when a connector or plugin capability list contains a protected capability. */
export function protectedCapabilities(capabilities: readonly string[]): Array<{ capability: string } & ProtectedClassification> {
  const out: Array<{ capability: string } & ProtectedClassification> = [];
  for (const capability of capabilities) {
    const r = classifyProtected({ toolName: capability, capability });
    if (r.protected) out.push({ capability, ...r });
  }
  return out;
}

/** Ledger and approval metadata for a protected action, or an empty object when not protected. */
export function protectedMeta(input: ProtectedInput): { protected: true; category: ProtectedCategory } | Record<string, never> {
  const r = classifyProtected(input);
  return r.protected && r.category ? { protected: true, category: r.category } : {};
}
