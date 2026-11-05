/**
 * Self-Improvement Engine — continuous learning from interactions.
 *
 * Analyzes conversation patterns, extracts lessons, updates procedural memories,
 * tracks success/failure metrics, and auto-generates improvements.
 * Runs as a worker job and can be triggered on-demand.
 */

import { prisma } from '@/lib/db';
import { writeMemory, MemoryWriteInput } from '@/lib/memory-engine';
import { admittedChatOnce } from '@/lib/model-router/dispatch';
import type { StreamChatOptions } from '@/lib/model-router';

export interface InteractionPattern {
  type: 'success' | 'failure' | 'correction' | 'preference' | 'efficiency';
  context: string;
  action: string;
  outcome: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface ImprovementProposal {
  id: string;
  type: 'procedural_update' | 'prompt_refinement' | 'routing_optimization' | 'skill_addition' | 'threshold_tuning';
  title: string;
  description: string;
  currentBehavior: string;
  proposedBehavior: string;
  evidence: string[];
  impact: 'high' | 'medium' | 'low';
  risk: 'low' | 'medium' | 'high';
  testPlan: string;
}

/**
 * Analyze recent interactions for patterns.
 */
export async function analyzeInteractions(
  userId: string,
  lookbackHours: number = 24
): Promise<InteractionPattern[]> {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  const messages = await prisma.message.findMany({
    where: {
      conversation: { userId },
      createdAt: { gte: since },
      role: { in: ['user', 'assistant'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  // Group into conversation turns
  const turns: Array<{ user: string; assistant: string; timestamp: Date }> = [];
  let lastUser = '';
  for (const msg of messages) {
    if (msg.role === 'user') {
      lastUser = msg.content;
    } else if (msg.role === 'assistant' && lastUser) {
      turns.push({ user: lastUser, assistant: msg.content, timestamp: msg.createdAt });
      lastUser = '';
    }
  }

  if (turns.length < 3) return [];

  // Use LLM to extract patterns
  const analysisPrompt = `Analyze these ${turns.length} conversation turns for patterns. Identify:
1. Success patterns (what worked well)
2. Failure patterns (errors, corrections, retries)
3. User preferences (explicit or implicit)
4. Efficiency opportunities (repeated steps, could be automated)
5. Corrections (user correcting assistant)

Turns:
${turns.slice(-20).map((t, i) => `${i + 1}. User: ${t.user.slice(0, 300)}\n   Assistant: ${t.assistant.slice(0, 300)}`).join('\n\n')}

Return JSON array of patterns:
{
  "type": "success|failure|correction|preference|efficiency",
  "context": "brief context",
  "action": "what was done",
  "outcome": "result",
  "confidence": 0.0-1.0,
  "metadata": {}
}`;

  try {
    const opts: StreamChatOptions = {
      messages: [
        { role: 'system', content: 'You are a pattern analyst. Return ONLY valid JSON array.' },
        { role: 'user', content: analysisPrompt },
      ],
      model: 'llama-local',
      temperature: 0.1,
      maxTokens: 2000,
    };
    const result = await admittedChatOnce({ userId, purpose: 'worker' }, opts);

    const patterns = JSON.parse(result);
    return Array.isArray(patterns) ? patterns : [];
  } catch {
    return [];
  }
}

/**
 * Generate improvement proposals from patterns.
 */
export async function generateImprovements(
  userId: string,
  patterns: InteractionPattern[]
): Promise<ImprovementProposal[]> {
  if (patterns.length === 0) return [];

  const proposalPrompt = `Given these interaction patterns, propose concrete improvements to the system:

Patterns:
${JSON.stringify(patterns, null, 2)}

Propose improvements as JSON array:
{
  "type": "procedural_update|prompt_refinement|routing_optimization|skill_addition|threshold_tuning",
  "title": "short title",
  "description": "detailed description",
  "currentBehavior": "what happens now",
  "proposedBehavior": "what should happen",
  "evidence": ["pattern refs"],
  "impact": "high|medium|low",
  "risk": "low|medium|high",
  "testPlan": "how to verify"
}

Only propose improvements with evidence from patterns. Be specific and actionable.`;

  try {
    const opts: StreamChatOptions = {
      messages: [
        { role: 'system', content: 'You are a system improvement architect. Return ONLY valid JSON array.' },
        { role: 'user', content: proposalPrompt },
      ],
      model: 'llama-local',
      temperature: 0.2,
      maxTokens: 3000,
    };
    const result = await admittedChatOnce({ userId, purpose: 'worker' }, opts);

    const proposals = JSON.parse(result);
    return Array.isArray(proposals) ? proposals : [];
  } catch {
    return [];
  }
}

/**
 * Apply a procedural improvement by writing to memory_procedural.
 */
export async function applyProceduralImprovement(
  userId: string,
  proposal: ImprovementProposal
): Promise<{ id: string; applied: boolean }> {
  if (proposal.type !== 'procedural_update' || proposal.risk === 'high') {
    return { id: '', applied: false };
  }

  const input: MemoryWriteInput = {
    userId,
    type: 'procedural',
    statement: `${proposal.title}: ${proposal.proposedBehavior}`,
    source: 'self_improvement',
    sourceId: proposal.id,
    eventType: 'procedural_improvement',
    confidence: 0.8,
    importance: proposal.impact === 'high' ? 0.9 : proposal.impact === 'medium' ? 0.7 : 0.5,
    entities: ['self-improvement', proposal.type],
    rationale: `Auto-generated from pattern analysis. Evidence: ${proposal.evidence.join('; ')}. Test: ${proposal.testPlan}`,
  };

  try {
    const result = await writeMemory(input);
    return { id: result.id, applied: true };
  } catch {
    return { id: '', applied: false };
  }
}

/**
 * Track success metrics for a specific action type.
 */
export async function recordActionOutcome(
  userId: string,
  actionType: string,
  success: boolean,
  latencyMs: number,
  tokensUsed: number,
  _metadata?: Record<string, unknown>
): Promise<void> {
  const input: MemoryWriteInput = {
    userId,
    type: 'episodic',
    statement: `${actionType}: ${success ? 'success' : 'failure'} (${latencyMs}ms, ${tokensUsed} tokens)`,
    source: 'metrics',
    sourceId: actionType,
    eventType: success ? 'action_success' : 'action_failure',
    confidence: 1.0,
    importance: 0.3,
    entities: [actionType, success ? 'success' : 'failure'],
  };
  await writeMemory(input);
}

/**
 * Get success rate for an action type.
 */
export async function getActionSuccessRate(
  userId: string,
  actionType: string,
  windowHours: number = 168 // 1 week
): Promise<{ rate: number; count: number; avgLatency: number; avgTokens: number }> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const episodes = await prisma.memoryEpisode.findMany({
    where: {
      userId,
      eventType: { in: ['action_success', 'action_failure'] },
      createdAt: { gte: since },
      entities: { contains: actionType },
    },
    select: { eventType: true, summary: true, createdAt: true },
  });

  if (episodes.length === 0) return { rate: 1, count: 0, avgLatency: 0, avgTokens: 0 };

  let success = 0;
  let totalLatency = 0;
  let totalTokens = 0;
  let parsed = 0;

  for (const ep of episodes) {
    if (ep.eventType === 'action_success') success++;
    // Parse latency and tokens from summary
    const match = ep.summary.match(/\((\d+)ms, (\d+) tokens\)/);
    if (match) {
      totalLatency += parseInt(match[1], 10);
      totalTokens += parseInt(match[2], 10);
      parsed++;
    }
  }

  return {
    rate: success / episodes.length,
    count: episodes.length,
    avgLatency: parsed > 0 ? totalLatency / parsed : 0,
    avgTokens: parsed > 0 ? totalTokens / parsed : 0,
  };
}

/**
 * Main self-improvement cycle. Runs periodically via worker.
 */
export async function runSelfImprovementCycle(userId: string): Promise<{
  patternsFound: number;
  proposalsGenerated: number;
  improvementsApplied: number;
}> {
  // 1. Analyze recent interactions
  const patterns = await analyzeInteractions(userId, 24);

  // 2. Generate improvement proposals
  const proposals = await generateImprovements(userId, patterns);

  // 3. Apply safe procedural improvements (low risk only)
  let applied = 0;
  for (const proposal of proposals) {
    if (proposal.risk === 'low' && proposal.type === 'procedural_update') {
      const result = await applyProceduralImprovement(userId, proposal);
      if (result.applied) applied++;
    }
  }

  // 4. Store all proposals as hypotheses for review
  for (const proposal of proposals) {
    await writeMemory({
      userId,
      type: 'hypothesis',
      statement: `[IMPROVEMENT] ${proposal.title}: ${proposal.description}`,
      source: 'self_improvement',
      sourceId: proposal.id,
      confidence: proposal.impact === 'high' ? 0.4 : 0.3,
      mambaMode: 'analysis',
      rationale: `Evidence: ${proposal.evidence.join('; ')}. Risk: ${proposal.risk}. Test: ${proposal.testPlan}`,
    });
  }

  return {
    patternsFound: patterns.length,
    proposalsGenerated: proposals.length,
    improvementsApplied: applied,
  };
}

/**
 * Query self-improvement history.
 */
export async function getSelfImprovementHistory(userId: string, limit: number = 20) {
  return prisma.memorySemantic.findMany({
    where: {
      userId,
      sourceType: 'self_improvement',
      supersededBy: null,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Manual trigger for self-improvement on a specific topic.
 */
export async function triggerFocusedImprovement(
  userId: string,
  topic: string,
  context: string
): Promise<ImprovementProposal[]> {
  const patterns: InteractionPattern[] = [{
    type: 'preference',
    context,
    action: `focused improvement on: ${topic}`,
    outcome: 'pending analysis',
    confidence: 0.9,
    metadata: { focused: true, topic },
  }];

  return generateImprovements(userId, patterns);
}