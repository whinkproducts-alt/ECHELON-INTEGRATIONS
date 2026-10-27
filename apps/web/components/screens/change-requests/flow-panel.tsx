import * as React from 'react';
import { GitPullRequest } from 'lucide-react';
import { HoloPanel } from '@/components/ui/holo';

export function FlowPanel() {
  return (
    <HoloPanel as="section" aria-label="How change requests work" tone="deep" padded className="!p-4">
      <div className="flex items-start gap-3">
        <GitPullRequest className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground">A build agent opens a pull request. Nothing is merged without you.</p>
          <p className="text-muted-foreground">You write the change, WHINK turns it into a spec, and you approve the exact issue text before it leaves your account. Merging stays your decision on GitHub.</p>
        </div>
      </div>
    </HoloPanel>
  );
}
