'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Activity, ExternalLink } from 'lucide-react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';

interface UsageData {
  messagesSent: number;
  memoryEntries: number;
  toolCalls: number;
}

export function BillingSurface() {
  const config = useTenantConfig();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/billing/usage')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setUsage(d);
        setLoadingUsage(false);
      })
      .catch(() => {
        setError(true);
        setLoadingUsage(false);
      });
  }, []);

  const productName = config.loading ? '...' : config.productName;
  const supportUrl = config.supportUrl ?? '#';

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-4">
          <CreditCard className="h-4 w-4" /> Current Plan
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-medium text-foreground">{productName} Personal — Early Access</p>
            <p className="text-xs text-muted-foreground mt-0.5">Full access during early access period</p>
          </div>
          <a
            href={supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-secondary text-foreground rounded-md text-sm font-medium hover:opacity-80 transition-opacity"
          >
            Manage billing <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Usage */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4" /> Usage this month
        </h2>

        {loadingUsage && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-secondary animate-pulse rounded-md" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">Failed to load usage data. Please refresh.</p>
        )}

        {!loadingUsage && !error && usage && (
          <div className="space-y-3">
            <UsageRow label="Messages sent" value={usage.messagesSent} />
            <UsageRow label="Memory entries written" value={usage.memoryEntries} />
            <UsageRow label="Tool calls" value={usage.toolCalls} />
          </div>
        )}
      </div>
    </div>
  );
}

function UsageRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono font-medium text-foreground">{value.toLocaleString('en-CA')}</span>
    </div>
  );
}
