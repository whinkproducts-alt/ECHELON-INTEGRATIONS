/**
 * OpenClaw stub server — placeholder until the real image ships.
 *
 * Implements the minimal wire protocol that openclaw-client.ts expects:
 *   GET  /tools          → list of tool definitions from config/tools.json
 *   POST /tools/:name    → echo the params back as the result
 *
 * Replace this file (and the Dockerfile) once ghcr.io/opencoatl/openclaw
 * is available.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT ?? '3100', 10);
const CONFIG_PATH = process.env.CONFIG_PATH ?? '/app/config/tools.json';
const TOKEN = process.env.OPENCLAW_TOKEN ?? '';

function loadTools() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function checkToken(req, res) {
  if (!TOKEN) return true; // token not configured — dev mode
  const auth = req.headers['authorization'] ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  // Constant-time compare to avoid timing attacks
  const tokenBuf = Buffer.from(TOKEN);
  const providedBuf = Buffer.alloc(tokenBuf.length);
  providedBuf.write(provided.substring(0, tokenBuf.length));
  if (provided.length !== TOKEN.length || !tokenBuf.equals(providedBuf)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }
  return true;
}

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (!checkToken(req, res)) return;

  if (req.method === 'GET' && req.url === '/tools') {
    res.end(JSON.stringify(loadTools()));
    return;
  }

  const postMatch = req.url?.match(/^\/tools\/([^/?]+)$/);
  if (req.method === 'POST' && postMatch) {
    const toolName = postMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let params = {};
      try { params = JSON.parse(body); } catch { /* empty body is fine */ }
      res.end(JSON.stringify({ tool: toolName, params, result: null, stub: true }));
    });
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`OpenClaw stub listening on :${PORT}`);
});
