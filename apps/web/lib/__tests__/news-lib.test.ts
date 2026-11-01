import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseRss, fetchNewsByCategory, fetchNewsFromUrls, NEWS_FEEDS, DESK_FEEDS } from '../news';

const RSS = `<rss><channel><title><![CDATA[BBC Business]]></title>
<item><title><![CDATA[First &amp; best]]></title><link>https://a.test/1</link><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Hello <b>world</b></p>]]></description></item>
<item><title>Second</title><guid>https://a.test/2</guid><pubDate>Mon, 26 Oct 2026 12:00:00 GMT</pubDate><description>plain</description></item>
<item><title></title><link>https://a.test/3</link></item>
</channel></rss>`;

describe('lib/news', () => {
  it('parses items exactly as the route used to', () => {
    const items = parseRss(RSS, 'https://a.test/feed');
    expect(items).toEqual([
      { title: 'First &amp; best', link: 'https://a.test/1', pubDate: 'Mon, 26 Oct 2026 10:00:00 GMT', source: 'BBC Business', excerpt: 'Hello world' },
      { title: 'Second', link: 'https://a.test/2', pubDate: 'Mon, 26 Oct 2026 12:00:00 GMT', source: 'BBC Business', excerpt: 'plain' },
    ]);
  });
  it('keeps the original feed lists', () => {
    expect(Object.keys(NEWS_FEEDS).sort()).toEqual(['ai', 'all', 'business', 'canada', 'market', 'tech']);
    expect(NEWS_FEEDS.all).toHaveLength(3);
  });
  it('dedupes by link, sorts newest first, skips a failing feed, unknown category uses all', async () => {
    const fetcher = vi.fn(async (u: string) => { if (u.includes('nytimes')) throw new Error('down'); return RSS; });
    const out = await fetchNewsByCategory('nope', fetcher);
    expect(out.map((i) => i.link)).toEqual(['https://a.test/2', 'https://a.test/1']);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(await fetchNewsByCategory('__proto__', fetcher)).toHaveLength(2);
  });
  it('desk feeds cover the six desks with https urls', () => {
    expect(Object.keys(DESK_FEEDS).sort()).toEqual(['americas', 'asia_pacific', 'canada', 'europe_africa', 'markets_business', 'tech_ai']);
    for (const urls of Object.values(DESK_FEEDS)) for (const u of urls) expect(u.startsWith('https://')).toBe(true);
    expect(fetchNewsFromUrls).toBeTypeOf('function');
  });
});

describe('GET /api/news', () => {
  const auth = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('next/server', () => ({ NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) } }));
    vi.doMock('@/auth', () => ({ auth }));
  });
  it('401 without a session, items with one', async () => {
    const { GET } = await import('../../app/api/news/route');
    auth.mockResolvedValue(null);
    expect((await GET(new Request('http://x/api/news'))).status).toBe(401);
    auth.mockResolvedValue({ user: { id: 'u1' } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(RSS)));
    const res = await GET(new Request('http://x/api/news?category=ai'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(typeof body.fetchedAt).toBe('string');
    vi.unstubAllGlobals();
  });
});
