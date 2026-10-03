/**
 * AnythingLLM adapter — the only place in the codebase that talks to the
 * AnythingLLM document recall service. Keep all other code behind this
 * interface so AnythingLLM can be swapped without touching tool-registry.ts.
 *
 * All responses are treated as untrusted external content and must be passed
 * through wrapUntrustedContent before entering the model context.
 */

const ANYTHINGLLM_URL = (process.env.ANYTHINGLLM_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

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
 * Search documents in a workspace using the AnythingLLM chat endpoint.
 * Falls back to an empty array if the service is unavailable.
 */
export async function searchDocuments(
  query: string,
  workspaceSlug?: string,
  limit: number = 5,
): Promise<DocumentResult[]> {
  assertApiKeyPresent();

  const slug = workspaceSlug ?? 'default';
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

  // AnythingLLM chat response includes sources array
  const sources: any[] = Array.isArray(json?.sources) ? json.sources : [];
  const allMapped: DocumentResult[] = sources.map((s: any) => ({
    title: String(s?.title ?? s?.name ?? 'Untitled'),
    content: String(s?.text ?? s?.content ?? ''),
    source: String(s?.url ?? s?.file ?? ''),
    score: typeof s?.score === 'number' ? s.score : undefined,
  }));

  // Filter out results below the score threshold (only when a score is present)
  const aboveThreshold = allMapped.filter(
    (r) => r.score === undefined || r.score >= SCORE_THRESHOLD
  );

  // If all results are below the threshold, return empty array
  const results: DocumentResult[] = aboveThreshold.slice(0, limit);

  // If no sources but there is a response text, wrap it as a single result
  if (results.length === 0 && json?.textResponse) {
    results.push({
      title: 'Response',
      content: String(json.textResponse),
      source: slug,
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
