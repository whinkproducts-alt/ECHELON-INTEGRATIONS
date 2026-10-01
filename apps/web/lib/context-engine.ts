import { prisma } from '@/lib/db';
import { workingMemory } from '@/lib/working-memory';
import { logger } from '@/lib/logger';

const MAX_CONTEXT_TOKENS = 80000;
const AVG_CHARS_PER_TOKEN = 4;
const MAX_CONTEXT_CHARS = MAX_CONTEXT_TOKENS * AVG_CHARS_PER_TOKEN;

export interface RetrievedContext {
  workingMemory: string[];
  projectContext: string | null;
  semanticMemories: string[];
  episodicMemories: string[];
  entityContext: string[];
  hypotheses: string[];
  totalChars: number;
}

export async function assembleContext(
  userId: string,
  conversationId: string,
  projectId?: string | null,
  correlationId?: string
): Promise<RetrievedContext> {
  const result: RetrievedContext = {
    workingMemory: [],
    projectContext: null,
    semanticMemories: [],
    episodicMemories: [],
    entityContext: [],
    hypotheses: [],
    totalChars: 0,
  };

  let budget = MAX_CONTEXT_CHARS;

  // 1. Working memory (highest priority)
  const wmKeys = await workingMemory.keys(`wm:${userId}:*`);
  for (const key of wmKeys) {
    const val = await workingMemory.get(key);
    if (val) {
      const entry = typeof val === 'string' ? val : JSON.stringify(val);
      if (budget - entry.length > 0) {
        result.workingMemory.push(entry);
        budget -= entry.length;
      }
    }
  }

  // 2. Project context
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        tasks: { where: { status: { not: 'DONE' } }, take: 10, orderBy: { updatedAt: 'desc' } },
        decisions: { take: 5, orderBy: { decidedAt: 'desc' } },
        risks: { where: { status: 'OPEN' }, take: 5 },
        openQuestions: { where: { status: 'OPEN' }, take: 5 },
        milestones: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });
    if (project) {
      const pCtx = [
        `Active Project: ${project.name}`,
        project.goal ? `Goal: ${project.goal}` : '',
        project.status ? `Status: ${project.status}` : '',
        project.tasks?.length ? `Open Tasks: ${(project.tasks ?? []).map((t: any) => `- [${t.status}] ${t.title}`).join('\n')}` : '',
        project.decisions?.length ? `Recent Decisions: ${(project.decisions ?? []).map((d: any) => `- ${d.title}`).join('\n')}` : '',
        project.risks?.length ? `Open Risks: ${(project.risks ?? []).map((r: any) => `- [${r.severity}] ${r.title}`).join('\n')}` : '',
        project.openQuestions?.length ? `Open Questions: ${(project.openQuestions ?? []).map((q: any) => `- ${q.question}`).join('\n')}` : '',
      ].filter(Boolean).join('\n');
      if (budget - pCtx.length > 0) {
        result.projectContext = pCtx;
        budget -= pCtx.length;
      }
    }
  }

  // 3. Semantic memories (project-scoped if applicable)
  const semanticWhere: any = { userId, supersededBy: null };
  if (projectId) semanticWhere.projectId = projectId;
  const semantics = await prisma.memorySemantic.findMany({
    where: semanticWhere,
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  for (const mem of semantics ?? []) {
    const entry = `[${mem.epistemicStatus}] ${mem.statement} (confidence: ${mem.confidence})`;
    if (budget - entry.length > 0) {
      result.semanticMemories.push(entry);
      budget -= entry.length;
    }
  }

  // 4. Episodic memories
  const episodicWhere: any = { userId, supersededBy: null };
  if (projectId) episodicWhere.projectId = projectId;
  const episodes = await prisma.memoryEpisode.findMany({
    where: episodicWhere,
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  for (const ep of episodes ?? []) {
    const entry = `[${ep.eventType}] ${ep.summary} (${ep.createdAt.toISOString().split('T')[0]})`;
    if (budget - entry.length > 0) {
      result.episodicMemories.push(entry);
      budget -= entry.length;
    }
  }

  // 5. Entity context
  const entities = await prisma.entityNode.findMany({
    where: { userId, mergedInto: null },
    include: { edgesFrom: { where: { supersededBy: null }, include: { to: true }, take: 5 } },
    take: 15,
    orderBy: { updatedAt: 'desc' },
  });
  for (const ent of entities ?? []) {
    const edges = (ent.edgesFrom ?? []).map((e: any) => `${e.relationshipType} ${e.to?.canonicalName ?? 'unknown'}`).join(', ');
    const entry = `${ent.type}: ${ent.canonicalName}${edges ? ` (${edges})` : ''}`;
    if (budget - entry.length > 0) {
      result.entityContext.push(entry);
      budget -= entry.length;
    }
  }

  // 6. Hypotheses (labeled as such)
  const hyps = await prisma.hypothesis.findMany({
    where: { userId, supersededBy: null, ...(projectId ? { projectId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  for (const h of hyps ?? []) {
    const entry = `[HYPOTHESIS confidence=${h.confidence}] ${h.statement}`;
    if (budget - entry.length > 0) {
      result.hypotheses.push(entry);
      budget -= entry.length;
    }
  }

  result.totalChars = MAX_CONTEXT_CHARS - budget;
  return result;
}

export function formatContextForPrompt(ctx: RetrievedContext): string {
  const sections: string[] = [];
  if (ctx.projectContext) sections.push(ctx.projectContext);
  if (ctx.semanticMemories.length) sections.push('Known Facts:\n' + ctx.semanticMemories.join('\n'));
  if (ctx.episodicMemories.length) sections.push('Recent Events:\n' + ctx.episodicMemories.join('\n'));
  if (ctx.entityContext.length) sections.push('Known Entities:\n' + ctx.entityContext.join('\n'));
  if (ctx.hypotheses.length) sections.push('MAMBA Hypotheses (NOT confirmed facts):\n' + ctx.hypotheses.join('\n'));
  return sections.join('\n\n');
}
