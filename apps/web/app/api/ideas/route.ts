import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { listIdeas, createIdea, updateIdea, archiveIdea, listRecommendations } from '@/lib/ideas';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') as 'private' | 'shared' | null;

    const ideas = await listIdeas(session.user.id, scope ?? 'private');
    return NextResponse.json({ ideas });
  } catch (error) {
    console.error('Error listing ideas:', error);
    return NextResponse.json({ error: 'Failed to list ideas' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, body: ideaBody, privacyScope = 'private' } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const idea = await createIdea(session.user.id, {
      title: title.trim(),
      body: ideaBody?.trim() || '',
      privacyScope,
    });

    return NextResponse.json({ idea }, { status: 201 });
  } catch (error) {
    console.error('Error creating idea:', error);
    return NextResponse.json({ error: 'Failed to create idea' }, { status: 500 });
  }
}