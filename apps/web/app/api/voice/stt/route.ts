export const dynamic = 'force-dynamic';
import { isLocalOnlyMode, localOnlyBlocksUrl, redirectOpt, SPEECH_UNAVAILABLE } from '@/lib/local-only';
import { ledgerLocalOnlyBlock } from '@/lib/local-only-guard';
import { isLockedDown, ledgerLockdownBlock, LOCKDOWN_MESSAGE } from '@/lib/safety/lockdown';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { DispatchBlockedError, runAdmittedVoice } from '@/lib/model-router/dispatch';

import { selectedSpeech, signSpeechTurn } from '@/lib/speech-services';
import { transcribeSpeech } from '@/lib/speech-transport';
import { audioFilename, localSpeechHeaders } from '@/lib/local-speech';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // R07: lockdown stops the microphone and speech. Checked before the body is read or any provider is called.
  if (await isLockedDown(session.user.id)) {
    await ledgerLockdownBlock(session.user.id, 'voice_stt');
    return NextResponse.json({ error: LOCKDOWN_MESSAGE, code: 'LOCKDOWN_ACTIVE' }, { status: 423 });
  }

  try {
    const selected = await selectedSpeech(req, session.user.id);
    if (selected === null) return NextResponse.json({ error: 'No verified local speech pair is available. Use text or check speech settings.' }, { status: 503 });
    if (selected) {
      const length = Number(req.headers.get('content-length'));
      if (!Number.isSafeInteger(length) || length <= 0 || length > MAX_BYTES) return NextResponse.json({ error: 'Invalid or oversized audio request' }, { status: 413 });
      const form = await req.formData();
      const audio = form.get('audio');
      if (!(audio instanceof Blob) || !audio.size || audio.size > MAX_BYTES) return NextResponse.json({ error: 'Invalid audio' }, { status: 400 });
      const text = await transcribeSpeech(session.user.id, selected, audio, req.signal);
      return NextResponse.json({ text, service: selected.service, turnToken: signSpeechTurn(session.user.id, selected.service) }, { headers: { 'Cache-Control': 'no-store' } });
    }
  } catch (error) {
    if (error instanceof DispatchBlockedError) return NextResponse.json({ error: 'Speech was not admitted.', code: error.code }, { status: 409 });
    return NextResponse.json({ error: 'Local speech is unavailable. Check speech settings; no cloud fallback was used.' }, { status: 503 });
  }

  const provider = (process.env.STT_PROVIDER ?? '').toLowerCase().trim();

  // Local-Only: speech is available only through a loopback service (STT_URL). No browser fallback: browser
  // recognition (for example Chrome's) sends audio to a vendor's servers.
  if (isLocalOnlyMode() && (provider === 'deepgram' || localOnlyBlocksUrl(process.env.STT_URL?.trim()))) {
    await ledgerLocalOnlyBlock(session.user.id, 'voice_stt', `provider=${provider || 'generic'}`);
    return NextResponse.json({ error: SPEECH_UNAVAILABLE }, { status: 503 });
  }

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
      dgRes = await runAdmittedVoice({ userId: session.user.id, channel: 'stt', units: audio.size }, () => fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': audio.type || 'audio/webm',
        },
        body: audio,
      }));
    } catch (err) {
      if (err instanceof DispatchBlockedError) return NextResponse.json({ error: 'Speech was not admitted.', code: err.code }, { status: 409 });
      return NextResponse.json({ error: 'STT service unreachable' }, { status: 502 });
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
  upstream.append('file', audio, audioFilename(audio.type));
  upstream.append('model', 'whisper-1');

  let upstreamRes: Response;
  try {
    upstreamRes = await runAdmittedVoice({ userId: session.user.id, channel: 'stt', units: audio.size }, () => fetch(`${sttUrl}/audio/transcriptions`, {
      method: 'POST',
      ...redirectOpt(sttUrl),
      headers: localSpeechHeaders(sttUrl, provider === 'local-whisper'),
      signal: AbortSignal.timeout(90_000),
      body: upstream,
    }));
  } catch (err) {
    if (err instanceof DispatchBlockedError) return NextResponse.json({ error: 'Speech was not admitted.', code: err.code }, { status: 409 });
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
