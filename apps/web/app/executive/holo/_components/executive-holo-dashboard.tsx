'use client';

import { HoloSurface } from '@/components/holo/holo-surface';

export function ExecutiveHoloDashboard({ userId }: { userId: string }) {
  return (
    <div className="h-full w-full">
      <HoloSurface />
    </div>
  );
}
