/**
 * Gateway config parsing. The config file lists upstream MCP servers.
 * Secrets are NEVER literal values here: env and header entries name the
 * environment variable that holds the value (supplied by compose / .env).
 */

import { posix } from 'node:path';
import { isIP } from 'node:net';

export const PLATFORM_RE = /^[a-z0-9]{1,16}$/;
export const ENV_NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const HEADER_NAME_RE = /^[A-Za-z0-9-]{1,64}$/;
const PREFIX_RE = /^(Bearer |Basic |Token )?$/;
const TOOL_NAME_RE = /^[A-Za-z0-9_.-]{1,128}$/;

/** Env names that can never be forwarded to an upstream or used for a header. */
const DENIED_ENV_NAMES = new Set(['OPENCLAW_TOKEN', 'PORT', 'HOST', 'CONFIG_PATH', 'NODE_OPTIONS', 'PATH']);
const DENIED_ENV_PREFIXES = ['LD_', 'OPENCLAW_', 'GATEWAY_'];

/** Known credential shapes. Matched anywhere in a string. */
const TOKEN_PATTERNS: RegExp[] = [
  /ghp_/, /github_pat_/, /gho_/, /ghs_/, /ghu_/, /ghr_/,
  /sk-/, /sk-ant-/, /xox[abpr]-/,
  /AKIA[0-9A-Z]{16}/,
  /AIza[0-9A-Za-z_-]{35}/,
];
/** Long unbroken runs of token characters look like real secrets. */
const HIGH_ENTROPY_RE = /[A-Za-z0-9_-]{32,}/;

function hasKnownToken(v: string): boolean {
  // Anchored to a non-token character before, so "task-x" or "disk-1" do not trip "sk-".
  return TOKEN_PATTERNS.some((r) => new RegExp(`(?<![A-Za-z0-9])(?:${r.source})`).test(v));
}
function looksLikeSecret(v: string): boolean {
  return hasKnownToken(v) || HIGH_ENTROPY_RE.test(v);
}

export interface HeaderSource {
  env: string;
  prefix: string;
}

export interface StdioServerConfig {
  platform: string;
  transport: 'stdio';
  command: string;
  args: string[];
  /** Names of env vars (read from the gateway process env) to pass to the child. */
  envNames: string[];
  /** Optional allow-list of ORIGINAL upstream tool names. When set, only these are exposed. */
  tools?: string[];
  /** True only when parseConfig validated this entry as the built-in social connector. Never read from JSON. */
  builtin?: boolean;
}

export interface HttpServerConfig {
  platform: string;
  transport: 'http';
  url: string;
  /** Header name -> env var that supplies the value. */
  headers: Record<string, HeaderSource>;
  tools?: string[];
}

export type ServerConfig = StdioServerConfig | HttpServerConfig;

export class ConfigError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Env var names are checked WITHOUT echoing them: a pasted secret must never reach a log. */
function checkEnvName(name: unknown, platform: string, where: string): string {
  const prefix = `${platform.toUpperCase()}_`;
  if (
    typeof name !== 'string' ||
    !ENV_NAME_RE.test(name) ||
    hasKnownToken(name) ||
    DENIED_ENV_NAMES.has(name) ||
    DENIED_ENV_PREFIXES.some((p) => name.startsWith(p))
  ) {
    throw new ConfigError(`${where}: invalid env name (must be an UPPER_SNAKE variable NAME, not a value, and not reserved)`);
  }
  if (!name.startsWith(prefix)) {
    throw new ConfigError(`${where}: env name must start with the platform prefix ${prefix}`);
  }
  return name;
}

/** Roots that are baked into the image. /app/config is a host bind mount and is NEVER executable. */
const STDIO_SCRIPT_ROOTS = ['/app/node_modules/', '/app/upstreams/'];
const STDIO_COMMAND_ROOTS = ['/app/upstreams/'];
const FORBIDDEN_ROOTS = ['/app/config/', '/app/config'];

