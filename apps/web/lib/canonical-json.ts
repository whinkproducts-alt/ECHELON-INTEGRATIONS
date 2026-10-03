import { createHash } from 'crypto';

/**
 * Deterministic JSON: object keys sorted recursively, undefined object properties dropped.
 * Strict: throws on anything JSON cannot represent exactly (Dates, Maps, Sets, class
 * instances, functions, symbols, bigint, undefined in arrays or at the top level, NaN/Infinity),
 * so two different inputs can never silently hash alike.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number');
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError('canonicalJson: only plain objects are allowed');
  }
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(obj).sort()) {
    if (obj[k] === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  }
  return `{${parts.join(',')}}`;
}

export interface HashableApproval {
  kind: string;
  tool: string | null;
  params: unknown;
}

/** sha256 hex of the canonical JSON of {kind, tool, params}. */
export function approvalContentHash(a: HashableApproval): string {
  return createHash('sha256')
    .update(canonicalJson({ kind: a.kind, tool: a.tool ?? null, params: a.params ?? null }))
    .digest('hex');
}
