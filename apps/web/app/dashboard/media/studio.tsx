'use client';
import { useEffect, useReducer, useState } from 'react';
import Link from 'next/link';
import { providerRequest } from '@/lib/model-router/higgsfield/schema';
import { ApprovalCard } from '@/app/dashboard/conversation/_components/approval-card';
import { approvalReducer, initialCardState, normalizeApproval, postDecision, type ApprovalView } from '@/lib/hooks/approval-state';
type Readiness = { configured: boolean; quoteReady: boolean; generationReady: boolean; blocker: string | null; message: string };
type Output = { status: string; images?: { url: string }[]; video?: { url: string }; expires_at?: string; accounting?: string };
function DecisionCard({ approval, completed }: { approval: ApprovalView; completed: (data: unknown) => void }) {
  const [state, dispatch] = useReducer(approvalReducer, initialCardState);
  const [inFlight, setInFlight] = useState(false);
  async function decide(decision: 'approve' | 'deny', voice?: { code: string }) {
    if (inFlight || state.phase !== 'pending') return;
    setInFlight(true); dispatch({ type: 'submit' });
    try {
      const result = await postDecision(approval.id, decision, voice);
      dispatch({ type: 'response', response: result });
      if (result.status === 'EXECUTED' && result.result?.success) completed(result.result.data);
    } catch { dispatch({ type: 'request_failed', message: 'Could not read the decision result. Check Approvals before retrying.' }); }
    finally { setInFlight(false); }
  }
  return <ApprovalCard className="w-full" approval={approval} state={state} onTick={secondsLeft => dispatch({ type: 'tick', secondsLeft })} onDecide={decide} />;
}
export function MediaStudio({ readiness }: { readiness: Readiness }) {
  const [kind, setKind] = useState<'image' | 'video'>('image');
  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<ApprovalView | null>(null);
  const [quoted, setQuoted] = useState<{ id: string; usd: string } | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [output, setOutput] = useState<Output | null>(null);
  const [savedId, setSavedId] = useState('');
  const [statusRequest, setStatusRequest] = useState(0);
  async function send(body: unknown) {
    const response = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok && !result.approvalRequired) throw new Error(result.error ?? 'Request failed');
    return result;
  }
  async function request(action: 'quote' | 'generate') {
    setBusy(true); setMessage('Preparing exact approval…');
    try {
      const result = await send(action === 'quote' ? { action, kind, prompt } : { action, quoteApprovalId: quoted?.id });
      const next = normalizeApproval(result.approvalRequired);
      if (!next) throw new Error('No approval was created.');
      setApproval(next); setMessage('Review the exact request below. Approval expires in 30 seconds.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!generationId) return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await send({ action: 'status', generationApprovalId: generationId });
        if (!active) return;
        const data = result.data as Output; setOutput(data);
        if (['completed', 'failed', 'canceled', 'nsfw'].includes(data.status)) return;
        timer = setTimeout(poll, 5000);
      } catch { if (active) setMessage('Status could not be read. No generation was retried. Open Approvals for the saved receipt.'); }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [generationId, statusRequest]);
  function completed(data: unknown) {
    if (!approval) return;
    if (approval.tool === 'media_quote') {
      const receipt = data as { usd?: unknown };
      if (typeof receipt?.usd === 'string') { setQuoted({ id: approval.id, usd: receipt.usd }); setMessage('Quote received. Request a separate approval for the exact amount and generation.'); }
    } else if (approval.tool === 'media_generate') { setGenerationId(approval.id); setMessage('Generation submitted once. Waiting for provider progress.'); }
  }
  function resetDraft() { setQuoted(null); setApproval(null); if (output && ['completed', 'failed', 'canceled', 'nsfw'].includes(output.status)) { setGenerationId(null); setOutput(null); } }
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <header><h1 className="font-display text-2xl text-foreground">Media studio</h1><p className="text-muted-foreground">Image and video production for your media, branding and authorized teams.</p></header>
    <section aria-label="Provider readiness" className="rounded-lg border border-border bg-card p-4 space-y-2">
      <h2 className="text-foreground font-semibold">{readiness.configured ? 'Provider configured' : 'Provider setup needed'}</h2>
      <p className="text-sm text-muted-foreground">{readiness.message}</p>
      <p className="text-sm text-muted-foreground">Pricing sends the exact prompt to Higgsfield after your approval. Generation requires another approval naming the account estimate and a spend reservation. This cloud media service is separate from voice.</p>
      <a className="text-primary underline" href="https://console.higgsfield.ai/" target="_blank" rel="noreferrer">Open provider console</a>
    </section>
    <section className="space-y-3" aria-label="Draft generation request">
      <h2 className="font-semibold text-foreground">Prepare a request</h2>
      <label className="block text-sm">Output<select value={kind} onChange={e => { setKind(e.target.value as 'image' | 'video'); resetDraft(); }} className="block rounded border border-border bg-background p-2"><option value="image">Image · square · 1k</option><option value="video">Video · 5 seconds · 720p · landscape with audio</option></select></label>
      <label className="block text-sm">Prompt<textarea value={prompt} maxLength={4000} onChange={e => { setPrompt(e.target.value); resetDraft(); }} className="mt-1 block min-h-28 w-full rounded border border-border bg-background p-3" placeholder="Describe the scene. Keep credentials out of prompts." /></label>
      <details><summary className="text-sm cursor-pointer">Exact provider request preview</summary><pre className="overflow-auto whitespace-pre-wrap rounded border border-border p-3 text-xs">{JSON.stringify(providerRequest({ kind, prompt }), null, 2)}</pre></details>
      <button type="button" disabled={!readiness.quoteReady || !prompt.trim() || busy} onClick={() => request('quote')} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">Request approval to get price</button>
      {quoted && <div className="space-y-2"><p>Account estimate: USD {quoted.usd}; this is not a final invoice or guaranteed maximum. Valid for five minutes; an estimate increase requires a new quote.</p><button type="button" disabled={!readiness.generationReady || busy || !!generationId} onClick={() => request('generate')} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">Request priced generation approval</button></div>}
      <p role="status" className="text-sm text-foreground">{message}</p>
      {approval && <DecisionCard key={approval.id} approval={approval} completed={completed} />}
    </section>
    {output && <section className="space-y-2" aria-label="Generation output"><h2 className="font-semibold">Provider status: {output.status}</h2><p className="text-sm text-muted-foreground">{output.accounting === 'billing_reconciliation_pending' ? 'Output is ready. Estimated cost stays reserved until billing is reconciled; this is not a final invoice.' : output.accounting === 'policy_not_charged' ? 'Provider policy says this outcome is not charged. This is a policy-based accounting update, not a separate refund receipt.' : 'Estimated provider cost remains reserved.'}</p>{[...(output.images ?? []), ...(output.video ? [output.video] : [])].map((asset, index) => <a key={index} href={asset.url} target="_blank" rel="noreferrer" className="block text-primary underline">Open generated {output.video ? 'video' : 'image'} {index + 1}</a>)}<p className="text-sm text-muted-foreground">Provider files expire {output.expires_at ?? 'seven days after completion'}. Save outputs you want to keep.</p></section>}
    <section aria-label="Saved generation" className="space-y-2"><h2 className="font-semibold">Check a saved generation</h2><p className="text-sm text-muted-foreground">Use its generation approval ID from your saved receipts. Only this account’s successful generation receipts can be read.</p><label className="block text-sm">Generation approval ID<input className="mt-1 block w-full rounded border border-border bg-background p-2" value={savedId} maxLength={160} onChange={event => setSavedId(event.target.value)} /></label><button type="button" disabled={!savedId.trim() || !readiness.quoteReady} onClick={() => { setOutput(null); setGenerationId(savedId.trim()); setStatusRequest(value => value + 1); setMessage('Reading saved generation status…'); }} className="rounded border border-border px-3 py-2 disabled:opacity-50">Check progress</button></section>
    {output && ['completed', 'failed', 'canceled', 'nsfw'].includes(output.status) && <button type="button" onClick={() => { setGenerationId(null); setOutput(null); setQuoted(null); setApproval(null); setPrompt(''); setMessage('Ready for a new draft. Previous receipts remain in Approvals.'); }} className="rounded border border-border px-3 py-2">New media request</button>}
    <Link href="/dashboard/approvals" className="text-primary underline">Open saved approvals and receipts</Link>
  </main>;
}
