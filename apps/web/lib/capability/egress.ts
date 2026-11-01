/**
 * Egress control for capability providers (E4a-08).
 *
 * Application-level allow-list, defence in depth. It is NOT a replacement for a network-level
 * boundary (plan section 15): on the Mac that is pf or a container, on Linux iptables. This module
 * guarantees that the process never even opens a socket to a destination the Founder did not list.
 *
 * Properties (each has a test):
 *  - deny by default: an empty allow-list allows nothing;
 *  - the connection is made to the IP that was checked (the resolver is pinned), so a second DNS
 *    answer cannot redirect the request (no check-then-use gap);
 *  - redirects are never followed: a 3xx is returned to the caller as-is;
 *  - link-local and cloud-metadata addresses are refused even when a hostname resolves to them;
 *  - default ports are handled (https://a.test and a.test:443 are the same destination);
 *  - IPv6 literals and IPv4 CIDRs work; entries are case-insensitive;
 *  - allow-list entries are validated at registration (no wildcard, no CIDR broader than /8).
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

export class EgressDeniedError extends Error {
  readonly code = 'EGRESS_DENIED';
  constructor(public readonly destination: string, reason = 'not on the allow-list') {
    super(`Egress denied: ${destination} (${reason})`);
    this.name = 'EgressDeniedError';
  }
}

export interface EgressPolicy {
  allowlist: readonly string[];
}

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443', 'ws:': '80', 'wss:': '443' };

/** Lower-case and strip IPv6 brackets. */
function bareHost(h: string): string {
  const x = h.trim().toLowerCase();
  return x.startsWith('[') && x.endsWith(']') ? x.slice(1, -1) : x;
}

function effectivePort(url: URL): string {
  return url.port || DEFAULT_PORTS[url.protocol] || '';
}

interface ParsedEntry {
  kind: 'host' | 'ip' | 'cidr';
  host: string; // hostname, IP, or CIDR base
  port: string | null;
  bits?: number;
}

/** Validate an allow-list entry. Returns an error message, or null when acceptable. */
export function validateAllowlistEntry(raw: string): string | null {
  const e = parseEntry(raw);
  if (typeof e === 'string') return e;
  return null;
}

function parseEntry(raw: string): ParsedEntry | string {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'empty entry';
  if (s.length > 255) return 'entry too long';
  if (s.includes('*') || s.includes('?')) return 'wildcards are not allowed';
  if (/[\s/\\@#]/.test(s.replace(/\/\d{1,3}$/, ''))) return 'entry must be a host, host:port, IP or IPv4 CIDR';
  if (s.includes('://')) return 'give a host, not a URL';

  const cidr = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(s);
  if (cidr) {
    const bits = Number(cidr[2]);
    if (isIP(cidr[1]) !== 4) return 'invalid IPv4 CIDR base';
    if (bits < 8 || bits > 32) return 'CIDR must be between /8 and /32';
    return { kind: 'cidr', host: cidr[1], port: null, bits };
  }

  // [v6]:port, [v6], v6, host:port, host, v4:port
  let host = s;
  let port: string | null = null;
  const v6port = /^\[([0-9a-f:.]+)\]:(\d{1,5})$/.exec(s);
  if (v6port) {
    host = v6port[1];
    port = v6port[2];
  } else if (s.startsWith('[')) {
    if (!s.endsWith(']')) return 'malformed IPv6 entry';
    host = s.slice(1, -1);
  } else if (isIP(s) === 6) {
    host = s;
  } else {
    const m = /^([^:]+):(\d{1,5})$/.exec(s);
    if (m) {
      host = m[1];
      port = m[2];
    } else if (s.includes(':')) {
      return 'malformed entry';
    }
  }
  if (port !== null && (Number(port) < 1 || Number(port) > 65535)) return 'invalid port';
  if (isIP(host)) return { kind: 'ip', host, port };
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(host)) return 'invalid hostname';
  return { kind: 'host', host, port };
}

function parsedAllowlist(list: readonly string[]): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  for (const raw of list) {
    const p = parseEntry(raw);
    if (typeof p !== 'string') out.push(p); // an invalid stored entry matches nothing (fail closed)
  }
  return out;
}

