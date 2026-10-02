export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const MAX_TEXT_LENGTH = 2000;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ttsUrl = process.env.TTS_URL?.trim();
  if (!ttsUrl) {
    return NextResponse.json({ fallback: 'browser' }, { status: 501 });
  }

  let body: { text?: unknown; voice?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `text too long (max ${MAX_TEXT_LENGTH} chars)` }, { status: 400 });
  }

  const voice =
    typeof body.voice === 'string' && body.voice.trim()
      ? body.voice.trim()
      : (process.env.TTS_VOICE?.trim() ?? 'alloy');

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${ttsUrl}/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', input: text, voice }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS upstream unreachable';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!upstreamRes.ok) {
    const detail = await upstreamRes.text().catch(() => '');
    return NextResponse.json(
      { error: `TTS upstream error ${upstreamRes.status}`, detail },
      { status: 502 },
    );
  }

  // Stream the audio blob back to the client
  const audioBuffer = await upstreamRes.arrayBuffer();
  return new NextResponse(audioBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audioBuffer.byteLength),
    },
  });
}