function underRoot(p: string, roots: string[]): boolean {
  if (!p.startsWith('/') || p.includes('\0') || p.includes('\\')) return false;
  const segs = p.split('/').slice(1);
  // No empty segments ("//", trailing slash), no dot segments, no trailing dots/spaces.
  if (segs.some((s) => s === '' || s === '.' || s === '..' || /[. ]$/.test(s))) return false;
  const n = posix.normalize(p);
  if (n !== p) return false;
  if (FORBIDDEN_ROOTS.some((f) => n === f || n.startsWith(f.endsWith('/') ? f : `${f}/`))) return false;
  return roots.some((r) => n.startsWith(r) && n.length > r.length);
}

/** stdio is only for servers baked into the image. No npx, uvx, shells or runtime downloads. */
function checkStdioCommand(command: string, args: string[], where: string): void {
  if (command === 'node') {
    if (args.length === 0 || !underRoot(args[0], STDIO_SCRIPT_ROOTS)) {
      throw new ConfigError(`${where}: stdio "node" needs args[0] to be a clean script path under /app/node_modules/ or /app/upstreams/ (never /app/config/)`);
    }
    return;
  }
  if (underRoot(command, STDIO_COMMAND_ROOTS)) return;
  throw new ConfigError(`${where}: stdio command must be "node" or a clean absolute path under /app/upstreams/ (baked into the image, never /app/config/). Run other servers as separate compose services over http`);
}

function ipv4Parts(h: string): number[] | null {
  if (isIP(h) !== 4) return null;
  return h.split('.').map(Number);
}

/** Always-rejected destinations: link-local and cloud metadata addresses. */
function isForbiddenHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = ipv4Parts(h);
  if (v4) return (v4[0] === 169 && v4[1] === 254) || h === '100.100.100.200';
  if (isIP(h) === 6) {
    if (/^f[cd]/.test(h)) return true; // fc00::/7 unique-local (includes fd00:ec2::254)
    if (/^fe[89ab]/.test(h)) return true; // fe80::/10 link-local
    if (h.includes('a9fe')) return true; // IPv4-mapped 169.254.x.x
    return false;
  }
  return h === 'metadata.google.internal' || h === 'instance-data';
}

function isLoopbackHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = ipv4Parts(h);
  if (v4) return v4[0] === 127;
  return h === 'localhost' || h === '::1';
}

/** A bare compose service name such as "github-mcp": no dots, not an IP. */
function isSingleLabelHost(host: string): boolean {
  return !host.includes('.') && !host.includes(':') && !host.startsWith('[') && /^[a-z0-9-]+$/i.test(host);
}

function parseTools(v: unknown, where: string): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || !v.every((t) => typeof t === 'string' && TOOL_NAME_RE.test(t))) {
    throw new ConfigError(`${where}.tools must be an array of tool names`);
  }
  return v as string[];
}

/** Platforms that receive per-call user credentials. Only the baked-in social connector may use them. */
export const RESERVED_SOCIAL_PLATFORMS: ReadonlySet<string> = new Set(['x', 'instagram', 'tiktok']);
export const SOCIAL_ENTRY = '/app/upstreams/social/dist/index.js';
const RESERVED_ERROR = 'reserved platform name: x, instagram and tiktok must be the built-in social connector (stdio, node, fixed args, no env, no headers)';

function isBuiltinSocial(raw: Record<string, unknown>, platform: string): boolean {
  const args = raw.args;
  const noEnv = raw.env === undefined || (Array.isArray(raw.env) && raw.env.length === 0);
  return (
    raw.transport === 'stdio' &&
    raw.command === 'node' &&
    Array.isArray(args) &&
    args.length === 3 &&
    args[0] === SOCIAL_ENTRY &&
    args[1] === '--platform' &&
    args[2] === platform &&
    noEnv &&
    raw.headers === undefined &&
    raw.url === undefined
  );
}

