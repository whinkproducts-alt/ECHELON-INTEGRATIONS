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

    // M2: require content-length to prevent buffering unbounded chunked bodies.
    const contentLength = req.headers.get('content-length');
    if (!contentLength) {
      return NextResponse.json({ error: 'Content-Length header required' }, { status: 411 });
    }
    if (parseInt(contentLength, 10) > MAX_BYTES) {
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
      // L1: do not leak upstream error body to the client
      return NextResponse.json({ error: 'STT service error' }, { status: 502 });
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

  // M2: require content-length to prevent buffering unbounded chunked bodies.
  const contentLength = req.headers.get('content-length');
  if (!contentLength) {
    return NextResponse.json({ error: 'Content-Length header required' }, { status: 411 });
  }
  if (parseInt(contentLength, 10) > MAX_BYTES) {
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
  } catch {
    // L1: do not leak internal network details to the client
    return NextResponse.json({ error: 'STT upstream unreachable' }, { status: 502 });
  }

  if (!upstreamRes.ok) {
    // L1: do not leak upstream error body to the client
    return NextResponse.json({ error: 'STT service error' }, { status: 502 });
  }

  const data = await upstreamRes.json();
  return NextResponse.json({ text: data.text ?? '' });
}
