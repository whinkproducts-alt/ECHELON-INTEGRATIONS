import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const initiatives = await prisma.initiative.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ 
      initiatives: initiatives.map(i => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      }))
    });
  } catch (error) {
    console.error('Error listing initiatives:', error);
    return NextResponse.json({ error: 'Failed to list initiatives' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, objective, recipient, sourceIdeaId } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!objective || !objective.trim()) {
      return NextResponse.json({ error: 'Objective is required' }, { status: 400 });
    }
    if (!recipient) {
      return NextResponse.json({ error: 'Recipient is required' }, { status: 400 });
    }

    const initiative = await prisma.initiative.create({
      data: {
        userId: session.user.id,
        title: title.trim(),
        objective: objective.trim(),
        recipient,
        sourceIdeaId: sourceIdeaId || null,
        status: 'queued',
        progress: 0,
      },
    });

    return NextResponse.json({ 
      initiative: {
        ...initiative,
        createdAt: initiative.createdAt.toISOString(),
        updatedAt: initiative.updatedAt.toISOString(),
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating initiative:', error);
    return NextResponse.json({ error: 'Failed to create initiative' }, { status: 500 });
  }
}