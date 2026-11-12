import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await prisma.tenantConfig.findUnique({ where: { tenantId: session.user.id } });
  const config = existing ?? await prisma.tenantConfig.upsert({
    where: { tenantId: session.user.id },
    create: { tenantId: session.user.id },
    update: {},
  });
  return NextResponse.json(config);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const allowed = ['productName', 'logoUrl', 'accentColor', 'supportUrl', 'privacyUrl', 'termsUrl'];
  const data: Record<string, string> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  const config = await prisma.tenantConfig.upsert({
    where: { tenantId: session.user.id },
    create: { tenantId: session.user.id, ...data },
    update: data,
  });
  return NextResponse.json(config);
}
