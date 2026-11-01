'use client';
// BoardGallery: hero portrait cards. Shows only what board.json supplies. Null fields render a "Details pending" badge,
// never an invented value.
import * as React from 'react';
import Image from 'next/image';
import { HoloBadge, HoloGrid, HoloPanel } from '@/components/ui/holo';
import type { BoardMember } from '@/lib/board';
import { TiltCard } from './tilt-card';

export function displayName(m: BoardMember): string {
  return m.name;
}

export function BoardGallery({ members }: { members: BoardMember[] }) {
  return (
    <HoloGrid as="ul" min="17rem" gap="1.25rem">
      {members.map((m) => (
        <li key={m.id} className="list-none">
          <TiltCard className="h-full">
            <HoloPanel as="article" padded={false} interactive glow={m.needsDetails ? 'none' : 'soft'} tone={m.needsDetails ? 'neutral' : 'accent'} className="h-full overflow-hidden">
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-[hsl(var(--surface))]">
                {m.imageUrl ? (
                  <Image src={m.imageUrl} alt={`Portrait of ${m.name}`} fill sizes="(max-width: 640px) 90vw, 18rem" className="object-cover object-top" />
                ) : (
                  <div className="flex h-full items-center justify-center font-display text-5xl text-muted-foreground" aria-hidden>{m.name.slice(0, 1)}</div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[hsl(var(--base))] via-[hsl(var(--base)/0.6)] to-transparent" aria-hidden />
                {m.needsDetails && (
                  <div className="absolute right-3 top-3"><HoloBadge tone="accent" dot className="bg-[hsl(var(--base)/0.78)] backdrop-blur-sm">Details pending</HoloBadge></div>
                )}
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <h3 className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground holo-text-glow">{displayName(m)}</h3>
                  <p className="mt-1 font-mono text-[0.6875rem] uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--whink-accent))' }}>
                    {m.seat ?? 'Seat not yet assigned'}
                  </p>
                </div>
              </div>
              <dl className="space-y-2 p-4 text-sm">
                <div>
                  <dt className="font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">Committees</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {m.committees.length > 0
                      ? m.committees.map((c) => <HoloBadge key={c} tone="deep">{c}</HoloBadge>)
                      : <span className="text-muted-foreground">None recorded</span>}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">Email</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-foreground">
                    {m.email ? <a href={`mailto:${m.email}`} className="hover:underline focus-visible:underline">{m.email}</a> : <span className="text-muted-foreground">{m.kind === 'ai' ? 'AI board member' : 'Pending surname'}</span>}
                  </dd>
                </div>
                {m.bio && <p className="text-xs text-muted-foreground">{m.bio}</p>}
              </dl>
            </HoloPanel>
          </TiltCard>
        </li>
      ))}
    </HoloGrid>
  );
}
