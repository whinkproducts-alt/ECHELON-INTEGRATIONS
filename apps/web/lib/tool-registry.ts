import { prisma } from '@/lib/db';
import { logger, generateCorrelationId } from '@/lib/logger';
import { checkPermission, type PermissionClass } from '@/lib/permission-engine';
import { writeMemory, correctMemory, searchMemory } from '@/lib/memory-engine';

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  source?: string;
  timestamp: string;
  toolVersion: string;
}

const TOOL_HANDLERS: Record<string, (userId: string, params: any) => Promise<ToolExecutionResult>> = {
  memory_write: async (userId: string, params: any) => {
    const result = await writeMemory({
      userId,
      type: params.type ?? 'semantic',
      statement: params.statement,
      projectId: params.projectId,
      source: params.source ?? 'conversation',
      confidence: params.confidence,
      epistemicStatus: params.epistemicStatus ?? 'KNOWN',
      eventType: params.eventType,
    });
    return { success: true, data: result, source: 'memory_engine', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  memory_read: async (userId: string, params: any) => {
    const result = await searchMemory(userId, params.query, params.projectId, params.limit);
    return { success: true, data: result, source: 'memory_engine', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  memory_correct: async (userId: string, params: any) => {
    const result = await correctMemory(userId, params.oldStatement, params.newStatement, params.projectId);
    return { success: true, data: result, source: 'memory_engine', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  entity_create: async (userId: string, params: any) => {
    const entity = await prisma.entityNode.create({
      data: {
        userId,
        type: params.type ?? 'PERSON',
        canonicalName: params.name,
        confidence: params.confidence ?? 0.8,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
    if (params.aliases?.length) {
      for (const alias of params.aliases) {
        await prisma.entityAlias.create({ data: { entityId: entity.id, alias } });
      }
    }
    return { success: true, data: entity, source: 'knowledge_graph', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  entity_update: async (userId: string, params: any) => {
    if (params.relationship) {
      // Supersede old relationship if exists
      if (params.supersede) {
        const old = await prisma.entityEdge.findFirst({
          where: {
            fromId: params.fromId,
            relationshipType: params.relationship.type,
            supersededBy: null,
          },
        });
        if (old) {
          const newEdge = await prisma.entityEdge.create({
            data: {
              fromId: params.fromId,
              toId: params.relationship.toId,
              relationshipType: params.relationship.type,
              context: params.relationship.context,
              confidence: params.relationship.confidence ?? 0.8,
              projectId: params.projectId,
            },
          });
          await prisma.entityEdge.update({ where: { id: old.id }, data: { supersededBy: newEdge.id } });
          return { success: true, data: { superseded: old.id, created: newEdge.id }, source: 'knowledge_graph', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
        }
      }
      const edge = await prisma.entityEdge.create({
        data: {
          fromId: params.fromId,
          toId: params.relationship.toId,
          relationshipType: params.relationship.type,
          context: params.relationship.context,
          projectId: params.projectId,
        },
      });
      return { success: true, data: edge, source: 'knowledge_graph', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
    }
    return { success: false, error: 'No operation specified', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  task_create: async (userId: string, params: any) => {
    const task = await prisma.projectTask.create({
      data: {
        projectId: params.projectId,
        title: params.title,
        description: params.description,
        priority: params.priority ?? 'MEDIUM',
        assignee: params.assignee,
        dueDate: params.dueDate ? new Date(params.dueDate) : null,
        source: 'whink',
      },
    });
    return { success: true, data: task, source: 'project_tasks', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },
};

const TOOL_RISK_MAP: Record<string, PermissionClass> = {
  memory_write: 'A',
  memory_read: 'A',
  memory_correct: 'B',
  entity_create: 'A',
  entity_update: 'B',
  task_create: 'B',
};

export async function executeTool(
  userId: string,
  toolName: string,
  params: any,
  persona?: string,
  mambaMode?: string,
  correlationId?: string
): Promise<ToolExecutionResult> {
  const cid = correlationId ?? generateCorrelationId();
  const startTime = Date.now();

  // Check permission
  const riskClass = TOOL_RISK_MAP[toolName] ?? 'B';
  const permCheck = await checkPermission(userId, toolName, riskClass, cid);

  if (!permCheck.allowed) {
    // Log to action ledger
    await prisma.action.create({
      data: {
        userId,
        initiator: 'system',
        persona,
        mambaMode,
        tool: toolName,
        action: `tool_execution_denied`,
        permissionClass: riskClass,
        status: 'FAILED',
        inputSummary: JSON.stringify(params).substring(0, 500),
        outputSummary: permCheck.reason,
        correlationId: cid,
        latencyMs: Date.now() - startTime,
      },
    });
    return { success: false, error: permCheck.reason ?? 'Permission denied', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  }

  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    return { success: false, error: `Unknown tool: ${toolName}`, timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  }

  try {
    const result = await handler(userId, params);
    // Log to action ledger
    await prisma.action.create({
      data: {
        userId,
        initiator: 'system',
        persona,
        mambaMode,
        tool: toolName,
        action: `tool_executed: ${toolName}`,
        permissionClass: riskClass,
        confirmationMethod: permCheck.method,
        status: result.success ? 'VALIDATED' : 'FAILED',
        inputSummary: JSON.stringify(params).substring(0, 500),
        outputSummary: JSON.stringify(result.data ?? result.error).substring(0, 500),
        correlationId: cid,
        latencyMs: Date.now() - startTime,
      },
    });
    return result;
  } catch (error: any) {
    await prisma.action.create({
      data: {
        userId,
        initiator: 'system',
        persona,
        mambaMode,
        tool: toolName,
        action: `tool_execution_error: ${toolName}`,
        permissionClass: riskClass,
        status: 'FAILED',
        inputSummary: JSON.stringify(params).substring(0, 500),
        outputSummary: error?.message ?? 'Unknown error',
        correlationId: cid,
        latencyMs: Date.now() - startTime,
      },
    });
    return { success: false, error: error?.message ?? 'Tool execution failed', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  }
}
