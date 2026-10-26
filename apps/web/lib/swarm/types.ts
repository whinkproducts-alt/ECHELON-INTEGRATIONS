import { z } from 'zod';

export type SwarmRole = 'lead' | 'integrator' | 'redteam' | 'reviewer' | 'worker';
export const SWARM_ROLES: readonly SwarmRole[] = ['lead', 'integrator', 'redteam', 'reviewer', 'worker'];

const clip = (n: number) => (s: string) => s.trim().slice(0, n);

/** One work package as the planner returns it. Strings are clipped, never trusted further. */
export const WorkPackageSchema = z.object({
  id: z.string().min(1).transform(clip(40)),
  title: z.string().min(1).transform(clip(120)),
  objective: z.string().min(1).transform(clip(800)),
  lane: z.string().min(1).transform(clip(80)),
  dependsOn: z.array(z.string().transform(clip(80))).max(20).default([]),
  deliverable: z.string().min(1).transform(clip(400)),
  requiredSkills: z.array(z.string().transform(clip(60))).max(10).default([]),
  estimatedCalls: z.number().int().min(1).max(5).catch(1).default(1),
});
export type WorkPackage = z.infer<typeof WorkPackageSchema>;

export const PlannerOutputSchema = z.object({
  title: z.string().optional(),
  packages: z.array(z.unknown()).min(1).max(400),
});

export interface TaskSpec {
  lane: string;
  role: SwarmRole;
  title: string;
  objective: string;
  deliverable: string;
  requiredSkills: string[];
  /** Lanes this task reviews, challenges or integrates (disjoint across tasks of one role). */
  covers: string[];
  /** Lanes whose output this task reads. */
  dependsOn: string[];
  estimatedCalls: number;
}

export interface AssignedTask extends TaskSpec {
  agentId: string;
  agentName: string;
  fit: 'matched' | 'generalist';
}

/** What an agent must return. Anything else is dropped. */
export const AgentOutputSchema = z.object({
  result: z.string().min(1),
  learnings: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  verdicts: z.array(z.object({ lane: z.string(), approved: z.boolean() })).optional(),
});
export type AgentOutput = z.infer<typeof AgentOutputSchema>;
