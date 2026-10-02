import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default auth(async function middleware(req: NextRequest & { auth: any }) {
  const { pathname } = req.nextUrl;

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
