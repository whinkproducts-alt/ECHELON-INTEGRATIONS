import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkCsrf } from '@/lib/csrf';
import { buildCsp, generateNonce, isHttpsDeployment } from '@/lib/csp';
import { applySecurityHeaders } from '@/lib/security-headers';
import { limitAuthRequest } from '@/lib/rate-limit';

export default auth(async function middleware(req: NextRequest & { auth: any }) {
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    upgradeInsecure: isHttpsDeployment(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL),
  });
  const https = isHttpsDeployment(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL);
  const res = await handle(req, nonce, csp);
  res.headers.set('Content-Security-Policy', csp);
  applySecurityHeaders(res, { https });
  return res;
});

async function handle(req: NextRequest & { auth: any }, nonce: string, csp: string): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  // Next reads the nonce from the request's CSP header and stamps it on its own scripts.
  const passThrough = () => {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
    return NextResponse.next({ request: { headers: requestHeaders } });
  };

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

  // Rate limit credential endpoints by client address before any other work.
  if (req.method === 'POST' && (pathname.startsWith('/api/auth') || pathname === '/api/signup')) {
    let account: string | null = null;
    if (pathname.startsWith('/api/auth/callback/credentials')) {
      try {
        const v = (await req.clone().formData()).get('email');
        if (typeof v === 'string') account = v;
      } catch { /* not a form post: address bucket still applies */ }
    }
    const limited = await limitAuthRequest(pathname === '/api/signup' ? 'signup' : 'auth', req.headers, account);
    if (limited) return new NextResponse(limited.body, { status: 429, headers: limited.headers });
  }

  // Public paths — no redirect
  const publicPaths = ['/login', '/signup', '/api/auth', '/manifest.webmanifest'];
  // Exact public API endpoints (no prefix match).
  const publicExact = ['/api/signup'];
  if (publicExact.includes(pathname) || publicPaths.some((p) => pathname.startsWith(p))) {
    return passThrough();
  }

  // Dev-only preview harness. Never matches outside `next dev`; production keeps the auth wall.
  if (process.env.NODE_ENV === 'development' && (pathname === '/dev-preview' || pathname.startsWith('/dev-preview/'))) {
    return passThrough();
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

  return passThrough();
}

export const config = {
  // The static-extension exclusion applies outside /api only: /api/* always runs CSRF + CSP,
  // even for a path that ends in .png or similar.
  matcher: [
    '/api/:path*',
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
