import { config as loadDotEnv } from 'dotenv';
import { chatOnce } from '../lib/model-router';
import { NVIDIA_TRIAL_CASES, NVIDIA_TRIAL_MODELS, nvidiaTrialChat } from '../lib/model-router/nvidia-trial';

loadDotEnv({ path: '.env.local' });
loadDotEnv({ path: '.env' });

type CaseResult = { caseId: string; passed: boolean | null; latencyMs: number | null; tokensIn: number | null; tokensOut: number | null; output: string | null; error: string | null };

async function evaluate(label: string, run: (trialCase: typeof NVIDIA_TRIAL_CASES[number]) => Promise<{ text: string; tokensIn: number | null; tokensOut: number | null }>): Promise<{ model: string; cases: CaseResult[] }> {
  const cases: CaseResult[] = [];
  for (const trialCase of NVIDIA_TRIAL_CASES) {
    const start = performance.now();
    try {
      const answer = await run(trialCase);
      cases.push({ caseId: trialCase.id, passed: trialCase.passes(answer.text), latencyMs: Math.round(performance.now() - start), tokensIn: answer.tokensIn, tokensOut: answer.tokensOut, output: answer.text.slice(0, 1000), error: null });
    } catch (error) {
      const safeError = error instanceof Error && /^NVIDIA trial returned HTTP \d{3}$/.test(error.message) ? error.message : error instanceof Error ? error.name : 'UnknownError';
      cases.push({ caseId: trialCase.id, passed: null, latencyMs: Math.round(performance.now() - start), tokensIn: null, tokensOut: null, output: null, error: safeError });
      if (/^NVIDIA trial returned HTTP (401|402|403|404|410|429)$/.test(safeError)) {
        for (const remaining of NVIDIA_TRIAL_CASES.slice(cases.length)) {
          cases.push({ caseId: remaining.id, passed: null, latencyMs: null, tokensIn: null, tokensOut: null, output: null, error: 'skipped_after_provider_error' });
        }
        break;
      }
    }
  }
  return { model: label, cases };
}

async function main() {
  const localModel = process.env.DEFAULT_MODEL?.trim() || 'wink-qwen3.5-9b-8k';
  const results = [await evaluate(localModel, async (trialCase) => ({
    text: await chatOnce({ messages: [{ role: 'system', content: trialCase.system }, { role: 'user', content: trialCase.user }], model: localModel, maxTokens: 256, temperature: 0 }),
    tokensIn: null,
    tokensOut: null,
  }))];

  const trialReady = process.env.NVIDIA_TRIAL_ENABLED === 'true' && !!process.env.NVIDIA_API_KEY && process.env.NODE_ENV !== 'production' && process.env.WHINK_LOCAL_ONLY !== 'true';
  if (trialReady) {
    for (const model of NVIDIA_TRIAL_MODELS) results.push(await evaluate(model, (trialCase) => nvidiaTrialChat(model, trialCase)));
  }
  process.stdout.write(JSON.stringify({
    evaluatedAt: new Date().toISOString(),
    syntheticOnly: true,
    nvidiaStatus: trialReady ? 'attempted' : 'disabled_or_unconfigured',
    results,
  }, null, 2) + '\n');
}

main().catch(() => {
  process.stderr.write('Synthetic evaluation could not start.\n');
  process.exitCode = 1;
});
