/** Owner-queued, one-shot agent calls through the existing gateway. Never replay uncertain dispatch. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { canonicalJson } from '@/lib/canonical-json';
import { encryptKey, decryptKey } from '@/lib/key-encryption';
import { recordAction } from '@/lib/ledger';
import { invokeCapability, CapabilityError } from '@/lib/capability/invoke';
import { CapabilityInputError } from '@/lib/capability/providers';
import { resolveAgent, agentMayAct } from '@/lib/capability/roster';
import { scanForUrls } from '@/lib/capability/egress';
import { SECRET_RULES } from '@/lib/secret-scan';
import { filterToolResult, wrapUntrustedContent } from '@/lib/content-isolation';
import type { ClaimedJob, JobOutcome } from '@/lib/worker/scheduler';

const schema = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
  agentId: z.string().min(1).max(160), toolName: z.string().min(1).max(160),
  args: z.record(z.string(), z.unknown()),
  dataClass: z.enum(['public', 'organization', 'confidential']),
  missionId: z.string().min(1).max(160).nullable().optional(),
}).strict();
export const CAPABILITY_QUEUE_TTL_MS = 15 * 60_000;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function parse(raw: unknown) {
  const result = schema.safeParse(raw);
  if (!result.success) throw new CapabilityInputError('Invalid capability job request');
  const request = { ...result.data, missionId: result.data.missionId ?? null };
  if (scanForUrls(request.args).incomplete) throw new CapabilityInputError('Arguments cannot be fully inspected');
  let text: string;
  try { text = canonicalJson(request); } catch { throw new CapabilityInputError('Arguments must be JSON'); }
  if (Buffer.byteLength(text) > 64 * 1024) throw new CapabilityInputError('Capability job request too large');
  if (/founder[_ -]?private/i.test(text) || SECRET_RULES.some((r) => r.re.test(text))) throw new CapabilityInputError('Private markers and credentials cannot be queued');
  return { request, text };
}
const publicSelect = { id: true, jobKey: true, lastStatus: true, lastError: true, createdAt: true, lastRunAt: true,
  capabilityReceiptId: true, capabilityApprovalId: true, leaseUntil: true, capabilityResultEnc: true } as const;

/** Internal admission primitive. The HTTP boundary requires the owner. Admission grants no tool authority. */
export async function enqueueCapabilityJob(userId: string, raw: unknown) {
  if (!userId) throw new CapabilityInputError('Account required');
  const { request, text } = parse(raw);
  const agent = await resolveAgent(request.agentId);
  if (!agent || !agentMayAct(agent.state)) throw new CapabilityInputError('Agent unavailable', 404);
  const tool = await prisma.tool.findFirst({ where: { name: request.toolName, connectorInstall: { userId, kind: 'MCP_SERVER' } }, select: { id: true } });
  if (!tool) throw new CapabilityInputError('Tool not found', 404);
  if (request.missionId && !await prisma.executionPlan.findFirst({ where: { id: request.missionId, userId }, select: { id: true } })) throw new CapabilityInputError('Mission not found', 404);
  const jobKey = `capability:${request.requestId}`;
  const digest = hash(canonicalJson({ userId, request }));
  const encrypted = encryptKey(text);
  return prisma.$transaction(async (tx) => {
    const made = await tx.agentJob.createMany({ data: [{ userId, jobKey, nextRunAt: new Date(), lastStatus: 'QUEUED', capabilityRequestEnc: encrypted, capabilityRequestHash: digest }], skipDuplicates: true });
    const row = await tx.agentJob.findUniqueOrThrow({ where: { jobKey_userId: { jobKey, userId } } });
    if (row.capabilityRequestHash !== digest) throw new CapabilityInputError('Request id already used for different content', 409);
    if (made.count) await recordAction({ userId, initiator: 'user', action: 'capability_job_queued', permissionClass: 'C', status: 'SUBMITTED', tool: request.toolName, correlationId: row.id, inputSummary: JSON.stringify({ sha256: digest }) }, tx);
    return tx.agentJob.findFirstOrThrow({ where: { id: row.id, userId }, select: publicSelect });
  });
}

/** Metadata only; approvalStatus is separate because dispatch is not approval execution. */
export async function getCapabilityJob(userId: string, id: string) {
  const row = await prisma.agentJob.findFirst({ where: { id, userId, jobKey: { startsWith: 'capability:' } }, select: publicSelect });
  if (!row) return null;
  const approval = row.capabilityApprovalId ? await prisma.approvalRequest.findFirst({ where: { id: row.capabilityApprovalId, userId }, select: { status: true } }) : null;
  const uncertain = row.lastStatus === 'DISPATCHING' && (!row.leaseUntil || row.leaseUntil <= new Date());
  const { capabilityResultEnc, ...safe } = row;
  const result = capabilityResultEnc ? wrapUntrustedContent(decryptKey(capabilityResultEnc), 'tool_result', 'capability-provider') : null;
  return { ...safe, lastStatus: uncertain ? 'UNKNOWN' : row.lastStatus, approvalStatus: approval?.status ?? null, result, untrusted: true };
}

