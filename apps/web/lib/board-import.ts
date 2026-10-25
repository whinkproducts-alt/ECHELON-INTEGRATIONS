/**
 * Pure helpers for scripts/import-board.ts: file-name parsing, magic-byte image checks, CSV parsing
 * and roster merging. No filesystem access here, so it is unit-testable.
 */
import { BoardFileSchema, type BoardMember } from '@/lib/board';
import { staffEmail } from '@/lib/staff-directory';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type ImageType = 'jpg' | 'png' | 'webp';

export function sniffImage(buf: Uint8Array): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length >= 8 && png.every((b, i) => buf[i] === b)) return 'png';
  const ascii = (o: number, s: string) => s.split('').every((c, i) => buf[o + i] === c.charCodeAt(0));
  if (buf.length >= 12 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'webp';
  return null;
}

/** firstname-lastname.(jpg|jpeg|png|webp) -> parts, else null. First hyphen splits first from last name. */
export function parsePhotoName(file: string): { first: string; last: string; ext: string; id: string } | null {
  const m = /^([a-z]+)-([a-z]+(?:-[a-z]+)*)\.(jpg|jpeg|png|webp)$/i.exec(file);
  if (!m) return null;
  const first = m[1].toLowerCase();
  const last = m[2].toLowerCase();
  return { first, last, ext: m[3].toLowerCase(), id: `${first}-${last}` };
}

export function titleCase(s: string): string {
  return s.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export function slugify(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export interface CsvMember { name: string; seat?: string; email?: string; bio?: string; committees?: string[] }

export function csvToMembers(text: string): CsvMember[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (!header.includes('name')) throw new Error('board.csv needs a "name" column');
  return rows.slice(1).map((r) => {
    const get = (k: string) => { const i = header.indexOf(k); return i >= 0 ? (r[i] ?? '').trim() : ''; };
    return {
      name: get('name'),
      seat: get('seat') || undefined,
      email: get('email') || undefined,
      bio: get('bio') || undefined,
      committees: get('committees') ? get('committees').split(';').map((c) => c.trim()).filter(Boolean) : undefined,
    };
  }).filter((m) => m.name);
}

export interface PhotoInput { file: string; bytes: Uint8Array }
export interface MergeResult { members: BoardMember[]; photos: Array<{ file: string; target: string }>; warnings: string[] }

/** Merge existing roster + CSV rows + validated photos. Never invents people: only names found in the CSV or photo names. */
export function mergeBoard(existing: BoardMember[], csv: CsvMember[], photos: PhotoInput[]): MergeResult {
  const warnings: string[] = [];
  const byId = new Map<string, BoardMember>(existing.map((m) => [m.id, { ...m }]));
  const photoOut: MergeResult['photos'] = [];

  for (const c of csv) {
    const id = slugify(c.name);
    const parts = c.name.trim().split(/\s+/);
    const cur = byId.get(id);
    const email = c.email ?? cur?.email ?? (parts.length > 1 ? staffEmail(parts[0], parts.slice(1).join(' ')) : '');
    const seat = c.seat ?? cur?.seat ?? null;
    byId.set(id, {
      id,
      name: c.name.trim(),
      firstName: cur?.firstName ?? parts[0] ?? null,
      lastName: cur?.lastName ?? (parts.length > 1 ? parts.slice(1).join(' ') : null),
      honorific: cur?.honorific ?? null,
      email: parts.length > 1 || c.email || cur?.email ? email.toLowerCase() : null,
      seat,
      needsDetails: seat === null,
      bio: c.bio ?? cur?.bio ?? '',
      imageUrl: cur?.imageUrl ?? null,
      joined: cur?.joined ?? null,
      committees: c.committees ?? cur?.committees ?? [],
    });
    if (!seat) warnings.push(`${c.name}: no seat in CSV; left empty and flagged needsDetails.`);
  }

  for (const p of photos) {
    const parsed = parsePhotoName(p.file);
    if (!parsed) { warnings.push(`${p.file}: name is not firstname-lastname.(jpg|png|webp), skipped`); continue; }
    if (p.bytes.length > MAX_PHOTO_BYTES) { warnings.push(`${p.file}: larger than ${MAX_PHOTO_BYTES} bytes, skipped`); continue; }
    const type = sniffImage(p.bytes);
    if (!type) { warnings.push(`${p.file}: not a real jpg/png/webp by content, skipped`); continue; }
    const wantExt = parsed.ext === 'jpeg' ? 'jpg' : parsed.ext;
    if (type !== wantExt) { warnings.push(`${p.file}: extension says ${wantExt} but content is ${type}, skipped`); continue; }
    const target = `${parsed.id}.${type}`;
    let m = byId.get(parsed.id);
    if (!m) {
      const first = titleCase(parsed.first);
      const last = titleCase(parsed.last);
      m = { id: parsed.id, name: `${first} ${last}`, firstName: first, lastName: last, honorific: null, email: null, seat: null, needsDetails: true, bio: '', imageUrl: null, joined: null, committees: [] };
      warnings.push(`${p.file}: no CSV row; member created from the file name only, seat and email left empty (needsDetails).`);
    }
    m.imageUrl = `/board/${target}`;
    byId.set(parsed.id, m);
    photoOut.push({ file: p.file, target });
  }

  const members = [...byId.values()];
  BoardFileSchema.parse({ members });
  return { members, photos: photoOut, warnings };
}
