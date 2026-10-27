/**
 * Computed security facts for GET /api/security/status. Facts only: booleans, counts,
 * timestamps. Never returns a secret, a path to a secret, or ledger content. Everything
 * per-user is scoped by userId.
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { countSecurityEvents } from '@/lib/ledger';
import { buildCsp, isHttpsDeployment } from '@/lib/csp';
import { securityHeaders } from '@/lib/security-headers';

export interface EventSummary { injectionBlocks: number; hashLockFailures: number; crossTenantAttempts: number; other: number; total: number }

export function categoriseEvents(counts: Record<string, number>): EventSummary {
  const s: EventSummary = { injectionBlocks: 0, hashLockFailures: 0, crossTenantAttempts: 0, other: 0, total: 0 };
  for (const [name, n] of Object.entries(counts)) {
    s.total += n;
    if (/injection/i.test(name)) s.injectionBlocks += n;
    else if (name === 'approval_hash_mismatch' || name === 'tool_definition_changed') s.hashLockFailures += n;
    else if (name === 'approval_not_found') s.crossTenantAttempts += n;
    else s.other += n;
  }
  return s;
}

function readJson(file: string): { data: unknown; mtime: Date } | null {
  try {
    const st = fs.statSync(file);
    return { data: JSON.parse(fs.readFileSync(file, 'utf8')), mtime: st.mtime };
  } catch {
    return null;
  }
}

export function readAuditSummary(file: string) {
  const r = readJson(file);
  if (!r) return { status: 'never_run' as const };
  const v = (r.data as { metadata?: { vulnerabilities?: Record<string, number> } })?.metadata?.vulnerabilities;
  if (!v) return { status: 'unreadable' as const, ranAt: r.mtime.toISOString() };
  const pick = (k: string) => (typeof v[k] === 'number' ? v[k] : 0);
  return {
    status: 'ok' as const,
    ranAt: r.mtime.toISOString(),
    vulnerabilities: { critical: pick('critical'), high: pick('high'), moderate: pick('moderate'), low: pick('low') },
  };
}

export function readSecretsScanSummary(file: string) {
  const r = readJson(file);
  if (!r) return { status: 'never_run' as const };
  const d = r.data as { ranAt?: string; findings?: number; envFiles?: number };
  const bad = (d.findings ?? 0) + (d.envFiles ?? 0);
  return { status: bad === 0 ? ('clean' as const) : ('findings' as const), ranAt: d.ranAt ?? r.mtime.toISOString(), findings: d.findings ?? 0, envFiles: d.envFiles ?? 0 };
}

/** True when a .gitignore at or above cwd ignores .env files. */
export function envIgnored(startDir: string): boolean {
  let dir = startDir;
  for (let i = 0; i < 4; i++) {
    try {
      const text = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
      if (/^\.env(\.\*|\*)?\s*$/m.test(text)) return true;
    } catch { /* keep walking up */ }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return false;
}

export async function securityStatus(userId: string, now = new Date(), cwd = process.cwd()) {
  if (!userId) throw new Error('security: userId is required');
  const https = isHttpsDeployment(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL);
  const headers = securityHeaders({ https });
  const csp = buildCsp({ nonce: 'status-check', isDev: false, upgradeInsecure: https });
  const cspChecks = {
    nonceBasedScripts: /script-src [^;]*'nonce-/.test(csp) && !/script-src [^;]*'unsafe-inline'/.test(csp),
    frameAncestorsNone: csp.includes("frame-ancestors 'none'"),
    objectSrcNone: csp.includes("object-src 'none'"),
  };
  const [pending, e24, e7] = await Promise.all([
    prisma.approvalRequest.count({ where: { userId, status: 'PENDING', permissionClass: 'C', expiresAt: { gt: now } } }),
    countSecurityEvents(userId, new Date(now.getTime() - 86_400_000)),
    countSecurityEvents(userId, new Date(now.getTime() - 7 * 86_400_000)),
  ]);
  return {
    generatedAt: now.toISOString(),
    headers: { enforcedByProxy: Object.keys(headers), hstsActive: https, csp: cspChecks },
    pendingClassCApprovals: pending,
    securityEvents: { last24h: categoriseEvents(e24), last7d: categoriseEvents(e7) },
    dependencyAudit: readAuditSummary(path.join(cwd, 'scripts', 'audit.json')),
    secretsScan: { ...readSecretsScanSummary(path.join(cwd, 'scripts', 'secrets-scan.json')), envFilesIgnoredByGit: envIgnored(cwd) },
    githubSettings: 'not_verifiable_from_code',
  };
}
