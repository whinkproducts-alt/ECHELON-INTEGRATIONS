/**
 * Import Board of Directors details from a folder on this machine.
 *
 *   tsx scripts/import-board.ts <folder> [--write] [--out config/board.json]
 *
 * Folder contents: images named firstname-lastname.(jpg|png|webp) and an optional board.csv
 * with columns name,seat,email,bio,committees (committees separated by ;).
 * Default is a dry run that prints what would change. Nothing is written without --write.
 * Photos are checked by magic bytes and capped at 5 MB, then copied to public/board/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BoardFileSchema } from '../lib/board';
import { csvToMembers, mergeBoard } from '../lib/board-import';

const args = process.argv.slice(2);
const write = args.includes('--write');
const outIdx = args.indexOf('--out');
const outPath = path.resolve(outIdx >= 0 ? args[outIdx + 1] : path.join(__dirname, '..', 'config', 'board.json'));
const folder = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');

if (!folder) {
  console.error('Usage: tsx scripts/import-board.ts <folder> [--write] [--out file]');
  process.exit(2);
}
const dir = path.resolve(folder);
if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  console.error(`Not a folder: ${dir}`);
  process.exit(2);
}

const existingRaw = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : { members: [] };
const existing = BoardFileSchema.parse(existingRaw).members;

const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());
const csvFile = files.find((f) => f.toLowerCase() === 'board.csv');
const csv = csvFile ? csvToMembers(fs.readFileSync(path.join(dir, csvFile), 'utf8')) : [];
const photos = files
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .map((f) => ({ file: f, bytes: new Uint8Array(fs.readFileSync(path.join(dir, f))) }));

const result = mergeBoard(existing, csv, photos);
console.log(`${write ? 'WRITE' : 'DRY RUN'}: ${result.members.length} members, ${result.photos.length} photos`);
for (const m of result.members) console.log(` - ${m.name} <${m.email ?? "no email yet"}> | ${m.seat ?? "no seat yet"}${m.imageUrl ? ' | ' + m.imageUrl : ''}`);
for (const w of result.warnings) console.warn(`warning: ${w}`);

if (!write) {
  console.log('Dry run only. Re-run with --write to apply.');
  process.exit(0);
}
const photoDir = path.join(__dirname, '..', 'public', 'board');
fs.mkdirSync(photoDir, { recursive: true });
for (const p of result.photos) fs.copyFileSync(path.join(dir, p.file), path.join(photoDir, p.target));
fs.writeFileSync(outPath, JSON.stringify({ ...existingRaw, members: result.members }, null, 2) + '\n');
console.log(`Wrote ${outPath}`);
