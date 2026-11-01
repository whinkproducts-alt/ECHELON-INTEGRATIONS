import { describe, it, expect } from 'vitest';
import { htmlToText } from '../html-text';

describe('htmlToText', () => {
  it('keeps text and removes tags', () => {
    expect(htmlToText('<p>Hello <b>world</b></p>')).toBe('Hello world');
    expect(htmlToText('<p>a</p><p>b</p>', { separator: '' })).toBe('ab');
  });

  it('drops script and style content, including end tags with spaces or odd case', () => {
    expect(htmlToText('x<script>alert(1)</script >y')).toBe('x y');
    expect(htmlToText('x<SCRIPT type="a">alert(1)</ScRiPt\n>y')).toBe('x y');
    expect(htmlToText('x<style>p{color:red}</style>y')).toBe('x y');
    expect(htmlToText('x<script>never closed alert(1)')).toBe('x');
  });

  it('a tag cannot be reassembled from fragments', () => {
    for (const evil of ['<scr<b>ipt>alert(1)</scr</b>ipt>', '<<script>script>alert(1)<</script>/script>', '<img src=x onerror="a>b"><script>x</script>']) {
      const out = htmlToText(evil);
      expect(out).not.toMatch(/[<>]/);
      expect(out.toLowerCase()).not.toContain('<script');
    }
  });

  it('never leaves an angle bracket in the output', () => {
    expect(htmlToText('a < b and c > d')).toBe('a b and c d');
    expect(htmlToText('<!-- hidden <script> -->visible')).toBe('visible');
    expect(htmlToText('1 <2 and 3> 2')).not.toMatch(/[<>]/);
  });

  it('respects quotes inside a tag and the length cap', () => {
    expect(htmlToText('<a title="x>y">link</a>')).toBe('link');
    expect(htmlToText('abcdefghij', { maxChars: 4 })).toBe('abcd');
  });

  it('handles an unterminated tag and an empty string', () => {
    expect(htmlToText('text <div class="open')).toBe('text');
    expect(htmlToText('')).toBe('');
  });
});
