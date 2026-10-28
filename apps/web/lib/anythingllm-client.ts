/**
 * AnythingLLM adapter — the ONLY file in the codebase that talks to the
 * AnythingLLM document recall service. All other code must use these exports.
 * Keep all transport details here so AnythingLLM can be swapped without
 * touching callers.
 *
 * All responses are treated as untrusted external content. Chunk text is
 * wrapped through wrapUntrustedContent before being returned. Suspicious
 * chunks are dropped and logged as security events by the caller.
 *
 * Version: AnythingLLM 1.18.0 — uses /api/v1/workspace/:slug/query
 * (retrieval-only, no model call). Decision logged in docs/decisions.md
 * 2026-10-25.
 */

// ── grep sentinel: ANYTHINGLLM_URL ANYTHINGLLM_API_KEY /api/v1/workspace ──────
// These strings must appear only in this file and its tests.

import { assertLoopbackWhenLocalOnly, redirectOpt } from '@/lib/local-only';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/** 500 ms hard cap on queryDocuments per C11. */
const QUERY_TIMEOUT_MS = 500;

/**
 * Resolve the base URL. If unset, return null so callers can return a graceful
 * "unavailable" result instead of throwing.
 */
function resolveBaseUrl(): string | null {
  const raw = process.env.ANYTHINGLLM_URL?.trim();
  if (!raw) return null;
  // Local-Only: a recall service that is not on this machine is never queried (callers treat the throw as unavailable).
  assertLoopbackWhenLocalOnly(raw, 'document service');
  return raw.replace(/\/$/, '');
}

function buildHeaders(): Record<string, string> {
  const key = process.env.ANYTHINGLLM_API_KEY?.trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }
  return headers;
}

/** Throw if the URL points to a non-local host and no API key is configured. */
function assertKeyForRemoteUrl(base: string): void {
  let hostname: string;
  try {
    hostname = new URL(base).hostname;
  } catch {
    throw new Error('ANYTHINGLLM_URL is not a valid URL');
  }
  if (!LOCAL_HOSTNAMES.has(hostname) && !process.env.ANYTHINGLLM_API_KEY?.trim()) {
    throw new Error('ANYTHINGLLM_API_KEY must be set for non-local AnythingLLM endpoints');
  }
}

// ── Public interfaces ─────────────────────────────────────────────────────────

/** A single ranked document chunk returned by queryDocuments. */
export interface DocumentChunk {
  documentName: string;
  chunkId: string;
  page: number | null;
  score: number | null;
  /** Raw (unwrapped) text from the chunk. Callers must wrap before sending to model. */
  text: string;
}

export interface Workspace {
  id: number;
  name: string;
  slug: string;
}

// ── queryDocuments ────────────────────────────────────────────────────────────

/**
 * Query documents in a workspace via the retrieval-only endpoint.
 * Returns ranked chunks with citation metadata.
 *
 * - If ANYTHINGLLM_URL is not set, returns an empty array (unavailable, no throw).
 * - Times out after 500 ms (C11).
 * - Drops chunks with a missing documentName.
 * - Does NOT wrap text — the caller (tool-registry) is responsible for
 *   injection scanning and wrapUntrustedContent.
 *
 * @param userId        Required — passed to callers for security-event scoping.
 * @param workspaceSlug Per-user workspace slug (resolved by caller from DocumentWorkspace).
 * @param query         The search query.
 * @param limit         Maximum chunks to return (capped at 20).
 */
