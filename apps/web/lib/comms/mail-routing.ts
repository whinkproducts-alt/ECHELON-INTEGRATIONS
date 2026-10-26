import raw from '@/config/mail-routing.json';

/**
 * Staff mail routing. Every address on a listed domain is delivered to the single catch-all
 * mailbox from config (Victor's instruction). The routed address always comes from the config
 * file, never from user input. This module only chooses the delivery address; whether a send
 * may happen at all is still decided by the permission engine (sending stays Class C /
 * protected).
 */
export interface MailRoutingConfig {
  catchAllTo: string;
  domains: string[];
  preserveOriginal: boolean;
}

export interface RoutedRecipient {
  /** False when the address is malformed; nothing may be sent to it. */
  valid: boolean;
  /** Where the message is actually delivered. Empty string when invalid. */
  deliverTo: string;
  /** The address the sender asked for (trimmed, lowercased). Shown in the UI and X-Original-To. */
  original: string;
  routed: boolean;
}

/** ASCII only on purpose: unicode lookalike domains and display-name tricks are rejected. */
const ADDRESS_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function isValidAddress(a: string): boolean {
  return a.length <= 254 && ADDRESS_RE.test(a) && !a.includes('..');
}

/**
 * The catch-all is the OWNER's inbox, so it applies only when the sending account is an owner
 * (`senderIsOwner`). Mail from any other account goes to the real address unchanged; otherwise
 * one tenant's staff mail would land with the owner.
 */
export function routeRecipient(
  address: string,
  opts: { senderIsOwner: boolean },
  config: MailRoutingConfig = raw,
): RoutedRecipient {
  const original = typeof address === 'string' ? address.trim().toLowerCase() : '';
  if (!isValidAddress(original)) return { valid: false, deliverTo: '', original, routed: false };
  const catchAll = config.catchAllTo.trim().toLowerCase();
  const domains = config.domains.map((d) => d.trim().toLowerCase());
  // Fail closed on a broken config: never route to an invalid catch-all.
  if (!isValidAddress(catchAll)) return { valid: true, deliverTo: original, original, routed: false };
  // The ADDRESS_RE guarantees exactly one '@', so the domain is everything after it. Exact match
  // only: no suffix or subdomain matching.
  const domain = original.slice(original.indexOf('@') + 1);
  if (opts.senderIsOwner && domains.includes(domain)) return { valid: true, deliverTo: catchAll, original, routed: true };
  return { valid: true, deliverTo: original, original, routed: false };
}

/** Headers to add to an outgoing message so the original staff address is not lost. */
export function routingHeaders(r: RoutedRecipient, config: MailRoutingConfig = raw): Record<string, string> {
  return config.preserveOriginal && r.valid ? { 'X-Original-To': r.original } : {};
}
