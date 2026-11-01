/**
 * Stage 1 skill scanner. Deterministic, no model, no network, no I/O.
 * An uploaded skill is untrusted text from an outsider. Any CRITICAL finding rejects it before
 * a model ever sees it. Findings carry a short sanitised excerpt, never a matched secret.
 */
import { scanForInjectionPatterns } from '@/lib/content-isolation';
import { SECRET_RULES } from '@/lib/secret-scan';
import config from '@/config/skill-pipeline.json';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ScanFinding {
  rule: string;
  severity: Severity;
  category: string;
  message: string;
  line: number | null;
  excerpt?: string;
}

export interface ScanReport {
  version: 1;
  verdict: 'clean' | 'flagged' | 'critical';
  score: number;
  findings: ScanFinding[];
  counts: Record<Severity, number>;
  truncated: boolean;
}

const WEIGHT: Record<Severity, number> = { CRITICAL: 100, HIGH: 30, MEDIUM: 10, LOW: 3 };
/** Two HIGH findings (or equivalent) reject without a CRITICAL. */
export const REJECT_SCORE = 60;
const MAX_FINDINGS = 50;

interface Rule {
  rule: string;
  severity: Severity;
  category: string;
  message: string;
  re: RegExp;
  /** Run on the folded text (lowercased, confusables mapped) as well as the raw text. */
  folded?: boolean;
}

// Zero width, bidi controls, tag block, soft hyphen, invisible operators, variation selectors, BOM mid-text.
const HIDDEN_CHARS = /[​-‏‪-‮⁠-⁤⁦-⁯­᠎︀-️﻿\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/u;
const HIDDEN_CHARS_G = new RegExp(HIDDEN_CHARS.source, 'gu');

// Cyrillic and Greek letters that look like Latin ones.
const CONFUSABLES: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'һ': 'h',
  'ԁ': 'd', 'ɡ': 'g', 'к': 'k', 'м': 'm', 'н': 'h', 'т': 't', 'в': 'b',
  'α': 'a', 'ο': 'o', 'ρ': 'p', 'ν': 'v', 'ι': 'i', 'κ': 'k', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ε': 'e',
};

export function foldText(text: string): string {
  let t = text.normalize('NFKC').replace(HIDDEN_CHARS_G, '');
  t = t.replace(/[Ѐ-ӿͰ-ϿԀ-ԯɐ-ʯ]/g, (c) => CONFUSABLES[c.toLowerCase()] ?? c);
  return t.toLowerCase().replace(/[ \t ]+/g, ' ');
}

const BASE64_BLOB = new RegExp(`[A-Za-z0-9+/]{${config.base64BlobChars},}={0,2}`);
const HEX_BLOB = new RegExp(`\\b[0-9a-fA-F]{${config.base64BlobChars},}\\b`);

