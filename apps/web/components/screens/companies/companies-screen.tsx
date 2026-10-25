'use client';
// CompaniesScreen: the group hub. Names, roles, descriptions and urls all come from config/companies.json via components/brand.
// A company with url null shows a visible "Link not set" state with where to set it; nothing is ever guessed.
// Brand-asset gallery files live in public/brand/. Logos have black backgrounds, so they are blended with the same class BrandMark uses.
import * as React from 'react';
import Image from 'next/image';
import { ArrowDown, ExternalLink, Link2Off } from 'lucide-react';
import { BrandMark, getCompany, getCompanies, type Company } from '@/components/brand';
import { HoloBadge, HoloEmpty, HoloHeading, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import { TiltCard } from '@/components/screens/board/tilt-card';

function CompanyCard({ c, size, relation }: { c: Company; size: number; relation?: string }) {
  return (
    <div className="w-full">
      {relation && (
        <div className="flex flex-col items-center py-3 text-primary" aria-hidden>
          <span className="h-6 w-px bg-current opacity-60" />
          <ArrowDown className="h-4 w-4" />
        </div>
      )}
      {relation && <p className="-mt-1 mb-3 text-center font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-muted-foreground">{relation}</p>}
      <TiltCard>
        <HoloPanel as="article" glow="soft" brackets className="text-center">
          <div className="flex justify-center py-4"><BrandMark company={c.id} size={size} /></div>
          <h2 className="font-display text-2xl font-semibold text-foreground holo-text-glow">{c.name}</h2>
          <p className="mt-1 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-primary">{c.role}</p>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">{c.description}</p>
          <div className="mt-4 flex flex-col items-center gap-2">
            {c.url ? (
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <ExternalLink className="h-4 w-4" aria-hidden />Visit website
              </a>
            ) : (
              <>
                <HoloBadge tone="neutral"><Link2Off className="h-3 w-3" aria-hidden />Link not set</HoloBadge>
                <p className="max-w-xs text-xs text-muted-foreground">Set the website in config/companies.json (the url field for this company) and it becomes clickable here and on the logo.</p>
              </>
            )}
          </div>
        </HoloPanel>
      </TiltCard>
    </div>
  );
}

const GALLERY: Array<{ src: string; companyId: Company['id']; variant: string; aspect: number }> = [
  { src: '/brand/whink-apps-v1.jpg', companyId: 'apps', variant: 'Logo variant 1', aspect: 1.5 },
  { src: '/brand/whink-apps-v2.jpg', companyId: 'apps', variant: 'Logo variant 2', aspect: 1.5 },
  { src: '/brand/whink-ultimate-emerald.webp', companyId: 'ultimate', variant: 'Emerald colourway', aspect: 1 },
  { src: '/brand/whink-ultimate-violet.webp', companyId: 'ultimate', variant: 'Violet colourway', aspect: 1 },
];

export function CompaniesScreen() {
  const list = getCompanies();
  const group = list.find((c) => c.id === 'group');
  const apps = list.find((c) => c.id === 'apps');
  const ultimate = list.find((c) => c.id === 'ultimate');

  return (
    <div className="relative isolate min-h-full overflow-hidden">
      <HoloOrbBackdrop stars={80} />
      <div className="relative z-10 mx-auto w-full max-w-5xl space-y-12 p-4 sm:p-8">
        <HoloHeading eyebrow="Group" title={group?.name ?? 'Group'} description="One group, one studio, one app. How the companies relate and where their brand assets live." />

        {!group || !apps || !ultimate ? (
          <HoloEmpty title="Company details are incomplete" description="config/companies.json must list the group, apps and ultimate entries." />
        ) : (
          <section aria-label="Company relationship" className="mx-auto max-w-xl">
            <CompanyCard c={group} size={140} />
            <CompanyCard c={apps} size={110} relation={`${apps.name} is a subsidiary of ${group.name}`} />
            <CompanyCard c={ultimate} size={110} relation={`${ultimate.name} is built by ${apps.name}`} />
          </section>
        )}

        <section aria-labelledby="assets-title" className="space-y-4">
          <h2 id="assets-title" className="font-display text-xl font-semibold text-foreground">Brand assets</h2>
          <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,14rem),1fr))]">
            {GALLERY.map((g) => {
              const c = getCompany(g.companyId);
              return (
                <li key={g.src}>
                  <HoloPanel className="h-full"><figure className="m-0">
                    <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-md bg-[hsl(var(--base))]">
                      <Image src={g.src} alt={`${c.name}, ${g.variant}`} fill sizes="(max-width: 640px) 90vw, 14rem" className="holo-brand-img object-contain p-3" />
                    </div>
                    <figcaption className="text-sm"><span className="block font-display font-semibold text-foreground">{c.name}</span><span className="block text-xs text-muted-foreground">{g.variant}</span>
                      <span className="mt-1 block break-all font-mono text-[0.625rem] text-muted-foreground">{g.src}</span></figcaption></figure>
                  </HoloPanel>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
