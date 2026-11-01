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
 *  - link-local and cloud-metadata addresses are refused even when a hostname resolves to them, in every
 *    IPv6 spelling that embeds an IPv4 address (mapped, compatible, NAT64, SIIT, 6to4);
 *  - a hostname entry never reaches loopback or a private range (10/8, 172.16/12, 192.168/16, 100.64/10,
 *    fc00::/7); the Founder must list such an IP or CIDR explicitly. 'localhost' may reach loopback only;
 *  - response bodies are counted as they arrive and cut off at a byte limit (default 1 MiB);
 *  - default ports are handled (https://a.test and a.test:443 are the same destination);
 *  - IPv6 literals and IPv4 CIDRs work; entries are case-insensitive;
 *  - allow-list entries are validated at registration (no wildcard, no CIDR broader than /8).
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable, Transform, pipeline } from 'node:stream';

export class EgressDeniedError extends Error {
  readonly code = 'EGRESS_DENIED';
  constructor(public readonly destination: string, reason = 'not on the allow-list') {
    super(`Egress denied: ${destination} (${reason})`);
    this.name = 'EgressDeniedError';
  }
}

/** A provider response went past the byte limit. Fixed text; the provider's content is never in it. */
export class ResponseTooLargeError extends Error {
  readonly code = 'RESPONSE_TOO_LARGE';
  constructor(limit: number) {
    super(`Provider response too large (limit ${limit} bytes)`);
    this.name = 'ResponseTooLargeError';
  }
}

export interface EgressPolicy {
  allowlist: readonly string[];
  /** Hard cap on response bytes, counted as they arrive. Default 1 MiB. The connection is destroyed past it. */
  maxResponseBytes?: number;
}

export const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

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

