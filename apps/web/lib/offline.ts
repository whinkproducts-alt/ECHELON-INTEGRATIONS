/**
 * Connectivity awareness and local fallback.
 *
 * connectivityMode(): cheap probe of the configured cloud provider host (from the model router's
 * own config), cached for 10 s. 'online' reachable and fast, 'degraded' reachable but slow,
 * 'offline' unreachable. With no cloud provider configured there is nothing to lose: 'online'.
 *
 * routeHint(): pure decision. Prefer the local model when offline or when the hard budget is hit.
 *
 * applyOfflineFallback(): the one wiring point used by the tool loop. Guarded by
 * WHINK_OFFLINE_FALLBACK=true (default off, so behaviour is unchanged). When it switches to the
 * local model it writes a 'model_fallback_local' ledger row with the reason, and drops any
 * per-user cloud API key so a cloud key is never sent to a local endpoint.
 */
import { configuredCloudModels, isCloudModel, ollamaProbeUrl, providerProbeUrl } from '@/lib/model-router';
import { budgetState, type BudgetState } from '@/lib/budget';
import { recordActionSafe } from '@/lib/ledger';
import { logger } from '@/lib/logger';

export type ConnectivityMode = 'online' | 'degraded' | 'offline';
export const PROBE_TTL_MS = 10_000;
const PROBE_TIMEOUT_MS = 2_500;
const SLOW_MS = 1_500;

type FetchLike = (url: string, init?: { method?: string; signal?: AbortSignal }) => Promise<{ status: number }>;
interface ProbeResult { reachable: boolean; latencyMs: number }

const cache = new Map<string, { at: number; value: ProbeResult }>();
let fetchImpl: FetchLike = (url, init) => fetch(url, init as RequestInit);

/** Test seam. */
export function __setProbeFetch(f: FetchLike | null): void {
  fetchImpl = f ?? ((url, init) => fetch(url, init as RequestInit));
  cache.clear();
}
export function __clearProbeCache(): void { cache.clear(); }

async function probe(url: string, now: number): Promise<ProbeResult> {
  const hit = cache.get(url);
  if (hit && now - hit.at < PROBE_TTL_MS) return hit.value;
  const started = Date.now();
  let value: ProbeResult;
  try {
    // Any HTTP answer, even 401 or 404, proves the host is reachable.
    await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    value = { reachable: true, latencyMs: Date.now() - started };
  } catch {
    value = { reachable: false, latencyMs: Date.now() - started };
  }
  cache.set(url, { at: now, value });
  return value;
}

export async function connectivityMode(now = Date.now()): Promise<ConnectivityMode> {
  const clouds = configuredCloudModels();
  if (clouds.length === 0) return 'online';
  const results = await Promise.all(clouds.map((m) => probe(providerProbeUrl(m), now)));
  const reachable = results.filter((r) => r.reachable);
  if (reachable.length === 0) return 'offline';
  if (reachable.every((r) => r.latencyMs > SLOW_MS) || reachable.length < results.length) return 'degraded';
  return 'online';
}

export async function ollamaReachable(now = Date.now()): Promise<boolean> {
  return (await probe(ollamaProbeUrl(), now)).reachable;
}

export type FallbackReason = 'offline' | 'budget_hard';
export interface RouteHint { useLocal: boolean; reason: FallbackReason | null }

export function routeHint(budget: Pick<BudgetState, 'state'>, connectivity: ConnectivityMode): RouteHint {
  if (connectivity === 'offline') return { useLocal: true, reason: 'offline' };
  if (budget.state === 'hard') return { useLocal: true, reason: 'budget_hard' };
  return { useLocal: false, reason: null };
}

export function offlineFallbackEnabled(): boolean {
  return process.env.WHINK_OFFLINE_FALLBACK === 'true';
}

export function localModelName(): string {
  return process.env.WHINK_LOCAL_MODEL?.trim() || 'llama3.1:8b';
}

export interface FallbackInput {
  userId: string;
  model: string;
  apiKey?: string;
  persona?: string;
  correlationId?: string;
}
export interface FallbackOutput { model: string; apiKey?: string; fellBack: boolean; reason: FallbackReason | null }

export async function applyOfflineFallback(input: FallbackInput): Promise<FallbackOutput> {
  const unchanged: FallbackOutput = { model: input.model, apiKey: input.apiKey, fellBack: false, reason: null };
  if (!offlineFallbackEnabled() || !isCloudModel(input.model) || !input.userId) return unchanged;
  try {
    const [budget, mode] = await Promise.all([budgetState(input.userId), connectivityMode()]);
    const hint = routeHint(budget, mode);
    if (!hint.useLocal || !hint.reason) return unchanged;
    if (!(await ollamaReachable())) {
      logger.warn('local fallback wanted but local model unreachable', { reason: hint.reason });
      return unchanged;
    }
    const local = localModelName();
    await recordActionSafe({
      userId: input.userId,
      initiator: 'system',
      persona: input.persona ?? 'WHINK',
      action: 'model_fallback_local',
      permissionClass: 'A',
      status: 'VALIDATED',
      inputSummary: `reason=${hint.reason} from=${input.model} to=${local}`,
      outputSummary: hint.reason === 'offline' ? 'Cloud provider unreachable; using local model' : 'Monthly token budget reached; using local model',
      correlationId: input.correlationId ?? 'unknown',
    });
    return { model: local, apiKey: undefined, fellBack: true, reason: hint.reason };
  } catch (e) {
    logger.warn('offline fallback check failed; keeping configured model', { error: (e as Error)?.message });
    return unchanged;
  }
}
