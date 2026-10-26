/** Swarm settings. Data lives in config/swarm.json; this file validates it and clamps unsafe values. */
import { z } from 'zod';
import raw from '@/config/swarm.json';

const RoleNums = z.object({
  worker: z.number().int().positive(), reviewer: z.number().int().positive(), redteam: z.number().int().positive(),
  integrator: z.number().int().positive(), lead: z.number().int().positive(), planner: z.number().int().positive(),
});

const SwarmConfigSchema = z.object({
  defaultMinAgents: z.number().int().min(50),
  minAgents: z.number().int().min(50),
  maxAgents: z.number().int().min(50).max(120),
  concurrency: z.number().int().min(1),
  maxConcurrency: z.number().int().min(1).max(20),
  taskTimeoutMs: z.number().int().min(1),
  maxRetries: z.number().int().min(0).max(5),
  retryDelayMs: z.number().int().min(0),
  heartbeatMs: z.number().int().min(1).max(60_000),
  heartbeatStaleMs: z.number().int().min(1),
  acquireTimeoutMs: z.number().int().min(1),
  maxConcurrentRuns: z.number().int().min(1).max(10),
  budgetCheckMs: z.number().int().min(0),
  tokenCapPerRun: z.number().int().positive(),
  tokenCapMultiplier: z.number().min(1),
  learningDigestMax: z.number().int().min(0),
  learningDigestChars: z.number().int().min(0),
  learningMaxChars: z.number().int().min(20).max(300),
  learningsPerTask: z.number().int().min(0).max(10),
  outputMaxChars: z.number().int().positive(),
  depOutputMaxChars: z.number().int().positive(),
  depTotalMaxChars: z.number().int().positive(),
  resultMaxChars: z.number().int().positive(),
  memoryConfidenceThreshold: z.number().min(0).max(1),
  memoryConfidenceCap: z.number().min(0).max(0.6),
  maxMemoryWrites: z.number().int().min(0),
  model: z.string().nullable(),
  roleMix: z.object({ integrators: z.number().min(0).max(0.5), redteam: z.number().min(0).max(0.5), reviewers: z.number().min(0).max(0.5) }),
  estimate: z.object({
    avgCallSeconds: z.number().positive(), retryRate: z.number().min(0).max(1),
    tokensIn: RoleNums, tokensOut: RoleNums,
  }),
}).strict();

export type SwarmConfig = z.infer<typeof SwarmConfigSchema>;

const parsed: SwarmConfig = SwarmConfigSchema.parse(raw);

/** Effective config. Concurrency never exceeds maxConcurrency (hard 20). */
export function swarmConfig(overrides: Partial<SwarmConfig> = {}): SwarmConfig {
  const c = { ...parsed, ...overrides };
  return { ...c, concurrency: Math.max(1, Math.min(c.concurrency, c.maxConcurrency, 20)) };
}
