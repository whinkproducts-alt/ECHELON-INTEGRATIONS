import { SECRET_RULES } from '@/lib/secret-scan';

const GLOBAL_SECRET_RULES = SECRET_RULES.map((r) => ({ name: r.name, re: new RegExp(r.re.source, r.re.flags.includes('g') ? r.re.flags : r.re.flags + 'g') }));

/** The whole private key: BEGIN line, body, END line (or to the end of the text when the END was cut off). */
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g;
/** AWS secret access key: a 40 character value after a label. */
const AWS_SECRET = /\b(aws_?secret_?(?:access_?)?key|secret_?access_?key)(["']?\s*[:=]\s*["']?)([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi;
/** name = value with no quotes: password=hunter2, DB_PASS: abc123, api_key=... (names that look like credentials). */
const UNQUOTED_ASSIGNMENT = /\b([A-Za-z0-9_.-]*(?:passw(?:or)?d|passwd|pwd|secret|token|api[_-]?key|private[_-]?key|access[_-]?key)[A-Za-z0-9_.-]*)(\s*[:=]\s*)(["']?)([^\s"'(){}<>,;$\\]{6,})(?![A-Za-z0-9_.-])(?!\()\3/gi;
/** Words after "password:" that are code, not values (type annotations, placeholders). */
const NOT_A_VALUE = /^(string|number|boolean|object|undefined|null|true|false|none|required|optional|unknown|any|\[redacted.*)$/i;

/** Replace secret-shaped strings with a marker. Rule name only, never the value. */
export function redactSecrets(text: string): string {
  let out = text.replace(PRIVATE_KEY_BLOCK, '[redacted:private_key]');
  for (const r of GLOBAL_SECRET_RULES) out = out.replace(r.re, `[redacted:${r.name}]`);
  out = out.replace(AWS_SECRET, (_m, label: string, sep: string) => `${label}${sep}[redacted:aws_secret_access_key]`);
  out = out.replace(UNQUOTED_ASSIGNMENT, (m, name: string, sep: string, q: string, value: string) =>
    NOT_A_VALUE.test(value) ? m : `${name}${sep}${q}[redacted:secret_assignment]${q}`);
  return out;
}
