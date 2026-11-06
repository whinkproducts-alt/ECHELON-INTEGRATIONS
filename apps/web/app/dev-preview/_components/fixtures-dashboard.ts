// Synthetic development-only dashboard responses. Never imported by authenticated routes.
import { isConversationPersona } from '@/lib/dashboard-client';
import type { MockCtx, Mocked } from './fixtures';

export function answerDashboard(method: string, url: URL, body: unknown, ctx: MockCtx): Mocked | null {
  if (!['dashboard','conversation','presence','obsidian'].includes(ctx.screen ?? '')) return null;
  const p = url.pathname;
  const resources = ['/api/worker/status', '/api/ledger', '/api/projects'];
  if (resources.includes(p)) {
    const counts = ctx.counters.dashboardLoads ??= {};
    counts[p] = (counts[p] ?? 0) + 1;
    if (ctx.fault === 'denied') return { status: 403, body: { error: 'Fixture access denied' } };
    if (ctx.fault === 'stale' && counts[p] > 1) return { status: 503, body: { error: 'Fixture refresh failure' } };
    if (ctx.state === 'loading') return { status: 200, body: {}, delayMs: 600_000 };
    if (ctx.state === 'error') return { status: 503, body: { error: 'Fixture service unavailable' } };
  }
  if (p === '/api/approvals' && ctx.screen !== 'dashboard' && ctx.fault !== 'approval') return {status:200,body:{approvals:[]}};
  const persona = ctx.counters.persona ?? (ctx.screen === 'obsidian' ? 'MAMBA' : 'WHINK');
  if (p === '/api/persona/state') return { status: 200, body: { activePersona: persona, mambaMode: persona === 'MAMBA' ? 'OBSIDIAN' : null, functionalMode: null } };
  if (p === '/api/persona/switch') {
    const wanted = (body as { persona?: string })?.persona;
    if (!isConversationPersona(wanted)) return { status: 400, body: { error: 'Invalid persona' } };
    if(wanted === 'REGISTRATION') return {status:403,body:{error:'Fixture founder access required'}};
    ctx.counters.persona = wanted;
    return { status: 200, body: { activePersona: wanted, mambaMode: wanted === 'MAMBA' ? 'OBSIDIAN' : null, functionalMode: null } };
  }
  if (p === '/api/safety/lockdown') return { status: 200, body: { state: { lockedDown: false, epoch: 1, reason: null, changedAt: null } } };
  if (p === '/api/worker/status') return { status: 200, body: {
    rosterSize: 8, enabledCount: 2, heartbeatAgeSeconds: ctx.state === 'empty' ? null : 12,
    jobs: ctx.state === 'empty' ? [] : [
      { jobKey: 'opportunity_scan:amara-okafor', lastStatus: 'OK', runs: 4, lastRunAt: new Date(ctx.now() - 60000).toISOString(), nextRunAt: new Date(ctx.now() + 3600000).toISOString() },
      { jobKey: 'self_improvement:self-improvement', lastStatus: 'FAILED', runs: 1, lastRunAt: new Date(ctx.now() - 120000).toISOString(), nextRunAt: new Date(ctx.now() + 21600000).toISOString() },
    ],
  } };
  if (p === '/api/ledger') return { status: 200, body: ctx.state === 'empty' ? [] : [{ id: 'fixture-action', action: 'fixture_long_action_name_for_wrapping_and_operational_readability_checks', persona: 'WHINK', status: 'DENIED', createdAt: new Date(ctx.now() - 30000).toISOString() }] };
  if (p === '/api/projects') return { status: 200, body: ctx.state === 'empty' ? [] : [{ id: 'fixture-project', name: 'Fixture project with a deliberately long operational title for responsive layout checks', status: 'ACTIVE', subsidiary: 'apps', openTaskCount: 3, progress: { percent: 25 } }] };
  if (p.startsWith('/api/conversations')) {
    if (ctx.fault === 'denied') return {status:403,body:{error:'Fixture access denied'}};
    if (ctx.state === 'error') return {status:503,body:{error:'Fixture conversation service unavailable'}};
    if (ctx.state === 'loading') return {status:200,body:[],delayMs:600000};
    if(ctx.fault === 'history-error' && p.endsWith('/messages') && method === 'GET') return {status:503,body:{error:'Fixture history unavailable'}};
    if (ctx.fault === 'create-failed' && p === '/api/conversations' && method === 'POST') return {status:503,body:{error:'Fixture creation failure'}};
  }
  if (p === '/api/conversations' && method === 'GET') return {status:200, body:ctx.state === 'empty' ? [] : [{id:'fixture-history', title:'Fixture: a long conversation title to check history navigation and wrapping',projectId:null,updatedAt:new Date(ctx.now()).toISOString()}]};
  if (p === '/api/conversations/fixture-history/messages' && method === 'GET') return {status:200, body:[{id:'fixture-message',role:'assistant',content:'Saved fixture conversation. No external service was called.',persona, mambaMode:persona === 'MAMBA' ? 'OBSIDIAN' : null,functionalMode:null,createdAt:new Date(ctx.now()).toISOString()}]};
  if (p === '/api/conversations/fixture-conversation/messages' && method === 'GET') return {status:200,body:[]};
  if (p === '/api/conversations' && method === 'POST') return { status: 201, body: { id: 'fixture-conversation', title:(body as {title?:string})?.title ?? 'Fixture conversation', projectId:(body as {projectId?:string|null})?.projectId ?? null, updatedAt:new Date(ctx.now()).toISOString() } };
  if ((p === '/api/conversations/fixture-conversation/messages' || p === '/api/conversations/fixture-history/messages') && method === 'POST') {
    if(ctx.fault === 'send-denied') return {status:403,body:{error:'Fixture denied'}};
    if(ctx.fault === 'stream-error') return {status:200,sse:true,body:`data: ${JSON.stringify({type:'citation',documentName:'Fixture-reference.pdf',page:2})}\n\ndata: ${JSON.stringify({type:'text',content:'Partial fixture response.',persona})}\n\ndata: ${JSON.stringify({type:'error',message:'Fixture error'})}\n\n`};
    if (typeof (body as { message?: unknown })?.message !== 'string') return { status: 400, body: { error: 'Fixture expects the real API message contract' } };
    return { status: 200, sse: true, body: `data: ${JSON.stringify({ type: 'text', content: 'Fixture response only. No model, worker, or external service was called.', persona })}\n\ndata: ${JSON.stringify({ type: 'done', persona })}\n\n` };
  }
  return null;
}