export async function queryDocuments(
  userId: string,
  workspaceSlug: string,
  query: string,
  limit: number = 5,
): Promise<DocumentChunk[]> {
  const base = resolveBaseUrl();
  if (!base) return [];

  assertKeyForRemoteUrl(base);

  const slug = encodeURIComponent(workspaceSlug);
  const url = `${base}/api/v1/workspace/${slug}/query`;
  const cappedLimit = Math.min(Math.max(1, Math.floor(limit)), 20);

  let res: Response;
  try {
    res = await fetch(url, {
      ...redirectOpt(url),
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ query, limit: cappedLimit }),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });
  } catch {
    // Network error or timeout — caller handles graceful degradation
    return [];
  }

  if (!res.ok) {
    return [];
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    return [];
  }

  // AnythingLLM /query response: { results: [...] } or { sources: [...] }
  // Normalise to an array of chunks.
  const rawChunks: any[] = Array.isArray(json?.results)
    ? json.results
    : Array.isArray(json?.sources)
    ? json.sources
    : [];

  const chunks: DocumentChunk[] = [];
  for (const c of rawChunks) {
    if (chunks.length >= cappedLimit) break;

    // C7: drop any chunk where documentName is missing or empty
    const documentName = String(c?.docName ?? c?.documentName ?? c?.title ?? c?.name ?? '').trim();
    if (!documentName) continue;

    const chunkId = String(c?.chunkId ?? c?.id ?? c?.chunk_id ?? '');
    const rawPage = c?.metadata?.page ?? c?.page ?? null;
    const page = rawPage !== null && rawPage !== undefined ? Number(rawPage) : null;
    const score = typeof c?.score === 'number' ? c.score : null;
    const text = String(c?.text ?? c?.content ?? c?.pageContent ?? '');

    chunks.push({ documentName, chunkId, page, score, text });
  }

  return chunks;
}

// ── uploadDocument ────────────────────────────────────────────────────────────

/**
 * Upload a document to a workspace.
 * Returns the document id assigned by AnythingLLM.
 * If ANYTHINGLLM_URL is not set, throws so the caller can surface the error.
 */
