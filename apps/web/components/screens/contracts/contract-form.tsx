'use client';
// Create and edit form. Client checks mirror lib/contracts/service.ts; the server stays the authority and its
// answers (404 project, 400 dates) are shown plainly. Nothing here moves money or sends anything.
import * as React from 'react';
import { Info } from 'lucide-react';
import { HoloButton, HoloPanel } from '@/components/ui/holo';
import { getSubsidiaryList } from '@/components/subsidiaries';
import { useJson } from '@/components/screens/subsidiaries/use-json';
import {
  CONTRACT_STATUSES, EMPTY_FORM, NOTES_MAX, TITLE_MAX, readError, statusLabel, toForm, toPayload, validateContract,
  type Contract, type ContractForm, type FormErrors, type ProjectOption,
} from './types';

const field = 'w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';
const label = 'mb-1 block font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground';

function Field({ id, name, error, hint, children }: { id: string; name: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={label}>{name}</label>
      {children}
      {hint && !error && <p id={`${id}-d`} className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-d`} className="mt-1 text-xs text-foreground" role="alert"><span className="mr-1 font-mono uppercase tracking-widest text-[hsl(var(--ember))]">Fix</span>{error}</p>}
    </div>
  );
}

export function ContractFormView({ initial, defaultSubsidiary, onSaved, onCancel }: {
  initial?: Contract;
  defaultSubsidiary?: string;
  onSaved: (c: Contract) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = React.useState<ContractForm>(() => (initial ? toForm(initial) : { ...EMPTY_FORM, subsidiary: defaultSubsidiary ?? '' }));
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [busy, setBusy] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const uid = React.useId();
  const projects = useJson<ProjectOption[]>('/api/projects');
  const subs = getSubsidiaryList();
  const set = <K extends keyof ContractForm>(k: K, v: ContractForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const projectList = projects.result.state === 'ok' && Array.isArray(projects.result.data) ? projects.result.data : [];
  const linkedMissing = form.projectId && !projectList.some((p) => p.id === form.projectId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateContract(form);
    setErrors(errs);
    setServerError(null);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    fetch(initial ? `/api/contracts/${encodeURIComponent(initial.id)}` : '/api/contracts', {
      method: initial ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toPayload(form)),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, `Could not save (${res.status})`));
        const d = (await res.json()) as { contract?: Contract };
        if (!d.contract) throw new Error('The server did not return the contract');
        onSaved(d.contract);
      })
      .catch((err: unknown) => setServerError(err instanceof Error ? err.message : 'Could not save'))
      .finally(() => setBusy(false));
  };

  const d = (k: keyof ContractForm) => (errors[k] ? `${uid}-${k}-d` : undefined);

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={initial ? 'Edit contract' : 'New contract'}>
      <HoloPanel tone="accent" padded className="!p-3" role="note">
        <p className="flex items-start gap-2 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>Recording a contract does not move money or send anything.</span>
        </p>
      </HoloPanel>

      <Field id={`${uid}-title`} name="Title" error={errors.title}>
        <input id={`${uid}-title`} className={field} value={form.title} maxLength={TITLE_MAX} required aria-invalid={!!errors.title} aria-describedby={d('title')} onChange={(e) => set('title', e.target.value)} />
      </Field>
      <Field id={`${uid}-counterparty`} name="Counterparty" error={errors.counterparty}>
        <input id={`${uid}-counterparty`} className={field} value={form.counterparty} maxLength={TITLE_MAX} required aria-invalid={!!errors.counterparty} aria-describedby={d('counterparty')} onChange={(e) => set('counterparty', e.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${uid}-subsidiary`} name="Subsidiary">
          <select id={`${uid}-subsidiary`} className={field} value={form.subsidiary} onChange={(e) => set('subsidiary', e.target.value)}>
            <option value="">Unassigned</option>
            {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field id={`${uid}-project`} name="Project" hint={projects.result.state === 'error' ? 'Projects could not be loaded. Saving without a link is still possible.' : 'Only a project you own or belong to can be linked.'}>
          <select id={`${uid}-project`} className={field} value={form.projectId} onChange={(e) => set('projectId', e.target.value)} aria-describedby={`${uid}-project-d`}>
            <option value="">No project</option>
            {linkedMissing && <option value={form.projectId}>Linked project</option>}
            {projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id={`${uid}-valueAmount`} name="Value" error={errors.valueAmount} hint="Optional. Up to 2 decimals.">
          <input id={`${uid}-valueAmount`} className={`${field} font-mono`} inputMode="decimal" placeholder="0.00" value={form.valueAmount} aria-invalid={!!errors.valueAmount} aria-describedby={`${uid}-valueAmount-d`} onChange={(e) => set('valueAmount', e.target.value)} />
        </Field>
        <Field id={`${uid}-currency`} name="Currency" error={errors.currency}>
          <input id={`${uid}-currency`} className={`${field} font-mono uppercase`} maxLength={3} value={form.currency} aria-invalid={!!errors.currency} aria-describedby={d('currency')} onChange={(e) => set('currency', e.target.value.toUpperCase())} />
        </Field>
        <Field id={`${uid}-status`} name="Status">
          <select id={`${uid}-status`} className={field} value={form.status} onChange={(e) => set('status', e.target.value)}>
            {CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {(['startDate', 'endDate', 'renewalDate'] as const).map((k) => (
          <Field key={k} id={`${uid}-${k}`} name={k === 'startDate' ? 'Start date' : k === 'endDate' ? 'End date' : 'Renewal date'} error={errors[k]}>
            <input id={`${uid}-${k}`} type="date" className={field} value={form[k]} aria-invalid={!!errors[k]} aria-describedby={d(k)} onChange={(e) => set(k, e.target.value)} />
          </Field>
        ))}
      </div>

      <Field id={`${uid}-notes`} name="Notes" error={errors.notes} hint="Plain text only. It is stored as written and never run or rendered as markup.">
        <textarea id={`${uid}-notes`} className={field} rows={4} maxLength={NOTES_MAX} value={form.notes} aria-invalid={!!errors.notes} aria-describedby={`${uid}-notes-d`} onChange={(e) => set('notes', e.target.value)} />
        <p className="mt-1 text-right font-mono text-[0.6875rem] text-muted-foreground">{form.notes.length}/{NOTES_MAX}</p>
      </Field>

      {serverError && <p className="text-sm text-foreground" role="alert"><span className="mr-2 font-mono text-[0.6875rem] uppercase tracking-widest text-[hsl(var(--ember))]">Not saved</span>{serverError}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <HoloButton variant="ghost" onClick={onCancel} disabled={busy}>Cancel</HoloButton>
        <HoloButton type="submit" loading={busy}>{initial ? 'Save changes' : 'Record contract'}</HoloButton>
      </div>
    </form>
  );
}
