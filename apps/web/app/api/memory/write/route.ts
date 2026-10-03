export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { writeMemory, type MemoryWriteInput } from '@/lib/memory-engine';
import { hasProjectId, assertOwnedProject } from '@/lib/project-access';

const MEMORY_TYPES = ['episodic', 'semantic', 'procedural', 'hypothesis'] as const;
const MAX_STATEMENT = 2000;

function clamp01(v: unknown): number | undefined | 'invalid' {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'invalid';
  return Math.min(1, Math.max(0, v));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  if (typeof b.statement !== 'string') return NextResponse.json({ error: 'statement must be a string' }, { status: 400 });
  const statement = b.statement.trim();
  if (!statement) return NextResponse.json({ error: 'statement required' }, { status: 400 });
  if (statement.length > MAX_STATEMENT) {
    return NextResponse.json({ error: `statement too long (max ${MAX_STATEMENT})` }, { status: 400 });
  }
  if (typeof b.type !== 'string' || !(MEMORY_TYPES as readonly string[]).includes(b.type)) {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 });
  }
  const type = b.type as MemoryWriteInput['type'];
  const confidence = clamp01(b.confidence);
  const importance = clamp01(b.importance);
  if (confidence === 'invalid') return NextResponse.json({ error: 'invalid confidence' }, { status: 400 });
  if (importance === 'invalid') return NextResponse.json({ error: 'invalid importance' }, { status: 400 });

  let projectId: string | null = null;
  if (hasProjectId(b.projectId)) {
    projectId = await assertOwnedProject(userId, b.projectId);
    if (!projectId) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Explicit allow-list: sourceId, mambaMode, eventType, rationale, entities are never client-controlled.
  const result = await writeMemory({
    userId,
    type,
    statement,
    projectId,
    source: 'user',
    epistemicStatus: 'KNOWN', // KNOWN is the convention for user-stated facts (see memory_write tool)
    ...(confidence !== undefined ? { confidence } : {}),
    ...(importance !== undefined ? { importance } : {}),
  });
  return NextResponse.json(result);
}
