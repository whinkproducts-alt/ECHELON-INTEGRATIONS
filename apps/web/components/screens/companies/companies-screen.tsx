'use client';
// CompaniesScreen: the group hub. Names, roles, descriptions and urls all come from config/companies.json via components/brand.
// A company with url null shows a visible "Link not set" state with where to set it; nothing is ever guessed.
// Brand-asset gallery files live in public/brand/. Logos have black backgrounds, so they are blended with the same class BrandMark uses.
import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, ExternalLink, Link2Off } from 'lucide-react';
import { getSubsidiaryList } from '@/components/subsidiaries/subsidiary-map';
import { BrandMark, getCompany, getCompanies, getProductSites, type Company } from '@/components/brand';
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
  const products = getProductSites();

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

        <section aria-labelledby="subs-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="subs-title" className="font-display text-xl font-semibold text-foreground">Subsidiaries</h2>
            <Link href="/dashboard/subsidiaries" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Open the Subsidiaries hub <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,12rem),1fr))]">
            {getSubsidiaryList().map((sub) => (
              <li key={sub.id}>
                <HoloPanel interactive className="h-full">
                  <Link href={`/dashboard/subsidiaries/${sub.id}`} className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                    <Image src={sub.logo} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-md object-cover" />
                    <span className="min-w-0 font-display text-base font-semibold text-foreground">{sub.name}</span>
                  </Link>
                </HoloPanel>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="sites-title" className="space-y-4">
          <h2 id="sites-title" className="font-display text-xl font-semibold text-foreground">Product websites</h2>
          <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
            {products.map((p) => (
              <li key={p.id}>
                <HoloPanel interactive className="h-full">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${p.name} website in a new tab`} className="flex items-center gap-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                    {p.logo ? (
                      <Image src={p.logo} alt="" width={56} height={56} className="holo-brand-img h-14 w-14 rounded-md object-contain" />
                    ) : (
                      <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-[hsl(var(--base))] font-display text-xl font-semibold text-primary">{p.name.slice(0, 1)}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg font-semibold text-foreground">{p.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{p.url.replace(/^https?:\/\//, '')}</span>
                      {!p.logo && <span className="mt-1 block text-xs text-muted-foreground">Logo not provided yet</span>}
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  </a>
                </HoloPanel>
              </li>
            ))}
          </ul>
        </section>

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
