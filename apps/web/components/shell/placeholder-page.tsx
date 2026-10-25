'use client';
// PlaceholderPage props: navId: string (id from nav-config.ts). Renders heading + "Coming online" empty state until the real screen replaces it.
import * as React from 'react';
import { HoloEmpty, HoloHeading } from '@/components/ui/holo';
import { NAV_GROUPS, NAV_ITEMS } from './nav-config';

export function PlaceholderPage({ navId }: { navId: string }) {
  const item = NAV_ITEMS.find((i) => i.id === navId);
  const group = NAV_GROUPS.find((g) => g.id === item?.group)?.label;
  const Icon = item?.icon;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
      <HoloHeading eyebrow={group} title={item?.label ?? 'Screen'} description={item?.description} />
      <HoloEmpty title="Coming online" description="This screen is being built. The navigation, route and permissions are already in place." icon={Icon ? <Icon className="h-6 w-6" aria-hidden /> : undefined} />
    </div>
  );
}
