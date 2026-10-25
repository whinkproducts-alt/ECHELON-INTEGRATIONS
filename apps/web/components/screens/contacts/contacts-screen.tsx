'use client';
// Contacts & Calls. Data: GET /api/contacts, PATCH/DELETE /api/contacts/[id], POST /api/contacts/import.
// Message and Call open the composer, which creates a Class C approval request. Nothing is sent until approved.
import * as React from 'react';
import { MessageSquare, Phone, Pencil, Trash2, Search, UserPlus, RefreshCw, Info } from 'lucide-react';
import { PersonaAvatar } from '@/components/ui/persona-avatar';
import {
  HoloBadge, HoloButton, HoloEmpty, HoloGrid, HoloHeading, HoloModal, HoloPanel,
} from '@/components/ui/holo';
import { VCardDropzone } from './vcard-dropzone';
import { ContactForm } from './contact-form';
import { ContactComposer } from './contact-composer';
import { matchesQuery, normalizeContact, readError, type Channel, type Contact } from './types';

type Load = 'loading' | 'ready' | 'error';
type Dialog = { kind: 'form'; contact: Contact | null } | { kind: 'compose'; contact: Contact; channel: Channel } | null;

export function ContactsScreen() {
  const [load, setLoad] = React.useState<Load>('loading');
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [query, setQuery] = React.useState('');
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    fetch('/api/contacts')
      .then((r) => { if (!r.ok) throw new Error('load_failed'); return r.json() as Promise<{ contacts?: unknown[] }>; })
      .then((d) => {
        if (!live) return;
        setContacts((Array.isArray(d.contacts) ? d.contacts : []).map(normalizeContact).filter((c): c is Contact => c !== null));
        setLoad('ready');
      })
      .catch(() => { if (live) setLoad('error'); });
    return () => { live = false; };
  }, [tick]);

  const reload = () => setTick((t) => t + 1);
  const retry = () => { setLoad('loading'); reload(); };

  const remove = (c: Contact) => {
    setActionError(null);
    fetch(`/api/contacts/${encodeURIComponent(c.id)}`, { method: 'DELETE' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, `Delete failed (${res.status})`));
        setConfirmDelete(null);
        reload();
      })
      .catch((e: unknown) => setActionError(e instanceof Error ? e.message : 'Delete failed'));
  };

  const shown = contacts.filter((c) => matchesQuery(c, query));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
      <HoloHeading
        eyebrow="People"
        title="Contacts & Calls"
        description="Everyone you deal with. Every message and call is drafted here, shown to you exactly as written, and sent only after you approve that specific request."
        actions={<HoloButton leftIcon={<UserPlus className="h-4 w-4" aria-hidden />} onClick={() => setDialog({ kind: 'form', contact: null })}>Add contact</HoloButton>}
      />

      <HoloPanel tone="neutral" padded className="!p-3" role="note">
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><span className="font-medium text-foreground">Google Contacts live sync is not connected yet.</span> Importing a vCard (.vcf) file is the supported way to bring contacts in today.</span>
        </p>
      </HoloPanel>

      <VCardDropzone onImported={reload} />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search contacts"
          placeholder="Search by name, company, tag, email or phone"
          className="w-full rounded-lg border border-border bg-background/60 py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        />
      </div>

      {actionError && <p role="alert" className="text-xs text-foreground"><span className="mr-2 font-mono uppercase tracking-widest text-[hsl(var(--ember))]">Error</span>{actionError}</p>}

      {load === 'loading' && (
        <HoloGrid min="19rem" className="min-h-[8rem]">
          {[0, 1, 2].map((i) => (
            <HoloPanel key={i} aria-hidden className="h-36 animate-pulse"><span className="sr-only">Loading</span></HoloPanel>
          ))}
          <p className="sr-only" role="status">Loading contacts</p>
        </HoloGrid>
      )}
      {load === 'error' && (
        <HoloEmpty state="error" title="Contacts did not load" description="The server could not return your contacts. Nothing has changed."
          action={<HoloButton variant="ghost" leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={retry}>Try again</HoloButton>} />
      )}
      {load === 'ready' && contacts.length === 0 && (
        <HoloEmpty title="No contacts yet" description="Import a vCard file above or add someone by hand. Contacts stay in your account."
          action={<HoloButton onClick={() => setDialog({ kind: 'form', contact: null })}>Add the first contact</HoloButton>} />
      )}
      {load === 'ready' && contacts.length > 0 && shown.length === 0 && (
        <HoloEmpty title="No match" description="No contact matches that search." action={<HoloButton variant="ghost" onClick={() => setQuery('')}>Clear search</HoloButton>} />
      )}
      {load === 'ready' && shown.length > 0 && (
        <>
          <p className="font-mono text-xs text-muted-foreground" aria-live="polite">{shown.length} of {contacts.length} shown</p>
          <HoloGrid min="19rem" as="ul">
            {shown.map((c) => (
              <li key={c.id} className="list-none">
                <HoloPanel as="article" aria-label={c.name} className="h-full">
                  <div className="flex items-start gap-3">
                    <PersonaAvatar name={c.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-display text-lg font-semibold text-foreground">{c.name}</h2>
                      {c.company && <p className="truncate text-xs text-muted-foreground">{c.company}</p>}
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{c.email ?? 'no email'}</p>
                      <p className="font-mono text-xs text-muted-foreground">{c.phone ?? 'no phone'}</p>
                    </div>
                    <HoloBadge tone={c.source === 'vcard' ? 'deep' : 'neutral'}>{c.source === 'vcard' ? 'vCard' : c.source}</HoloBadge>
                  </div>
                  {c.tags.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
                      {c.tags.map((t) => <li key={t} className="list-none"><HoloBadge tone="accent">{t}</HoloBadge></li>)}
                    </ul>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <HoloButton size="sm" leftIcon={<MessageSquare className="h-3.5 w-3.5" aria-hidden />} onClick={() => setDialog({ kind: 'compose', contact: c, channel: 'SMS' })} aria-label={`Message ${c.name}`}>Message</HoloButton>
                    <HoloButton size="sm" variant="ghost" leftIcon={<Phone className="h-3.5 w-3.5" aria-hidden />} onClick={() => setDialog({ kind: 'compose', contact: c, channel: 'PHONE_CALL' })} aria-label={`Call ${c.name}`}>Call</HoloButton>
                    <HoloButton size="sm" variant="ghost" tone="neutral" leftIcon={<Pencil className="h-3.5 w-3.5" aria-hidden />} onClick={() => setDialog({ kind: 'form', contact: c })} aria-label={`Edit ${c.name}`}>Edit</HoloButton>
                    {confirmDelete === c.id ? (
                      <>
                        <HoloButton size="sm" variant="danger" onClick={() => remove(c)}>Confirm delete</HoloButton>
                        <HoloButton size="sm" variant="ghost" tone="neutral" onClick={() => setConfirmDelete(null)}>Keep</HoloButton>
                      </>
                    ) : (
                      <HoloButton size="sm" variant="ghost" tone="neutral" leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden />} onClick={() => setConfirmDelete(c.id)} aria-label={`Delete ${c.name}`}>Delete</HoloButton>
                    )}
                  </div>
                </HoloPanel>
              </li>
            ))}
          </HoloGrid>
        </>
      )}

      <HoloModal
        open={dialog?.kind === 'form'} onOpenChange={(o) => { if (!o) setDialog(null); }}
        title={dialog?.kind === 'form' && dialog.contact ? 'Edit contact' : 'Add contact'}
      >
        {dialog?.kind === 'form' && (
          <ContactForm key={dialog.contact?.id ?? 'new'} contact={dialog.contact} onCancel={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); }} />
        )}
      </HoloModal>

      <HoloModal
        open={dialog?.kind === 'compose'} onOpenChange={(o) => { if (!o) setDialog(null); }} width="40rem"
        title={dialog?.kind === 'compose' ? (dialog.channel === 'PHONE_CALL' ? `Call ${dialog.contact.name}` : `Message ${dialog.contact.name}`) : 'Compose'}
        description="Review the exact content. Nothing leaves until you approve the request."
      >
        {dialog?.kind === 'compose' && (
          <ContactComposer key={dialog.contact.id} contact={dialog.contact} initialChannel={dialog.channel} onClose={() => setDialog(null)} />
        )}
      </HoloModal>
    </div>
  );
}

export default ContactsScreen;
