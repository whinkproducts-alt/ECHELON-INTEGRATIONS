/**
 * AnythingLLM adapter — the only place in the codebase that talks to the
 * AnythingLLM document recall service. Keep all other code behind this
 * interface so AnythingLLM can be swapped without touching tool-registry.ts.
 *
 * All responses are treated as untrusted external content and are wrapped
 * through wrapUntrustedContent before being returned to the caller.
 *
 * NOTE: AnythingLLM 1.7.4 does not expose a pure vector-retrieval endpoint.
 * We use the /chat endpoint with mode: 'query' but discard the textResponse
 * (LLM output) and use only the sources array (indexed document chunks).
 * TODO: upgrade to AnythingLLM 2.x for a pure retrieval endpoint.
 */

import { stripFakeUntrustedTags, wrapUntrustedContent, scanForInjectionPatterns } from '@/lib/content-isolation';
import { logSecurityEvent } from '@/lib/permission-engine';

const ANYTHINGLLM_URL = (process.env.ANYTHINGLLM_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const MAX_SNIPPET_CHARS = 2000;

function assertApiKeyPresent(): void {
  const hostname = new URL(ANYTHINGLLM_URL).hostname;
  const isLocal = LOCAL_HOSTNAMES.has(hostname);
  if (!isLocal && !process.env.ANYTHINGLLM_API_KEY?.trim()) {
    throw new Error('ANYTHINGLLM_API_KEY must be set for non-local AnythingLLM endpoints');
  }
}

function buildHeaders(): Record<string, string> {
  const key = process.env.ANYTHINGLLM_API_KEY?.trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }
  return headers;
}

export interface DocumentResult {
  title: string;
  /** Wrapped untrusted content — safe to pass to model context. */
  content: string;
  source: string;
  score?: number;
}

export interface Workspace {
  id: number;
  name: string;
  slug: string;
}

/**
 * Search documents in a workspace.
 * Returns only source document chunks (no LLM-generated text).
 * Each snippet is injection-scanned, capped, and wrapped as untrusted.
 * Suspicious snippets are dropped and logged as security events.
 *
 * @param query    The search query.
 * @param userId   Required — scopes the security event log.
 * @param workspaceSlug  Per-user workspace slug.
 * @param limit    Maximum number of results to return.
 */
export async function searchDocuments(
  query: string,
  userId: string,
  workspaceSlug: string,
  limit: number = 5,
): Promise<DocumentResult[]> {
  assertApiKeyPresent();

  const slug = workspaceSlug;
  const url = `${ANYTHINGLLM_URL}/api/v1/workspace/${encodeURIComponent(slug)}/chat`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ message: query, mode: 'query' }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: any) {
    console.warn(`[anythingllm] searchDocuments fetch failed: ${err?.message}`);
    return [];
  }

  if (!res.ok) {
    console.warn(`[anythingllm] searchDocuments returned ${res.status}`);
    return [];
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    console.warn('[anythingllm] searchDocuments returned invalid JSON');
    return [];
  }

  const SCORE_THRESHOLD = 0.3;

  // Use only the sources array (indexed document chunks).
  // textResponse (LLM-generated output) is intentionally discarded.
  const sources: any[] = Array.isArray(json?.sources) ? json.sources : [];

  const results: DocumentResult[] = [];
  for (const s of sources) {
    if (results.length >= limit) break;

    const score = typeof s?.score === 'number' ? s.score : undefined;
    if (score !== undefined && score < SCORE_THRESHOLD) continue;

    const rawTitle = String(s?.title ?? s?.name ?? 'Untitled');
    const rawText = String(s?.text ?? s?.content ?? '');
    const sourceRef = String(s?.url ?? s?.file ?? slug);

    // Strip fake envelope tags before inspection
    const cleanText = stripFakeUntrustedTags(rawText);

    // Scan for injection patterns; drop suspicious snippets
    const { suspicious, patterns } = scanForInjectionPatterns(cleanText);
    if (suspicious) {
      await logSecurityEvent(userId, 'anythingllm_injection_detected', {
        patterns,
        source: sourceRef,
        slug,
      });
      continue;
    }

    // Cap and wrap
    const capped = cleanText.slice(0, MAX_SNIPPET_CHARS);
    const wrapped = wrapUntrustedContent(capped, 'document', sourceRef);

    results.push({
      title: stripFakeUntrustedTags(rawTitle).slice(0, 200),
      content: wrapped,
      source: sourceRef,
      score,
    });
  }

  return results;
}

/**
 * List all workspaces in the AnythingLLM instance.
 */
export async function listWorkspaces(): Promise<Workspace[]> {
  assertApiKeyPresent();

  let res: Response;
  try {
    res = await fetch(`${ANYTHINGLLM_URL}/api/v1/workspaces`, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: any) {
    console.warn(`[anythingllm] listWorkspaces fetch failed: ${err?.message}`);
    return [];
  }

  if (!res.ok) {
    console.warn(`[anythingllm] listWorkspaces returned ${res.status}`);
    return [];
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    console.warn('[anythingllm] listWorkspaces returned invalid JSON');
    return [];
  }

  const workspaces: any[] = Array.isArray(json?.workspaces) ? json.workspaces : [];
  return workspaces.map((w: any) => ({
    id: Number(w?.id ?? 0),
    name: String(w?.name ?? ''),
    slug: String(w?.slug ?? ''),
  }));
}