/** At-most-once dispatch, not exactly-once external effects. A crash after the claim never auto-retries. */
export async function runCapabilityJob(job: ClaimedJob, workerId: string, now = new Date()): Promise<JobOutcome> {
  if (!job.leaseUntil || job.leaseUntil <= now) return 'SKIPPED';
  let claimed = false;
  try {
    const row = await prisma.$transaction(async (tx) => {
      const won = await tx.agentJob.updateMany({ where: { id: job.id, userId: job.userId, jobKey: { startsWith: 'capability:' }, leaseOwner: workerId, leaseUntil: { equals: job.leaseUntil, gt: now }, lastStatus: 'QUEUED' }, data: { lastStatus: 'DISPATCHING', lastRunAt: now, runs: { increment: 1 } } });
      if (!won.count) return null;
      await recordAction({ userId: job.userId, initiator: 'automation', action: 'capability_job_dispatching', permissionClass: 'C', status: 'SUBMITTED', correlationId: job.id }, tx);
      return tx.agentJob.findFirstOrThrow({ where: { id: job.id, userId: job.userId } });
    });
    if (!row) return 'SKIPPED';
    claimed = true;
    if (now.getTime() - row.createdAt.getTime() > CAPABILITY_QUEUE_TTL_MS || !row.capabilityRequestEnc) throw new CapabilityInputError('Expired or missing queued request');
    const { request } = parse(JSON.parse(decryptKey(row.capabilityRequestEnc)));
    if (row.jobKey !== `capability:${request.requestId}` || row.capabilityRequestHash !== hash(canonicalJson({ userId: job.userId, request }))) throw new CapabilityInputError('Queued request integrity failure');
    const result = await invokeCapability({ userId: job.userId, subject: { type: 'AGENT', agentId: request.agentId }, toolName: request.toolName, args: request.args, dataClass: request.dataClass, missionId: request.missionId, correlationId: job.id });
    const output = result.status === 'EXECUTED' ? filterToolResult(result.output) : null;
    if (output && Buffer.byteLength(output) > 16_000) throw new Error('Provider result exceeded safe size limit');
    if (output && SECRET_RULES.some((rule) => rule.re.test(output))) throw new Error('Provider result contained a credential');
    await finish(job, workerId, result.status, null, result.actionId, result.status === 'AWAITING_APPROVAL' ? result.approvalId : null, output);
    return result.status === 'EXECUTED' ? 'OK' : 'SKIPPED';
  } catch (e) {
    if (claimed) {
      // Timeouts and upstream errors do not prove the remote side performed no effect.
      const known = e instanceof CapabilityInputError || (e instanceof CapabilityError && !e.code.startsWith('EXEC_'));
      const reason = e instanceof CapabilityError ? e.code : e instanceof CapabilityInputError ? 'INVALID_OR_EXPIRED_REQUEST' : 'DISPATCH_UNCERTAIN';
      await finish(job, workerId, known ? 'FAILED' : 'UNKNOWN', reason, e instanceof CapabilityError ? e.actionId ?? null : null, null).catch(() => undefined);
    }
    return 'FAILED';
  }
}
async function finish(job: ClaimedJob, workerId: string, state: string, reason: string | null, receiptId: string | null, approvalId: string | null, output: string | null = null) {
  await prisma.$transaction(async (tx) => {
    const done = await tx.agentJob.updateMany({ where: { id: job.id, userId: job.userId, leaseOwner: workerId, leaseUntil: job.leaseUntil, lastStatus: 'DISPATCHING' }, data: { lastStatus: state, lastError: reason, capabilityRequestEnc: null, capabilityReceiptId: receiptId, capabilityApprovalId: approvalId, capabilityResultEnc: output ? encryptKey(output) : null, leaseUntil: null, leaseOwner: null } });
    if (!done.count) throw new Error('Capability job lease lost');
    await recordAction({ userId: job.userId, initiator: 'automation', action: 'capability_job_finished', permissionClass: 'C', status: state === 'EXECUTED' ? 'EXECUTED' : state === 'AWAITING_APPROVAL' ? 'AWAITING_APPROVAL' : state === 'UNKNOWN' ? 'UNVERIFIED' : 'FAILED', correlationId: job.id, approvalId, errorCode: reason, outputSummary: state }, tx);
  });
}
