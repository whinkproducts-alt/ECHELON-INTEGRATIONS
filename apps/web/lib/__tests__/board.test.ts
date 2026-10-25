import { describe, it, expect } from 'vitest';
import { getBoardMembers, parseBoard } from '../board';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readPhotoSafely, csvToMembers, mergeBoard, parsePhotoName, sniffImage } from '../board-import';

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe('board.json', () => {
  const members = getBoardMembers();
  it('parses, ids unique, only confirmed people', () => {
    expect(new Set(members.map((m) => m.id)).size).toBe(members.length);
    expect(members.map((m) => m.id).sort()).toEqual(
      ['anthony-igboekwe', 'barrister-genevieve', 'dr-tinaye', 'juliet-igboekwe', 'mamba', 'marcus-vale', 'victor-igboekwe', 'whink'],
    );
  });
  it('WHINK and MAMBA sit on the board as AI members with no email, using the white-background portraits', () => {
    for (const id of ['whink', 'mamba']) {
      expect(members.find((m) => m.id === id)).toMatchObject({ kind: 'ai', email: null, needsDetails: false, imageUrl: `/board/${id}.webp` });
    }
  });
  it('Victor and Marcus are complete; the four others are flagged pending with null email and seat', () => {
    expect(members.find((m) => m.id === 'victor-igboekwe')).toMatchObject({ seat: 'Founder & Chairman', email: 'victor.igboekwe@whinkgroup.com', needsDetails: false });
    for (const id of ['anthony-igboekwe', 'dr-tinaye', 'barrister-genevieve', 'juliet-igboekwe']) {
      const m = members.find((x) => x.id === id)!;
      expect(m).toMatchObject({ email: null, seat: null, needsDetails: true, bio: '' });
    }
    expect(members.find((m) => m.id === 'dr-tinaye')).toMatchObject({ honorific: 'Dr', lastName: null });
    expect(members.find((m) => m.id === 'barrister-genevieve')).toMatchObject({ honorific: 'Barrister', lastName: null });
  });
  it('rejects remote image URLs and bad emails', () => {
    const base = { id: 'a-b', name: 'A B', seat: 'x', bio: '', joined: null, committees: [] };
    expect(() => parseBoard({ members: [{ ...base, email: 'a.b@whinkgroup.com', imageUrl: 'https://evil/x.png' }] })).toThrow();
    expect(() => parseBoard({ members: [{ ...base, email: 'nope@gmail.com', imageUrl: null }] })).toThrow();
  });
  it('rejects duplicate emails but allows several null emails', () => {
    const m = (id: string, email: string | null) => ({ id, name: id, seat: null, email, bio: '', imageUrl: null, joined: null, committees: [] });
    expect(() => parseBoard({ members: [m('a-a', 'a.a@whinkgroup.com'), m('b-b', 'a.a@whinkgroup.com')] })).toThrow();
    expect(parseBoard({ members: [m('a-a', null), m('b-b', null)] })).toHaveLength(2);
  });
});

describe('board import helpers', () => {
  it('sniffs image types by magic bytes', () => {
    expect(sniffImage(JPG)).toBe('jpg');
    expect(sniffImage(PNG)).toBe('png');
    expect(sniffImage(WEBP)).toBe('webp');
    expect(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
  });
  it('parses firstname-lastname file names only', () => {
    expect(parsePhotoName('Jane-Doe.JPG')).toMatchObject({ id: 'jane-doe', ext: 'jpg' });
    expect(parsePhotoName('jane.jpg')).toBeNull();
    expect(parsePhotoName('jane-doe.gif')).toBeNull();
    expect(parsePhotoName('../jane-doe.png')).toBeNull();
  });
  it('parses CSV with quotes', () => {
    const rows = csvToMembers('name,seat,email,bio,committees\n"Doe, Jane",Chair,,"Says ""hi""",Audit;Risk\n');
    expect(rows[0]).toMatchObject({ name: 'Doe, Jane', seat: 'Chair', bio: 'Says "hi"', committees: ['Audit', 'Risk'] });
  });
  it('merges photos and CSV, never inventing seats, rejecting fakes', () => {
    const r = mergeBoard([], csvToMembers('name,seat\nJane Doe,Chair\n'), [
      { file: 'jane-doe.png', bytes: PNG },
      { file: 'bob-lee.jpg', bytes: PNG }, // extension lies
      { file: 'eve-ray.png', bytes: new TextEncoder().encode('not an image') },
      { file: 'sam-fox.webp', bytes: WEBP }, // no CSV row
    ]);
    const jane = r.members.find((m) => m.id === 'jane-doe')!;
    expect(jane).toMatchObject({ seat: 'Chair', imageUrl: '/board/jane-doe.png', email: 'jane.doe@whinkgroup.com' });
    expect(r.members.find((m) => m.id === 'sam-fox')).toMatchObject({ seat: null, email: null, needsDetails: true });
    expect(r.members.find((m) => m.id === 'bob-lee')).toBeUndefined();
    expect(r.members.find((m) => m.id === 'eve-ray')).toBeUndefined();
    expect(r.warnings.length).toBeGreaterThanOrEqual(3);
  });
  it('rejects oversize photos', () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1); big.set(PNG);
    const r = mergeBoard([], [], [{ file: 'big-one.png', bytes: big }]);
    expect(r.photos).toHaveLength(0);
  });
});

describe('readPhotoSafely', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
  it('reads a regular file and returns its exact bytes', () => {
    fs.writeFileSync(path.join(dir, 'a-b.png'), PNG);
    const r = readPhotoSafely(dir, 'a-b.png');
    expect('bytes' in r && Array.from(r.bytes)).toEqual(Array.from(PNG));
  });
  it('rejects symlinks (even to a valid image outside the folder)', () => {
    fs.writeFileSync(path.join(outside, 'secret.png'), PNG);
    fs.symlinkSync(path.join(outside, 'secret.png'), path.join(dir, 'c-d.png'));
    const r = readPhotoSafely(dir, 'c-d.png');
    expect(r).toEqual({ skipped: expect.stringContaining('symbolic') });
  });
  it('rejects oversize files before reading them, and path separators', () => {
    const fd = fs.openSync(path.join(dir, 'big-one.png'), 'w');
    fs.ftruncateSync(fd, 6 * 1024 * 1024);
    fs.closeSync(fd);
    expect(readPhotoSafely(dir, 'big-one.png')).toEqual({ skipped: expect.stringContaining('not read') });
    expect(readPhotoSafely(dir, '../x.png')).toEqual({ skipped: expect.stringContaining('separators') });
  });
});
