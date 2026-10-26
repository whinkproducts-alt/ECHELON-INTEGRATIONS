export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { BodyTooLargeError, readBodyCapped, requireUserId } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/permission-engine';
import { recordActionSafe } from '@/lib/ledger';
import config from '@/config/skill-pipeline.json';
import { checkFile, storageReady } from '@/lib/skills/intake';
import { countToday, enqueueSubmission, resumeStalled, startProcessing } from '@/lib/skills/pipeline';

const LIST_SELECT = {
  id: true, name: true, filename: true, sizeBytes: true, status: true, decision: true, reason: true,
  memoryIds: true, attempts: true, createdAt: true, updatedAt: true, scanReport: true, committee: true,
} as const;

function summarise(row: Record<string, unknown>) {
  const scan = row.scanReport as { score?: number; verdict?: string; counts?: unknown } | null;
  const committee = row.committee as { approvals?: number; meanScore?: number } | null;
  const { scanReport: _s, committee: _c, memoryIds, ...rest } = row;
  void _s; void _c;
  return {
    ...rest,
    memoryCount: Array.isArray(memoryIds) ? memoryIds.length : 0,
    scan: scan ? { verdict: scan.verdict ?? null, score: scan.score ?? null, counts: scan.counts ?? null } : null,
    committeeSummary: committee ? { approvals: committee.approvals ?? null, meanScore: committee.meanScore ?? null } : null,
  };
}

export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  // Opportunistic sweep for this account only; detached and never blocks the list.
  void resumeStalled({ userId: a.userId }).catch(() => {});
  const rows = await prisma.skillSubmission.findMany({
    where: { userId: a.userId }, orderBy: { createdAt: 'desc' }, take: 200, select: LIST_SELECT,
  });
  return NextResponse.json({ submissions: rows.map((r) => summarise(r as unknown as Record<string, unknown>)) });
}

export async function POST(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const userId = a.userId;

  if (!storageReady()) {
    return NextResponse.json({ error: 'Skill uploads are unavailable: encryption key not configured' }, { status: 503 });
  }

  const limited = await limitOr429('import', userId);
  if (limited) return limited as NextResponse;

  const ct = req.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'Content-Type must be multipart/form-data' }, { status: 415 });
  }

  let form: FormData;
  try {
    const bytes = await readBodyCapped(req, config.maxFilesPerRequest * config.maxFileBytes + 64 * 1024);
    form = await new Response(bytes as BodyInit, { headers: { 'content-type': ct } }).formData();
  } catch (e) {
    if (e instanceof BodyTooLargeError) return NextResponse.json({ error: 'Upload too large' }, { status: 413 });
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const files = [...form.getAll('file'), ...form.getAll('files')].filter((f): f is File => typeof f !== 'string');
  if (files.length === 0) return NextResponse.json({ error: 'No files provided (field "file")' }, { status: 400 });
  if (files.length > config.maxFilesPerRequest) {
    return NextResponse.json({ error: `At most ${config.maxFilesPerRequest} files per request` }, { status: 400 });
  }

  const perm = await checkPermission(userId, 'skill_intake', 'A');
  if (!perm.allowed) {
    await recordActionSafe({ userId, initiator: 'user', persona: 'WHINK', action: 'skill_intake_denied', tool: 'skill_pipeline', permissionClass: 'A', status: 'DENIED' });
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  }

  let used = await countToday(userId);
  if (used >= config.dailyCap) {
    return NextResponse.json({ error: `Daily skill upload cap (${config.dailyCap}) reached` }, { status: 429 });
  }

  const submissions: Array<{ id: string; filename: string; name: string; status: string; duplicate: boolean }> = [];
  const rejected: Array<{ filename: string; error: string; status?: number }> = [];
  for (const f of files) {
    const filename = f.name.slice(0, 200);
    if (f.size > config.maxFileBytes) { rejected.push({ filename, error: `File exceeds ${Math.floor(config.maxFileBytes / 1024)} KB` }); continue; }
    const check = checkFile(f.name, new Uint8Array(await f.arrayBuffer()));
    if (!check.ok) { rejected.push({ filename, error: check.error, ...(check.tooLong ? { status: 413 } : {}) }); continue; }
    const existing = await prisma.skillSubmission.findFirst({ where: { userId, sha256: check.file.sha256 }, select: { id: true, status: true } });
    if (existing) { submissions.push({ id: existing.id, filename: check.file.filename, name: check.file.name, status: existing.status, duplicate: true }); continue; }
    if (used >= config.dailyCap) { rejected.push({ filename, error: 'Daily skill upload cap reached' }); continue; }
    const q = await enqueueSubmission(userId, check.file);
    if (!q.duplicate) { used++; startProcessing(userId, q.id); }
    submissions.push({ id: q.id, filename: check.file.filename, name: check.file.name, status: 'QUEUED', duplicate: q.duplicate });
  }

  if (submissions.length === 0) {
    const allTooLong = rejected.length > 0 && rejected.every((r) => r.status === 413);
    return NextResponse.json({ error: allTooLong ? rejected[0].error : 'No files accepted', rejected }, { status: allTooLong ? 413 : 400 });
  }
  return NextResponse.json({ submissions, rejected }, { status: 202 });
}
