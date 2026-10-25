export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { validateManifest } from '@/lib/connectors/manifest';

/** Validation only. Never fetches an endpoint, never runs plugin code, never stores anything. */
export async function POST(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const b = await readJsonBody(req, 128 * 1024);
  if ('response' in b) return b.response;
  const result = validateManifest(b.body);
  return NextResponse.json(result, { status: result.valid ? 200 : 422 });
}
