'use client';

import { useRouter } from 'next/navigation';
import { promptHref } from '@/components/screens/conversation-helpers/slash-commands';

const FIRST_REQUESTS = [
  { label: 'Get my briefing', prompt: 'Brief me on what needs my attention', detail: 'A short view of priorities, approvals, and blockers.' },
  { label: 'Plan my week', prompt: 'Help me plan my week', detail: 'Turn the next seven days into a practical starting plan.' },
  { label: 'Set expectations', prompt: 'Explain what you can do and what you will always ask me about first', detail: 'See what WHINK handles and where it pauses for you.' },
];

/** Three starter chips. They only open the conversation with the text prefilled; the user presses send. */
export function FirstRequestCard({ productName }: { productName: string }) {
  const router = useRouter();
  return (
    <section aria-labelledby="first-request-title" className="rounded-xl border border-primary/20 bg-primary/[0.04] p-5 shadow-[0_18px_40px_-30px_hsl(var(--primary)/0.8)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Start with one decision</p>
          <h2 id="first-request-title" className="mt-1 text-lg font-display font-semibold tracking-tight text-foreground">Your first request</h2>
        </div>
        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[0.6875rem] text-muted-foreground">Nothing sent yet</span>
      </div>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Choose a starting point. We will open the conversation with your words filled in; you decide when to send. {productName} asks before it spends money, sends anything out, or shares private information.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {FIRST_REQUESTS.map((p) => (
          <button
            key={p.prompt}
            type="button"
            onClick={() => router.push(promptHref(p.prompt))}
            className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 text-left transition-[transform,border-color,background-color] motion-safe:hover:-translate-y-0.5 hover:border-primary/60 hover:bg-card/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="min-w-0"><span className="block text-sm font-medium text-foreground">{p.label}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{p.detail}</span></span>
            <span aria-hidden className="shrink-0 text-lg text-primary transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        ))}
      </div>
    </section>
  );
}
