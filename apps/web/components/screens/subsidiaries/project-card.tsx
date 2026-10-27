'use client';
import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, HelpCircle, ListChecks, UserPlus } from 'lucide-react';
import { HoloBadge, HoloPanel } from '@/components/ui/holo';
import { ProgressRing } from './subsidiary-logo';
import { fmtDate, humanize, plural, statusTone } from './format';
import type { ProjectCardData } from './types';

export function ProjectPortfolioCard({ p, href, assignHref }: { p: ProjectCardData; href: string; assignHref?: string }) {
  const { tasksDone, tasksTotal, percent } = p.progress;
  return (
    <HoloPanel as="article" interactive className="relative h-full">
      <div className="flex items-start gap-4">
        <ProgressRing percent={percent} label={`${p.name} progress`} />
        <div className="min-w-0 flex-1">
          <HoloBadge tone={statusTone(p.status)} dot>{humanize(p.status)}</HoloBadge>
          <h3 className="mt-2 font-display text-lg font-semibold leading-snug text-foreground">
            <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{p.name}</Link>
          </h3>
          {p.goal && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.goal}</p>}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="flex items-center gap-2"><ListChecks className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /><dt className="sr-only">Tasks</dt><dd className="font-mono tabular-nums">{tasksDone}/{tasksTotal} tasks done</dd></div>
        <div className="flex items-start gap-2 sm:col-span-2"><CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /><dt className="sr-only">Next milestone</dt>
          <dd className="min-w-0">{p.nextMilestone ? <><span className="text-foreground">{p.nextMilestone.title}</span> <span className="font-mono">{fmtDate(p.nextMilestone.dueDate)}</span></> : 'No upcoming milestone'}</dd></div>
        <div className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /><dt className="sr-only">Open risks</dt><dd className="font-mono tabular-nums">{plural(p.openRisks, 'open risk')}</dd></div>
        <div className="flex items-center gap-2"><HelpCircle className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /><dt className="sr-only">Open questions</dt><dd className="font-mono tabular-nums">{plural(p.openQuestions, 'open question')}</dd></div>
      </dl>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
        <span className="font-mono uppercase tracking-[0.18em] text-primary">Full report</span>
        {assignHref && (
          <Link href={assignHref} className="relative z-10 inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            <UserPlus className="h-3.5 w-3.5" aria-hidden />Assign subsidiary
          </Link>
        )}
      </div>
    </HoloPanel>
  );
}
