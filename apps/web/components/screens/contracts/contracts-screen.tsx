'use client';
// Contracts list. GET /api/contracts?subsidiary&status&project&cursor&limit. A contract is a record: nothing here
// moves money or sends anything. Props: { initialCreate?: boolean } (true on /dashboard/contracts/new).
import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FileSignature, Plus } from 'lucide-react';
import { HoloButton, HoloEmpty, HoloHeading, HoloModal, HoloOrbBackdrop } from '@/components/ui/holo';
import { getSubsidiaryList } from '@/components/subsidiaries';
import { useJson } from '@/components/screens/subsidiaries/use-json';
import { cn } from '@/lib/utils';
import { ContractFormView } from './contract-form';
import { ContractRow } from './contract-row';
import { useNow } from './use-now';
import { CONTRACT_STATUSES, readError, statusLabel, type Contract, type ContractListResponse, type ProjectOption } from './types';

const chip = 'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground';

export function ContractsScreen({ initialCreate = false }: { initialCreate?: boolean }) {
  const router = useRouter();
  const now = useNow();
  const [subsidiary, setSubsidiary] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [project, setProject] = React.useState('');
  const [creating, setCreating] = React.useState(initialCreate);
  const [more, setMore] = React.useState<{ base: ContractListResponse; items: Contract[]; next: string | null } | null>(null);
  const [moreBusy, setMoreBusy] = React.useState(false);
  const [moreError, setMoreError] = React.useState<string | null>(null);
  const subs = getSubsidiaryList();
  const projects = useJson<ProjectOption[]>('/api/projects');

  const qs = new URLSearchParams();
  if (subsidiary) qs.set('subsidiary', subsidiary);
  if (status) qs.set('status', status);
  if (project) qs.set('project', project);
  qs.set('limit', '25');
  const { result, retry } = useJson<ContractListResponse>(`/api/contracts?${qs.toString()}`);

  const closeCreate = () => { setCreating(false); if (initialCreate) router.replace('/dashboard/contracts'); };
  const filtered = Boolean(subsidiary || status || project);
  const clear = () => { setSubsidiary(''); setStatus(''); setProject(''); };

  const loadMore = (base: ContractListResponse, cursor: string) => {
    setMoreBusy(true);
    setMoreError(null);
    fetch(`/api/contracts?${qs.toString()}&cursor=${encodeURIComponent(cursor)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, `Could not load more (${res.status})`));
        const d = (await res.json()) as ContractListResponse;
        setMore((m) => ({ base, items: [...(m && m.base === base ? m.items : []), ...d.contracts], next: d.nextCursor }));
      })
      .catch((e: unknown) => setMoreError(e instanceof Error ? e.message : 'Could not load more'))
      .finally(() => setMoreBusy(false));
  };

  const actions = <HoloButton leftIcon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreating(true)}>New contract</HoloButton>;

  let body: React.ReactNode;
  if (result.state === 'loading') {
    body = (
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading contracts</span>
        <div className="grid gap-4" aria-hidden>{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-secondary/50 motion-reduce:animate-none" />)}</div>
      </div>
    );
  } else if (result.state !== 'ok') {
    body = <HoloEmpty state="error" title={result.state === 'notfound' ? 'That filter matched nothing you can open' : 'Contracts could not be loaded'}
      description={result.state === 'notfound' ? 'The project is not one you own or belong to.' : 'The server did not answer. Nothing was changed.'}
      action={<div className="flex gap-2"><HoloButton onClick={retry}>Retry</HoloButton>{filtered && <HoloButton variant="ghost" onClick={clear}>Clear filters</HoloButton>}</div>} />;
  } else {
    const base = result.data;
    const extra = more && more.base === base ? more : null;
    const items = [...base.contracts, ...(extra?.items ?? [])];
    const next = extra ? extra.next : base.nextCursor;
    body = items.length === 0 ? (
      <HoloEmpty icon={<FileSignature className="h-6 w-6" aria-hidden />} title={filtered ? 'No contracts match these filters' : 'No contracts recorded yet'}
        description={filtered ? 'Try another subsidiary or status.' : 'Record the agreements you hold so renewals and end dates are never a surprise.'}
        action={filtered ? <HoloButton variant="ghost" onClick={clear}>Clear filters</HoloButton> : actions} />
    ) : (
      <div className="space-y-4">
        <p className="sr-only" role="status" aria-live="polite">{items.length} contracts shown</p>
        <ul className="grid gap-4">{items.map((c) => <li key={c.id}><ContractRow c={c} now={now} /></li>)}</ul>
        {moreError && <p className="text-sm text-foreground" role="alert"><span className="mr-2 font-mono text-[0.6875rem] uppercase tracking-widest text-[hsl(var(--ember))]">Error</span>{moreError}</p>}
        {next && <div className="flex justify-center"><HoloButton variant="ghost" loading={moreBusy} onClick={() => loadMore(base, next)}>Load more</HoloButton></div>}
      </div>
    );
  }

  const projectList = projects.result.state === 'ok' && Array.isArray(projects.result.data) ? projects.result.data : [];

  return (
    <div className="relative isolate min-h-full overflow-hidden">
      <HoloOrbBackdrop stars={40} floor={false} />
      <div className="relative z-10 mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-8">
        <HoloHeading eyebrow="Records" title="Contracts" description="Agreements you hold, by subsidiary. Recording a contract does not move money or send anything." actions={actions} />

        <section aria-label="Filters" className="space-y-3">
          <div role="group" aria-label="Filter by subsidiary" className="flex flex-wrap gap-2">
            <button type="button" className={chip} aria-pressed={subsidiary === ''} onClick={() => setSubsidiary('')}>All subsidiaries</button>
            {subs.map((s) => (
              <button key={s.id} type="button" className={chip} aria-pressed={subsidiary === s.id} onClick={() => setSubsidiary(subsidiary === s.id ? '' : s.id)}>
                <Image src={s.logo} alt="" width={20} height={20} className="h-5 w-5 rounded-full object-cover" />{s.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
              <button type="button" className={chip} aria-pressed={status === ''} onClick={() => setStatus('')}>Any status</button>
              {CONTRACT_STATUSES.map((s) => <button key={s} type="button" className={chip} aria-pressed={status === s} onClick={() => setStatus(status === s ? '' : s)}>{statusLabel(s)}</button>)}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">Project
              <select className={cn('rounded-md border border-border bg-background/60 px-2 py-1 text-xs text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring')} value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">Any project</option>
                {projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
        </section>

        {body}
      </div>

      <HoloModal open={creating} onOpenChange={(o) => { if (!o) closeCreate(); }} title="New contract" description="A record only. Nothing is paid, signed or sent." width="40rem">
        <ContractFormView defaultSubsidiary={subsidiary || undefined} onCancel={closeCreate} onSaved={() => { setMore(null); closeCreate(); retry(); }} />
      </HoloModal>
    </div>
  );
}
