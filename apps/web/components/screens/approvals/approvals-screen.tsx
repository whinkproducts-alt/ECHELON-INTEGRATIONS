'use client';
// Approvals inbox. Top: requests waiting for a decision, using the existing approval card (so approve,
// deny and spoken codes behave exactly as in the conversation). Below: history of every request.
// Decisions are never reimplemented here. Amber appears only on requests that are waiting.
import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { PendingApprovals } from '@/components/screens/today/pending-approvals';
import { HoloButton, HoloHeading, HoloOrbBackdrop } from '@/components/ui/holo';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { ApprovalDrawer } from './approval-drawer';
import { HistoryTable } from './history-table';

export function ApprovalsScreen() {
  const { productName } = useTenantConfig();
  const [nonce, setNonce] = React.useState(0);
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <div className="relative isolate">
      <HoloOrbBackdrop stars={40} />
      <div className="relative mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-8">
        <HoloHeading
          eyebrow="Governance"
          title="Approvals"
          description={`Anything that moves money or shares proprietary information waits here for your yes. ${productName} never does it first, and each request expires after 30 seconds.`}
          actions={<HoloButton variant="ghost" size="sm" leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={() => setNonce((n) => n + 1)}>Refresh history</HoloButton>}
        />

        <section aria-labelledby="pending-title" className="space-y-3">
          <h2 id="pending-title" className="font-display text-2xl font-semibold text-foreground">Waiting for you</h2>
          <PendingApprovals />
        </section>

        <section aria-labelledby="history-title" className="space-y-3">
          <div>
            <h2 id="history-title" className="font-display text-2xl font-semibold text-foreground">History</h2>
            <p className="text-sm text-muted-foreground">Every request, whether it ran, was denied, expired or failed. Select a row to see the exact content and its ledger trail.</p>
          </div>
          <HistoryTable nonce={nonce} onOpen={setOpen} />
        </section>
      </div>
      <ApprovalDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