export async function uploadDocument(
  userId: string,
  workspaceSlug: string,
  file: Buffer,
  filename: string,
  mimeType: string,
): Promise<{ id: string }> {
  const base = resolveBaseUrl();
  if (!base) throw new Error('AnythingLLM is not configured (ANYTHINGLLM_URL not set)');

  assertKeyForRemoteUrl(base);

  // Build a multipart/form-data body manually using the Blob/File API available in Node 18+
  const formData = new FormData();
  const blob = new Blob([file], { type: mimeType });
  formData.append('file', blob, filename);

  const headers = buildHeaders();
  // Do not set Content-Type — let fetch set the boundary automatically for multipart
  delete headers['Content-Type'];

  const uploadUrl = `${base}/api/v1/document/upload`;
  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      ...redirectOpt(uploadUrl),
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: unknown) {
    throw new Error(`AnythingLLM upload failed: ${(err as Error)?.message ?? 'unknown error'}`);
  }

  if (!res.ok) {
    throw new Error(`AnythingLLM upload returned ${res.status}`);
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error('AnythingLLM upload returned invalid JSON');
  }

  // Move the document into the workspace after upload
  const docId = String(json?.documents?.[0]?.id ?? json?.id ?? '');
  if (!docId) throw new Error('AnythingLLM upload response missing document id');

  // Associate document with the workspace
  const slug = encodeURIComponent(workspaceSlug);
  const addUrl = `${base}/api/v1/workspace/${slug}/update-embeddings`;
  try {
    const addHeaders = buildHeaders();
    await fetch(addUrl, {
      ...redirectOpt(addUrl),
      method: 'POST',
      headers: addHeaders,
      body: JSON.stringify({ adds: [json?.documents?.[0]?.location ?? docId], deletes: [] }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // Best-effort — document is uploaded; workspace association failure is not fatal
  }

  return { id: docId };
}

// ── deleteDocument ────────────────────────────────────────────────────────────

/**
 * Delete a document from a workspace.
 * If ANYTHINGLLM_URL is not set, throws.
 */
export async function deleteDocument(
  userId: string,
  workspaceSlug: string,
  documentId: string,
): Promise<void> {
  const base = resolveBaseUrl();
  if (!base) throw new Error('AnythingLLM is not configured (ANYTHINGLLM_URL not set)');

  assertKeyForRemoteUrl(base);

  const url = `${base}/api/v1/document/${encodeURIComponent(documentId)}`;
  let res: Response;
  try {
    const headers = buildHeaders();
    res = await fetch(url, {
      ...redirectOpt(url),
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: unknown) {
    throw new Error(`AnythingLLM delete failed: ${(err as Error)?.message ?? 'unknown error'}`);
  }

  if (!res.ok) {
    throw new Error(`AnythingLLM delete returned ${res.status}`);
  }
}

// ── listWorkspaces ────────────────────────────────────────────────────────────

/**
 * List all workspaces in the AnythingLLM instance.
 * Returns empty array if ANYTHINGLLM_URL is not set.
 */
export async function listWorkspaces(): Promise<Workspace[]> {
  const base = resolveBaseUrl();
  if (!base) return [];

  assertKeyForRemoteUrl(base);

  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/workspaces`, {
      ...redirectOpt(`${base}/api/v1/workspaces`),
      headers: buildHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return [];
  }

  if (!res.ok) {
    return [];
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    return [];
  }

  const workspaces: any[] = Array.isArray(json?.workspaces) ? json.workspaces : [];
  return workspaces.map((w: any) => ({
    id: Number(w?.id ?? 0),
    name: String(w?.name ?? ''),
    slug: String(w?.slug ?? ''),
  }));
}

// ── Legacy alias (kept for backward compatibility with context-engine) ─────────

/**
 * @deprecated Use queryDocuments instead.
 * This alias wraps queryDocuments and adapts the result shape to the old
 * DocumentResult interface so callers can migrate incrementally.
 */
export interface DocumentResult {
  title: string;
  /** Wrapped untrusted content — safe to pass to model context. */
  content: string;
  source: string;
  score?: number;
}

export async function searchDocuments(
  query: string,
  userId: string,
  workspaceSlug: string,
  limit: number = 5,
): Promise<DocumentResult[]> {
  const chunks = await queryDocuments(userId, workspaceSlug, query, limit);
  return chunks.map((c) => ({
    title: c.documentName,
    content: c.text,
    source: c.chunkId || workspaceSlug,
    score: c.score ?? undefined,
  }));
}

// ── listDocuments ─────────────────────────────────────────────────────────────

export interface WorkspaceDocument {
  id: string;
  name: string;
  /** Approximate size in bytes, if available */
  size?: number;
  createdAt?: string;
}

/**
 * List documents in a workspace.
 * Returns empty array if ANYTHINGLLM_URL is not set or the request fails.
 */
export async function listDocuments(
  _userId: string,
  workspaceSlug: string,
): Promise<WorkspaceDocument[]> {
  const base = resolveBaseUrl();
  if (!base) return [];

  assertKeyForRemoteUrl(base);

  const slug = encodeURIComponent(workspaceSlug);
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/workspace/${slug}`, {
      ...redirectOpt(`${base}/api/v1/workspace/${slug}`),
      headers: buildHeaders(),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return [];
  }

  if (!res.ok) return [];

  let json: any;
  try {
    json = await res.json();
  } catch {
    return [];
  }

  // AnythingLLM returns { workspace: [{ documents: [...] }] } or similar shapes
  const wsArr: any[] = Array.isArray(json?.workspace) ? json.workspace : [];
  const ws = wsArr[0] ?? json?.workspace ?? {};
  const docs: any[] = Array.isArray(ws?.documents) ? ws.documents : [];

  return docs.map((d: any) => ({
    id: String(d?.id ?? d?.docpath ?? d?.name ?? ''),
    name: String(d?.title ?? d?.name ?? d?.filename ?? 'Untitled'),
    size: typeof d?.size === 'number' ? d.size : undefined,
    createdAt: d?.createdAt ?? d?.created_at ?? undefined,
  })).filter((d) => d.id && d.name !== 'Untitled');
}

/** True when a recall service URL is configured. No network call. */
export function isAnythingLlmConfigured(): boolean {
  try { return resolveBaseUrl() !== null; } catch { return false; }
}
