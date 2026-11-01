'use client';
// Drag and drop (or choose) a .vcf file exported from Contacts. Posts multipart to /api/contacts/import and
// shows the server's summary. Names and notes inside the file are data; this component never renders them.
import * as React from 'react';
import { FileUp } from 'lucide-react';
import { HoloPanel, HoloBadge } from '@/components/ui/holo';
import { cn } from '@/lib/utils';
import { readError, type ImportResult } from './types';

type Phase = { kind: 'idle' } | { kind: 'busy'; name: string } | { kind: 'done'; result: ImportResult } | { kind: 'error'; message: string };

export function VCardDropzone({ onImported }: { onImported: () => void }) {
  const [phase, setPhase] = React.useState<Phase>({ kind: 'idle' });
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const uid = React.useId();

  const send = (file: File | undefined) => {
    if (!file) return;
    if (!/\.(vcf|vcard)$/i.test(file.name)) {
      setPhase({ kind: 'error', message: 'That is not a .vcf file. Export your contacts from the Contacts app as vCard.' });
      return;
    }
    setPhase({ kind: 'busy', name: file.name });
    const fd = new FormData();
    fd.append('file', file);
    fetch('/api/contacts/import', { method: 'POST', body: fd })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, `Import failed (${res.status})`));
        const d = (await res.json()) as Partial<ImportResult>;
        const result: ImportResult = {
          parsed: Number(d.parsed ?? 0), imported: Number(d.imported ?? 0), duplicates: Number(d.duplicates ?? 0),
        };
        setPhase({ kind: 'done', result });
        onImported();
      })
      .catch((e: unknown) => setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Import failed' }))
      .finally(() => { if (inputRef.current) inputRef.current.value = ''; });
  };

  return (
    <HoloPanel tone="accent" className="!p-0">
      <label
        htmlFor={uid}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files?.[0]); }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-[inherit] border border-dashed border-border px-5 py-7 text-center transition-colors',
          'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
          over && 'border-primary bg-primary/5',
        )}
      >
        <FileUp className="h-6 w-6 text-primary" aria-hidden />
        <span className="font-display text-base font-medium text-foreground">Import contacts from a vCard</span>
        <span className="max-w-md text-xs text-muted-foreground">
          Drop a .vcf file here, or choose one. On a Mac: open Contacts, select people, then File, Export, Export vCard.
        </span>
        <input
          id={uid} ref={inputRef} type="file" accept=".vcf,.vcard,text/vcard,text/x-vcard" className="sr-only"
          onChange={(e) => send(e.target.files?.[0])}
          disabled={phase.kind === 'busy'}
        />
      </label>
      <div className="px-5 pb-4 pt-3" role="status" aria-live="polite">
        {phase.kind === 'busy' && <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="holo-spinner" aria-hidden />Importing {phase.name}</p>}
        {phase.kind === 'done' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <HoloBadge tone="accent">Import complete</HoloBadge>
            <span className="font-mono text-foreground">{phase.result.parsed} read</span>
            <span className="font-mono text-foreground">{phase.result.imported} added</span>
            <span className="font-mono text-muted-foreground">{phase.result.duplicates} already here</span>
          </div>
        )}
        {phase.kind === 'error' && <p className="text-xs text-foreground" role="alert"><HoloBadge tone="ember">Error</HoloBadge> <span className="ml-2">{phase.message}</span></p>}
        {phase.kind === 'idle' && <p className="text-xs text-muted-foreground">Nothing imported yet this visit.</p>}
      </div>
    </HoloPanel>
  );
}
