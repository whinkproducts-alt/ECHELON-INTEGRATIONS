import tenantDefaults from '@/config/tenant-defaults.json';

export interface WebAuthnConfig {
  rpID: string;
  rpName: string;
  origins: string[];
}

export class PasskeyConfigError extends Error {}

function isLocalhost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

/**
 * Read WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN (comma list). Throws PasskeyConfigError when unset
 * or when any origin is not HTTPS (localhost excepted). Routes turn that into a plain 503.
 */
export function getWebAuthnConfig(env: Record<string, string | undefined> = process.env): WebAuthnConfig {
  const rpID = (env.WEBAUTHN_RP_ID ?? '').trim().toLowerCase();
  const raw = (env.WEBAUTHN_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!rpID || raw.length === 0) throw new PasskeyConfigError('passkeys not configured');
  const origins: string[] = [];
  for (const o of raw) {
    let u: URL;
    try { u = new URL(o); } catch { throw new PasskeyConfigError('invalid WEBAUTHN_ORIGIN'); }
    const local = isLocalhost(u.hostname);
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) {
      throw new PasskeyConfigError('WEBAUTHN_ORIGIN must be https (localhost excepted)');
    }
    if (u.hostname !== rpID && !u.hostname.endsWith(`.${rpID}`)) {
      throw new PasskeyConfigError('WEBAUTHN_ORIGIN host must match WEBAUTHN_RP_ID');
    }
    origins.push(u.origin);
  }
  return { rpID, rpName: tenantDefaults.appName, origins };
}
