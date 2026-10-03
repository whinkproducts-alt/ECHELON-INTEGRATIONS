/**
 * Gateway config parsing. The config file lists upstream MCP servers.
 * Secrets are NEVER literal values here: env and header entries name the
 * environment variable that holds the value (supplied by compose / .env).
 */

export const PLATFORM_RE = /^[a-z0-9]{1,16}$/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const HEADER_NAME_RE = /^[A-Za-z0-9-]{1,64}$/;

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
}

export interface HttpServerConfig {
  platform: string;
  transport: 'http';
  url: string;
  /** Header name -> env var that supplies the value. */
  headers: Record<string, HeaderSource>;
}

export type ServerConfig = StdioServerConfig | HttpServerConfig;

export class ConfigError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseOne(raw: unknown, index: number): ServerConfig {
  const where = `servers[${index}]`;
  if (!isRecord(raw)) throw new ConfigError(`${where} must be an object`);
  const platform = raw.platform;
  if (typeof platform !== 'string' || !PLATFORM_RE.test(platform)) {
    throw new ConfigError(`${where}.platform must match ${PLATFORM_RE}`);
  }

  if (raw.transport === 'stdio') {
    if (typeof raw.command !== 'string' || raw.command.length === 0) {
      throw new ConfigError(`${where}.command must be a non-empty string`);
    }
    const args = raw.args ?? [];
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
      throw new ConfigError(`${where}.args must be an array of strings`);
    }
    const env = raw.env ?? [];
    if (!Array.isArray(env) || !env.every((e) => typeof e === 'string' && ENV_NAME_RE.test(e))) {
      throw new ConfigError(`${where}.env must be an array of environment variable NAMES, not values`);
    }
    return { platform, transport: 'stdio', command: raw.command, args: args as string[], envNames: env as string[] };
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
    const headersRaw = raw.headers ?? {};
    if (!isRecord(headersRaw)) throw new ConfigError(`${where}.headers must be an object`);
    const headers: Record<string, HeaderSource> = {};
    for (const [name, value] of Object.entries(headersRaw)) {
      if (!HEADER_NAME_RE.test(name)) throw new ConfigError(`${where}.headers has an invalid header name`);
      let source: HeaderSource;
      if (typeof value === 'string') {
        source = { env: value, prefix: '' };
      } else if (isRecord(value) && typeof value.env === 'string') {
        source = { env: value.env, prefix: typeof value.prefix === 'string' ? value.prefix : '' };
      } else {
        throw new ConfigError(`${where}.headers.${name} must be an env var name or {env, prefix}`);
      }
      if (!ENV_NAME_RE.test(source.env)) {
        throw new ConfigError(`${where}.headers.${name} must reference an environment variable NAME, not a value`);
      }
      headers[name] = source;
    }
    return { platform, transport: 'http', url: raw.url, headers };
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
