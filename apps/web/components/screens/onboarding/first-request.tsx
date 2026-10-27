'use client';

import { useRouter } from 'next/navigation';
import { promptHref } from '@/components/screens/conversation-helpers/slash-commands';

const FIRST_REQUESTS = [
  'Brief me on what needs my attention',
  'Help me plan my week',
  'Explain what you can do and what you will always ask me about first',
];

/** Three starter chips. They only open the conversation with the text prefilled; the user presses send. */
export function FirstRequestCard({ productName }: { productName: string }) {
  const router = useRouter();
  return (
    <section aria-labelledby="first-request-title" className="rounded-lg border border-border bg-secondary/50 p-4">
      <h2 id="first-request-title" className="text-sm font-medium text-foreground">Your first request</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick one to start. It is filled in for you and nothing is sent until you press send. {productName} asks before it spends money, sends anything out, or shares private information.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {FIRST_REQUESTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => router.push(promptHref(p))}
            className="rounded-md border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition-[transform,opacity] motion-safe:hover:-translate-y-0.5 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {p}
          </button>
        ))}
      </div>
    </section>
  );
}