function parseOne(raw: unknown, index: number): ServerConfig {
  const where = `servers[${index}]`;
  if (!isRecord(raw)) throw new ConfigError(`${where} must be an object`);
  const platform = raw.platform;
  if (typeof platform !== 'string' || !PLATFORM_RE.test(platform)) {
    throw new ConfigError(`${where}.platform must match ${PLATFORM_RE}`);
  }

  const reserved = RESERVED_SOCIAL_PLATFORMS.has(platform);
  if (reserved && !isBuiltinSocial(raw, platform)) throw new ConfigError(`${where}: ${RESERVED_ERROR}`);

  if (raw.transport === 'stdio') {
    if (typeof raw.command !== 'string' || raw.command.length === 0) {
      throw new ConfigError(`${where}.command must be a non-empty string`);
    }
    const args = raw.args ?? [];
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
      throw new ConfigError(`${where}.args must be an array of strings`);
    }
    if (args.some((a) => looksLikeSecret(a))) {
      throw new ConfigError(`${where}.args must not contain secrets; pass credentials through env var NAMES`);
    }
    checkStdioCommand(raw.command, args as string[], where);
    const env = raw.env ?? [];
    if (!Array.isArray(env)) throw new ConfigError(`${where}.env must be an array of environment variable NAMES`);
    const envNames = env.map((e) => checkEnvName(e, platform, `${where}.env`));
    return { platform, transport: 'stdio', command: raw.command, args: args as string[], envNames, tools: parseTools(raw.tools, where), ...(reserved ? { builtin: true } : {}) };
  }

  if (raw.transport === 'http') {
    if (typeof raw.url !== 'string') throw new ConfigError(`${where}.url must be a string`);
    let parsed: URL;
    try {
      parsed = new URL(raw.url);
    } catch {
      throw new ConfigError(`${where}.url is not a valid URL`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ConfigError(`${where}.url must be http or https`);
    }
    if (parsed.username || parsed.password || parsed.search) {
      throw new ConfigError(`${where}.url must not embed credentials or query strings; use headers`);
    }
    if (hasKnownToken(raw.url) || /[A-Za-z0-9_-]{32,}/.test(parsed.pathname.replace(/\//g, ' '))) {
      throw new ConfigError(`${where}.url must not contain secrets`);
    }
    if (isForbiddenHost(parsed.hostname)) {
      throw new ConfigError(`${where}.url points at a link-local or metadata address`);
    }
    const headersRaw = raw.headers ?? {};
    if (!isRecord(headersRaw)) throw new ConfigError(`${where}.headers must be an object`);
    const headers: Record<string, HeaderSource> = {};
    for (const [name, value] of Object.entries(headersRaw)) {
      if (!HEADER_NAME_RE.test(name) || looksLikeSecret(name)) throw new ConfigError(`${where}.headers has an invalid header name`);
      let source: HeaderSource;
      if (typeof value === 'string') {
        source = { env: value, prefix: '' };
      } else if (isRecord(value) && typeof value.env === 'string') {
        const prefix = value.prefix === undefined ? '' : value.prefix;
        if (typeof prefix !== 'string' || !PREFIX_RE.test(prefix)) {
          throw new ConfigError(`${where}.headers prefix must be "Bearer ", "Basic ", "Token " or empty`);
        }
        source = { env: value.env, prefix };
      } else {
        throw new ConfigError(`${where}.headers must map a header name to an env var name or {env, prefix}`);
      }
      checkEnvName(source.env, platform, `${where}.headers`);
      headers[name] = source;
    }
    if (Object.keys(headers).length > 0) {
      const host = parsed.hostname;
      const safeHost = isLoopbackHost(host) || isSingleLabelHost(host);
      if (parsed.protocol !== 'https:' && !safeHost) {
        throw new ConfigError(`${where}.url must be https when credentials are sent (http only for loopback or a compose service name)`);
      }
    }
    return { platform, transport: 'http', url: raw.url, headers, tools: parseTools(raw.tools, where) };
  }

  throw new ConfigError(`${where}.transport must be "stdio" or "http"`);
}

export function parseConfig(text: string): ServerConfig[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ConfigError('config is not valid JSON');
  }
  if (!isRecord(json) || !Array.isArray(json.servers)) {
    throw new ConfigError('config must be an object with a "servers" array');
  }
  const out = json.servers.map(parseOne);
  const seen = new Set<string>();
  for (const s of out) {
    if (seen.has(s.platform)) throw new ConfigError(`duplicate platform "${s.platform}"`);
    seen.add(s.platform);
  }
  return out;
}

/** Resolve header values from the environment. Missing vars are reported by name only. */
export function resolveHeaders(
  headers: Record<string, HeaderSource>,
  env: Record<string, string | undefined>,
): { headers: Record<string, string>; missing: string[] } {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const [name, src] of Object.entries(headers)) {
    const v = env[src.env];
    if (!v) missing.push(src.env);
    else out[name] = `${src.prefix}${v}`;
  }
  return { headers: out, missing };
}
