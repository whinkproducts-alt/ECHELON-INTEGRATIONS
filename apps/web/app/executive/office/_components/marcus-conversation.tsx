'use client';

import { useState } from 'react';
import { ConversationSurface } from '@/app/dashboard/conversation/_components/conversation-surface';
import { ShieldCheck } from 'lucide-react';

export function MarcusConversation() {
  // Marcus conversations are always in a private, sealed scope.
  // The backend API handles the privacy/encryption enforced by the 'sealed' identifier in the route.
  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border shadow-inner">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Marcus Vale · Founder-Private
        </h2>
        <span className="text-xs text-muted-foreground font-mono px-2 py-1 bg-secondary rounded">
          Sealed Scope
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <ConversationSurface initialPrompt="Marcus, report." />
      </div>
    </div>
  );
}
