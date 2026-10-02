export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sttUrl = process.env.STT_URL?.trim();
  if (!sttUrl) {
    // Tell the client to fall back to Web Speech API
    return NextResponse.json({ text: '', fallback: 'browser' });
  }

  // Validate content-length before reading
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
    return NextResponse.json({ error: 'Audio too large (max 10 MB)' }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const audio = formData.get('audio');
  if (!audio || !(audio instanceof Blob)) {
    return NextResponse.json({ error: 'Missing audio field' }, { status: 400 });
  }

  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Audio too large (max 10 MB)' }, { status: 413 });
  }

  // Forward to Whisper-compatible endpoint
  const upstream = new FormData();
  upstream.append('file', audio, 'audio.webm');
  upstream.append('model', 'whisper-1');

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${sttUrl}/audio/transcriptions`, {
      method: 'POST',
      body: upstream,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'STT upstream unreachable';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!upstreamRes.ok) {
    const body = await upstreamRes.text().catch(() => '');
    return NextResponse.json(
      { error: `STT upstream error ${upstreamRes.status}`, detail: body },
      { status: 502 },
    );
  }

  const data = await upstreamRes.json();
  return NextResponse.json({ text: data.text ?? '' });
}
