export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const MAX_TEXT_LENGTH = 2000;

// L3: only these voice identifiers are forwarded to providers; anything else is rejected.
const ALLOWED_VOICES_OPENAI = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
// Deepgram Aura voice models
const ALLOWED_VOICES_DEEPGRAM = new Set([
  'aura-asteria-en', 'aura-luna-en', 'aura-stella-en', 'aura-athena-en',
  'aura-hera-en', 'aura-orion-en', 'aura-arcas-en', 'aura-perseus-en',
  'aura-angus-en', 'aura-orpheus-en', 'aura-helios-en', 'aura-zeus-en',
]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  const provider = (process.env.TTS_PROVIDER ?? '').toLowerCase().trim();

  const rawVoice =
    typeof body.voice === 'string' && body.voice.trim()
      ? body.voice.trim()
      : (process.env.TTS_VOICE?.trim() ?? (provider === 'deepgram' ? 'aura-asteria-en' : 'alloy'));

  // L3: validate voice against provider allow-list before forwarding
  const allowedVoices = provider === 'deepgram' ? ALLOWED_VOICES_DEEPGRAM : ALLOWED_VOICES_OPENAI;
  const voice = allowedVoices.has(rawVoice) ? rawVoice : (provider === 'deepgram' ? 'aura-asteria-en' : 'alloy');

  // ── OpenAI TTS direct ─────────────────────────────────────────────────────
  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY?.trim() ?? process.env.OPENAI_COMPATIBLE_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 });
    }

    const ttsModel = process.env.TTS_MODEL ?? 'tts-1';

    let oaiRes: Response;
    try {
      oaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: ttsModel, input: text, voice }),
      });
    } catch {
      // L1: do not leak internal network details to the client
      return NextResponse.json({ error: 'TTS service unreachable' }, { status: 502 });
    }

    if (!oaiRes.ok) {
      // L1: do not leak upstream error body to the client
      return NextResponse.json({ error: 'TTS service error' }, { status: 502 });
    }

    const audioBuffer = await oaiRes.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.byteLength),
      },
    });
  }

  // ── Generic Whisper-compatible TTS (Kokoro, ADA V2, local) ───────────────
  const ttsUrl = process.env.TTS_URL?.trim();
  if (!ttsUrl) {
    // No provider configured — tell client to fall back to browser synthesis
    return NextResponse.json({ fallback: 'browser' }, { status: 501 });
  }

  let upstreamRes: Response;
  try {
    // L4: ADA V2 uses /tts; OpenAI-compatible shims typically use /audio/speech.
    // Prefer /tts when TTS_URL is set (ADA V2 / local service); the provider
    // env var is already handled in the openai branch above.
    upstreamRes = await fetch(`${ttsUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', input: text, voice }),
    });
  } catch {
    // L1: do not leak internal network details to the client
    return NextResponse.json({ error: 'TTS service unreachable' }, { status: 502 });
  }

  if (!upstreamRes.ok) {
    // L1: do not leak upstream error body to the client
    return NextResponse.json({ error: 'TTS service error' }, { status: 502 });
  }

  const audioBuffer = await upstreamRes.arrayBuffer();
  return new NextResponse(audioBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audioBuffer.byteLength),
    },
  });
}
