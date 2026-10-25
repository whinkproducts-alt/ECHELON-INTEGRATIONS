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

export type ProtectedCategory = 'money' | 'proprietary';

export interface ProtectedInput {
  toolName?: string | null;
  capability?: string | null;
  description?: string | null;
  params?: unknown;
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
  'web_search', 'web_fetch',
  'calendar_list', 'calendar_create', 'note_write',
  'board_meeting_create', 'board_minutes_write', 'connector_manage', 'usage_budget_set',
  'contact_create', 'contact_update', 'contact_delete', 'contact_import',
  'project_create', 'project_update',
  'autonomy_change', 'ear',
  'gesture_open_thread', 'gesture_request_brief', 'gesture_propose_task', 'gesture_select', 'gesture_dismiss',
  'gesture_toggle_overview', 'gesture_pause', 'gesture_wake', 'gesture_next', 'gesture_refresh',
]);

// Tokens that make a name a read. Nouns below are not protected when a read token is present.
const READ_TOKENS = new Set([
  'read', 'list', 'get', 'search', 'view', 'show', 'describe', 'count', 'status', 'echo', 'sum',
  'find', 'query', 'lookup', 'fetch', 'check', 'info', 'whoami', 'me', 'ping', 'health',
]);

// Protected whenever present in a name.
const MONEY_VERBS = new Set([
  'transfer', 'transfers', 'pay', 'payout', 'payouts', 'refund', 'refunds', 'withdraw', 'withdrawal', 'withdrawals',
  'wire', 'purchase', 'purchases', 'subscribe', 'checkout', 'buy', 'sell', 'charge', 'deposit', 'remit', 'disburse',
  'reimburse', 'spend', 'topup',
]);
const EGRESS_VERBS = new Set([
  'share', 'publish', 'export', 'upload', 'forward', 'send', 'disclose', 'broadcast', 'tweet', 'reply',
  'follow', 'unfollow', 'dial',
]);

// Protected unless the name is a read.
const MONEY_NOUNS = new Set([
  'payment', 'payments', 'invoice', 'invoices', 'trade', 'trades', 'order', 'orders', 'bank', 'banking', 'crypto',
  'bitcoin', 'btc', 'eth', 'wallet', 'fund', 'funds', 'funding', 'billing', 'subscription', 'subscriptions',
  'stripe', 'paypal', 'plaid', 'venmo',
]);
const EGRESS_NOUNS = new Set([
  'post', 'email', 'mail', 'sms', 'dm', 'message', 'messages', 'whatsapp', 'telegram', 'slack', 'discord',
  'twitter', 'webhook', 'comment', 'notify', 'phone',
]);

// A gateway tool runs on someone else's system: any mutation of it is egress.
const EXTERNAL_MUTATION_TOKENS = new Set([
  'create', 'update', 'write', 'delete', 'remove', 'edit', 'push', 'add', 'set', 'modify', 'put', 'patch',
  'merge', 'close', 'invite', 'grant', 'revoke',
]);

// Description rules: only unambiguous verbs, so ordinary prose does not trip them.
const DESCRIPTION_MONEY = new Set([
  'transfer', 'pay', 'payout', 'refund', 'withdraw', 'wire', 'purchase', 'subscribe', 'checkout', 'buy', 'sell', 'invoice', 'crypto',
]);
const DESCRIPTION_EGRESS = new Set(['send', 'share', 'publish', 'export', 'forward', 'disclose', 'upload', 'email']);

// Parameter key names that mean a payment or an outside recipient. Keys only, never values.
const PARAM_MONEY_KEYS = new Set(['amount', 'iban', 'swift', 'routing_number', 'account_number', 'wallet_address', 'card_number']);
const PARAM_EGRESS_KEYS = new Set(['recipient', 'recipients', 'to_email', 'webhook_url']);

function tokens(s: string): string[] {
  return s
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

function classifyName(name: string): ProtectedClassification | null {
  const key = normName(name);
  if (!key) return null;
  const reg = Object.prototype.hasOwnProperty.call(PROTECTED_REGISTRY, key) ? PROTECTED_REGISTRY[key] : undefined;
  if (reg) return { protected: true, category: reg.category, reason: `${key}: ${reg.reason}` };
  if (LOCAL_SAFE_REGISTRY.has(key)) return null;

  const toks = tokens(name);
  const isGateway = key.startsWith('openclaw__');
  const mv = hit(toks, MONEY_VERBS);
  if (mv) return { protected: true, category: 'money', reason: `${key}: name contains money verb "${mv}"` };
  const ev = hit(toks, EGRESS_VERBS);
  if (ev) return { protected: true, category: 'proprietary', reason: `${key}: name contains disclosure verb "${ev}"` };

  const isRead = toks.some((t) => READ_TOKENS.has(t));
  if (!isRead) {
    const mn = hit(toks, MONEY_NOUNS);
    if (mn) return { protected: true, category: 'money', reason: `${key}: name refers to money ("${mn}") and is not a read` };
    const en = hit(toks, EGRESS_NOUNS);
    if (en) return { protected: true, category: 'proprietary', reason: `${key}: name refers to an outbound channel ("${en}") and is not a read` };
    if (isGateway) {
      const mut = hit(toks, EXTERNAL_MUTATION_TOKENS);
      if (mut) return { protected: true, category: 'proprietary', reason: `${key}: gateway tool mutates an external system ("${mut}")` };
    }
  }
  return null;
}

function classifyDescription(name: string, description: string): ProtectedClassification | null {
  if (tokens(name).some((t) => READ_TOKENS.has(t))) return null;
  const toks = tokens(description);
  const m = hit(toks, DESCRIPTION_MONEY);
  if (m) return { protected: true, category: 'money', reason: `description of ${name} mentions "${m}"` };
  const e = hit(toks, DESCRIPTION_EGRESS);
  if (e) return { protected: true, category: 'proprietary', reason: `description of ${name} mentions "${e}"` };
  return null;
}

function classifyParams(name: string, params: unknown): ProtectedClassification | null {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
  const keys = Object.keys(params as Record<string, unknown>).map((k) => k.toLowerCase());
  const m = keys.find((k) => PARAM_MONEY_KEYS.has(k));
  if (m) return { protected: true, category: 'money', reason: `${name}: parameter "${m}" indicates a payment` };
  const e = keys.find((k) => PARAM_EGRESS_KEYS.has(k));
  if (e) return { protected: true, category: 'proprietary', reason: `${name}: parameter "${e}" indicates an outside recipient` };
  return null;
}

export function classifyProtected(input: ProtectedInput): ProtectedClassification {
  const names = [input.toolName, input.capability].filter((n): n is string => typeof n === 'string' && n.trim() !== '');
  const seen = new Set<string>();
  const unique = names.map((n) => n.trim()).filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));

  for (const n of unique) {
    const r = classifyName(n);
    if (r) return r;
  }
  const unlisted = unique.filter((n) => !LOCAL_SAFE_REGISTRY.has(normName(n)));
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
