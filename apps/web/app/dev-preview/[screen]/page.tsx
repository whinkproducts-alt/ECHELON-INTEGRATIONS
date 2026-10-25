// DEV ONLY preview harness. Dead in production: notFound() unless NODE_ENV is exactly 'development', evaluated on the server.
import type * as React from 'react';
import { notFound } from 'next/navigation';
import { PreviewClient } from '../_components/preview-client';
import type { PreviewState } from '../_components/fixtures';

export const dynamic = 'force-dynamic';

const SERVER_PAGES: Record<string, () => Promise<{ default: () => unknown }>> = {
  board: () => import('@/app/dashboard/board/page'),
  directory: () => import('@/app/dashboard/directory/page'),
  workforce: () => import('@/app/dashboard/workforce/page'),
  companies: () => import('@/app/dashboard/companies/page'),
};

const STATES: readonly PreviewState[] = ['ready', 'loading', 'error', 'empty'];

export default async function DevPreviewPage({ params, searchParams }: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { screen } = await params;
  const raw = (await searchParams).state;
  const wanted = Array.isArray(raw) ? raw[0] : raw;
  const state = STATES.find((s) => s === wanted) ?? 'ready';
  const loadPage = SERVER_PAGES[screen];
  const Page = loadPage ? ((await loadPage()).default as unknown as React.ComponentType) : null;
  return <PreviewClient screen={screen} state={state}>{Page ? <Page /> : undefined}</PreviewClient>;
}
