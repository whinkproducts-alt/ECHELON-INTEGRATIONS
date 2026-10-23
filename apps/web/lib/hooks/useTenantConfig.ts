'use client';

import { useState, useEffect } from 'react';

export interface TenantConfig {
  productName: string;
  logoUrl: string | null;
  /** Tenant-supplied accent. Null means "use the design token"; no colour lives in code. */
  accentColor: string | null;
  supportUrl: string | null;
  privacyUrl: string | null;
  termsUrl: string | null;
  loading: boolean;
}

const DEFAULT_CONFIG: TenantConfig = {
  productName: 'WHINK',
  logoUrl: null,
  accentColor: null,
  supportUrl: null,
  privacyUrl: null,
  termsUrl: null,
  loading: true,
};

export function useTenantConfig(): TenantConfig {
  const [config, setConfig] = useState<TenantConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    fetch('/api/tenant/config')
      .then((r) => r.json())
      .then((data) => {
        setConfig({
          productName: data.productName ?? 'WHINK',
          logoUrl: data.logoUrl ?? null,
          accentColor: data.accentColor ?? null,
          supportUrl: data.supportUrl ?? null,
          privacyUrl: data.privacyUrl ?? null,
          termsUrl: data.termsUrl ?? null,
          loading: false,
        });
      })
      .catch(() => setConfig((c) => ({ ...c, loading: false })));
  }, []);

  return config;
}
