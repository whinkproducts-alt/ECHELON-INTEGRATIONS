/**
 * Security response headers applied to every response by proxy.ts. Pure and edge-safe.
 * The CSP itself is per request (nonce) and comes from lib/csp.ts.
 *
 * Why these values:
 * - Permissions-Policy: camera and microphone only for our own origin (voice and gesture);
 *   everything else off.
 * - COOP same-origin and CORP same-origin: the app opens no cross-origin popups and serves
 *   nothing meant for other sites. Social OAuth is a full-page redirect, not a popup.
 * - HSTS only when the configured public URL is https (browsers ignore it over http anyway).
 * - X-Frame-Options DENY backs up CSP frame-ancestors 'none' for old browsers.
 */
/** Pages whose URL carries a one-time token: no Referer is ever sent from them. */
const NO_REFERRER_PATHS: ReadonlySet<string> = new Set(['/reset-password', '/forgot-password']);

export function wantsNoReferrer(pathname: string | undefined): boolean {
  if (!pathname) return false;
  let p = pathname;
  try { p = decodeURIComponent(pathname); } catch { /* keep the raw path */ }
  return NO_REFERRER_PATHS.has(p.replace(/\/+$/, '').toLowerCase());
}

export function securityHeaders(opts: { https: boolean; pathname?: string }): Record<string, string> {
  const h: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': wantsNoReferrer(opts.pathname) ? 'no-referrer' : 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  if (opts.https) h['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
  return h;
}

export function applySecurityHeaders(res: Response, opts: { https: boolean; pathname?: string }): void {
  for (const [k, v] of Object.entries(securityHeaders(opts))) res.headers.set(k, v);
}

/** Headers the security status endpoint expects to see on a response, by CSP directive. */
export const REQUIRED_CSP_DIRECTIVES = ["script-src", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"] as const;
