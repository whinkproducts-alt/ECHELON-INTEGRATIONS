import { NextResponse } from 'next/server';
import { isLocalOnlyMode, LOCAL_ONLY_UNAVAILABLE } from '@/lib/local-only';
import { ledgerLocalOnlyBlock } from '@/lib/local-only-guard';
import { auth } from '@/auth';
import { fetchNewsByCategory } from '@/lib/news';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (isLocalOnlyMode()) {
    await ledgerLocalOnlyBlock(session.user.id, 'news_feed', 'news feeds are external');
    return NextResponse.json({ error: LOCAL_ONLY_UNAVAILABLE, items: [] }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? 'all';

  const items = await fetchNewsByCategory(category);
  return NextResponse.json({ items, fetchedAt: new Date().toISOString() });
}