function ipv4ToNum(ip: string): number {
  const p = ip.split('.').map(Number);
  return (((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0);
}

function ipv4InCidr(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1) >>> 0);
  return ((ipv4ToNum(ip) & mask) >>> 0) === ((ipv4ToNum(base) & mask) >>> 0);
}

/** Addresses that are never reachable through the gateway, whatever the allow-list says. */
export function isForbiddenAddress(ip: string): boolean {
  const a = bareHost(ip);
  if (isIP(a) === 4) {
    return ipv4InCidr(a, '169.254.0.0', 16) // link-local, includes cloud metadata 169.254.169.254
      || ipv4InCidr(a, '0.0.0.0', 8)
      || ipv4InCidr(a, '224.0.0.0', 4) // multicast
      || a === '255.255.255.255';
  }
  if (isIP(a) === 6) {
    if (a === '::' || a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb')) return true; // unspecified, fe80::/10
    if (a.startsWith('ff')) return true; // multicast
    if (a === 'fd00:ec2::254') return true; // AWS IPv6 metadata
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a); // IPv4-mapped
    if (mapped) return isForbiddenAddress(mapped[1]);
  }
  return false;
}

/** Does this entry list allow this URL by NAME/IP (before any DNS)? Port and case aware. */
export function hostAllowed(url: URL, allowlist: readonly string[]): boolean {
  const host = bareHost(url.hostname);
  const port = effectivePort(url);
  const ipv = isIP(host);
  for (const e of parsedAllowlist(allowlist)) {
    if (e.port !== null && e.port !== port) continue;
    if (e.kind === 'cidr') {
      if (ipv === 4 && ipv4InCidr(host, e.host, e.bits as number)) return true;
    } else if (e.host === host) {
      return true;
    }
  }
  return false;
}

/** Is this resolved IP covered by an IP or CIDR entry (used when the hostname itself is not listed)? */
function ipAllowed(ip: string, port: string, allowlist: readonly string[]): boolean {
  const a = bareHost(ip);
  for (const e of parsedAllowlist(allowlist)) {
    if (e.port !== null && e.port !== port) continue;
    if (e.kind === 'cidr' && isIP(a) === 4 && ipv4InCidr(a, e.host, e.bits as number)) return true;
    if (e.kind === 'ip' && e.host === a) return true;
  }
  return false;
}

export interface ResolvedTarget {
  address: string;
  family: 4 | 6;
}

export interface EgressDeps {
  resolve?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
}

/**
 * Decide whether the URL may be contacted and return the exact IP to connect to.
 * Rules: scheme http(s) only; every address the name resolves to must be non-forbidden; the
 * destination must be allowed by name (hostname entry) or every resolved address by IP/CIDR entry.
 */
