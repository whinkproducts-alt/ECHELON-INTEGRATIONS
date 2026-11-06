'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/brand';
import { getCompanies } from '@/components/brand/companies';
import { HoloOrbBackdrop } from '@/components/ui/holo';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { DemoConsole } from './demo-console';
import { CAPABILITIES, CONTRASTS, TOUR } from './landing-data';
import { btnPrimary, btnSecondary } from './ui';
import styles from './landing.module.css';

export function LandingScreen() {
  const { productName, acronymExpansion, companyName, studioName, termsUrl, privacyUrl } = useTenantConfig();
  const companies = getCompanies();

  return (
    <div className="public-surface min-h-[100dvh] bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${productName} home`}>
          <BrandMark company="ultimate" size={36} glow={false} interactive={false} />
          <span className="font-display text-base font-semibold tracking-tight">{productName}</span>
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/login" className={cn(btnSecondary, 'min-h-10 px-4')}>Sign in</Link>
        </nav>
      </header>

      <main>
        <section aria-labelledby="hero-title" className="relative">
          <HoloOrbBackdrop stars={40} floor={false} className="opacity-30" />
          <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 pb-16 pt-8 sm:pb-24 lg:min-h-[640px] lg:grid-cols-[1.2fr_1fr] lg:gap-14">
            <div className="flex flex-col gap-6">
              <p className={cn('font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground', styles.rise)}>{acronymExpansion}</p>
              <h1 id="hero-title" className={cn('text-balance font-display text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-[3.25rem] xl:text-[3.5rem]', styles.rise)} style={{ '--d': '80ms' } as React.CSSProperties}>
                An AI chief of staff that asks first.
              </h1>
              <p className={cn('max-w-xl text-lg text-secondary-foreground', styles.rise)} style={{ '--d': '160ms' } as React.CSSProperties}>
                It keeps your projects and decisions moving, and it waits for your approval before it spends money, sends anything out, or shares private information.
              </p>
              <div className={cn('flex flex-col gap-3 sm:flex-row', styles.rise)} style={{ '--d': '240ms' } as React.CSSProperties}>
                <Link href="/signup" className={cn(btnPrimary, 'sm:min-w-44')}>Create account <ArrowRight className="h-4 w-4" aria-hidden /></Link>
                <Link href="/login" className={cn(btnSecondary, 'sm:min-w-32')}>Sign in</Link>
              </div>
            </div>
            <DemoConsole />
          </div>
        </section>

        <section aria-labelledby="tour-title" className="mx-auto w-full max-w-6xl px-6 pb-16 sm:pb-24">
          <div className="mb-10 flex flex-col gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Product tour</p>
            <h2 id="tour-title" className="max-w-xl text-balance font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">See what it keeps in front of you.</h2>
            <p className="text-sm text-muted-foreground">Real screens, shown with sample data.</p>
          </div>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-10 lg:grid-cols-6">
            {TOUR.map((t, i) => (
              <li key={t.id} className={cn('group flex flex-col gap-3', i === 0 ? 'lg:col-span-4' : i === 1 ? 'lg:col-span-2' : 'lg:col-span-3')}>
                <div className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_60px_-28px_hsl(var(--base)/0.95)] transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0', i === 1 && 'lg:flex-1')}>
                  <Image src={t.src} alt={t.alt} width={t.width} height={t.height} sizes={i === 0 ? '(min-width: 1024px) 66vw, 100vw' : i === 1 ? '(min-width: 1024px) 33vw, 100vw' : '(min-width: 1024px) 50vw, 100vw'} className={cn('h-auto w-full', i === 1 && 'lg:h-full lg:origin-[0%_30%] lg:scale-[1.15] lg:object-cover lg:object-[0%_30%]')} />
                </div>
                <p className="max-w-md text-sm text-muted-foreground">{t.caption}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="jobs-title" className="mx-auto w-full max-w-6xl px-6 pb-16 sm:pb-24">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-20">
            <div className="lg:sticky lg:top-10 lg:self-start">
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">What it does</p>
              <h2 id="jobs-title" className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">The job of a chief of staff.</h2>
            </div>
            <ol className="flex flex-col divide-y divide-border border-y border-border">
              {CAPABILITIES.map((c, i) => (
                <li key={c.id} className="grid grid-cols-1 gap-3 py-8 sm:grid-cols-[3rem_1fr]">
                  <span className="font-mono text-sm text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                  <div className="flex flex-col gap-2">
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{c.tag}</p>
                    <h3 className="max-w-lg text-balance font-display text-2xl font-semibold tracking-tight sm:text-3xl">{c.title}</h3>
                    <p className="max-w-xl text-base text-muted-foreground">{c.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="why-title" className="border-y border-border bg-card">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
            <h2 id="why-title" className="mb-12 max-w-xl text-balance font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Why not a general assistant.</h2>
            <ul className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
              {CONTRASTS.map((c) => (
                <li key={c.id} className="flex flex-col gap-3">
                  <h3 className="font-display text-xl font-semibold tracking-tight">{c.heading}</h3>
                  <p className="text-sm text-muted-foreground">{c.general}</p>
                  <p className="text-sm text-foreground">{c.here}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="cta-title" className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-6 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-14">
          <div className="flex flex-col items-start gap-6">
            <h2 id="cta-title" className="max-w-lg text-balance font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Start with one decision.</h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className={cn(btnPrimary, 'sm:min-w-44')}>Create account <ArrowRight className="h-4 w-4" aria-hidden /></Link>
              <Link href="/login" className={btnSecondary}>Sign in</Link>
            </div>
          </div>
          <ul className="flex flex-col divide-y divide-border border-y border-border text-base">
            <li className="py-4"><span className="font-medium text-foreground">Approvals first.</span> <span className="text-muted-foreground">Money and private information wait for your yes.</span></li>
            <li className="py-4"><span className="font-medium text-foreground">A record of everything.</span> <span className="text-muted-foreground">Each action is written to a ledger you can read.</span></li>
            <li className="py-4"><span className="font-medium text-foreground">Your data, your call.</span> <span className="text-muted-foreground">Delete memories yourself, or ask to delete your account.</span></li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{productName} is built by {studioName}, part of {companyName}.</p>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Link href={termsUrl ?? '/terms'} className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Terms</Link>
            <Link href={privacyUrl ?? '/privacy'} className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Privacy</Link>
            {companies.filter((c) => c.id !== 'ultimate').map((c) => c.url ? (
              <a key={c.id} href={c.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{c.name}</a>
            ) : null)}
          </nav>
        </div>
      </footer>
    </div>
  );
}
