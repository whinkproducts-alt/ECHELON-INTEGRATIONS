'use client';
// Add or edit a contact. Phone must be E.164 (the API enforces it too). Tags are comma separated.
import * as React from 'react';
import { HoloButton } from '@/components/ui/holo';
import { readError, type Contact } from './types';

const E164 = /^\+[1-9]\d{7,14}$/;
const field = 'w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';

function L({ ids, id, children }: { ids: string; id: string; children: React.ReactNode }) {
  return <label htmlFor={`${ids}-${id}`} className="mb-1 block font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">{children}</label>;
}

export function ContactForm({ contact, onSaved, onCancel }: { contact: Contact | null; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = React.useState(contact?.name ?? '');
  const [email, setEmail] = React.useState(contact?.email ?? '');
  const [phone, setPhone] = React.useState(contact?.phone ?? '');
  const [company, setCompany] = React.useState(contact?.company ?? '');
  const [tags, setTags] = React.useState(contact?.tags.join(', ') ?? '');
  const [notes, setNotes] = React.useState(contact?.notes ?? '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ids = React.useId();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    if (phone.trim() && !E164.test(phone.trim())) { setError('Phone must be in international format, for example +14035550123.'); return; }
    setBusy(true);
    setError(null);
    const payload = {
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      company: company.trim() || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      notes: notes.trim() || null,
    };
    fetch(contact ? `/api/contacts/${encodeURIComponent(contact.id)}` : '/api/contacts', {
      method: contact ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, `Save failed (${res.status})`));
        onSaved();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Save failed'))
      .finally(() => setBusy(false));
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div><L ids={ids} id="name">Name</L><input id={`${ids}-name`} className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required autoComplete="off" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><L ids={ids} id="email">Email</L><input id={`${ids}-email`} type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="off" /></div>
        <div><L ids={ids} id="phone">Phone</L><input id={`${ids}-phone`} type="tel" className={field} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+14035550123" autoComplete="off" /></div>
      </div>
      <div><L ids={ids} id="company">Company</L><input id={`${ids}-company`} className={field} value={company} onChange={(e) => setCompany(e.target.value)} maxLength={200} autoComplete="off" /></div>
      <div>
        <L ids={ids} id="tags">Tags</L>
        <input id={`${ids}-tags`} className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="client, calgary" autoComplete="off" aria-describedby={`${ids}-tagshelp`} />
        <p id={`${ids}-tagshelp`} className="mt-1 text-xs text-muted-foreground">Separate with commas. To message on Telegram, add a tag like telegram:123456789 (the chat id).</p>
      </div>
      <div><L ids={ids} id="notes">Notes</L><textarea id={`${ids}-notes`} className={field} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></div>
      {error && <p role="alert" className="text-xs text-foreground"><span className="font-mono uppercase tracking-widest text-[hsl(var(--ember))]">Error</span> {error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <HoloButton variant="ghost" type="button" onClick={onCancel}>Cancel</HoloButton>
        <HoloButton type="submit" loading={busy}>{contact ? 'Save changes' : 'Add contact'}</HoloButton>
      </div>
    </form>
  );
}
