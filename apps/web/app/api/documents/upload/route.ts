export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { uploadDocument } from '@/lib/anythingllm-client';
import { recordActionSafe } from '@/lib/ledger';

// ── MIME type validation ──────────────────────────────────────────────────────

/**
 * Allowed MIME types — validated by content, not extension only (C6).
 * Each entry carries the MIME type and the magic bytes it must start with.
 */
const ALLOWED_TYPES: Array<{ mime: string; magic: Buffer }> = [
  // PDF: %PDF
  { mime: 'application/pdf', magic: Buffer.from([0x25, 0x50, 0x44, 0x46]) },
  // DOCX (ZIP-based Office Open XML): PK\x03\x04
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  },
  // Plain text and Markdown have no reliable magic bytes — fall through to declared MIME check.
  { mime: 'text/plain', magic: Buffer.alloc(0) },
  { mime: 'text/markdown', magic: Buffer.alloc(0) },
];

const TEXT_MIMES = new Set(['text/plain', 'text/markdown']);

/**
 * Returns the validated MIME type or null if the content is not an allowed type.
 * For binary types we check magic bytes. For text types we accept the declared type.
 */
function detectMime(buf: Buffer, declaredMime: string): string | null {
  const declared = declaredMime.split(';')[0].trim().toLowerCase();

  if (!ALLOWED_TYPES.some((a) => a.mime === declared)) return null;

  if (TEXT_MIMES.has(declared)) {
    // Minimal check: must not start with binary magic bytes for PDF or ZIP
    const isPdf = buf.slice(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]));
    const isZip = buf.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (isPdf || isZip) return null; // binary content declared as text — reject
    return declared;
  }

  // Binary: find matching entry and check magic bytes
  const entry = ALLOWED_TYPES.find((a) => a.mime === declared && a.magic.length > 0);
  if (!entry) return null;
  if (buf.slice(0, entry.magic.length).equals(entry.magic)) return declared;
  return null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_MB = 25;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const maxMb = Number(process.env.DOCUMENT_MAX_SIZE_MB ?? DEFAULT_MAX_MB);
  const maxBytes = maxMb * 1024 * 1024;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const fileEntry = formData.get('file');
  if (!fileEntry || typeof fileEntry === 'string') {
    return NextResponse.json({ error: 'file field required' }, { status: 400 });
  }

  const file = fileEntry as File;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File exceeds maximum size of ${maxMb} MB` },
      { status: 413 },
    );
  }

  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  // Validate MIME type by content (C6)
  const validatedMime = detectMime(buf, file.type || 'application/octet-stream');
  if (!validatedMime) {
    return NextResponse.json(
      { error: 'Unsupported file type. Allowed: PDF, DOCX, plain text, Markdown.' },
      { status: 415 },
    );
  }

  // Resolve the user's workspace (required — cannot upload without a configured workspace)
  const ws = await prisma.documentWorkspace.findUnique({ where: { userId } });
  if (!ws) {
    return NextResponse.json(
      { error: 'No document workspace configured for this account.' },
      { status: 404 },
    );
  }

  // Compute SHA-256 of file contents (C6)
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

  // Upload via the adapter
  let result: { id: string };
  try {
    result = await uploadDocument(userId, ws.workspaceSlug, buf, file.name, validatedMime);
  } catch {
    await recordActionSafe({
      userId,
      action: 'document_upload_failed',
      permissionClass: 'A',
      status: 'FAILED',
      tool: 'documents_upload',
      inputSummary: `filename=${file.name.slice(0, 200)} size=${file.size}`,
    });
    return NextResponse.json({ error: 'Upload to document store failed' }, { status: 502 });
  }

  // Ledger: filename, size in bytes, hash — never file content (C6)
  await recordActionSafe({
    userId,
    action: 'document_uploaded',
    permissionClass: 'A',
    status: 'SUBMITTED',
    tool: 'documents_upload',
    inputSummary: `filename=${file.name.slice(0, 200)} size=${file.size} sha256=${sha256}`,
  });

  return NextResponse.json({ id: result.id }, { status: 201 });
}
