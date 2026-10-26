/**
 * RSS fetch and parse for the Intelligence Feed and the news desk worker.
 * Moved out of app/api/news/route.ts with the same feeds and the same output. No XML library
 * (keeps the dependency list MIT/Apache only). Everything parsed here is untrusted text.
 */

export interface NewsItem { title: string; link: string; pubDate: string; source: string; excerpt: string }

/** Category to feed map used by GET /api/news. Unknown categories fall back to `all`. */
export const NEWS_FEEDS: Readonly<Record<string, readonly string[]>> = {
  all: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://feeds.bbci.co.uk/news/technology/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
  ],
  tech: [
    'https://feeds.bbci.co.uk/news/technology/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
  ],
  ai: ['https://feeds.bbci.co.uk/news/technology/rss.xml'],
  business: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
  ],
  canada: [
    'https://www.cbc.ca/cmlink/rss-business',
    'https://www.cbc.ca/cmlink/rss-technology',
  ],
  market: ['https://feeds.bbci.co.uk/news/business/rss.xml'],
};

/**
 * Feeds for the worker's news desks (public RSS, no key). Regional desks use the public BBC
 * regional feeds; if one is unreachable that desk simply sees nothing new.
 */
export const DESK_FEEDS: Readonly<Record<string, readonly string[]>> = {
  americas: ['https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', 'https://feeds.bbci.co.uk/news/world/latin_america/rss.xml'],
  europe_africa: ['https://feeds.bbci.co.uk/news/world/europe/rss.xml', 'https://feeds.bbci.co.uk/news/world/africa/rss.xml'],
  asia_pacific: ['https://feeds.bbci.co.uk/news/world/asia/rss.xml', 'https://feeds.bbci.co.uk/news/world/australia/rss.xml'],
  tech_ai: NEWS_FEEDS.tech,
  markets_business: NEWS_FEEDS.business,
  canada: NEWS_FEEDS.canada,
};

/** Parses one RSS document. Same regexes and caps as the original route (8 items, 180 char excerpt). */
export function parseRss(text: string, url: string): NewsItem[] {
  const out: NewsItem[] = [];
  const items = text.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  const sourceName = text.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
    ?? text.match(/<title>(.*?)<\/title>/)?.[1]
    ?? new URL(url).hostname;
  for (const item of items.slice(0, 8)) {
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? item.match(/<title>(.*?)<\/title>/)?.[1] ?? '').trim();
    const link = (item.match(/<link>(.*?)<\/link>/)?.[1]
      ?? item.match(/<guid>(https?:\/\/[^<]+)<\/guid>/)?.[1] ?? '').trim();
    const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '').trim();
    const excerpt = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s)?.[1]
      ?? item.match(/<description>(.*?)<\/description>/s)?.[1] ?? '')
      .replace(/<[^>]+>/g, '').slice(0, 180).trim();
    if (title && link) out.push({ title, link, pubDate, source: sourceName, excerpt });
  }
  return out;
}

/** Fetches the text of one feed URL. Injected so the route and the worker can differ. */
export type FeedTextFetcher = (url: string) => Promise<string>;

/** Route fetcher: plain fetch with the 5 minute cache hint the route always used. */
export const routeFetcher: FeedTextFetcher = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'IntelligenceFeed/1.0' },
    next: { revalidate: 300 }, // 5-min cache
  } as RequestInit);
  return res.text();
};

export const WORKER_FEED_MAX_BYTES = 512 * 1024;
export const WORKER_FEED_TIMEOUT_MS = 10_000;

/**
 * Worker fetcher: https only, SSRF check first (assertSafeUrl), redirects refused, hard time and
 * size caps. Loaded lazily so the route does not pull in the tool registry.
 */
export const safeFetcher: FeedTextFetcher = async (url) => {
  const { assertSafeUrl } = await import('@/lib/tool-registry');
  await assertSafeUrl(url);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'IntelligenceFeed/1.0' },
    redirect: 'manual',
    signal: AbortSignal.timeout(WORKER_FEED_TIMEOUT_MS),
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`feed HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > WORKER_FEED_MAX_BYTES) throw new Error('feed too large');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > WORKER_FEED_MAX_BYTES) { await reader.cancel().catch(() => {}); throw new Error('feed too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf-8');
};

/** Fetch, parse, dedupe by link, sort newest first. A feed that fails is skipped. */
export async function fetchNewsFromUrls(urls: readonly string[], fetcher: FeedTextFetcher = routeFetcher): Promise<NewsItem[]> {
  const results: NewsItem[] = [];
  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        results.push(...parseRss(await fetcher(url), url));
      } catch { /* feed unavailable — skip */ }
    }),
  );
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  }).sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
}

export async function fetchNewsByCategory(category: string, fetcher: FeedTextFetcher = routeFetcher): Promise<NewsItem[]> {
  return fetchNewsFromUrls(Object.prototype.hasOwnProperty.call(NEWS_FEEDS, category) ? NEWS_FEEDS[category] : NEWS_FEEDS.all, fetcher);
}
