/** Skill upload validation and at-rest packing. Pure apart from encryption. */
import crypto from 'crypto';
import config from '@/config/skill-pipeline.json';
import { decryptKey, encryptKey, isEncryptionConfigured } from '@/lib/key-encryption';

export interface ValidFile { filename: string; name: string; ext: string; text: string; sha256: string; sizeBytes: number }
export type FileCheck = { ok: true; file: ValidFile } | { ok: false; error: string; tooLong?: boolean };

export function sanitizeFilename(raw: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001F\u007F‪-‮⁦-⁩]/g, '').trim();
  return base.slice(0, 200);
}

/** Reject YAML features that enable alias expansion, custom tags or multi-document tricks, and bad indentation. */
export function checkYamlShape(text: string): string | null {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\t|^ *\t/.test(l)) return `tab indentation on line ${i + 1}`;
    const code = l.replace(/^\s*#.*$/, '');
    if (/(^|[\s:[{,-])!{1,2}[\w<]/.test(code)) return 'YAML tags are not allowed';
    if (/(^|[\s:[{,-])[&*][A-Za-z0-9_-]+/.test(code.replace(/(["']).*?\1/g, ''))) return 'YAML anchors and aliases are not allowed';
  }
  let quotes = 0;
  for (const l of lines) {
    const t = l.replace(/\\./g, '');
    if (/^\s*#/.test(t)) continue;
    quotes += (t.match(/"/g) ?? []).length % 2;
  }
  if (quotes > 0) return 'unbalanced quotes';
  if (!lines.some((l) => l.trim() && !l.trim().startsWith('#'))) return 'empty document';
  return null;
}

export function checkFile(rawName: string, bytes: Uint8Array): FileCheck {
  const filename = sanitizeFilename(rawName);
  if (!filename) return { ok: false, error: 'Missing file name' };
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  if (!config.allowedExtensions.includes(ext)) return { ok: false, error: `File type not allowed. Allowed: ${config.allowedExtensions.join(' ')}` };
  if (bytes.byteLength === 0) return { ok: false, error: 'File is empty' };
  if (bytes.byteLength > config.maxFileBytes) return { ok: false, error: `File exceeds ${Math.floor(config.maxFileBytes / 1024)} KB` };
  if (bytes.includes(0)) return { ok: false, error: 'File contains NUL bytes' };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: 'File is not valid UTF-8 text' };
  }
  if (text.length > config.maxModelChars) {
    return { ok: false, tooLong: true, error: `Skill text is ${text.length} characters; the limit is ${config.maxModelChars} because every character must be reviewed before it is stored. Split it into smaller files.` };
  }
  if (ext === '.json') {
    try { JSON.parse(text); } catch { return { ok: false, error: 'File is not valid JSON' }; }
  }
  if (ext === '.yaml' || ext === '.yml') {
    const problem = checkYamlShape(text);
    if (problem) return { ok: false, error: `File is not valid YAML: ${problem}` };
  }
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const name = filename.slice(0, dot > 0 ? dot : undefined).replace(/\s+/g, ' ').trim().slice(0, 120) || 'skill';
  return { ok: true, file: { filename, name, ext, text, sha256, sizeBytes: bytes.byteLength } };
}

/** At rest: AES-256-GCM through lib/key-encryption.ts when configured, otherwise plain text. */
export function plaintextAllowed(): boolean {
  return process.env.SKILL_ALLOW_PLAINTEXT === 'true';
}

/** True when uploads may be stored: the encryption key is configured, or plaintext was explicitly allowed. */
export function storageReady(): boolean {
  return isEncryptionConfigured() || plaintextAllowed();
}

export function packContent(text: string): string {
  if (!storageReady()) throw new Error('encryption key not configured');
  return isEncryptionConfigured() ? `enc:${encryptKey(text)}` : `raw:${text}`;
}

export function unpackContent(stored: string): string {
  if (stored.startsWith('enc:')) return decryptKey(stored.slice(4));
  if (stored.startsWith('raw:')) return stored.slice(4);
  throw new Error('skill content has an unknown storage format');
}
