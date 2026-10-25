// DEV ONLY preview harness. Dead in production: notFound() unless NODE_ENV is exactly 'development', evaluated on the server.
import type * as React from 'react';
import { notFound } from 'next/navigation';
import { BoardScreen } from '@/components/screens/board/board-screen';
import { getBoardMembers } from '@/lib/board';
import { getSubsidiary } from '@/lib/subsidiaries';
import { PreviewClient } from '../_components/preview-client';
import type { PreviewState } from '../_components/fixtures';

export const dynamic = 'force-dynamic';

const SERVER_PAGES: Record<string, () => Promise<{ default: () => unknown }>> = {
  directory: () => import('@/app/dashboard/directory/page'),
  workforce: () => import('@/app/dashboard/workforce/page'),
  companies: () => import('@/app/dashboard/companies/page'),
};

const STATES: readonly PreviewState[] = ['ready', 'loading', 'error', 'empty'];

export default async function DevPreviewPage({ params, searchParams }: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ state?: string | string[]; id?: string | string[] }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { screen } = await params;
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  const entityId = rawId && /^[\w-]{1,64}$/.test(rawId) ? rawId : undefined;
  const raw = sp.state;
  const wanted = Array.isArray(raw) ? raw[0] : raw;
  const state = STATES.find((s) => s === wanted) ?? 'ready';
  const loadPage = SERVER_PAGES[screen];
  const Page = loadPage ? ((await loadPage()).default as unknown as React.ComponentType) : null;
  // The real board page is owner-gated through auth(); the dev preview renders the screen directly.
  const body = screen === 'board' ? <BoardScreen members={getBoardMembers()} /> : Page ? <Page /> : undefined;
  // SubsidiaryScreen takes its config row from the server page; the harness supplies it the same way.
  const extraProps = screen === 'subsidiary' ? { subsidiary: getSubsidiary(entityId ?? 'consult') } : undefined;
  return <PreviewClient screen={screen} state={state} entityId={entityId} extraProps={extraProps}>{body}</PreviewClient>;
}
