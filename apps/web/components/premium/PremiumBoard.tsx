'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight, ShieldCheck, Check, Users } from 'lucide-react';
import { PersonaAvatar } from '@/components/ui/persona-avatar';
import { STAFF_DIRECTORY } from '@/lib/staff-directory';
import { officialAssets } from '@/lib/brand/official-assets';
import { PERSONAS, type PersonaType } from '@/lib/personas';

const SPECIALISTS: PersonaType[] = ['AMARA', 'MATEO', 'PRIYA', 'SOREN', 'MEI_LING', 'MAYA'];

export function PremiumBoard({ activePersona, onSelect, busy = false }: {
  activePersona: PersonaType | null;
  onSelect: (p: PersonaType) => void;
  busy?: boolean;
}) {
  const [selectedProfile, setSelectedProfile] = useState<PersonaType | null>(null);
  return (
    <div className="operations-page board-page">
      <div className="operations-heading">
        <div><p className="workspace-kicker">People & perspective</p><h1 className="workspace-title">Your advisory board<span className="text-primary">.</span></h1><p className="workspace-description">Two executive perspectives. A specialist directory. One governed workspace.</p></div>
        <Link href="/dashboard/directory" className="workspace-button workspace-button-secondary">Full directory <ArrowUpRight size={16} aria-hidden /></Link>
      </div>
      <div className="board-executives">
        {(['WHINK', 'MAMBA'] as const).map((p) => {
          const c = PERSONAS[p]; const active = activePersona === p;
          return <article key={p} className="board-executive" data-persona={p}>
            <div className="board-executive-art"><Image src={p === 'WHINK' ? officialAssets.whink : officialAssets.mamba} alt={`${c.name}, official executive portrait`} width={1122} height={1402} sizes="(min-width: 1100px) 240px, (min-width: 640px) 200px, 110px" priority /></div>
            <div className="board-executive-copy">
              <div className="flex items-center justify-between gap-3"><span className="workspace-kicker">{p === 'WHINK' ? 'Intelligence & synthesis' : 'Challenge & strategy'}</span>{active && <span className="board-active"><Check size={12} aria-hidden />Selected</span>}</div>
              <h2>{c.name}</h2><p className="board-executive-role">{c.title}</p>
              <p className="board-executive-description">{c.description}</p>
              <button type="button" disabled={busy} onClick={() => onSelect(p)} className="workspace-button workspace-button-secondary">Open conversation <ArrowRight size={16} aria-hidden /></button>
            </div>
          </article>;
        })}
      </div>
      <div className="board-governance"><ShieldCheck size={17} aria-hidden /><p>Selecting an executive changes the perspective. Your permissions, approvals and spending limits still apply.</p></div>
      <section aria-labelledby="specialists-heading" className="board-specialists">
        <div className="workspace-section-heading"><div><p className="workspace-kicker">Specialist perspectives</p><h2 id="specialists-heading" className="workspace-section-title">The wider team</h2></div><span className="workspace-count"><Users size={14} aria-hidden />6 directory profiles</span></div>
        <div className="board-specialist-grid">{SPECIALISTS.map((p) => {
          const c = PERSONAS[p]; const selected = selectedProfile === p;
          const staff = STAFF_DIRECTORY.find((member) => member.firstName.toUpperCase().replace('-', '_') === p);
          const name = staff ? `${staff.firstName} ${staff.lastName}` : c.name;
          return <article key={p} className="board-specialist" data-selected={selected}>
            <button type="button" className="board-specialist-select" aria-expanded={selected} aria-controls={`profile-${p}`} onClick={() => setSelectedProfile(selected ? null : p)}>
              <PersonaAvatar name={name} imageUrl={staff?.imageUrl} size="md" role={c.title} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{name}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{c.title}</span></span><ArrowUpRight size={17} className="text-muted-foreground" aria-hidden />
            </button>
            <p className="board-specialist-summary">{c.description}</p>
            <div hidden={!selected} id={`profile-${p}`} className="board-profile-details">
              {staff && <p className="break-all font-mono text-xs text-muted-foreground">{staff.email}</p>}
              <div className="mt-3 flex flex-wrap gap-2">{c.capabilities.map(cap => <span key={cap} className="board-capability">{cap}</span>)}</div>
              <p className="mt-3 text-xs text-muted-foreground">Direct conversation unavailable for this profile.</p>
            </div>
            <span className="board-profile-label">Directory profile</span>
          </article>;
        })}</div>
      </section>
    </div>
  );
}
