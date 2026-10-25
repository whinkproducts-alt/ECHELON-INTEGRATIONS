/**
 * Connector registry. The catalog (config/connectors.catalog.json) is data only. Status is
 * computed here from real evidence, never read from the catalog:
 *   connected    evidence exists (env vars present, a database row, a service that answers)
 *   needs_config WHINK can use it but required configuration is missing
 *   available    can be installed, nothing connected yet
 *   unavailable  no WHINK adapter exists yet
 * Every query is scoped by userId.
 */
import { z } from 'zod';
import catalogJson from '@/config/connectors.catalog.json';
import { prisma } from '@/lib/db';
import { ConnectorManifestSchema, protectedClassErrors, type ConnectorManifest } from '@/lib/connectors/manifest';
import { isGatewayConfigured, listOpenClawTools } from '@/lib/openclaw-client';
import { isAnythingLlmConfigured } from '@/lib/anythingllm-client';
import { hasActiveConnection } from '@/lib/social/connections';
import { ollamaReachable } from '@/lib/offline';
import { logger } from '@/lib/logger';

export type ConnectorStatus = 'available' | 'connected' | 'needs_config' | 'unavailable';

const EvidenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('env'), vars: z.array(z.string()).min(1) }),
  z.object({ type: z.literal('social'), platform: z.enum(['x', 'instagram', 'tiktok']) }),
  z.object({ type: z.literal('gateway_platform'), platform: z.string().regex(/^[a-z0-9]{1,16}$/) }),
  z.object({ type: z.literal('gateway') }),
  z.object({ type: z.literal('ollama') }),
  z.object({ type: z.literal('anythingllm') }),
]);
export type Evidence = z.infer<typeof EvidenceSchema>;

// The catalog adds `evidence` to the manifest shape. Parsed once; a bad catalog fails loudly in tests.
const CatalogEntrySchema = ConnectorManifestSchema.extend({ evidence: EvidenceSchema });
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

let cached: CatalogEntry[] | null = null;
export function loadCatalog(raw?: unknown): CatalogEntry[] {
  if (raw === undefined && cached) return cached;
  const src = raw === undefined ? catalogJson : raw;
  const list = (src as { connectors?: unknown }).connectors;
  const entries = z.array(CatalogEntrySchema).parse(list);
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) throw new Error(`duplicate connector id ${e.id}`);
    ids.add(e.id);
    const bad = protectedClassErrors(e);
    if (bad.length) throw new Error(`connector ${e.id}: ${bad.join('; ')}`);
  }
  if (raw === undefined) cached = entries;
  return entries;
}

export interface EvidenceContext {
  /** Operator account. Non-owners never learn which operator credentials or services are configured. */
  isOwner: boolean;
  env: Record<string, string | undefined>;
  userId: string;
  hasSocial: (platform: 'x' | 'instagram' | 'tiktok') => Promise<boolean>;
  hasWorkspace: () => Promise<boolean>;
  gatewayToolNames: () => Promise<string[] | null>; // null = gateway down or disabled
  ollamaUp: () => Promise<boolean>;
  anythingLlmConfigured: () => boolean;
  gatewayConfigured: () => boolean;
}

export async function computeStatus(entry: CatalogEntry, ctx: EvidenceContext): Promise<ConnectorStatus> {
  const ev = entry.evidence;
  if (!ctx.isOwner) {
    // Operator-wide evidence (env credentials, the gateway, Ollama, recall config) is not
    // visible to ordinary accounts: no presence signal at all.
    switch (ev.type) {
      case 'none': return 'unavailable';
      case 'env':
      case 'gateway':
      case 'gateway_platform':
      case 'ollama':
        return 'needs_config';
      case 'social': return (await ctx.hasSocial(ev.platform)) ? 'connected' : 'available';
      case 'anythingllm': return (await ctx.hasWorkspace()) ? 'connected' : 'available';
    }
  }
  switch (ev.type) {
    case 'none':
      return 'unavailable';
    case 'env':
      return ev.vars.every((v) => (ctx.env[v] ?? '').trim() !== '') ? 'connected' : 'needs_config';
    case 'social':
      return (await ctx.hasSocial(ev.platform)) ? 'connected' : 'available';
    case 'gateway_platform': {
      if (!ctx.gatewayConfigured()) return 'needs_config';
      const names = await ctx.gatewayToolNames();
      if (names === null) return 'needs_config';
      return names.some((n) => n.toLowerCase().startsWith(`${ev.platform}__`) || n.toLowerCase().startsWith(`openclaw__${ev.platform}__`)) ? 'connected' : 'available';
    }
    case 'gateway': {
      if (!ctx.gatewayConfigured()) return 'needs_config';
      return (await ctx.gatewayToolNames()) === null ? 'needs_config' : 'connected';
    }
    case 'ollama':
      return (await ctx.ollamaUp()) ? 'connected' : 'needs_config';
    case 'anythingllm':
      if (!ctx.anythingLlmConfigured()) return 'needs_config';
      return (await ctx.hasWorkspace()) ? 'connected' : 'available';
  }
}