export async function resolveAllowedTarget(url: URL, policy: EgressPolicy, deps: EgressDeps = {}): Promise<ResolvedTarget> {
  const dest = `${url.hostname}:${effectivePort(url)}`;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new EgressDeniedError(dest, `scheme ${url.protocol} not allowed`);
  if (url.username || url.password) throw new EgressDeniedError(dest, 'credentials in URL not allowed');
  const host = bareHost(url.hostname);
  const port = effectivePort(url);

  let addrs: Array<{ address: string; family: number }>;
  if (isIP(host)) {
    addrs = [{ address: host, family: isIP(host) }];
  } else {
    const resolver = deps.resolve ?? ((h: string) => dnsLookup(h, { all: true, verbatim: true }));
    try {
      addrs = await resolver(host);
    } catch {
      throw new EgressDeniedError(dest, 'could not resolve');
    }
  }
  if (addrs.length === 0) throw new EgressDeniedError(dest, 'no addresses');
  for (const a of addrs) {
    if (isForbiddenAddress(a.address)) throw new EgressDeniedError(`${dest}->${a.address}`, 'forbidden address range');
  }

  const byName = hostAllowed(url, policy.allowlist);
  const byIp = addrs.every((a) => ipAllowed(a.address, port, policy.allowlist));
  if (!byName && !byIp) throw new EgressDeniedError(dest);

  const first = addrs[0];
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

/**
 * fetch() replacement for providers. Resolves and checks once, then connects to THAT address.
 * Never follows redirects. Streams the body so MCP's SSE responses work.
 */
export function createAllowlistedFetch(policy: EgressPolicy, deps: EgressDeps = {}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : (input as Request).url);
    const target = await resolveAllowedTarget(url, policy, deps);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.delete('host');
    let body: Buffer | undefined;
    const rawBody = init?.body;
    if (rawBody != null) {
      if (typeof rawBody === 'string') body = Buffer.from(rawBody);
      else if (rawBody instanceof Uint8Array) body = Buffer.from(rawBody);
      else throw new EgressDeniedError(url.hostname, 'unsupported request body type');
      headers.set('content-length', String(body.length));
    }
    const lib = url.protocol === 'https:' ? https : http;
    const signal = init?.signal ?? undefined;

    return new Promise<Response>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'));
      const req = lib.request(
        {
          protocol: url.protocol,
          hostname: bareHost(url.hostname),
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method,
          headers: Object.fromEntries(headers.entries()),
          agent: false,
          servername: isIP(bareHost(url.hostname)) ? undefined : bareHost(url.hostname),
          // Pin the connection to the address that was checked. The system resolver is never asked again.
          // Node may ask for one address or for all of them (autoSelectFamily), so answer in either shape.
          lookup: (_h: string, opts: { all?: boolean } | undefined, cb: (...a: unknown[]) => void) => {
            if (opts && opts.all) cb(null, [{ address: target.address, family: target.family }]);
            else cb(null, target.address, target.family);
          },
        } as http.RequestOptions,
        (res) => {
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) for (const x of v) h.append(k, x);
            else if (v !== undefined) h.set(k, v);
          }
          const status = res.statusCode ?? 502;
          const nullBody = status === 204 || status === 205 || status === 304 || method === 'HEAD';
          const webBody = nullBody ? null : (Readable.toWeb(res) as unknown as ReadableStream);
          if (nullBody) res.resume();
          resolve(new Response(webBody, { status, statusText: res.statusMessage ?? '', headers: h }));
        },
      );
      const onAbort = (): void => { req.destroy(signal?.reason instanceof Error ? signal.reason : new Error('aborted')); };
      signal?.addEventListener('abort', onAbort, { once: true });
      req.on('error', (e) => {
        signal?.removeEventListener('abort', onAbort);
        reject(e);
      });
      req.on('close', () => signal?.removeEventListener('abort', onAbort));
      if (body) req.write(body);
      req.end();
    });
  }) as typeof fetch;
}

export interface UrlScan {
  urls: URL[];
  /** True when the input was too deep or too large to scan completely. Callers must fail closed. */
  incomplete: boolean;
}

const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]{1,15}:\/\/[^\s"'<>`\\)\]}]+/gi;
const MAX_DEPTH = 32;
const MAX_NODES = 20_000;

/**
 * Find every URL an argument object could send somewhere: anywhere inside any string value or key,
 * not only strings that are a URL on their own. Plain text such as "note:todo" or "10:30" is not
 * a URL and is ignored. Too deep or too large means incomplete, and incomplete means deny.
 */
export function scanForUrls(input: unknown): UrlScan {
  const urls: URL[] = [];
  let nodes = 0;
  let incomplete = false;
  const seen = new Set<unknown>();
  const visitString = (s: string): void => {
    for (const m of s.matchAll(URL_IN_TEXT)) {
      try { urls.push(new URL(m[0])); } catch { incomplete = true; /* looked like a URL but did not parse: fail closed */ }
    }
  };
  const walk = (v: unknown, depth: number): void => {
    if (incomplete) return;
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) { incomplete = true; return; }
    if (typeof v === 'string') return visitString(v);
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (v && typeof v === 'object') {
      if (seen.has(v)) return;
      seen.add(v);
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) { visitString(k); walk(x, depth + 1); }
    }
  };
  walk(input, 0);
  return { urls, incomplete };
}
