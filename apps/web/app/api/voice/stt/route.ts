export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const provider = (process.env.STT_PROVIDER ?? '').toLowerCase().trim();

  // ── Deepgram ─────────────────────────────────────────────────────────────
  if (provider === 'deepgram') {
    const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'DEEPGRAM_API_KEY not set' }, { status: 500 });
    }

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

    const model = process.env.DEEPGRAM_MODEL ?? 'nova-3';
    const url = `https://api.deepgram.com/v1/listen?model=${model}&smart_format=true&punctuate=true`;

    let dgRes: Response;
    try {
      dgRes = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': audio.type || 'audio/webm',
        },
        body: audio,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deepgram unreachable';
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (!dgRes.ok) {
      const body = await dgRes.text().catch(() => '');
      return NextResponse.json(
        { error: `Deepgram error ${dgRes.status}`, detail: body },
        { status: 502 },
      );
    }

    const data = await dgRes.json();
    const text =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
    return NextResponse.json({ text });
  }

  // ── Generic Whisper-compatible (Kokoro, ADA V2, local Whisper) ────────────
  const sttUrl = process.env.STT_URL?.trim();
  if (!sttUrl) {
    // No provider configured — tell client to use browser Web Speech
    return NextResponse.json({ text: '', fallback: 'browser' });
  }

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
