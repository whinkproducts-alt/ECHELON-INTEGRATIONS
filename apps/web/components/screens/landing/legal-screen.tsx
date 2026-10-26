'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { LEGAL_CONTACT_EMAIL, LEGAL_DRAFT_NOTICE, LEGAL_LAST_UPDATED, PRIVACY, TERMS, type LegalDoc } from './legal-content';

export function LegalScreen({ doc }: { doc: 'terms' | 'privacy' }) {
  const { productName, companyName, studioName } = useTenantConfig();
  const d: LegalDoc = doc === 'terms' ? TERMS : PRIVACY;
  const values: Record<string, string> = { product: productName, company: companyName, studio: studioName, contact: LEGAL_CONTACT_EMAIL };
  const fill = (s: string) => s.replace(/\{(product|company|studio|contact)\}/g, (_m, k: string) => values[k]);
  const other = doc === 'terms' ? { href: '/privacy', label: 'Privacy policy' } : { href: '/terms', label: 'Terms of use' };
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[minmax(0,16rem)_minmax(0,40rem)] lg:gap-20 lg:py-16">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-10 lg:self-start">
          <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="h-4 w-4" aria-hidden /> {productName}
          </Link>
          <Link href={other.href} className="w-fit text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{other.label}</Link>
        </aside>
        <main className="flex flex-col gap-10">
          <header className="flex flex-col gap-4">
            <p role="note" className="w-fit rounded-md border border-border px-3 py-2 font-mono text-xs text-muted-foreground">{LEGAL_DRAFT_NOTICE}</p>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{d.title}</h1>
            <p className="font-mono text-xs text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>
            <p className="text-base text-muted-foreground">{fill(d.intro)}</p>
          </header>
          {d.sections.map((s) => (
            <section key={s.heading} className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-semibold tracking-tight">{s.heading}</h2>
              {s.paragraphs?.map((p) => <p key={p} className="text-base text-muted-foreground">{fill(p)}</p>)}
              {s.bullets && (
                <ul className="flex list-disc flex-col gap-2 pl-5 text-base text-muted-foreground marker:text-border">
                  {s.bullets.map((b) => <li key={b}>{fill(b)}</li>)}
                </ul>
              )}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
