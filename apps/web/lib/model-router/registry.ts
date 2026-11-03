/**
 * R04 model provider registry. One list of the models the Founder can put in a priority order.
 *
 * An entry describes a model; it is not permission to call it. Whether a call may happen is decided per
 * request by lib/model-router/priority.ts (lockdown, Local-Only, data class, tools, trial and spend gates).
 * Entries carry no credential, only whether the server has one configured (presence, never the value).
 *
 * NVIDIA-hosted entries are evaluation-only (admitted: false): NVIDIA Build free endpoints are trial access
 * and trial inputs may be logged, so no application traffic is routed to them. DeepSeek browser chat is a
 * manual handoff: the app opens the official page and the Founder copies a reviewed brief by hand.
 */
export type RegistryKind = 'api' | 'manual_handoff';
export type CostClass = 'local' | 'trial' | 'metered' | 'manual';
/** Most sensitive data an entry may receive. private > internal > synthetic. */
export type DataCeiling = 'private' | 'internal' | 'synthetic';
export type ProviderId = 'ollama' | 'anthropic' | 'gemini' | 'openai_compatible' | 'nvidia' | 'deepseek_web';

type EnvMap = Record<string, string | undefined>;

export interface ModelRegistryEntry {
  id: string;
  label: string;
  provider: ProviderId;
  /** Model id passed to the model router. Empty for manual handoff. */
  model: string;
  kind: RegistryKind;
  local: boolean;
  cost: CostClass;
  dataCeiling: DataCeiling;
  capabilities: { text: boolean; tools: boolean; stream: boolean };
  timeoutMs: number;
  /** False: listed so the Founder can see and order it, but never routed application traffic. */
  admitted: boolean;
  handoffUrl?: string;
  note: string;
}

const has = (env: EnvMap, k: string) => Boolean(env[k]?.trim());

export function localDefaultModel(env: EnvMap = process.env): string {
  return env.WHINK_LOCAL_MODEL?.trim() || env.DEFAULT_MODEL?.trim() || 'wink-qwen3.5-9b-8k';
}

/** Built per call so env changes (tests, restarts) are seen. */
export function modelRegistry(env: EnvMap = process.env): ModelRegistryEntry[] {
  const list: ModelRegistryEntry[] = [
    {
      id: 'local-default', label: `Local model (${localDefaultModel(env)})`, provider: 'ollama', model: localDefaultModel(env),
      kind: 'api', local: true, cost: 'local', dataCeiling: 'private', capabilities: { text: true, tools: true, stream: true },
      timeoutMs: 120_000, admitted: true, note: 'Runs on this machine. No data leaves it.',
    },
    {
      id: 'anthropic-sonnet', label: 'Claude Sonnet (Anthropic API)', provider: 'anthropic', model: 'claude-sonnet-5-5',
      kind: 'api', local: false, cost: 'metered', dataCeiling: 'private', capabilities: { text: true, tools: true, stream: true },
      timeoutMs: 60_000, admitted: true, note: 'Paid per token. Paid routing must be enabled. A stored key alone does not enable it.',
    },
    {
      id: 'anthropic-haiku', label: 'Claude Haiku (Anthropic API)', provider: 'anthropic', model: 'claude-haiku-5-5',
      kind: 'api', local: false, cost: 'metered', dataCeiling: 'private', capabilities: { text: true, tools: true, stream: true },
      timeoutMs: 45_000, admitted: true, note: 'Paid per token, lower cost tier.',
    },
    {
      id: 'nvidia-nemotron-3-ultra', label: 'NVIDIA Nemotron 3 Ultra (NVIDIA Build trial)', provider: 'nvidia', model: 'nvidia/nemotron-3-ultra-550b-a55b',
      kind: 'api', local: false, cost: 'trial', dataCeiling: 'synthetic', capabilities: { text: true, tools: false, stream: false },
      timeoutMs: 60_000, admitted: false,
      note: 'Evaluation only. Passed 4 small synthetic cases; tools, streaming and live workflows untested. Trial inputs may be logged, so private data is never sent.',
    },
    {
      id: 'nvidia-deepseek', label: 'DeepSeek V4.1 Flash (NVIDIA Build trial)', provider: 'nvidia', model: 'deepseek-ai/deepseek-v4.1-flash',
      kind: 'api', local: false, cost: 'trial', dataCeiling: 'synthetic', capabilities: { text: true, tools: false, stream: false },
      timeoutMs: 60_000, admitted: false,
      note: 'Evaluation only. Timed out in the recorded trial. Trial inputs may be logged, so private data is never sent.',
    },
    {
      id: 'deepseek-browser', label: 'DeepSeek chat in the browser (manual handoff)', provider: 'deepseek_web', model: '',
      kind: 'manual_handoff', local: false, cost: 'manual', dataCeiling: 'internal', capabilities: { text: true, tools: false, stream: false },
      timeoutMs: 0, admitted: true, handoffUrl: 'https://chat.deepseek.com/',
      note: 'Opens the official page. You copy a reviewed brief by hand; nothing is uploaded automatically and the answer is untrusted until you import it.',
    },
  ];
  if (has(env, 'GEMINI_MODEL')) {
    list.splice(3, 0, {
      id: 'gemini', label: `Gemini (${env.GEMINI_MODEL!.trim()})`, provider: 'gemini', model: env.GEMINI_MODEL!.trim(),
      kind: 'api', local: false, cost: 'metered', dataCeiling: 'private', capabilities: { text: true, tools: true, stream: true },
      timeoutMs: 60_000, admitted: true, note: 'Paid per token unless your Google plan says otherwise.',
    });
  }
  return list;
}

export function registryEntry(id: string, env: EnvMap = process.env): ModelRegistryEntry | undefined {
  return modelRegistry(env).find((e) => e.id === id);
}

/** Whether the server holds a credential for the entry. Presence only. */
export function entryConfigured(e: ModelRegistryEntry, env: EnvMap = process.env): boolean {
  switch (e.provider) {
    case 'ollama': return true; // reachability is a runtime health question, not configuration
    case 'anthropic': return has(env, 'ANTHROPIC_API_KEY');
    case 'gemini': return has(env, 'GEMINI_API_KEY');
    case 'openai_compatible': return has(env, 'OPENAI_COMPATIBLE_BASE_URL');
    case 'nvidia': return has(env, 'NVIDIA_API_KEY');
    case 'deepseek_web': return true;
  }
}

/** Public view for the settings screen. No credential values. */
export function publicRegistry(env: EnvMap = process.env) {
  return modelRegistry(env).map((e) => ({
    id: e.id, label: e.label, provider: e.provider, model: e.model, kind: e.kind, local: e.local, cost: e.cost,
    dataCeiling: e.dataCeiling, capabilities: e.capabilities, admitted: e.admitted, handoffUrl: e.handoffUrl ?? null,
    note: e.note, configured: entryConfigured(e, env),
  }));
}
