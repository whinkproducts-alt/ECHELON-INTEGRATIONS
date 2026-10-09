export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { connectedAppsUrl, isSocialPlatform } from '@/lib/social/platforms';
import { completeCallback } from '@/lib/social/oauth';

/**
 * OAuth callback. A top-level GET navigation from the platform, so the CSRF middleware (which
 * guards state-changing methods) does not apply. It is safe because it changes state only when
 * `state` is valid: single-use, unexpired, and bound to this session user and platform.
 * The redirect target is built server-side and carries fixed codes only, never provider text.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  // Redirects never use the request origin: Location is absolute only from configured URLs, else relative.
  const redirect = (location: string) => new NextResponse(null, { status: 302, headers: { Location: location } });
  const back = (q: Record<string, string>) => redirect(connectedAppsUrl(q));

  if (!isSocialPlatform(platform)) return back({ error: 'unknown_platform' });
  const session = await auth();
  if (!session?.user?.id) return redirect('/login');

  const sp = req.nextUrl.searchParams;
  const result = await completeCallback(session.user.id, platform, {
    code: sp.get('code'),
    state: sp.get('state'),
    error: sp.get('error'),
  });
  return result.ok ? back({ connected: platform }) : back({ error: result.error });
}
