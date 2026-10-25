/**
 * Secret scanner: regex patterns for common key formats. Pure (no fs, no git), no dependency.
 * Used by scripts/scan-secrets.ts (pre-commit, `pnpm security:scan`) and tested directly.
 * Findings never include the matched secret: only rule name, file, line and a redacted preview.
 * A line containing "scan-secrets:ignore" is skipped (for documented test fixtures).
 */

export interface SecretRule { name: string; re: RegExp }

export const SECRET_RULES: SecretRule[] = [
  { name: 'anthropic_api_key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'openai_api_key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { name: 'aws_access_key_id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'github_token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}/ },
  { name: 'google_api_key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'slack_token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'stripe_live_key', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/ },
  { name: 'twilio_auth_token_assignment', re: /TWILIO_AUTH_TOKEN\s*[:=]\s*['"]?[0-9a-f]{32}\b/i },
  { name: 'telegram_bot_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/ },
  { name: 'private_key_block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'database_url_with_password', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/'"]+:[^\s@/'"]{3,}@/ },
  { name: 'secret_assignment', re: /\b[A-Za-z0-9_]*(?:secret|token|passw(?:or)?d|api[_-]?key)[A-Za-z0-9_]*\s*[:=]\s*['"][^'"\s]{20,}['"]/i },
];

const PLACEHOLDER_RE = /(?:example|placeholder|changeme|change-me|your[_-]|xxxx|<[^>]+>|\$\{|process\.env|dummy|redacted|\.\.\.)/i;

const TEST_PATH_RE = /(__tests__|\/test\/|\.test\.|\.spec\.)/;

export interface SecretFinding { rule: string; file: string; line: number; preview: string }

function redact(line: string, re: RegExp): string {
  const m = re.exec(line);
  if (!m) return '';
  const start = Math.max(0, m.index - 12);
  const shown = line.substring(start, m.index) + m[0].substring(0, 4) + '[redacted]';
  return shown.trim().substring(0, 60);
}

export function scanText(file: string, text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 2000 || line.includes('scan-secrets:ignore')) continue;
    for (const rule of SECRET_RULES) {
      if (!rule.re.test(line)) continue;
      if (rule.name === 'secret_assignment' && (PLACEHOLDER_RE.test(line) || /['"](?:https?:)?\/\//.test(line) || /['"][A-Z][A-Z0-9_]{5,}['"]/.test(line) || (TEST_PATH_RE.test(file)))) continue;
      if (rule.name === 'database_url_with_password' && /:\/\/[^:@/\s]+:(?:password|pass|postgres|secret|changeme|example|user|x)@/i.test(line)) continue;
      findings.push({ rule: rule.name, file, line: i + 1, preview: redact(line, rule.re) });
    }
  }
  return findings;
}

const SKIP_PATH_RE = /(^|\/)(node_modules|\.next|\.git|dist|out)\//;
const SKIP_FILE_RE = /(\.lock|lock\.json|lock\.yaml|\.env\.example|\.png|\.jpe?g|\.webp|\.gif|\.ico|\.pdf|\.woff2?|\.ttf)$/i;
const SKIP_NAMES = new Set(['yarn.lock', 'pnpm-lock.yaml', 'package-lock.json']);

export function shouldScanPath(p: string): boolean {
  const norm = p.replace(/\\/g, '/');
  if (SKIP_PATH_RE.test(norm) || SKIP_FILE_RE.test(norm)) return false;
  return !SKIP_NAMES.has(norm.split('/').pop() ?? '');
}

/** True for paths that must never be committed at all. */
export function isForbiddenEnvFile(p: string): boolean {
  const base = p.replace(/\\/g, '/').split('/').pop() ?? '';
  return /^\.env(\..+)?$/.test(base) && base !== '.env.example';
}
