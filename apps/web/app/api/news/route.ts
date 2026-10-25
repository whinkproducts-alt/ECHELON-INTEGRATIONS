import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? 'all';

  // Map categories to RSS feeds (public, no API key)
  const feeds: Record<string, string[]> = {
    all: [
      'https://feeds.bbci.co.uk/news/business/rss.xml',
      'https://feeds.bbci.co.uk/news/technology/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    ],
    tech: [
      'https://feeds.bbci.co.uk/news/technology/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    ],
    ai: [
      'https://feeds.bbci.co.uk/news/technology/rss.xml',
    ],
    business: [
      'https://feeds.bbci.co.uk/news/business/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    ],
    canada: [
      'https://www.cbc.ca/cmlink/rss-business',
      'https://www.cbc.ca/cmlink/rss-technology',
    ],
    market: [
      'https://feeds.bbci.co.uk/news/business/rss.xml',
    ],
  };

  const urls = feeds[category] ?? feeds.all;

  const results: Array<{ title: string; link: string; pubDate: string; source: string; excerpt: string }> = [];

  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'IntelligenceFeed/1.0' },
          next: { revalidate: 300 }, // 5-min cache
        });
        const text = await res.text();
        // parse RSS XML manually (no external lib — keep MIT/Apache only)
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
          if (title && link) results.push({ title, link, pubDate, source: sourceName, excerpt });
        }
      } catch { /* feed unavailable — skip */ }
    })
  );

  // deduplicate by link, sort by pubDate desc
  const seen = new Set<string>();
  const deduped = results.filter(r => {
    if (seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  }).sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  return NextResponse.json({ items: deduped, fetchedAt: new Date().toISOString() });
}
