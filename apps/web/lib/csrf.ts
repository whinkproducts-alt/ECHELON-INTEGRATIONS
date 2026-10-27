/**
 * CSRF guard for state-changing API calls. Pure and edge-safe (no Node imports) so the
 * middleware can use it and tests can call it directly.
 *
 * Rules for POST, PUT, PATCH, DELETE on /api/** (NextAuth's own catch-all under /api/auth is left to NextAuth; /api/auth/passkey and /api/auth/password are checked):
 * 1. Sec-Fetch-Site present: must be exactly "same-origin" (not "none", "same-site", "cross-site").
 * 2. Else Origin present: must equal one of the app's own origins.
 * 3. Else (neither header): rejected. Every legitimate browser fetch sends at least one.
 */

export const STATE_CHANGING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface CsrfInput {
  method: string;
  pathname: string;
  secFetchSite: string | null;
  origin: string | null;
  /** Host header (or x-forwarded-host when behind a trusted proxy). */
  host: string | null;
  /** x-forwarded-proto, if any. */
  proto: string | null;
  /** The URL origin the framework parsed for this request. */
  requestOrigin: string;
  /** NEXTAUTH_URL / AUTH_URL, if configured. */
  configuredUrl: string | null;
}

export type CsrfResult = { ok: true } | { ok: false; reason: string };

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const o = new URL(url).origin;
    return o === 'null' ? null : o;
  } catch {
    return null;
  }
}

export function checkCsrf(input: CsrfInput): CsrfResult {
  const method = input.method.toUpperCase();
  if (!STATE_CHANGING_METHODS.has(method)) return { ok: true };
  // Match on the decoded, normalised path so an encoded segment cannot dodge the checks below.
  let p = input.pathname;
  try { p = decodeURIComponent(p); } catch { /* an undecodable path is checked as written, which is the stricter side */ }
  p = p.replace(/\/{2,}/g, '/');
  if (p !== '/api' && !p.startsWith('/api/')) return { ok: true };
  // Only NextAuth's own catch-all is left to NextAuth (it has its own CSRF token). Our passkey and
  // password routes are plain fetches from our pages, which always send Sec-Fetch-Site or Origin.
  if ((p === '/api/auth' || p.startsWith('/api/auth/')) && !p.startsWith('/api/auth/passkey') && !p.startsWith('/api/auth/password')) return { ok: true };

  if (input.secFetchSite !== null) {
    return input.secFetchSite.toLowerCase() === 'same-origin'
      ? { ok: true }
      : { ok: false, reason: 'cross-site request refused (Sec-Fetch-Site)' };
  }

  if (input.origin !== null) {
    const allowed = new Set<string>();
    allowed.add(input.requestOrigin);
    const configured = originOf(input.configuredUrl);
    if (configured) allowed.add(configured);
    if (input.host) {
      const proto = (input.proto ?? new URL(input.requestOrigin).protocol.replace(':', '')).split(',')[0].trim();
      const hostOrigin = originOf(`${proto}://${input.host.split(',')[0].trim()}`);
      if (hostOrigin) allowed.add(hostOrigin);
    }
    const origin = originOf(input.origin);
    return origin && allowed.has(origin)
      ? { ok: true }
      : { ok: false, reason: 'cross-origin request refused (Origin)' };
  }

  return { ok: false, reason: 'missing Sec-Fetch-Site and Origin' };
}
