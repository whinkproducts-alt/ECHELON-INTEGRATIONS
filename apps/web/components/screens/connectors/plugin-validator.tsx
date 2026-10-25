'use client';
// "Bring your own plugin": paste or upload a manifest and have the server check it.
// Validation only. The server never runs the plugin, fetches its endpoints or stores anything,
// and neither does this component. Every manifest string is rendered as text.
import * as React from 'react';
import { FileJson, ShieldCheck, ShieldX, Upload } from 'lucide-react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { HoloBadge, HoloButton, HoloPanel, HoloHeading, StatusDot } from '@/components/ui/holo';

interface Validation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  effectiveClass: 'C';
  manifest?: {
    id: string; name: string; version: string; publisher: string; license: string; kind: string;
    capabilities?: string[]; scopes?: string[]; endpoints?: string[];
    tools?: { name: string; description: string }[];
  };
}

const MAX_BYTES = 128 * 1024;
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function PluginValidator() {
  const { productName } = useTenantConfig();
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Validation | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) { setProblem('That file is larger than 128 KB. A manifest should be far smaller.'); return; }
    setText(await f.text());
    setResult(null);
    setProblem(null);
  };

  const check = async () => {
    setResult(null);
    setProblem(null);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { setProblem('That is not valid JSON.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/connectors/manifest/validate', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(parsed) });
      let body: unknown = null;
      try { body = await res.json(); } catch { body = null; }
      const b = body as Partial<Validation> | null;
      if ((res.status === 200 || res.status === 422) && b && typeof b.valid === 'boolean') {
        setResult({ valid: b.valid, errors: strList(b.errors), warnings: strList(b.warnings), effectiveClass: 'C', manifest: b.manifest });
      } else if (res.status === 401) setProblem('Your session has ended. Sign in again.');
      else if (res.status === 413) setProblem('The manifest is too large.');
      else setProblem(`The validator did not answer properly (${res.status}). Nothing was stored.`);
    } catch {
      setProblem('The request did not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const licenceBad = result ? result.errors.some((e) => e.toLowerCase().startsWith('license')) : false;
  const m = result?.valid ? result.manifest : undefined;

  return (
    <section aria-label="Bring your own plugin" className="space-y-4 pt-4">
      <HoloHeading level={2} tone="deep" eyebrow="Plugins" title="Bring your own plugin" description="Paste a plugin manifest to check it. This is validation only: nothing is run, nothing is fetched from the plugin, and nothing is installed or stored." />
      <HoloPanel tone="deep" className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <label htmlFor="byo-manifest" className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">Manifest JSON</label>
          <textarea
            id="byo-manifest" value={text} onChange={(e) => { setText(e.target.value); setResult(null); setProblem(null); }} spellCheck={false} rows={12} maxLength={MAX_BYTES}
            placeholder={'{\n  "id": "my_plugin",\n  "name": "My plugin",\n  "version": "1.0.0",\n  "publisher": "Me",\n  "license": "MIT",\n  "kind": "mcp"\n}'}
            className="w-full rounded-lg border border-input bg-background/60 p-3 font-mono text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap gap-2">
            <HoloButton size="sm" onClick={check} loading={busy} disabled={text.trim() === ''} leftIcon={<ShieldCheck className="h-4 w-4" aria-hidden />}>Validate manifest</HoloButton>
            <HoloButton size="sm" variant="ghost" onClick={() => fileRef.current?.click()} leftIcon={<Upload className="h-4 w-4" aria-hidden />}>Upload .json</HoloButton>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label="Upload manifest file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>

        <div aria-live="polite" className="min-h-40 space-y-3">
          {!result && !problem && !busy && (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <FileJson className="h-8 w-8" aria-hidden />
              <p>The result appears here. Only MIT, Apache-2.0, BSD and ISC licences are accepted.</p>
            </div>
          )}
          {busy && <p role="status" className="py-8 text-center text-sm text-muted-foreground">Checking manifest…</p>}
          {problem && (
            <div role="alert" className="rounded-lg border border-border p-3">
              <StatusDot tone="ember" label="Error" showLabel />
              <p className="mt-1 text-sm text-foreground">{problem}</p>
            </div>
          )}
          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <HoloBadge tone={result.valid ? 'accent' : 'ember'} dot>{result.valid ? 'Manifest valid' : 'Manifest rejected'}</HoloBadge>
                <HoloBadge tone={licenceBad ? 'ember' : result.valid ? 'accent' : 'neutral'}>
                  {result.valid ? <ShieldCheck className="mr-1 h-3 w-3" aria-hidden /> : <ShieldX className="mr-1 h-3 w-3" aria-hidden />}
                  {licenceBad ? 'Licence not accepted' : result.valid ? `Licence accepted: ${m?.license ?? ''}` : 'Licence not confirmed'}
                </HoloBadge>
                <HoloBadge tone="neutral">Treated as Class C</HoloBadge>
              </div>
              {result.errors.length > 0 && (
                <ul className="space-y-1 text-sm" aria-label="Problems">
                  {result.errors.map((e, i) => <li key={i} className="font-mono text-xs text-foreground">Problem: {e}</li>)}
                </ul>
              )}
              {result.warnings.length > 0 && (
                <ul className="space-y-1" aria-label="Warnings">
                  {result.warnings.map((w, i) => <li key={i} className="font-mono text-xs text-muted-foreground">Note: {w}</li>)}
                </ul>
              )}
              {m && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">Name</dt><dd className="text-foreground">{m.name} <span className="font-mono text-xs text-muted-foreground">({m.id} v{m.version})</span></dd>
                  <dt className="text-muted-foreground">Publisher</dt><dd className="text-foreground">{m.publisher}</dd>
                  <dt className="text-muted-foreground">Kind</dt><dd className="font-mono text-xs text-foreground">{m.kind}</dd>
                  <dt className="text-muted-foreground">Capabilities</dt><dd className="font-mono text-xs text-foreground">{strList(m.capabilities).join(' · ') || 'none declared'}</dd>
                  <dt className="text-muted-foreground">Scopes</dt><dd className="font-mono text-xs text-foreground">{strList(m.scopes).join(' · ') || 'none declared'}</dd>
                  <dt className="text-muted-foreground">Endpoints</dt><dd className="break-all font-mono text-xs text-foreground">{strList(m.endpoints).join(' · ') || 'none'}</dd>
                  <dt className="text-muted-foreground">Tools</dt>
                  <dd className="font-mono text-xs text-foreground">
                    {Array.isArray(m.tools) && m.tools.length > 0 ? m.tools.map((t) => <span key={t.name} className="block">{String(t.name)}</span>) : 'none declared'}
                  </dd>
                </dl>
              )}
              <p className="text-xs text-muted-foreground">Checked only. Whatever the manifest claims, {productName} treats its tools as Class C, so each use waits for your approval.</p>
            </div>
          )}
        </div>
      </HoloPanel>
    </section>
  );
}
