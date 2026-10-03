/**
 * Tool name prefixing. Exposed name is `<platform>__<tool>`. WHINK adds the
 * `openclaw__` prefix, and the FULL name must fit ^[a-z0-9_]{1,64}$.
 * Names are never truncated: too long, invalid or colliding names are rejected.
 */

export const WHINK_PREFIX = 'openclaw__';
export const MAX_FULL_NAME = 64;
const BODY_RE = /^[a-z0-9_]+$/;

export type NameResult = { ok: true; name: string } | { ok: false; reason: string };

/**
 * Lowercasing and hyphen-to-underscore are the only renames, both lossless
 * under collision detection (see assignNames). Anything else is rejected.
 */
export function exposeName(platform: string, tool: string): NameResult {
  const body = tool.toLowerCase().replace(/-/g, '_');
  if (!BODY_RE.test(body)) return { ok: false, reason: 'invalid characters' };
  const full = `${WHINK_PREFIX}${platform}__${body}`;
  if (full.length > MAX_FULL_NAME) return { ok: false, reason: `full name exceeds ${MAX_FULL_NAME} characters` };
  return { ok: true, name: `${platform}__${body}` };
}

export interface NamedTool<T> {
  exposed: string;
  original: string;
  tool: T;
}

/** Assign exposed names for one platform. Collisions reject every colliding tool. */
export function assignNames<T extends { name: string }>(
  platform: string,
  tools: T[],
): { accepted: NamedTool<T>[]; rejected: { tool: string; reason: string }[] } {
  const rejected: { tool: string; reason: string }[] = [];
  const byName = new Map<string, NamedTool<T>[]>();
  for (const tool of tools) {
    const r = exposeName(platform, tool.name);
    if (!r.ok) {
      rejected.push({ tool: tool.name, reason: r.reason });
      continue;
    }
    const list = byName.get(r.name) ?? [];
    list.push({ exposed: r.name, original: tool.name, tool });
    byName.set(r.name, list);
  }
  const accepted: NamedTool<T>[] = [];
  for (const list of byName.values()) {
    if (list.length === 1) accepted.push(list[0]);
    else for (const n of list) rejected.push({ tool: n.original, reason: 'name collision' });
  }
  return { accepted, rejected };
}
