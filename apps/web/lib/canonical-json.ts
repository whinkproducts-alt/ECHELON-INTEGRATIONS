import { createHash } from 'crypto';

/** Deterministic JSON: object keys sorted recursively, undefined dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const s = JSON.stringify(value);
    return s === undefined ? 'null' : s;
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
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
