/**
 * Plugin manifest schema. Validation only: nothing here executes plugin code or contacts a
 * plugin endpoint. A manifest is a request, not a grant:
 * - permissionClass in a manifest is advisory; WHINK treats every third-party tool as Class C
 *   unless a WHINK-side allow-list says otherwise (see effectiveClass).
 * - endpoints must be https (or loopback http). No stdio commands are accepted in a manifest.
 * - licence must be MIT, Apache-2.0, BSD-*, ISC or 0BSD (CLAUDE.md rule 7).
 * - tool descriptions are untrusted: stripped, scanned for injection, capped.
 */
import { z } from 'zod';
import { scanForInjectionPatterns, stripFakeUntrustedTags } from '@/lib/content-isolation';
import { classifyProtected, protectedCapabilities } from '@/lib/protected-actions';

export const ALLOWED_LICENSE_RE = /^(MIT|Apache-2\.0|ISC|0BSD|BSD-[0-9]-Clause(-[A-Za-z]+)*)$/;
export const TOOL_DESCRIPTION_CAP = 300;
export const MAX_TOOLS = 50;

export function isAllowedLicense(spdx: string): boolean {
  return ALLOWED_LICENSE_RE.test(spdx.trim());
}

function endpointOk(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.username || u.password) return false;
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

const ToolSchema = z.object({
  name: z.string().regex(/^[a-z0-9_]{1,40}$/),
  description: z.string().max(5000),
});

export const ConnectorManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/, 'id must be 1-40 chars of a-z, 0-9, underscore'),
  name: z.string().trim().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, 'version must be semver'),
  publisher: z.string().trim().min(1).max(80),
  license: z.string().refine(isAllowedLicense, 'licence must be MIT, Apache-2.0, BSD-*, ISC or 0BSD'),
  kind: z.enum(['mcp', 'oauth', 'webhook', 'native']),
  capabilities: z.array(z.string().regex(/^[a-z0-9_]{1,40}$/)).max(50).default([]),
  permissionClass: z.enum(['A', 'B', 'C']).default('C'),
  endpoints: z.array(z.string().max(300).refine(endpointOk, 'endpoint must be https (or loopback http) with no credentials')).max(10).default([]),
  scopes: z.array(z.string().min(1).max(120)).max(30).default([]),
  iconUrl: z.string().max(300).refine((v) => /^\/[A-Za-z0-9/_.-]+$/.test(v) || endpointOk(v), 'iconUrl must be a same-origin path or https URL').optional(),
  description: z.string().max(500).optional(),
  tools: z.array(ToolSchema).max(MAX_TOOLS).optional(),
}).strict();

export type ConnectorManifest = z.infer<typeof ConnectorManifestSchema>;

export interface SanitisedTool { name: string; description: string }

export interface ManifestValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifest?: Omit<ConnectorManifest, 'tools'> & { tools?: SanitisedTool[] };
  /** Always 'C' for third-party manifests: WHINK assigns classes, not the plugin. */
  effectiveClass: 'C';
}

export function sanitiseToolDescription(d: string): { text: string; suspicious: boolean } {
  const stripped = stripFakeUntrustedTags(d).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ').trim();
  const scan = scanForInjectionPatterns(stripped);
  return { text: stripped.substring(0, TOOL_DESCRIPTION_CAP), suspicious: scan.suspicious };
}

/**
 * A manifest whose capabilities or tools are protected (money movement, disclosure of
 * proprietary information) may not declare a class below C. Returns one error per offender.
 */
export function protectedClassErrors(m: { permissionClass?: string; capabilities?: readonly string[]; tools?: ReadonlyArray<{ name: string; description?: string }> }): string[] {
  if (!m.permissionClass || m.permissionClass === 'C') return [];
  const errors: string[] = [];
  for (const p of protectedCapabilities(m.capabilities ?? [])) {
    errors.push(`capability ${p.capability} is a protected ${p.category} action and cannot be declared below Class C`);
  }
  for (const t of m.tools ?? []) {
    const r = classifyProtected({ toolName: t.name, capability: t.name, description: t.description });
    if (r.protected) errors.push(`tool ${t.name} is a protected ${r.category} action and cannot be declared below Class C`);
  }
  return errors;
}

export function validateManifest(raw: unknown): ManifestValidation {
  const parsed = ConnectorManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || 'manifest'}: ${i.message}`),
      warnings: [],
      effectiveClass: 'C',
    };
  }
  const warnings: string[] = [];
  const errors: string[] = [];
  const m = parsed.data;
  errors.push(...protectedClassErrors(m));
  if (m.permissionClass !== 'C') warnings.push(`permissionClass ${m.permissionClass} is advisory only; WHINK treats this connector as Class C.`);
  let tools: SanitisedTool[] | undefined;
  if (m.tools) {
    tools = [];
    for (const t of m.tools) {
      const s = sanitiseToolDescription(t.description);
      if (s.suspicious) errors.push(`tool ${t.name}: description contains instruction-like text and was rejected`);
      else tools.push({ name: t.name, description: s.text });
      if (t.description.length > TOOL_DESCRIPTION_CAP) warnings.push(`tool ${t.name}: description truncated to ${TOOL_DESCRIPTION_CAP} characters`);
    }
  }
  if (errors.length) return { valid: false, errors, warnings, effectiveClass: 'C' };
  return { valid: true, errors: [], warnings, manifest: { ...m, tools }, effectiveClass: 'C' };
}

/** Third-party connectors are always Class C. Only WHINK's own config may lower a class. */
export function effectiveClass(_manifest: { permissionClass?: string }): 'C' {
  return 'C';
}
