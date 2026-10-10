'use strict';

const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { createClient } = require('@deepgram/sdk');

const PORT = parseInt(process.env.PORT ?? '3002', 10);
const ADA_AUTH_TOKEN = (process.env.ADA_AUTH_TOKEN ?? '').trim();

// Require auth token — fail closed, never open.
if (!ADA_AUTH_TOKEN) {
  console.error('[ada-voice] FATAL: ADA_AUTH_TOKEN is not set. Refusing to start without authentication.');
  process.exit(1);
}

const DEEPGRAM_API_KEY = (process.env.DEEPGRAM_API_KEY ?? '').trim();
const DEEPGRAM_STT_MODEL = (process.env.DEEPGRAM_STT_MODEL ?? 'nova-3').trim();
const DEEPGRAM_TTS_MODEL = (process.env.DEEPGRAM_TTS_MODEL ?? 'aura-asteria-en').trim();

const app = express();
app.use(express.json());

// Auth middleware — ADA_AUTH_TOKEN is always required (process exits at startup if missing).
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  // Use timing-safe comparison to prevent timing attacks.
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(ADA_AUTH_TOKEN);
  const safe =
    tokenBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(tokenBuf, expectedBuf);
  if (!safe) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ada-voice' });
});

// POST /stt — multipart audio → { text, confidence }
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

app.post('/stt', requireAuth, upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Missing audio field' });
  }
  if (!DEEPGRAM_API_KEY) {
    return res.status(500).json({ error: 'DEEPGRAM_API_KEY not set' });
  }

  try {
    const deepgram = createClient(DEEPGRAM_API_KEY);
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      req.file.buffer,
      {
        model: DEEPGRAM_STT_MODEL,
        smart_format: true,
        punctuate: true,
        mimetype: req.file.mimetype || 'audio/webm',
      },
    );

    if (error) {
      return res.status(502).json({ error: String(error) });
    }

    const alt = result?.results?.channels?.[0]?.alternatives?.[0];
    const text = alt?.transcript ?? '';
    const confidence = alt?.confidence ?? null;
    return res.json({ text, confidence });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'STT failed';
    return res.status(502).json({ error: message });
  }
});

// POST /tts — { text, voice? } → audio/mpeg stream
app.post('/tts', requireAuth, async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ error: 'text too long (max 2000 chars)' });
  }
  if (!DEEPGRAM_API_KEY) {
    return res.status(500).json({ error: 'DEEPGRAM_API_KEY not set' });
  }

  const model =
    typeof req.body?.voice === 'string' && req.body.voice.trim()
      ? req.body.voice.trim()
      : DEEPGRAM_TTS_MODEL;

  try {
    const deepgram = createClient(DEEPGRAM_API_KEY);
    const response = await deepgram.speak.request(
      { text },
      { model },
    );
    const stream = await response.getStream();
    if (!stream) {
      return res.status(502).json({ error: 'No stream from Deepgram TTS' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    // Pipe the web ReadableStream to the HTTP response
    const reader = stream.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    await pump();
  } catch (err) {
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : 'TTS failed';
      return res.status(502).json({ error: message });
    }
  }
});

const HOST = process.env.HOST ?? '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`[ada-voice] Listening on ${HOST}:${PORT}`);
  console.log(`[ada-voice] STT model: ${DEEPGRAM_STT_MODEL} | TTS model: ${DEEPGRAM_TTS_MODEL}`);
  if (!DEEPGRAM_API_KEY) console.warn('[ada-voice] WARNING: DEEPGRAM_API_KEY not set');
});
