import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchNewsByCategory } from '@/lib/news';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? 'all';

  const items = await fetchNewsByCategory(category);
  return NextResponse.json({ items, fetchedAt: new Date().toISOString() });
}
