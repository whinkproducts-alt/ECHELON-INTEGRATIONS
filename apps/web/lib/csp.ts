/**
 * Content-Security-Policy builder. Pure and edge-safe (no Node imports) so the
 * middleware can use it and tests can call it directly.
 *
 * Scripts: nonce-based with 'strict-dynamic' (Next 16 CSP guide). Every page is
 * dynamically rendered (root layout is force-dynamic), so Next stamps the nonce
 * on framework scripts. No 'unsafe-inline' for scripts, ever.
 *
 * Styles: 'unsafe-inline' is kept for styles ONLY. React `style={{}}` props,
 * Radix/shadcn positioning and next/font emit style attributes, and a nonce
 * cannot cover attributes. Style injection cannot run script, and script-src is strict.
 *
 * connect-src: 'self' only. Every external call (OpenAI TTS, Deepgram STT, model
 * providers, the MCP gateway) is made server-side, never from the browser.
 *
 * Phase 2d (social media images): do NOT add CDN hosts (cdninstagram, twimg, tiktokcdn)
 * to img-src. Add a same-origin server-side image proxy route (for example
 * /api/media/proxy) that fetches with an allow-list, size cap and content-type check,
 * so img-src stays 'self' data: blob:. Extend IMG_SRC below only if that proxy is rejected.
 */

const IMG_SRC = ["'self'", 'data:', 'blob:'];

export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function buildCsp(opts: { nonce: string; isDev: boolean }): string {
  const { nonce, isDev } = opts;
  const directives: string[] = [
    "default-src 'self'",
    // 'unsafe-eval' only in development: React uses eval for debugging stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${IMG_SRC.join(' ')}`,
    "media-src 'self' blob:",
    // Dev server hot reload uses a same-host websocket.
    `connect-src 'self'${isDev ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}