const RULES: Rule[] = [
  // Instruction override and impersonation
  { rule: 'ignore_instructions', severity: 'CRITICAL', category: 'prompt_injection', folded: true,
    message: 'Tells the reader to ignore, forget or override prior rules',
    re: /\b(ignore|disregard|forget|override|overrule|discard)\b\s+(?:\w+\s+){0,3}(instructions?|rules?|guidelines?|prompts?|polic(?:y|ies)|safety|constraints?|restrictions?|directives?)/i },
  { rule: 'conceal_from_user', severity: 'CRITICAL', category: 'prompt_injection', folded: true,
    message: 'Asks to hide actions or information from the user',
    re: /\b(do not|don'?t|never)\s+(tell|inform|mention|reveal|show|notify|alert)\b[^.\n]{0,40}\b(user|owner|victor|human)\b/i },
  { rule: 'reveal_system_prompt', severity: 'CRITICAL', category: 'prompt_injection', folded: true,
    message: 'Asks to reveal system prompt or hidden instructions',
    re: /\b(reveal|print|show|leak|output|repeat|dump)\b\s+(?:\w+\s+){0,2}(system\s+prompt|hidden\s+instructions|initial\s+instructions|your\s+instructions)/i },
  { rule: 'role_marker', severity: 'CRITICAL', category: 'impersonation', folded: true,
    message: 'Line impersonates a system, assistant or developer message',
    re: /(?:^|\n)[ \t>*#-]*(system|assistant|developer|admin(?:istrator)?)\s*(?:[:>]|prompt\b)/i },
  { rule: 'chat_template_token', severity: 'CRITICAL', category: 'impersonation', folded: true,
    message: 'Contains chat template or control tokens',
    re: /<\|?\s*(im_start|im_end|system|endoftext|eot_id|start_header_id)\s*\|?>|\[\/?INST\]|<<\/?SYS>>|###\s*(system|instruction)/i },
  { rule: 'roleplay_system_impersonation', severity: 'CRITICAL', category: 'impersonation', folded: true,
    message: 'Role-play framing that redefines the assistant (you are now / from now on you are)',
    re: /\b(you are now|you will now act|from now on,? (?:you are|you will|ignore|always)|your new (role|instructions|persona|rules))\b/i },
  { rule: 'jailbreak_terms', severity: 'CRITICAL', category: 'impersonation', folded: true,
    message: 'Jailbreak vocabulary (DAN, developer mode, jailbreak)',
    re: /\b(jailbreak(?:ed)?|developer mode|do anything now|dan mode|god mode|unrestricted mode)\b/i },
  { rule: 'note_to_ai', severity: 'CRITICAL', category: 'assistant_directed', folded: true,
    message: 'Note or message addressed to the AI',
    re: /\b(note|message|instruction)s?\s+(to|for)\s+(the\s+)?(ai|assistant|model|llm|agent|whink|mamba|claude)\b|\bai assistant\b|\bsystem note\b/i },
  { rule: 'address_assistant', severity: 'CRITICAL', category: 'assistant_directed', folded: true,
    message: 'Instruction addressed directly to the assistant',
    re: /\b(assistant|ai|claude|whink|mamba|chatgpt|llm|agent)\s*[,:]\s*(you\s+)?(must|should|will|shall|do|please|always|never|ignore|run|execute|call|send|delete)\b/i },
  { rule: 'when_you_read_this', severity: 'HIGH', category: 'assistant_directed', folded: true,
    message: 'Triggers behaviour when the assistant reads the text',
    re: /\b(when|if|once) you (read|see|process|encounter|are reading|finish reading|load) this\b|\bbefore (answering|responding|replying),? (you must|always|first)\b/i },
  { rule: 'pretend_roleplay', severity: 'HIGH', category: 'impersonation', folded: true,
    message: 'Asks the assistant to pretend or act as another entity',
    re: /\b(pretend (to be|you are|that you)|act as (if you (are|were)|an? unrestricted)|simulate being)\b/i },
  { rule: 'authority_claim', severity: 'HIGH', category: 'impersonation', folded: true,
    message: 'Claims authority or pre-authorisation',
    re: /\b(authori[sz]ed by (victor|the owner|the admin)|victor (said|approved|has approved|authori[sz]ed)|pre-?approved|approved in advance)\b/i },

  // Approvals, permissions, ledger, security
  { rule: 'bypass_controls', severity: 'CRITICAL', category: 'control_bypass', folded: true,
    message: 'Attempts to disable or bypass approvals, permissions, ledger or security',
    re: /\b(disable|turn off|switch off|skip|bypass|circumvent|override|remove|suppress|silence|ignore|evade|without)\b\s+(?:\w+\s+){0,3}(approvals?|permissions?|permission engine|ledger|audit(?:\s+log)?|security|safeguards?|guardrails?|confirmations?|human review|class c|injection (?:scan|filter)|untrusted)/i },
  { rule: 'auto_approve', severity: 'CRITICAL', category: 'control_bypass', folded: true,
    message: 'Pre-approves or auto-approves actions',
    re: /\bauto[- ]?approv|\bapprove\s+(?:all|everything|automatically|on my behalf)\b|\bnever\s+(?:ask|require|request|wait)\s+(?:for\s+)?(?:approval|confirmation|permission)|\bwithout\s+(?:asking|approval|confirmation|permission)\b/i },
  { rule: 'grant_access', severity: 'CRITICAL', category: 'privilege_escalation', folded: true,
    message: 'Requests tools, autonomy or elevated access be granted',
    re: /\b(grant|give|enable|unlock|allow)\b\s+(?:\w+\s+){0,3}(autonomy|admin|root|sudo|elevated|full access|all permissions|tool access|unrestricted)|\b(increase|raise|maximi[sz]e|set)\s+(?:the\s+)?autonomy|\b(change|set|upgrade|lower|downgrade)\s+(?:the\s+)?permission class|\bclass [abc]\s*(?:->|→|to)\s*class [abc]/i },
  { rule: 'register_tools', severity: 'HIGH', category: 'privilege_escalation', folded: true,
    message: 'Asks to register, install or add tools or capabilities',
    re: /\b(register|install|add|expose|enable)\s+(?:a\s+|the\s+|new\s+|these\s+|following\s+)?(?:tools?|capabilit(?:y|ies)|plugins?|mcp servers?|connectors?)\b/i },

  // Exfiltration
  { rule: 'exfiltrate_word', severity: 'CRITICAL', category: 'exfiltration', folded: true,
    message: 'Mentions exfiltration',
    re: /\bexfiltrat/i },
  { rule: 'send_data_to_external', severity: 'CRITICAL', category: 'exfiltration', folded: true,
    message: 'Sends data to a URL, address or external endpoint',
    re: /\b(send|post|upload|forward|email|transmit|leak|copy|submit)\b[^.\n]{0,80}\b(to|at|via|into)\b[^.\n]{0,60}(https?:\/\/|ftp:\/\/|[\w.+-]+@[\w-]+\.\w|\bwebhook|\bpastebin|\bexternal (?:server|endpoint|site)|\bremote (?:server|host))/i },
  { rule: 'send_to_generic', severity: 'MEDIUM', category: 'exfiltration', folded: true,
    message: 'Contains a send ... to phrase',
    re: /\bsend\b[^.\n]{0,60}\bto\b/i },
  { rule: 'exfil_endpoint', severity: 'CRITICAL', category: 'exfiltration', folded: true,
    message: 'Webhook, paste, request-capture or tunnel endpoint',
    re: /\b(webhook\.site|requestbin|pipedream\.net|pastebin\.com|paste\.ee|hastebin|ngrok(?:-free)?\.(?:io|app|dev)|burpcollaborator|interact\.sh|oast\.\w+|discord(?:app)?\.com\/api\/webhooks|hooks\.slack\.com|api\.telegram\.org\/bot|transfer\.sh|file\.io|requestcatcher|canarytokens)\b/i },
  { rule: 'ip_endpoint', severity: 'CRITICAL', category: 'exfiltration',
    message: 'URL pointing at a raw IP address',
    re: /\bhttps?:\/\/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?/i },
  { rule: 'url_query_template', severity: 'CRITICAL', category: 'exfiltration',
    message: 'URL whose query string carries template or encoded data',
    re: /\bhttps?:\/\/[^\s)"'>]+\?[^\s)"'>]*(?:=\{|=\$\{|=\$|=%7B|=<|=\[|=[A-Za-z0-9+/_-]{40,})/i },
  { rule: 'markdown_image_query', severity: 'CRITICAL', category: 'exfiltration',
    message: 'Markdown image with a query string (data-leak beacon)',
    re: /!\[[^\]]*\]\(\s*https?:\/\/[^)\s]*\?[^)\s]*\)/i },
  { rule: 'url_with_query', severity: 'MEDIUM', category: 'exfiltration',
    message: 'URL with a query string',
    re: /\bhttps?:\/\/[^\s)"'>]+\?[^\s)"'>]+=/i },

  // Shell and script payloads
  { rule: 'pipe_to_shell', severity: 'CRITICAL', category: 'payload',
    message: 'Pipes downloaded or decoded content into a shell',
    re: /\b(curl|wget|fetch|iwr|invoke-webrequest)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b|\|\s*(?:sudo\s+)?(?:ba|z)?sh\s*(?:$|\n|-)/i },
  { rule: 'powershell_encoded', severity: 'CRITICAL', category: 'payload',
    message: 'Encoded or hidden PowerShell',
    re: /\bpowershell(?:\.exe)?\b[^\n]*(?:-e\b|-enc\b|-encodedcommand|-w(?:indowstyle)?\s+hidden|-nop\b)|\binvoke-expression\b|\biex\s*\(/i },
  { rule: 'eval_exec', severity: 'CRITICAL', category: 'payload',
    message: 'eval or dynamic code execution',
    re: /\beval\s*\(|\bnew Function\s*\(|\bexec\s*\(|\bos\.system\s*\(|\bsubprocess\.(?:run|call|popen|check_output)|\bchild_process\b|\bRuntime\.getRuntime\b|\b__import__\s*\(/i },
  { rule: 'destructive_shell', severity: 'CRITICAL', category: 'payload',
    message: 'Destructive or reverse-shell command',
    re: /\brm\s+-[a-z]*r[a-z]*f?\s+(?:--no-preserve-root\s+)?[/~*]|\bmkfs\b|\bdd\s+if=|\bnc\s+(?:-\w+\s+)*-e\b|\bbash\s+-i\s*>&|\/dev\/tcp\/|:\(\)\s*\{\s*:\|:&\s*\};:/i },
  { rule: 'base64_decode_cmd', severity: 'CRITICAL', category: 'payload',
    message: 'Decodes base64 for execution',
    re: /\bbase64\s+(?:-d|--decode)\b|\batob\s*\(|\bfrombase64string\b|\bb64decode\s*\(/i },

  // HTML and hidden markup
  { rule: 'html_active_content', severity: 'CRITICAL', category: 'markup',
    message: 'Script, iframe, object, embed or SVG element',
    re: /<\s*\/?\s*(script|iframe|object|embed|svg|frame|frameset|applet)\b/i },
  { rule: 'html_other_tags', severity: 'HIGH', category: 'markup',
    message: 'Form, meta, link, style, base or img element',
    re: /<\s*(form|meta|link|style|base|img|input|button|video|audio|source)\b/i },
  { rule: 'js_or_data_uri', severity: 'CRITICAL', category: 'markup',
    message: 'javascript:, vbscript: or data: URI',
    re: /\b(?:javascript|vbscript)\s*:|\bdata:[a-z0-9.+/-]*(?:;[a-z0-9=-]+)*,|\bdata:text\/html/i },
  { rule: 'html_event_handler', severity: 'HIGH', category: 'markup',
    message: 'HTML event handler attribute',
    re: /\bon(?:error|load|click|mouseover|focus|toggle|begin)\s*=\s*["'a-z]/i },
  { rule: 'html_hidden_style', severity: 'HIGH', category: 'markup',
    message: 'Inline style that hides text',
    re: /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|opacity\s*:\s*0\b|color\s*:\s*(?:white|#fff(?:fff)?)\b|\bhidden\b\s*(?:=|>)/i },
  { rule: 'html_comment', severity: 'MEDIUM', category: 'markup',
    message: 'HTML comment (can hide text from a reader)',
    re: /<!--[\s\S]*?-->/ },
  { rule: 'markdown_reference_hidden', severity: 'HIGH', category: 'markup',
    message: 'Markdown reference definition used as a hidden comment',
    re: /^\s*\[(?:\/\/|comment|hidden|#)\]\s*:\s*(?:#|<>|\S+)\s*[("'].+/im },
  { rule: 'markdown_empty_link', severity: 'MEDIUM', category: 'markup',
    message: 'Link with no visible text',
    re: /(?<!!)\[\s*\]\(\s*\S+\s*\)/ },
  { rule: 'long_whitespace_push', severity: 'HIGH', category: 'markup',
    message: 'Long whitespace run pushing text out of view',
    re: /[ \t]{80,}\S/ },
];

function lineOf(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

const CTRL = /[\u0000-\u001F\u007F]/g;
function excerpt(s: string): string {
  const c = s.replace(CTRL, ' ').replace(/\s+/g, ' ').trim();
  return c.length > 80 ? c.slice(0, 80) + '...' : c;
}

function mixedScriptWord(text: string): RegExpExecArray | null {
  const re = /[\p{L}\p{M}]{3,}/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const w = m[0];
    if (/[A-Za-z]/.test(w) && /[Ѐ-ӿͰ-Ͽ]/.test(w)) return m;
  }
  return null;
}

export function scanSkill(rawText: string): ScanReport {
  // A single leading BOM is harmless; anywhere else it is a hidden character.
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  const findings: ScanFinding[] = [];
  const seen = new Set<string>();
  const add = (f: ScanFinding) => {
    const key = `${f.rule}:${f.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };

  // Hidden characters
  const hidden = HIDDEN_CHARS.exec(text);
  if (hidden) {
    add({ rule: 'hidden_unicode', severity: 'CRITICAL', category: 'hidden_text',
      message: 'Zero-width, bidi, tag or invisible characters present', line: lineOf(text, hidden.index) });
  }
  // Control characters other than tab, newline, carriage return
  const ctrl = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.exec(text);
  if (ctrl) add({ rule: 'control_chars', severity: 'HIGH', category: 'hidden_text', message: 'Control characters present', line: lineOf(text, ctrl.index) });
  const mixed = mixedScriptWord(text);
  if (mixed) {
    add({ rule: 'homoglyph_mixed_script', severity: 'HIGH', category: 'hidden_text',
      message: 'Word mixes Latin letters with look-alike Cyrillic or Greek letters', line: lineOf(text, mixed.index), excerpt: excerpt(mixed[0]) });
  }

  const folded = foldText(text);

  for (const r of RULES) {
    const targets: Array<{ t: string; isFolded: boolean }> = [{ t: text, isFolded: false }];
    if (r.folded) targets.push({ t: folded, isFolded: true });
    for (const { t, isFolded } of targets) {
      const m = r.re.exec(t);
      if (!m) continue;
      // Folding can shift line numbers only through removed characters; lines (\n) are preserved.
      add({ rule: r.rule + (isFolded && !r.re.test(text) ? '_obfuscated' : ''), severity: r.severity, category: r.category,
        message: r.message + (isFolded && !r.re.test(text) ? ' (found only after unicode normalisation)' : ''),
        line: lineOf(t, m.index), excerpt: excerpt(m[0]) });
      break;
    }
  }

  // Existing injection scan (the one chat and documents use), on raw and folded text.
  for (const [label, t] of [['raw', text], ['folded', folded]] as const) {
    const inj = scanForInjectionPatterns(t);
    for (const p of inj.patterns) {
      const sev: Severity = p === 'authorization_claim' ? 'HIGH' : 'CRITICAL';
      add({ rule: `injection_${p}`, severity: sev, category: 'prompt_injection',
        message: `Matches the shared injection scan (${p})${label === 'folded' ? ' after normalisation' : ''}`, line: null });
    }
  }

  // Secrets (value never stored)
  for (const sr of SECRET_RULES) {
    const m = sr.re.exec(text);
    if (m) add({ rule: `secret_${sr.name}`, severity: 'CRITICAL', category: 'secret', message: `Looks like a credential (${sr.name})`, line: lineOf(text, m.index) });
  }

  // Encoded blobs
  const b64 = BASE64_BLOB.exec(text);
  if (b64 && /[A-Z]/.test(b64[0]) && /[a-z]/.test(b64[0]) && /\d/.test(b64[0])) {
    add({ rule: 'base64_blob', severity: 'CRITICAL', category: 'payload', message: `Encoded blob of ${b64[0].length}+ characters`, line: lineOf(text, b64.index) });
  }
  const hex = HEX_BLOB.exec(text);
  if (hex) add({ rule: 'hex_blob', severity: 'HIGH', category: 'payload', message: `Hex blob of ${hex[0].length}+ characters`, line: lineOf(text, hex.index) });

  // Softer signals
  const soft = /\byou (must|should|shall) (always|never|immediately)\b/i.exec(folded);
  if (soft) add({ rule: 'imperative_to_reader', severity: 'LOW', category: 'assistant_directed', message: 'Strong imperative aimed at the reader', line: null });

  const order: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule));
  const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  let score = 0;
  for (const f of findings) { counts[f.severity]++; score += WEIGHT[f.severity]; }
  const verdict = counts.CRITICAL > 0 || score >= REJECT_SCORE ? 'critical' : findings.some((f) => f.severity !== 'LOW') ? 'flagged' : 'clean';
  return { version: 1, verdict, score, findings: findings.slice(0, MAX_FINDINGS), counts, truncated: findings.length > MAX_FINDINGS };
}

/** True when the report must stop the pipeline before any model call. */
export function isBlocking(report: ScanReport): boolean {
  return report.verdict === 'critical';
}
