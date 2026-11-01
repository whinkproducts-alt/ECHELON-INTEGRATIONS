/**
 * Turns an HTML document into plain text for model context and short excerpts.
 *
 * A single pass over the characters, with no regular-expression tag stripping. Stripping tags with a regex
 * can leave a new tag behind (`<scr<b>ipt>`) or miss a `</script >` end tag, which is why this scans instead.
 * The result is text only: no `<` or `>` survives, so it can never be mistaken for markup downstream.
 *
 * What counts as a tag: `<` followed by a letter, `/`, `!` or `?`. Anything else (`a < b`) is ordinary text.
 * Content of `<script>` and `<style>` elements is dropped, and so are comments. An unclosed script or style
 * element drops the rest of the document, which is the safe side.
 */
export interface HtmlTextOptions {
  /** What a removed tag becomes. ' ' keeps words apart; '' joins them (feed excerpts). */
  separator?: string;
  /** Stop after this many output characters. */
  maxChars?: number;
}

function isTagStart(ch: string | undefined): boolean {
  return ch !== undefined && (/[A-Za-z]/.test(ch) || ch === '/' || ch === '!' || ch === '?');
}

/** Index just after the '>' that ends the tag starting at `start`, respecting quoted attribute values. */
function endOfTag(s: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '>') return i + 1;
  }
  return s.length;
}

/** Index just after the end tag of a raw-text element (script or style), tolerant of `</script >`. */
function endOfRawText(s: string, from: number, name: string): number {
  const lower = s.toLowerCase();
  let i = from;
  for (;;) {
    const at = lower.indexOf(`</${name}`, i);
    if (at === -1) return s.length;
    const after = lower[at + 2 + name.length];
    // A real end tag continues with whitespace, '/' or '>'. `</scripty>` is not one.
    if (after === undefined || after === '>' || after === '/' || /\s/.test(after)) return endOfTag(s, at);
    i = at + 2;
  }
}

export function htmlToText(html: string, opts: HtmlTextOptions = {}): string {
  const sep = opts.separator ?? ' ';
  const max = opts.maxChars ?? Infinity;
  let out = '';
  let i = 0;
  while (i < html.length && out.length < max) {
    const c = html[i];
    if (c !== '<' || !isTagStart(html[i + 1])) {
      out += c;
      i += 1;
      continue;
    }
    if (html.startsWith('<!--', i)) {
      const close = html.indexOf('-->', i + 4);
      i = close === -1 ? html.length : close + 3;
      out += sep;
      continue;
    }
    const name = /^<([A-Za-z][A-Za-z0-9]*)/.exec(html.slice(i, i + 20))?.[1]?.toLowerCase();
    const end = endOfTag(html, i);
    if (name === 'script' || name === 'style') {
      i = endOfRawText(html, end, name);
    } else {
      i = end;
    }
    out += sep;
  }
  // Whatever angle brackets remain were ordinary text. Remove them so nothing downstream can read the output as markup.
  return out.replace(/[<>]/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, Number.isFinite(max) ? max : undefined);
}
