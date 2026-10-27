'use client';

import { useState, useEffect } from 'react';
import type { SocialPlatform } from '@/lib/social-ui';
import tenantDefaults from '@/config/tenant-defaults.json';

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
  /** Short app name, e.g. for title bars. Defaults from config/tenant-defaults.json. */
  appName: string;
  /** Long form including the acronym dots. */
  fullName: string;
  companyName: string;
  studioName: string;
  acronymExpansion: string;
  tagline: string;
  /** Contact address shown on the Terms and Privacy pages. */
  legalContactEmail: string;
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
  // ── Memory screen labels ──────────────────────────────────────────────────
  memoryAutoLabel: string;
  viewSourceConversation: string;
  memoryTabSemantic: string;
  memoryTabEpisodic: string;
  memoryTabEntities: string;
  memoryTabHypotheses: string;
  memoryLabelSource: string;
  memoryLabelConf: string;
  memoryLabelImportance: string;
  memoryLabelHypothesis: string;
  memoryLabelMamba: string;
  memoryLabelConfirm: string;
  memoryLabelCorrect: string;
  memoryLabelDelete: string;
  memoryLabelDeleteConfirm: string;
  // ── Citation labels ───────────────────────────────────────────────────────
  citationLabel: string;
  // ── Document upload labels ────────────────────────────────────────────────
  uploadDocumentLabel: string;
  documentsPageTitle: string;
  // ── Obsidian / adversarial mode label ────────────────────────────────────
  /** Tenant label for the MAMBA/Obsidian mode. Never hardcode MAMBA in markup. */
  obsidianLabel: string | null;
}

const DEFAULT_CONFIG: TenantConfig = {
  productName: tenantDefaults.appName,
  appName: tenantDefaults.appName,
  fullName: tenantDefaults.fullName,
  companyName: tenantDefaults.companyName,
  studioName: tenantDefaults.studioName,
  acronymExpansion: tenantDefaults.acronymExpansion,
  tagline: tenantDefaults.tagline,
  legalContactEmail: tenantDefaults.legalContactEmail,
  logoUrl: null,
  accentColor: null,
  supportUrl: null,
  privacyUrl: null,
  termsUrl: null,
  platformLabels: DEFAULT_PLATFORM_LABELS,
  platformNotes: DEFAULT_PLATFORM_NOTES,
  loading: true,
  memoryAutoLabel: 'auto',
  viewSourceConversation: 'View source',
  memoryTabSemantic: 'Semantic',
  memoryTabEpisodic: 'Episodic',
  memoryTabEntities: 'Entities',
  memoryTabHypotheses: 'Hypotheses',
  memoryLabelSource: 'Source',
  memoryLabelConf: 'conf',
  memoryLabelImportance: 'importance',
  memoryLabelHypothesis: 'HYPOTHESIS',
  memoryLabelMamba: 'MAMBA',
  memoryLabelConfirm: 'Confirm',
  memoryLabelCorrect: 'Correct',
  memoryLabelDelete: 'Delete',
  memoryLabelDeleteConfirm: 'Are you sure?',
  citationLabel: 'Source',
  uploadDocumentLabel: 'Upload document',
  documentsPageTitle: 'Documents',
  obsidianLabel: null,
};

export function useTenantConfig(): TenantConfig {
  const [config, setConfig] = useState<TenantConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    fetch('/api/tenant/config')
      .then((r) => r.json())
      .then((data) => {
        setConfig({
          productName: data.productName ?? DEFAULT_CONFIG.productName,
          appName: data.appName ?? data.productName ?? DEFAULT_CONFIG.appName,
          fullName: data.fullName ?? DEFAULT_CONFIG.fullName,
          companyName: data.companyName ?? DEFAULT_CONFIG.companyName,
          studioName: data.studioName ?? DEFAULT_CONFIG.studioName,
          acronymExpansion: data.acronymExpansion ?? DEFAULT_CONFIG.acronymExpansion,
          tagline: data.tagline ?? DEFAULT_CONFIG.tagline,
          legalContactEmail: data.legalContactEmail ?? DEFAULT_CONFIG.legalContactEmail,
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
          memoryAutoLabel: data.memoryAutoLabel ?? DEFAULT_CONFIG.memoryAutoLabel,
          viewSourceConversation: data.viewSourceConversation ?? DEFAULT_CONFIG.viewSourceConversation,
          memoryTabSemantic: data.memoryTabSemantic ?? DEFAULT_CONFIG.memoryTabSemantic,
          memoryTabEpisodic: data.memoryTabEpisodic ?? DEFAULT_CONFIG.memoryTabEpisodic,
          memoryTabEntities: data.memoryTabEntities ?? DEFAULT_CONFIG.memoryTabEntities,
          memoryTabHypotheses: data.memoryTabHypotheses ?? DEFAULT_CONFIG.memoryTabHypotheses,
          memoryLabelSource: data.memoryLabelSource ?? DEFAULT_CONFIG.memoryLabelSource,
          memoryLabelConf: data.memoryLabelConf ?? DEFAULT_CONFIG.memoryLabelConf,
          memoryLabelImportance: data.memoryLabelImportance ?? DEFAULT_CONFIG.memoryLabelImportance,
          memoryLabelHypothesis: data.memoryLabelHypothesis ?? DEFAULT_CONFIG.memoryLabelHypothesis,
          memoryLabelMamba: data.memoryLabelMamba ?? DEFAULT_CONFIG.memoryLabelMamba,
          memoryLabelConfirm: data.memoryLabelConfirm ?? DEFAULT_CONFIG.memoryLabelConfirm,
          memoryLabelCorrect: data.memoryLabelCorrect ?? DEFAULT_CONFIG.memoryLabelCorrect,
          memoryLabelDelete: data.memoryLabelDelete ?? DEFAULT_CONFIG.memoryLabelDelete,
          memoryLabelDeleteConfirm: data.memoryLabelDeleteConfirm ?? DEFAULT_CONFIG.memoryLabelDeleteConfirm,
          citationLabel: data.citationLabel ?? DEFAULT_CONFIG.citationLabel,
          uploadDocumentLabel: data.uploadDocumentLabel ?? DEFAULT_CONFIG.uploadDocumentLabel,
          documentsPageTitle: data.documentsPageTitle ?? DEFAULT_CONFIG.documentsPageTitle,
          obsidianLabel: data.obsidianLabel ?? null,
        });
      })
      .catch(() => setConfig((c) => ({ ...c, loading: false })));
  }, []);

  return config;
}
