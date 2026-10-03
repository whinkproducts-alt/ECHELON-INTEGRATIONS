import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkCsrf } from '@/lib/csrf';

export default auth(async function middleware(req: NextRequest & { auth: any }) {
  const { pathname } = req.nextUrl;

  // M1: CSRF guard for state-changing /api calls, before any other work.
  const csrf = checkCsrf({
    method: req.method,
    pathname,
    secFetchSite: req.headers.get('sec-fetch-site'),
    origin: req.headers.get('origin'),
    host: req.headers.get('x-forwarded-host') ?? req.headers.get('host'),
    proto: req.headers.get('x-forwarded-proto'),
    requestOrigin: req.nextUrl.origin,
    configuredUrl: process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? null,
  });
  if (!csrf.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Public paths — no redirect
  const publicPaths = ['/login', '/signup', '/api/auth'];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = req.auth;
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Onboarding redirect: if displayName is missing and not already on /onboarding
  if (!pathname.startsWith('/onboarding') && !pathname.startsWith('/api')) {
    const profileRes = await fetch(new URL('/api/settings', req.url), {
      headers: { cookie: req.headers.get('cookie') ?? '' },
    });
    if (profileRes.ok) {
      const data = await profileRes.json();
      if (!data?.profile?.displayName) {
        return NextResponse.redirect(new URL('/onboarding', req.url));
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
