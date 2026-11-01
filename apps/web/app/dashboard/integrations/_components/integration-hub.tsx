'use client';

/**
 * Integration Hub (E4b). Every number and badge here is read from the database through
 * /api/integrations/*; nothing is optimistic and nothing is a fixture. A tool call that needs the
 * Founder's yes shows its approval request id and waits; it is never shown as done.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, Clock, Loader2, Plug, ShieldCheck } from 'lucide-react';

interface Tool { id: string; name: string; originalName: string | null; riskClass: string; costClass: string; isActive: boolean; defHash: string | null; reviewedDefHash: string | null }
interface Provider {
  id: string; connectorId: string; status: string; transport: string | null; endpoint: string | null; hostId: string | null;
  egressAllowlist: string[]; maxDataClass: string; hasCredential: boolean; credentialHint: string | null; reviewedAt: string | null; tools: Tool[];
}
interface Host { id: string; name: string; kind: string; status: string; lastHeartbeat: string | null }
interface Grant { id: string; subjectType: string; subjectId: string; toolId: string; executionPlanId: string | null; invocationCount: number; maxInvocations: number | null; expiresAt: string; revokedAt: string | null; tool: { name: string; originalName: string | null } }
interface Receipt { id: string; action: string; status: string; errorCode: string | null; createdAt: string; latencyMs: number | null; tool: string | null; permissionClass: string; approvalId: string | null; hostId: string | null; outputSummary: string | null }
interface CheckReport { pass: boolean; failures: string[]; summary: { fingerprint: string; endpoint: string | null; egressAllowlist: string[]; maxDataClass: string; hasCredential: boolean; host: string | null; tools: Array<{ id: string; name: string; originalName: string | null; description: string; riskClass: string; costClass: string; protected: boolean }> } }
interface RosterHit { id: string; name: string; title?: string }

const RISK = ['C', 'B', 'A'] as const;
const COST = ['UNKNOWN', 'FREE', 'METERED', 'CLOUD_BILLABLE'] as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/integrations${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

/** Wall clock as state: ticks every 15 s, so render stays pure. */
function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 15_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  return now;
}

function age(iso: string | null, now: number): string {
  if (!iso) return 'never';
  if (!now) return '…';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
}

function Badge({ value }: { value: string }) {
  const warn = ['DEGRADED', 'DISABLED', 'REGISTERED', 'REVIEWED', 'AWAITING_APPROVAL', 'SUBMITTED'].includes(value);
  const bad = ['OFFLINE', 'REVOKED', 'DENIED', 'FAILED'].includes(value);
  const style = bad ? { color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive))' } : warn ? { color: 'hsl(var(--pending-amber))', borderColor: 'hsl(var(--pending-amber))' } : undefined;
  return <span className="inline-block rounded border border-border px-1.5 py-0.5 text-[11px] font-medium" style={style}>{value}</span>;
}