function liveContext(userId: string, owner: boolean): EvidenceContext {
  let toolNames: Promise<string[] | null> | null = null;
  return {
    isOwner: owner,
    env: process.env,
    userId,
    hasSocial: (p) => hasActiveConnection(userId, p),
    hasWorkspace: async () => Boolean(await prisma.documentWorkspace.findFirst({ where: { userId }, select: { id: true } })),
    gatewayToolNames: () => {
      toolNames ??= listOpenClawTools().then((t) => t.map((x) => x.name)).catch((e) => { logger.warn('connector status: gateway unreachable', { error: (e as Error)?.message }); return null; });
      return toolNames;
    },
    ollamaUp: () => ollamaReachable(),
    anythingLlmConfigured: isAnythingLlmConfigured,
    gatewayConfigured: isGatewayConfigured,
  };
}

export interface ConnectorView {
  id: string;
  name: string;
  version: string;
  publisher: string;
  kind: ConnectorManifest['kind'];
  capabilities: string[];
  permissionClass: 'C' | 'A' | 'B';
  description: string | null;
  iconUrl: string | null;
  status: ConnectorStatus;
  installed: boolean;
  enabled: boolean;
}

export async function listConnectors(
  userId: string,
  opts: { owner?: boolean; ctx?: EvidenceContext } = {},
): Promise<ConnectorView[]> {
  const ctx = opts.ctx ?? liveContext(userId, opts.owner === true);
  if (!userId) throw new Error('connectors: userId is required');
  const catalog = loadCatalog();
  const installs = await prisma.connectorInstall.findMany({ where: { userId }, select: { connectorId: true, enabled: true } });
  const byId = new Map(installs.map((i) => [i.connectorId, i]));
  return Promise.all(
    catalog.map(async (e) => {
      const inst = byId.get(e.id);
      let status: ConnectorStatus;
      try { status = await computeStatus(e, ctx); } catch { status = 'needs_config'; }
      return {
        id: e.id, name: e.name, version: e.version, publisher: e.publisher, kind: e.kind,
        capabilities: e.capabilities, permissionClass: e.permissionClass, description: e.description ?? null,
        iconUrl: e.iconUrl ?? null, status, installed: Boolean(inst), enabled: inst?.enabled ?? false,
      };
    }),
  );
}

export function findCatalogEntry(id: string): CatalogEntry | null {
  return loadCatalog().find((e) => e.id === id) ?? null;
}

/** Install and uninstall: Class B capability 'connector_manage', always through the permission engine. */
export async function installConnector(userId: string, connectorId: string) {
  const { runGuarded } = await import('@/lib/guarded-action');
  const entry = findCatalogEntry(connectorId);
  if (!entry) return null;
  if (entry.evidence.type === 'none') return 'unavailable' as const;
  return runGuarded(
    { userId, capability: 'connector_manage', permissionClass: 'B', action: 'connector_installed', summary: `connectorId=${connectorId}` },
    async () => {
      await prisma.connectorInstall.upsert({
        where: { userId_connectorId: { userId, connectorId } },
        create: { userId, connectorId, enabled: true },
        update: { enabled: true },
      });
      return { id: connectorId, installed: true };
    },
  );
}

export async function uninstallConnector(userId: string, connectorId: string) {
  const { runGuarded } = await import('@/lib/guarded-action');
  if (!findCatalogEntry(connectorId)) return null;
  return runGuarded(
    { userId, capability: 'connector_manage', permissionClass: 'B', action: 'connector_uninstalled', summary: `connectorId=${connectorId}` },
    async () => {
      const res = await prisma.connectorInstall.deleteMany({ where: { userId, connectorId } });
      return { id: connectorId, installed: false, removed: res.count };
    },
  );
}
