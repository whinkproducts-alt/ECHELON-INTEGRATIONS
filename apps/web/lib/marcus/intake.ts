import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireMarcusAuth } from '@/lib/capability/hosts';
import { canonicalJson, approvalContentHash } from '@/lib/canonical-json';
import { registerSealedScope, isSealedScope, type SealedKind, type Directorate } from '@/lib/sealed-scope';

export interface MarcusTaskInput {
  client_operation_id: string;
  title: string;
  goal: string;
  deadline: string | null;
  requested_for: string;
  approval: {
    approval_id: string;
    approved_at: string;
    method: "voice" | "tap";
    content_hash: string;
  };
  sensitivity: "standard" | "proprietary" | "financial";
  directorate: string | null;
}

const RECONFIRM_SENSITIVITY = new Set(["financial", "proprietary"]);

export async function intakeMarcusTask(req: Request) {
  const auth = requireMarcusAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: MarcusTaskInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  if (!body.client_operation_id || !body.title || !body.goal || !body.requested_for || !body.approval) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!['standard', 'proprietary', 'financial'].includes(body.sensitivity)) {
    return NextResponse.json({ error: 'Invalid sensitivity value' }, { status: 400 });
  }
  if (!['voice', 'tap'].includes(body.approval.method)) {
    return NextResponse.json({ error: 'Invalid approval method' }, { status: 400 });
  }

  // Verify approval content hash matches title + goal + deadline
  const contentForHash = { title: body.title, goal: body.goal, deadline: body.deadline };
  const expectedHash = canonicalJson(contentForHash);
  const computedHash = require('crypto').createHash('sha256').update(expectedHash).digest('hex');
  if (computedHash !== body.approval.content_hash) {
    return NextResponse.json({ error: 'Approval content hash mismatch' }, { status: 400 });
  }

  // Idempotency: Check if client_operation_id exists
  const existingTask = await prisma.agentJob.findFirst({
    where: { jobKey: `marcus:${body.client_operation_id}` }
  });

  if (existingTask) {
    return NextResponse.json({
      task_id: existingTask.id,
      client_operation_id: body.client_operation_id,
      status: existingTask.lastStatus === 'OK' ? 'done' : 'received',
      created_at: existingTask.createdAt.toISOString(),
    });
  }

  // Check if approval_id has been replayed
  const replayed = await prisma.approvalRequest.findFirst({
    where: { id: body.approval.approval_id },
    select: { id: true }
  });
  if (replayed) {
    return NextResponse.json({ error: 'Approval ID already used' }, { status: 409 });
  }

  // Determine initial status based on sensitivity
  const requiresReconfirmation = RECONFIRM_SENSITIVITY.has(body.sensitivity);
  const initialStatus = requiresReconfirmation ? 'reconfirmation_required' : 'received';

  // Create the task (using AgentJob as the task record)
  const task = await prisma.agentJob.create({
    data: {
      jobKey: `marcus:${body.client_operation_id}`,
      userId: 'victor-igboekwe', // Marcus tasks are for Victor
      nextRunAt: new Date(),
      lastStatus: initialStatus,
      capabilityRequestHash: body.approval.content_hash,
      capabilityApprovalId: body.approval.approval_id,
    }
  });

  // Register sealed scope for this task (Marcus tasks operate in sealed scope)
  await registerSealedScope({
    userId: task.userId,
    email: 'victor.igboekwe@whinkgroup.com',
    kind: 'OBJECTIVE',
    refId: task.id,
  });

  // Record approval request for tracking (single-use)
  await prisma.approvalRequest.create({
    data: {
      userId: task.userId,
      kind: 'tool_call',
      tool: 'marcus_task_intake',
      params: { client_operation_id: body.client_operation_id },
      contentHash: body.approval.content_hash,
      summary: body.title,
      permissionClass: requiresReconfirmation ? 'C' : 'A',
      status: requiresReconfirmation ? 'PENDING' : 'EXECUTING',
      correlationId: `marcus:${body.client_operation_id}`,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // No expiry per prompt
    }
  });

  // Emit status event
  await prisma.action.create({
    data: {
      userId: task.userId,
      initiator: 'system',
      action: 'capability_marcus_task_received',
      status: initialStatus === 'received' ? 'EXECUTED' : 'BLOCKED',
      errorCode: initialStatus === 'reconfirmation_required' ? 'RECONFIRMATION_REQUIRED' : null,
      capabilityId: task.id,
      inputSummary: `title=${body.title} sensitivity=${body.sensitivity}`,
      correlationId: `marcus:${body.client_operation_id}`,
    }
  });

  return NextResponse.json({
    task_id: task.id,
    client_operation_id: body.client_operation_id,
    status: initialStatus,
    created_at: task.createdAt.toISOString(),
  });
}
