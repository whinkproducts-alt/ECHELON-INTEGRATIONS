import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { updateIdea, archiveIdea } from '@/lib/ideas';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { title, body: ideaBody } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const idea = await updateIdea(session.user.id, id, {
      title: title.trim(),
      body: body?.trim() || '',
    });

    if (!idea) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
    }

    return NextResponse.json({ idea });
  } catch (error) {
    console.error('Error updating idea:', error);
    return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const success = await archiveIdea(session.user.id, id);

    if (!success) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error archiving idea:', error);
    return NextResponse.json({ error: 'Failed to archive idea' }, { status: 500 });
  }
}