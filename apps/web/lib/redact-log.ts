/** Redact token-like substrings (sk-..., Bearer ...) and truncate for server-side logs. */
export function redactForLog(body: string, max = 300): string {
  return body
    .replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{35}/g, '[redacted]')
    .substring(0, max);
}
