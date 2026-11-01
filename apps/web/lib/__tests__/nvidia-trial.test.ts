import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NVIDIA_TRIAL_CASES, NVIDIA_TRIAL_MODELS, nvidiaTrialChat } from '../model-router/nvidia-trial';

const fetchMock = vi.fn();
const model = NVIDIA_TRIAL_MODELS[0];
const trialCase = NVIDIA_TRIAL_CASES[0];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('NVIDIA_TRIAL_ENABLED', 'false');
  vi.stubEnv('NVIDIA_API_KEY', 'nvapi-test-secret');
  vi.stubEnv('WHINK_LOCAL_ONLY', 'false');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('NVIDIA Build trial profile', () => {
  it('is disabled by default and cannot call NVIDIA in Local-Only or production mode', async () => {
    await expect(nvidiaTrialChat(model, trialCase)).rejects.toThrow('disabled');
    vi.stubEnv('NVIDIA_TRIAL_ENABLED', 'true');
    vi.stubEnv('WHINK_LOCAL_ONLY', 'true');
    await expect(nvidiaTrialChat(model, trialCase)).rejects.toThrow('Local-Only');
    vi.stubEnv('WHINK_LOCAL_ONLY', 'false');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(nvidiaTrialChat(model, trialCase)).rejects.toThrow('production');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts only the built-in synthetic cases and model allowlist', async () => {
    vi.stubEnv('NVIDIA_TRIAL_ENABLED', 'true');
    await expect(nvidiaTrialChat('other/model' as typeof model, trialCase)).rejects.toThrow('allowlisted');
    await expect(nvidiaTrialChat(model, { ...trialCase, user: 'private' } as unknown as typeof trialCase)).rejects.toThrow('allowlisted');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the fixed endpoint, sends only synthetic content, and never includes the key in results', async () => {
    vi.stubEnv('NVIDIA_TRIAL_ENABLED', 'true');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"id":"T-17","owner":"Ada","due":"2026-11-07"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 24, completion_tokens: 19 } }), { status: 200 }));
    const result = await nvidiaTrialChat(model, trialCase);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(init.redirect).toBe('error');
    expect(init.headers.Authorization).toBe('Bearer nvapi-test-secret');
    expect(init.body).not.toContain('nvapi-test-secret');
    expect(JSON.parse(init.body).messages).toEqual([{ role: 'system', content: trialCase.system }, { role: 'user', content: trialCase.user }]);
    expect(result).toMatchObject({ tokensIn: 24, tokensOut: 19 });
    expect(trialCase.passes(result.text)).toBe(true);
  });

  it('fails closed on missing credentials, provider errors, and truncated output', async () => {
    vi.stubEnv('NVIDIA_TRIAL_ENABLED', 'true');
    vi.stubEnv('NVIDIA_API_KEY', '');
    await expect(nvidiaTrialChat(model, trialCase)).rejects.toThrow('not configured');
    vi.stubEnv('NVIDIA_API_KEY', 'nvapi-test-secret');
    fetchMock.mockResolvedValueOnce(new Response('key=nvapi-test-secret', { status: 401 }));
    const error = await nvidiaTrialChat(model, trialCase).catch((e: Error) => e);
    expect(String(error)).not.toContain('nvapi-test-secret');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'unfinished' }, finish_reason: 'length' }] }), { status: 200 }));
    await expect(nvidiaTrialChat(model, trialCase)).rejects.toThrow('truncated');
  });
});