/** Parse an IPv6 literal (no brackets, no zone) to 16 bytes, or null if it is not valid. */
export function ipv6ToBytes(addr: string): number[] | null {
  if (isIP(addr) !== 6) return null;
  let a = addr.toLowerCase();
  const pct = a.indexOf('%');
  if (pct >= 0) a = a.slice(0, pct);
  // An embedded dotted IPv4 tail becomes two hextets.
  const dotted = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (dotted) {
    const o = dotted.slice(2).map(Number);
    if (o.some((n) => n > 255)) return null;
    a = `${dotted[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = a.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    out.push(n >> 8, n & 255);
  }
  return out;
}

/** The IPv4 address an IPv6 address stands for, when it embeds one in a translation or compatibility form. */
function embeddedIpv4(b: number[]): string | null {
  const zero = (from: number, to: number): boolean => b.slice(from, to).every((x) => x === 0);
  const v4 = (o: number): string => `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`;
  if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff) return v4(12); // ::ffff:0:0/96 IPv4-mapped
  if (zero(0, 8) && b[8] === 0xff && b[9] === 0xff && b[10] === 0 && b[11] === 0) return v4(12); // ::ffff:0:0:0/96 SIIT
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zero(4, 12)) return v4(12); // 64:ff9b::/96 NAT64
  if (zero(0, 12) && !zero(12, 16) && !(zero(12, 15) && b[15] === 1)) return v4(12); // ::/96 IPv4-compatible (not :: or ::1)
  if (b[0] === 0x20 && b[1] === 0x02) return v4(2); // 2002::/16 6to4
  return null;
}

/** Addresses that are never reachable through the gateway, whatever the allow-list says. */
export function isForbiddenAddress(ip: string): boolean {
  const a = bareHost(ip);
  if (isIP(a) === 4) {
    return ipv4InCidr(a, '169.254.0.0', 16) // link-local, includes cloud metadata 169.254.169.254
      || ipv4InCidr(a, '0.0.0.0', 8)
      || ipv4InCidr(a, '224.0.0.0', 4) // multicast
      || a === '255.255.255.255'
      || a === '100.100.100.200'; // Alibaba Cloud metadata
  }
  if (isIP(a) === 6) {
    const b = ipv6ToBytes(a);
    if (!b) return true; // unparseable: fail closed
    if (b.every((x) => x === 0)) return true; // ::
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
    if (b[0] === 0xff) return true; // multicast
    if (b[0] === 0xfd && b[1] === 0x00 && b[2] === 0x0e && b[3] === 0xc2) return true; // fd00:ec2::/32 AWS IPv6 metadata
    const v4 = embeddedIpv4(b);
    if (v4) return isForbiddenAddress(v4);
  }
  return false;
}

/** Loopback or private space: reachable only when the Founder lists that IP or CIDR explicitly. */
export function isInternalAddress(ip: string): boolean {
  const a = bareHost(ip);
  if (isIP(a) === 4) {
    return ipv4InCidr(a, '127.0.0.0', 8) || ipv4InCidr(a, '10.0.0.0', 8) || ipv4InCidr(a, '172.16.0.0', 12)
      || ipv4InCidr(a, '192.168.0.0', 16) || ipv4InCidr(a, '100.64.0.0', 10);
  }
  if (isIP(a) === 6) {
    const b = ipv6ToBytes(a);
    if (!b) return true;
    if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true; // ::1
    if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique local
    const v4 = embeddedIpv4(b);
    if (v4) return isInternalAddress(v4);
  }
  return false;
}

function isLoopbackAddress(ip: string): boolean {
  const a = bareHost(ip);
  if (isIP(a) === 4) return ipv4InCidr(a, '127.0.0.0', 8);
  const b = ipv6ToBytes(a);
  return Boolean(b && b.slice(0, 15).every((x) => x === 0) && b[15] === 1);
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
  // A name is the provider operator's to point anywhere with DNS. It must not lead into loopback or private
  // space unless the Founder listed that IP or CIDR. ('localhost' may reach loopback addresses only.)
  if (!byIp && !isIP(host)) {
    const localhostOk = host === 'localhost' && addrs.every((a) => isLoopbackAddress(a.address));
    if (!localhostOk && addrs.some((a) => isInternalAddress(a.address))) {
      throw new EgressDeniedError(`${dest}`, 'name resolves to a loopback or private address; list that IP or CIDR explicitly');
    }
  }

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
    const maxBytes = policy.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
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
          const declared = Number(res.headers['content-length']);
          if (Number.isFinite(declared) && declared > maxBytes) {
            res.destroy();
            req.destroy();
            return reject(new ResponseTooLargeError(maxBytes));
          }
          let webBody: ReadableStream | null = null;
          if (!nullBody) {
            // Count bytes as they arrive and cut the connection at the limit: nothing downstream can buffer more.
            let seen = 0;
            const counter = new Transform({
              transform(chunk: Buffer, _enc, cb) {
                seen += chunk.length;
                if (seen > maxBytes) return cb(new ResponseTooLargeError(maxBytes));
                cb(null, chunk);
              },
            });
            pipeline(res, counter, () => { /* errors surface on the web stream */ });
            webBody = Readable.toWeb(counter) as unknown as ReadableStream;
          } else {
            res.resume();
          }
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

// Any scheme followed by two or more slashes or backslashes; or http(s)/ws(s)/ftp followed by ':' and anything
// (the URL parser reads 'https:host', 'http:\\\\host' as http://host); or a protocol-relative '//host.tld'.
const URL_IN_TEXT = /\b(?:[a-z][a-z0-9+.-]{1,15}:[\\/]{2,}|(?:https?|wss?|ftp):[\\/]*)[^\s"'<>`)\]}]+/gi;
const PROTOCOL_RELATIVE = /(?:^|[\s"'(=,;])(\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'<>`)\]}]*)/gi;
const MAX_DEPTH = 32;
const MAX_NODES = 20_000;

/**
 * Find every URL an argument object could send somewhere: anywhere inside any string value or key,
 * not only strings that are a URL on their own. Plain text such as "note:todo" or "10:30" is not
 * a URL and is ignored. Too deep or too large means incomplete, and incomplete means deny.
 *
 * Limits (documented, not hidden): this is a secondary gate. A bare host with no scheme ("evil.example/x"),
 * double percent-encoding and other encodings are not found; the real boundary is the provider allow-list
 * plus a network-level control.
 */
export function scanForUrls(input: unknown): UrlScan {
  const urls: URL[] = [];
  let nodes = 0;
  let incomplete = false;
  const seen = new Set<unknown>();
  const scan = (s: string): void => {
    for (const m of s.matchAll(URL_IN_TEXT)) {
      try { urls.push(new URL(m[0])); } catch { incomplete = true; /* looked like a URL but did not parse: fail closed */ }
    }
    for (const m of s.matchAll(PROTOCOL_RELATIVE)) {
      try { urls.push(new URL(`https:${m[1]}`)); } catch { incomplete = true; }
    }
  };
  const visitString = (s: string): void => {
    scan(s);
    // One round of percent-decoding, so https%3A%2F%2Fhost is seen. A malformed sequence (a bare '%') is just text.
    if (s.includes('%')) {
      try { const d = decodeURIComponent(s); if (d !== s) scan(d); } catch { /* not valid percent-encoding */ }
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
