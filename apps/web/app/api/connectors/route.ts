export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { listConnectors } from '@/lib/connectors/registry';

export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  return NextResponse.json({ connectors: await listConnectors(a.userId) });
}
