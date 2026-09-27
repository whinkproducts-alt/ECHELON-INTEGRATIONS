export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [profile, preferences] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: session.user.id } }),
    prisma.userPreference.findUnique({ where: { userId: session.user.id } }),
  ]);
  return NextResponse.json({ profile, preferences });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  
  if (body.profile) {
    await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      update: body.profile,
      create: { userId: session.user.id, ...body.profile },
    });
  }
  if (body.preferences) {
    await prisma.userPreference.upsert({
      where: { userId: session.user.id },
      update: body.preferences,
      create: { userId: session.user.id, ...body.preferences },
    });
  }
  if (body.name) {
    await prisma.user.update({ where: { id: session.user.id }, data: { name: body.name } });
  }
  return NextResponse.json({ success: true });
}