export function IntegrationHub() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [newToken, setNewToken] = useState<{ host: string; token: string } | null>(null);
  const [review, setReview] = useState<{ provider: Provider; report: CheckReport; picks: Record<string, { riskClass: string; costClass: string }> } | null>(null);
  const [testing, setTesting] = useState<{ tool: Tool; args: string; dataClass: string; result: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, h, g, i] = await Promise.all([
        api<{ providers: Provider[] }>('/providers'), api<{ hosts: Host[] }>('/hosts'),
        api<{ grants: Grant[] }>('/grants'), api<{ invocations: Receipt[] }>('/invocations?limit=25'),
      ]);
      setProviders(p.providers); setHosts(h.hosts); setGrants(g.grants); setReceipts(i.invocations); setLoaded(true);
    } catch (e) { setError((e as Error).message); }
  }, []);

  // Initial fetch: state is set after the awaited responses, never synchronously (same convention as the memory and conversation screens).
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  // Live updates from the ledger. EventSource reconnects with Last-Event-ID by itself; a poll every 30 s is the fallback.
  useEffect(() => {
    const es = new EventSource('/api/integrations/events');
    const types = ['capability_invoke', 'capability_denied', 'capability_awaiting_approval', 'provider_registered', 'provider_discovered', 'provider_reviewed', 'provider_enabled', 'provider_disabled', 'provider_revoked', 'grant_created', 'grant_revoked', 'host_online', 'host_degraded', 'host_offline', 'host_registered'];
    for (const t of types) es.addEventListener(t, () => { void load(); });
    const poll = setInterval(() => { void load(); }, 30_000);
    return () => { es.close(); clearInterval(poll); };
  }, [load]);

  const act = async (label: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(label); setError(''); setNotice('');
    try { await fn(); if (ok) setNotice(ok); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2"><Plug className="h-6 w-6" aria-hidden /> Integration Hub</h1>
        <p className="text-sm text-muted-foreground mt-1">Add MCP providers, review them, grant one tool to one agent or team, test, monitor, revoke. Deny by default.</p>
      </div>

      <div className="flex items-start gap-2 bg-card border border-border rounded-lg p-4 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-foreground" aria-hidden />
        <ul className="list-disc pl-4 space-y-1">
          <li>Connecting a provider gives no agent any access. Only a grant does, and a grant names one tool.</li>
          <li>Paid or unknown-cost tools are blocked. Unreviewed tools, and anything that moves money or shares proprietary data, wait for your approval by request id.</li>
          <li>Host status is computed from heartbeats. Surviving a physically powered-off Mac has <strong>not</strong> been verified yet.</li>
          <li>stdio providers can be recorded for a host agent but are not run from here.</li>
        </ul>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border p-3 text-sm" style={{ borderColor: 'hsl(var(--destructive))', color: 'hsl(var(--destructive))' }}><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm"><CheckCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />{notice}</div>}
      {!loaded && !error && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading</p>}

      {newToken && (
        <div role="alert" className="rounded-lg border p-4 text-sm space-y-2" style={{ borderColor: 'hsl(var(--pending-amber))' }}>
          <p className="font-medium">Token for host “{newToken.host}”. It is shown once and cannot be recovered.</p>
          <code className="block break-all rounded bg-muted p-2 text-xs select-all">{newToken.token}</code>
          <p className="text-muted-foreground">Run <code>node scripts/host-heartbeat.mjs</code> on that machine with this token (see docs/CAPABILITY-GATEWAY.md).</p>
          <button className="text-xs underline" onClick={() => setNewToken(null)}>I have stored it</button>
        </div>
      )}

      <HostsSection hosts={hosts} busy={busy} act={act} onToken={setNewToken} />

      <ProvidersSection
        providers={providers} hosts={hosts} busy={busy} act={act}
        onReview={async (p) => {
          setError('');
          try {
            const report = await api<CheckReport>(`/providers/${p.id}/checks`);
            const picks: Record<string, { riskClass: string; costClass: string }> = {};
            for (const t of report.summary.tools) picks[t.id] = { riskClass: t.protected ? 'C' : t.riskClass, costClass: t.costClass };
            setReview({ provider: p, report, picks });
          } catch (e) { setError((e as Error).message); }
        }}
      />

      {review && (
        <section aria-label="Review provider" className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="font-semibold">Review {review.provider.connectorId}</h2>
          <p className="text-sm text-muted-foreground">You are approving this exact configuration and these exact tool definitions. A later change to any of them switches the provider off until you review again.</p>
          <dl className="text-sm grid grid-cols-[10rem_1fr] gap-y-1">
            <dt className="text-muted-foreground">Endpoint</dt><dd className="break-all">{review.report.summary.endpoint ?? '—'}</dd>
            <dt className="text-muted-foreground">May contact only</dt><dd className="break-all">{review.report.summary.egressAllowlist.join(', ') || '— (nothing)'}</dd>
            <dt className="text-muted-foreground">Highest data class</dt><dd>{review.report.summary.maxDataClass}</dd>
            <dt className="text-muted-foreground">Credential</dt><dd>{review.report.summary.hasCredential ? 'stored encrypted; sent only to this endpoint' : 'none'}</dd>
          </dl>
          {!review.report.pass && <div role="alert" className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>Automated checks failed: {review.report.failures.join('; ')}</div>}
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Tool</th><th>Permission class</th><th>Cost</th></tr></thead>
            <tbody>
              {review.report.summary.tools.map((t) => (
                <tr key={t.id} className="border-t border-border align-top">
                  <td className="py-2 pr-2"><span className="font-mono text-xs">{t.originalName ?? t.name}</span><div className="text-xs text-muted-foreground">{t.description}</div>{t.protected && <div className="text-xs" style={{ color: 'hsl(var(--pending-amber))' }}>Looks like money or sharing: always needs your approval.</div>}</td>
                  <td><select aria-label={`Permission class for ${t.originalName ?? t.name}`} className="border border-border bg-background rounded px-1 py-0.5" disabled={t.protected} value={review.picks[t.id].riskClass} onChange={(e) => setReview({ ...review, picks: { ...review.picks, [t.id]: { ...review.picks[t.id], riskClass: e.target.value } } })}>{RISK.map((r) => <option key={r} value={r}>{r === 'C' ? 'C: ask me every time' : r === 'B' ? 'B: needs delegation' : 'A: runs on its own'}</option>)}</select></td>
                  <td><select aria-label={`Cost for ${t.originalName ?? t.name}`} className="border border-border bg-background rounded px-1 py-0.5" value={review.picks[t.id].costClass} onChange={(e) => setReview({ ...review, picks: { ...review.picks, [t.id]: { ...review.picks[t.id], costClass: e.target.value } } })}>{COST.map((c) => <option key={c} value={c}>{c === 'FREE' ? 'FREE (may run)' : `${c} (blocked)`}</option>)}</select></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <button disabled={!review.report.pass || busy !== ''} className="rounded border border-border bg-background px-3 py-1 text-sm disabled:opacity-50"
              onClick={() => act('review', async () => { await api(`/providers/${review.provider.id}/review`, { method: 'POST', body: JSON.stringify({ fingerprint: review.report.summary.fingerprint, tools: Object.entries(review.picks).map(([toolId, v]) => ({ toolId, ...v })) }) }); setReview(null); }, 'Reviewed. Enable it when you are ready.')}>I have reviewed this: confirm</button>
            <button className="text-sm underline" onClick={() => setReview(null)}>Cancel</button>
          </div>
        </section>
      )}

      <GrantsSection providers={providers} grants={grants} busy={busy} act={act} onTest={(tool) => setTesting({ tool, args: '{"text":"hello"}', dataClass: 'organization', result: '' })} />

      {testing && (
        <section aria-label="Test tool" className="rounded-lg border border-border bg-card p-4 space-y-2">
          <h2 className="font-semibold">Test {testing.tool.originalName ?? testing.tool.name}</h2>
          <p className="text-xs text-muted-foreground">Same gates and the same permission engine as an agent call. A class B/C tool creates an approval request instead of running.</p>
          <label className="block text-sm">Arguments (JSON)<textarea className="mt-1 w-full rounded border border-border bg-background p-2 font-mono text-xs" rows={3} value={testing.args} onChange={(e) => setTesting({ ...testing, args: e.target.value })} /></label>
          <label className="block text-sm">Data class<select className="ml-2 border border-border bg-background rounded px-1 py-0.5" value={testing.dataClass} onChange={(e) => setTesting({ ...testing, dataClass: e.target.value })}>{['public', 'organization', 'confidential'].map((d) => <option key={d}>{d}</option>)}</select></label>
          <div className="flex gap-2">
            <button disabled={busy !== ''} className="rounded border border-border bg-background px-3 py-1 text-sm disabled:opacity-50" onClick={async () => {
              let args: unknown; try { args = JSON.parse(testing.args); } catch { setTesting({ ...testing, result: 'Arguments are not valid JSON.' }); return; }
              setBusy('test'); setError('');
              try {
                const r = await api<{ status: string; output?: string; approvalId?: string; reason?: string }>(`/tools/${testing.tool.id}/test`, { method: 'POST', body: JSON.stringify({ args, dataClass: testing.dataClass }) });
                setTesting({ ...testing, result: r.status === 'EXECUTED' ? `Ran. Provider output (untrusted): ${r.output}` : `Waiting for your approval: request ${r.approvalId}. Nothing was sent.` });
                await load();
              } catch (e) { setTesting({ ...testing, result: `Not run: ${(e as Error).message}` }); } finally { setBusy(''); }
            }}>Run test</button>
            <button className="text-sm underline" onClick={() => setTesting(null)}>Close</button>
            <Link href="/dashboard/approvals" className="text-sm underline">Approvals</Link>
          </div>
          {testing.result && <p role="status" className="text-sm break-words">{testing.result}</p>}
        </section>
      )}

      <section aria-label="Receipts" className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold mb-2">Recent activity (the ledger)</h2>
        <p className="text-xs text-muted-foreground mb-2">Receipts hold keys, sizes and hashes only. Arguments and results are never stored.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">When</th><th>Event</th><th>Status</th><th>Class</th><th>Detail</th></tr></thead>
            <tbody>
              {receipts.length === 0 && <tr><td colSpan={5} className="py-3 text-muted-foreground">Nothing has happened yet.</td></tr>}
              {receipts.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="py-1 whitespace-nowrap text-xs">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="font-mono text-xs">{r.action}</td>
                  <td><Badge value={r.status} /></td>
                  <td className="text-xs">{r.permissionClass}</td>
                  <td className="text-xs break-all">{r.errorCode ?? ''} {r.latencyMs != null ? `${r.latencyMs} ms` : ''} {r.approvalId ? `approval ${r.approvalId}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type Act = (label: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>;

function HostsSection({ hosts, busy, act, onToken }: { hosts: Host[]; busy: string; act: Act; onToken: (t: { host: string; token: string }) => void }) {
  const now = useNow();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'LOCAL' | 'REMOTE'>('REMOTE');
  return (
    <section aria-label="Hosts" className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="font-semibold">Hosts</h2>
      {hosts.length === 0 && <p className="text-sm text-muted-foreground">No hosts yet. A host is a machine that runs MCP servers: this Mac, or a remote worker.</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {hosts.map((h) => (
          <li key={h.id} className="rounded border border-border p-3 text-sm">
            <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs">{h.name}</span><Badge value={h.status} /></div>
            <div className="text-xs text-muted-foreground mt-1">{h.kind} · last heartbeat {age(h.lastHeartbeat, now)}</div>
            <button className="text-xs underline mt-1" disabled={busy !== ''} onClick={() => act('rotate', async () => { const r = await api<{ token: string }>(`/hosts/${h.id}/token`, { method: 'POST', body: '{}' }); onToken({ host: h.name, token: r.token }); })}>Rotate token</button>
          </li>
        ))}
      </ul>
      <form className="flex flex-wrap items-end gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); void act('host', async () => { const r = await api<{ token: string; host: Host }>('/hosts', { method: 'POST', body: JSON.stringify({ name, kind }) }); onToken({ host: r.host.name, token: r.token }); setName(''); }); }}>
        <label>Name<input required className="ml-1 border border-border bg-background rounded px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Kind<select className="ml-1 border border-border bg-background rounded px-1 py-1" value={kind} onChange={(e) => setKind(e.target.value as 'LOCAL' | 'REMOTE')}><option>REMOTE</option><option>LOCAL</option></select></label>
        <button disabled={busy !== ''} className="rounded border border-border bg-background px-3 py-1 disabled:opacity-50">Add host</button>
      </form>
    </section>
  );
}

function ProvidersSection({ providers, hosts, busy, act, onReview }: { providers: Provider[]; hosts: Host[]; busy: string; act: Act; onReview: (p: Provider) => Promise<void> }) {
  const [f, setF] = useState({ connectorId: '', endpoint: '', credential: '', maxDataClass: 'organization', hostId: '', allow: '' });
  const [confirmRevoke, setConfirmRevoke] = useState('');
  return (
    <section aria-label="Providers" className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="font-semibold">Providers</h2>
      {providers.length === 0 && <p className="text-sm text-muted-foreground">No providers yet.</p>}
      <ul className="space-y-2">
        {providers.map((p) => (
          <li key={p.id} className="rounded border border-border p-3 text-sm space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><span className="font-mono text-xs">{p.connectorId}</span> <span className="text-xs text-muted-foreground">{p.transport} · max data {p.maxDataClass}{p.hasCredential ? ` · credential ••••${p.credentialHint ?? ''}` : ''}</span></span>
              <Badge value={p.status} />
            </div>
            <div className="text-xs text-muted-foreground break-all">{p.endpoint ?? 'no endpoint'} · may contact: {p.egressAllowlist.join(', ') || 'nothing'}{p.hostId ? ` · host ${hosts.find((h) => h.id === p.hostId)?.name ?? p.hostId}` : ''}</div>
            <div className="text-xs">Tools: {p.tools.filter((t) => t.isActive).map((t) => `${t.originalName} (${t.defHash && t.defHash === t.reviewedDefHash ? `class ${t.riskClass}` : 'not reviewed'}, ${t.costClass.toLowerCase()})`).join(', ') || 'none discovered'}</div>
            <div className="flex flex-wrap gap-3 pt-1">
              {p.status !== 'REVOKED' && p.transport === 'streamable-http' && <button className="text-xs underline" disabled={busy !== ''} onClick={() => act('discover', () => api(`/providers/${p.id}/discover`, { method: 'POST', body: '{}' }), 'Discovery finished.')}>Discover tools</button>}
              {['REGISTERED', 'REVIEWED', 'DISABLED', 'ENABLED'].includes(p.status) && <button className="text-xs underline" disabled={busy !== ''} onClick={() => onReview(p)}>Review</button>}
              {['REVIEWED', 'DISABLED'].includes(p.status) && <button className="text-xs underline" disabled={busy !== ''} onClick={() => act('enable', () => api(`/providers/${p.id}/enable`, { method: 'POST', body: '{}' }), 'Enabled.')}>Enable</button>}
              {p.status === 'ENABLED' && <button className="text-xs underline" disabled={busy !== ''} onClick={() => act('disable', () => api(`/providers/${p.id}/disable`, { method: 'POST', body: '{}' }), 'Disabled.')}>Disable</button>}
              {p.status !== 'REVOKED' && (confirmRevoke === p.id
                ? <span className="text-xs">Final: destroys the credential and revokes every grant. <button className="underline" style={{ color: 'hsl(var(--destructive))' }} onClick={() => { setConfirmRevoke(''); void act('revoke', () => api(`/providers/${p.id}/revoke`, { method: 'POST', body: '{}' }), 'Revoked.'); }}>Yes, revoke</button> <button className="underline" onClick={() => setConfirmRevoke('')}>No</button></span>
                : <button className="text-xs underline" style={{ color: 'hsl(var(--destructive))' }} onClick={() => setConfirmRevoke(p.id)}>Revoke</button>)}
            </div>
          </li>
        ))}
      </ul>
      <form className="grid gap-2 sm:grid-cols-2 text-sm border-t border-border pt-3" onSubmit={(e) => {
        e.preventDefault();
        void act('register', async () => {
          await api('/providers', { method: 'POST', body: JSON.stringify({
            connectorId: f.connectorId, transport: 'streamable-http', endpoint: f.endpoint, credential: f.credential || undefined,
            maxDataClass: f.maxDataClass, hostId: f.hostId || undefined,
            egressAllowlist: f.allow.split(',').map((s) => s.trim()).filter(Boolean),
          }) });
          setF({ connectorId: '', endpoint: '', credential: '', maxDataClass: 'organization', hostId: '', allow: '' });
        }, 'Registered. Discover its tools, then review.');
      }}>
        <label>Id (a-z, 0-9, hyphen)<input required className="mt-1 w-full border border-border bg-background rounded px-2 py-1" value={f.connectorId} onChange={(e) => setF({ ...f, connectorId: e.target.value })} /></label>
        <label>Endpoint (https, or http on loopback)<input required className="mt-1 w-full border border-border bg-background rounded px-2 py-1" value={f.endpoint} onChange={(e) => setF({ ...f, endpoint: e.target.value })} placeholder="https://mcp.example.com/mcp" /></label>
        <label>Credential (optional, stored encrypted)<input type="password" autoComplete="off" className="mt-1 w-full border border-border bg-background rounded px-2 py-1" value={f.credential} onChange={(e) => setF({ ...f, credential: e.target.value })} /></label>
        <label>Extra destinations it may contact (comma separated; its own host is added)<input className="mt-1 w-full border border-border bg-background rounded px-2 py-1" value={f.allow} onChange={(e) => setF({ ...f, allow: e.target.value })} placeholder="api.example.com:443" /></label>
        <label>Highest data class it may receive<select className="mt-1 w-full border border-border bg-background rounded px-1 py-1" value={f.maxDataClass} onChange={(e) => setF({ ...f, maxDataClass: e.target.value })}>{['public', 'organization', 'confidential'].map((d) => <option key={d}>{d}</option>)}</select></label>
        <label>Runs on host (optional)<select className="mt-1 w-full border border-border bg-background rounded px-1 py-1" value={f.hostId} onChange={(e) => setF({ ...f, hostId: e.target.value })}><option value="">none (always reachable)</option>{hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <div className="sm:col-span-2"><button disabled={busy !== ''} className="rounded border border-border bg-background px-3 py-1 disabled:opacity-50">Register provider</button></div>
      </form>
    </section>
  );
}

function GrantsSection({ providers, grants, busy, act, onTest }: { providers: Provider[]; grants: Grant[]; busy: string; act: Act; onTest: (t: Tool) => void }) {
  const tools = providers.filter((p) => p.status === 'ENABLED').flatMap((p) => p.tools.filter((t) => t.isActive));
  const [toolId, setToolId] = useState('');
  const [type, setType] = useState<'AGENT' | 'TEAM'>('AGENT');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<RosterHit[]>([]);
  const [subject, setSubject] = useState<RosterHit | null>(null);
  const [days, setDays] = useState(7);
  const [max, setMax] = useState('');
  const now = useNow();
  // Search only while typing. Hits are replaced by each response; clearing them is done by the handlers that pick or reset.
  useEffect(() => {
    if (q.trim().length < 2 || subject) return;
    let cancelled = false;
    const h = setTimeout(() => {
      api<{ agents: RosterHit[]; teams: RosterHit[] }>(`/roster?q=${encodeURIComponent(q.trim())}`)
        .then((r) => { if (!cancelled) setHits(type === 'AGENT' ? r.agents : r.teams); })
        .catch(() => { if (!cancelled) setHits([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(h); };
  }, [q, type, subject]);
  return (
    <section aria-label="Tools and grants" className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="font-semibold">Grants</h2>
      <p className="text-xs text-muted-foreground">A grant lets one roster agent or team call one tool until it expires (at most 30 days). Only enabled providers' tools can be granted.</p>
      {tools.length > 0 && (
        <ul className="text-sm space-y-1">
          {tools.map((t) => <li key={t.id} className="flex items-center justify-between gap-2"><span className="font-mono text-xs break-all">{t.originalName} <span className="text-muted-foreground">({t.name})</span></span><button className="text-xs underline shrink-0" onClick={() => onTest(t)}>Test</button></li>)}
        </ul>
      )}
      <form className="grid gap-2 sm:grid-cols-2 text-sm border-t border-border pt-3" onSubmit={(e) => {
        e.preventDefault();
        if (!subject || !toolId) return;
        void act('grant', async () => { await api('/grants', { method: 'POST', body: JSON.stringify({ subjectType: type, subjectId: subject.id, toolId, days, maxInvocations: max ? Number(max) : undefined }) }); setSubject(null); setQ(''); }, 'Grant created.');
      }}>
        <label>Tool<select required className="mt-1 w-full border border-border bg-background rounded px-1 py-1" value={toolId} onChange={(e) => setToolId(e.target.value)}><option value="">choose…</option>{tools.map((t) => <option key={t.id} value={t.id}>{t.originalName}</option>)}</select></label>
        <label>Grant to<select className="mt-1 w-full border border-border bg-background rounded px-1 py-1" value={type} onChange={(e) => { setType(e.target.value as 'AGENT' | 'TEAM'); setSubject(null); setQ(''); setHits([]); }}><option value="AGENT">One agent</option><option value="TEAM">One team</option></select></label>
        <label className="sm:col-span-2">Search the roster (name, title or id)
          <input className="mt-1 w-full border border-border bg-background rounded px-2 py-1" value={subject ? `${subject.name}` : q} onChange={(e) => { setSubject(null); setQ(e.target.value); if (e.target.value.trim().length < 2) setHits([]); }} />
        </label>
        {hits.length > 0 && <ul className="sm:col-span-2 max-h-40 overflow-auto rounded border border-border text-xs">{hits.map((h) => <li key={h.id}><button type="button" className="w-full text-left px-2 py-1 hover:bg-muted" onClick={() => { setSubject(h); setHits([]); }}>{h.name}{h.title ? ` · ${h.title}` : ''}<span className="block text-muted-foreground break-all">{h.id}</span></button></li>)}</ul>}
        <label>Days (1-30)<input type="number" min={1} max={30} className="mt-1 w-full border border-border bg-background rounded px-2 py-1" value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
        <label>Max calls (optional)<input type="number" min={1} className="mt-1 w-full border border-border bg-background rounded px-2 py-1" value={max} onChange={(e) => setMax(e.target.value)} /></label>
        <div className="sm:col-span-2"><button disabled={busy !== '' || !subject || !toolId} className="rounded border border-border bg-background px-3 py-1 disabled:opacity-50">Create grant</button></div>
      </form>
      <ul className="space-y-1 text-sm border-t border-border pt-3">
        {grants.length === 0 && <li className="text-muted-foreground">No grants. Every agent is denied every tool.</li>}
        {grants.map((g) => {
          const dead = Boolean(g.revokedAt) || (now > 0 && new Date(g.expiresAt).getTime() <= now);
          return (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs break-all"><Badge value={g.revokedAt ? 'REVOKED' : dead ? 'EXPIRED' : 'ACTIVE'} /> {g.subjectType} <span className="font-mono">{g.subjectId}</span> → {g.tool.originalName ?? g.tool.name} · used {g.invocationCount}{g.maxInvocations ? `/${g.maxInvocations}` : ''} · expires {new Date(g.expiresAt).toLocaleDateString()}</span>
              {!dead && <button className="text-xs underline" style={{ color: 'hsl(var(--destructive))' }} disabled={busy !== ''} onClick={() => act('revoke-grant', () => api(`/grants/${g.id}`, { method: 'DELETE' }), 'Grant revoked.')}>Revoke</button>}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden /> Class B/C calls wait on the <Link href="/dashboard/approvals" className="underline">Approvals</Link> page.</p>
    </section>
  );
}
