'use client';

import { useState, useEffect } from 'react';
import type { SocialPlatform } from '@/lib/social-ui';

/** Display labels for each social platform. Overridable per tenant. */
export type PlatformLabels = Record<SocialPlatform, string>;
/** Notes shown beneath each platform card. Overridable per tenant. */
export type PlatformNotes = Record<SocialPlatform, string[]>;

const DEFAULT_PLATFORM_LABELS: PlatformLabels = {
  x: 'X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

const DEFAULT_PLATFORM_NOTES: PlatformNotes = {
  x: [],
  instagram: ['Limited: pending platform app review'],
  tiktok: ['Limited: pending platform app review', 'Posting only — no DM API'],
};

export interface TenantConfig {
  productName: string;
  logoUrl: string | null;
  /** Tenant-supplied accent. Null means "use the design token"; no colour lives in code. */
  accentColor: string | null;
  supportUrl: string | null;
  privacyUrl: string | null;
  termsUrl: string | null;
  /** Social platform display labels. Falls back to defaults when not overridden by tenant. */
  platformLabels: PlatformLabels;
  /** Notes shown beneath each platform card. Falls back to defaults when not overridden. */
  platformNotes: PlatformNotes;
  loading: boolean;
}

const DEFAULT_CONFIG: TenantConfig = {
  productName: 'Your assistant',
  logoUrl: null,
  accentColor: null,
  supportUrl: null,
  privacyUrl: null,
  termsUrl: null,
  platformLabels: DEFAULT_PLATFORM_LABELS,
  platformNotes: DEFAULT_PLATFORM_NOTES,
  loading: true,
};

export function useTenantConfig(): TenantConfig {
  const [config, setConfig] = useState<TenantConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    fetch('/api/tenant/config')
      .then((r) => r.json())
      .then((data) => {
        setConfig({
          productName: data.productName ?? 'Your assistant',
          logoUrl: data.logoUrl ?? null,
          accentColor: data.accentColor ?? null,
          supportUrl: data.supportUrl ?? null,
          privacyUrl: data.privacyUrl ?? null,
          termsUrl: data.termsUrl ?? null,
          platformLabels: {
            x: data.platformLabels?.x ?? DEFAULT_PLATFORM_LABELS.x,
            instagram: data.platformLabels?.instagram ?? DEFAULT_PLATFORM_LABELS.instagram,
            tiktok: data.platformLabels?.tiktok ?? DEFAULT_PLATFORM_LABELS.tiktok,
          },
          platformNotes: {
            x: Array.isArray(data.platformNotes?.x) ? data.platformNotes.x : DEFAULT_PLATFORM_NOTES.x,
            instagram: Array.isArray(data.platformNotes?.instagram) ? data.platformNotes.instagram : DEFAULT_PLATFORM_NOTES.instagram,
            tiktok: Array.isArray(data.platformNotes?.tiktok) ? data.platformNotes.tiktok : DEFAULT_PLATFORM_NOTES.tiktok,
          },
          loading: false,
        });
      })
      .catch(() => setConfig((c) => ({ ...c, loading: false })));
  }, []);

  return config;
}
