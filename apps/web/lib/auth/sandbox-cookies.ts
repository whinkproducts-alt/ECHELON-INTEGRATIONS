// Browser cookies are scoped by hostname, not port. The local sandbox and the
// main app both use localhost, so every Auth.js cookie needs a distinct name.
// Auth.js deep-merges these names with its normal cookie security options.
export const sandboxAuthCookies = {
  sessionToken: { name: 'echelon-sandbox.session-token' },
  callbackUrl: { name: 'echelon-sandbox.callback-url' },
  csrfToken: { name: 'echelon-sandbox.csrf-token' },
  pkceCodeVerifier: { name: 'echelon-sandbox.pkce.code_verifier' },
  state: { name: 'echelon-sandbox.state' },
  nonce: { name: 'echelon-sandbox.nonce' },
  webauthnChallenge: { name: 'echelon-sandbox.challenge' },
} as const;
