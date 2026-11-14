import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { canonicalJson } from '@/lib/canonical-json';
import crypto from 'crypto';

// Mock canonical-json module
vi.mock('@/lib/canonical-json', () => {
  const mockApprovalContentHash = vi.fn();
  return {
    canonicalJson: vi.fn((obj: any) => JSON.stringify(obj, Object.keys(obj).sort())),
    approvalContentHash: mockApprovalContentHash,
    __mockApprovalContentHash: mockApprovalContentHash,
  };
});

const h = vi.hoisted(() => ({
  jobs: [] as any[],
  actions: [] as any[],
  approvals: [] as any[],
  sealedScopes: [] as any[],
  findFirst: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('@/lib/db', async () => {
  return {
    prisma: {
      agentJob: {
        findFirst: (...args: any[]) => h.findFirst(...args),
        findMany: (...args: any[]) => h.findMany(...args),
        findUnique: (...args: any[]) => h.findUnique(...args),
        create: (...args: any[]) => h.create(...args),
        update: (...args: any[]) => h.update(...args),
        updateMany: (...args: any[]) => h.updateMany(...args),
        delete: (...args: any[]) => h.delete(...args),
      },
      approvalRequest: {
        findFirst: (...args: any[]) => h.findFirst(...args),
        findMany: (...args: any[]) => h.findMany(...args),
        create: (...args: any[]) => h.create(...args),
        update: (...args: any[]) => h.update(...args),
      },
      action: {
        findMany: (...args: any[]) => h.findMany(...args),
        create: (...args: any[]) => h.create(...args),
        createMany: (...args: any[]) => h.createMany(...args),
      },
      sealedScope: {
        create: (...args: any[]) => h.create(...args),
      },
    },
  };
});

vi.mock('@/lib/capability/hosts', async () => {
  return {
    requireMarcusAuth: vi.fn((req: Request) => {
      const auth = req.headers.get('authorization');
      if (!auth?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Missing bearer token' };
      const token = auth.slice(7);
      if (token === 'valid-token') return { ok: true };
      return { ok: false, status: 401, error: 'Invalid bearer token' };
    }),
    MARCUS_SERVICE_NAME: 'marcus-vale',
    verifyMarcusToken: vi.fn((token: string) => token === 'valid-token'),
    hashMarcusToken: vi.fn((token: string) => crypto.createHash('sha256').update(token).digest('hex')),
  };
});

vi.mock('@/lib/sealed-scope', () => {
  return {
    createSealedScope: vi.fn(),
    registerSealedScope: vi.fn(),
    isSealedScope: vi.fn(),
  };
});

import { intakeMarcusTask } from '@/lib/marcus/intake';
import { checkMarcusApproval, checkMarcusApprovalReplay } from '@/lib/permission-engine';
import { approvalContentHash as mockApprovalContentHash } from '@/lib/canonical-json';
import type { approvalContentHash } from '@/lib/canonical-json';

// Get the mock function from the mocked module
const __mockApprovalContentHash = mockApprovalContentHash as unknown as ReturnType<typeof vi.fn>;

interface MarcusTaskBody {
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

const validBodyBase: MarcusTaskBody = {
  client_operation_id: 'test-op-123',
  title: 'Test Task',
  goal: 'Test goal description',
  deadline: '2026-12-01T00:00:00Z',
  requested_for: 'victor',
  approval: {
    approval_id: 'approval-123',
    approved_at: '2026-11-13T12:00:00Z',
    method: 'voice',
    content_hash: '',
  },
  sensitivity: 'standard',
  directorate: null,
};

function computeHash(body: MarcusTaskBody) {
  const contentForHash = { title: body.title, goal: body.goal, deadline: body.deadline };
  const canonical = canonicalJson(contentForHash);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function makeReq(body: any, token = 'valid-token') {
  return {
    headers: new Map([['authorization', `Bearer ${token}`]]),
    json: async () => body,
  } as unknown as Request;
}

describe('Marcus Intake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __mockApprovalContentHash.mockReset();
    h.jobs = [];
    h.actions = [];
    h.approvals = [];
    h.sealedScopes = [];
  });

  it('accepts a valid Marcus bearer token', async () => {
    const body = { ...validBodyBase, approval: { ...validBodyBase.approval, content_hash: computeHash(validBodyBase) } };
    h.findFirst.mockResolvedValueOnce(null); // no existing task
    h.findFirst.mockResolvedValueOnce(null); // no replayed approval
    h.create.mockResolvedValueOnce({ id: 'task-1', createdAt: new Date(), lastStatus: 'received', userId: 'victor-igboekwe' });
    h.create.mockResolvedValueOnce({}); // approvalRequest create
    h.create.mockResolvedValueOnce({}); // action create
    
    const req = makeReq(body);
    const res = await intakeMarcusTask(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('received');
    expect(data.task_id).toBeDefined();
  });

  it('rejects invalid token with 401', async () => {
    const body = { ...validBodyBase, approval: { ...validBodyBase.approval, content_hash: computeHash(validBodyBase) } };
    const req = makeReq(body, 'invalid-token');
    const res = await intakeMarcusTask(req);
    expect(res.status).toBe(401);
  });

  it('rejects missing token with 401', async () => {
    const body = { ...validBodyBase, approval: { ...validBodyBase.approval, content_hash: computeHash(validBodyBase) } };
    const req = makeReq(body, '');
    const res = await intakeMarcusTask(req);
    expect(res.status).toBe(401);
  });

  it('idempotent on duplicate client_operation_id', async () => {
    const body = { ...validBodyBase, approval: { ...validBodyBase.approval, content_hash: computeHash(validBodyBase) } };
    const existing = { id: 'task-existing', createdAt: new Date('2026-11-01'), lastStatus: 'received', userId: 'victor-igboekwe' };
    h.findFirst.mockResolvedValueOnce(existing);
    
    const req = makeReq(body);
    const res = await intakeMarcusTask(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.task_id).toBe('task-existing');
  });

  it('rejects replayed approval_id with 409', async () => {
    const body = { ...validBodyBase, approval: { ...validBodyBase.approval, content_hash: computeHash(validBodyBase) } };
    h.findFirst.mockResolvedValueOnce(null); // no existing task
    h.findFirst.mockResolvedValueOnce({ id: 'approval-123' }); // replayed approval
    
    const req = makeReq(body);
    const res = await intakeMarcusTask(req);
    expect(res.status).toBe(409);
  });

  it('pauses financial sensitivity and emits reconfirmation_required', async () => {
    const financialBody = { ...validBodyBase, sensitivity: 'financial' as const };
    financialBody.approval.content_hash = computeHash(financialBody);
    
    h.findFirst.mockResolvedValueOnce(null);
    h.findFirst.mockResolvedValueOnce(null);
    h.create.mockResolvedValueOnce({ id: 'task-fin', createdAt: new Date(), lastStatus: 'reconfirmation_required', userId: 'victor-igboekwe' });
    h.create.mockResolvedValueOnce({}); // approvalRequest
    h.create.mockResolvedValueOnce({}); // action
    
    const req = makeReq(financialBody);
    const res = await intakeMarcusTask(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('reconfirmation_required');
  });

  it('pauses proprietary sensitivity and emits reconfirmation_required', async () => {
    const proprietaryBody = { ...validBodyBase, sensitivity: 'proprietary' as const };
    proprietaryBody.approval.content_hash = computeHash(proprietaryBody);
    
    h.findFirst.mockResolvedValueOnce(null);
    h.findFirst.mockResolvedValueOnce(null);
    h.create.mockResolvedValueOnce({ id: 'task-prop', createdAt: new Date(), lastStatus: 'reconfirmation_required', userId: 'victor-igboekwe' });
    h.create.mockResolvedValueOnce({}); // approvalRequest
    h.create.mockResolvedValueOnce({}); // action
    
    const req = makeReq(proprietaryBody);
    const res = await intakeMarcusTask(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('reconfirmation_required');
  });

  it('standard sensitivity is accepted without second approval', async () => {
    const body = { ...validBodyBase, approval: { ...validBodyBase.approval, content_hash: computeHash(validBodyBase) } };
    h.findFirst.mockResolvedValueOnce(null);
    h.findFirst.mockResolvedValueOnce(null);
    h.create.mockResolvedValueOnce({ id: 'task-std', createdAt: new Date(), lastStatus: 'received', userId: 'victor-igboekwe' });
    h.create.mockResolvedValueOnce({}); // approvalRequest
    h.create.mockResolvedValueOnce({}); // action
    
    const req = makeReq(body);
    const res = await intakeMarcusTask(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('received');
  });
});

describe('Marcus Approval Carry-Over', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __mockApprovalContentHash.mockReset();
    // Default mock to return matching hash (synchronous!)
    __mockApprovalContentHash.mockReturnValue('computed-hash');
  });

  it('checkMarcusApproval accepts standard sensitivity', async () => {
    h.findFirst.mockResolvedValueOnce({
      id: 'approval-123',
      userId: 'victor-igboekwe',
      kind: 'tool_call',
      tool: 'marcus_task_intake',
      params: { client_operation_id: 'test-op-123' },
      contentHash: 'computed-hash',
      status: 'PENDING',
      executedAt: null,
      decidedAt: null,
    });
    h.update.mockResolvedValueOnce({});

    const result = await checkMarcusApproval('victor-igboekwe', 'approval-123', 'marcus_task_intake', 'computed-hash', 'standard');
    expect(result.allowed).toBe(true);
    expect(result.method).toBe('human_approved');
  });

  it('checkMarcusApproval blocks financial sensitivity', async () => {
    h.findFirst.mockResolvedValueOnce({
      id: 'approval-123',
      userId: 'victor-igboekwe',
      kind: 'tool_call',
      tool: 'marcus_task_intake',
      params: { client_operation_id: 'test-op-123' },
      contentHash: 'computed-hash',
      status: 'PENDING',
      executedAt: null,
      decidedAt: null,
    });

    const result = await checkMarcusApproval('victor-igboekwe', 'approval-123', 'marcus_task_intake', 'computed-hash', 'financial');
    expect(result.allowed).toBe(false);
    expect(result.method).toBe('requires_confirmation');
    expect(result.reason).toContain('reconfirmation');
  });

  it('checkMarcusApproval blocks proprietary sensitivity', async () => {
    h.findFirst.mockResolvedValueOnce({
      id: 'approval-123',
      userId: 'victor-igboekwe',
      kind: 'tool_call',
      tool: 'marcus_task_intake',
      params: { client_operation_id: 'test-op-123' },
      contentHash: 'computed-hash',
      status: 'PENDING',
      executedAt: null,
      decidedAt: null,
    });

    const result = await checkMarcusApproval('victor-igboekwe', 'approval-123', 'marcus_task_intake', 'computed-hash', 'proprietary');
    expect(result.allowed).toBe(false);
    expect(result.method).toBe('requires_confirmation');
    expect(result.reason).toContain('reconfirmation');
  });

  it('checkMarcusApproval rejects replayed approval_id', async () => {
    h.findFirst.mockResolvedValueOnce({
      id: 'approval-123',
      userId: 'victor-igboekwe',
      executedAt: new Date(), // already consumed
    });

    const result = await checkMarcusApproval('victor-igboekwe', 'approval-123', 'marcus_task_intake', 'computed-hash', 'standard');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Marcus approval already consumed');
  });

  it('checkMarcusApprovalReplay returns true for consumed approval', async () => {
    h.findFirst.mockResolvedValueOnce({
      id: 'approval-123',
      executedAt: new Date(),
    });
    const replayed = await checkMarcusApprovalReplay('approval-123');
    expect(replayed).toBe(true);
  });

  it('checkMarcusApprovalReplay returns false for unused approval', async () => {
    h.findFirst.mockResolvedValueOnce({
      id: 'approval-123',
      executedAt: null,
    });
    const replayed = await checkMarcusApprovalReplay('approval-123');
    expect(replayed).toBe(false);
  });

  it('checkMarcusApprovalReplay returns false for non-existent approval', async () => {
    h.findFirst.mockResolvedValueOnce(null);
    const replayed = await checkMarcusApprovalReplay('approval-123');
    expect(replayed).toBe(false);
  });
});

describe('Marcus Persona', () => {
  it('MARCUS persona is registered in personas.ts', async () => {
    const { PERSONAS } = await import('@/lib/personas');
    expect(PERSONAS.MARCUS).toBeDefined();
    expect(PERSONAS.MARCUS.id).toBe('MARCUS');
    expect(PERSONAS.MARCUS.title).toBe('External Intake Agent');
    expect(PERSONAS.MARCUS.capabilities).toContain('Task Submission');
    expect(PERSONAS.MARCUS.capabilities).toContain('Status Relay');
    expect(PERSONAS.MARCUS.capabilities).toContain('Freeze Control');
    expect(PERSONAS.MARCUS.isBoardMember).toBe(false);
    expect(PERSONAS.MARCUS.reportsTo).toBe('FOUNDER');
  });
});

describe('Marcus Host Credential', () => {
  it('MARCUS_SERVICE_NAME is defined in hosts.ts', async () => {
    const { MARCUS_SERVICE_NAME, requireMarcusAuth, verifyMarcusToken, hashMarcusToken } = await import('@/lib/capability/hosts');
    expect(MARCUS_SERVICE_NAME).toBe('marcus-vale');
    expect(typeof requireMarcusAuth).toBe('function');
    expect(typeof verifyMarcusToken).toBe('function');
    expect(typeof hashMarcusToken).toBe('function');
  });
});

describe('Marcus Events Feed', () => {
  it('route exists for /api/integrations/marcus/events', async () => {
    const fs = await import('fs');
    const path = '/Users/victorcheckingin/Developer/ECHELON-INTEGRATIONS/apps/web/app/api/integrations/marcus/events/route.ts';
    expect(fs.existsSync(path)).toBe(true);
  });
});

describe('Marcus Freeze/Unfreeze', () => {
  it('freeze route exists', async () => {
    const fs = await import('fs');
    const path = '/Users/victorcheckingin/Developer/ECHELON-INTEGRATIONS/apps/web/app/api/integrations/marcus/freeze/route.ts';
    expect(fs.existsSync(path)).toBe(true);
  });

  it('unfreeze route exists', async () => {
    const fs = await import('fs');
    const path = '/Users/victorcheckingin/Developer/ECHELON-INTEGRATIONS/apps/web/app/api/integrations/marcus/unfreeze/route.ts';
    expect(fs.existsSync(path)).toBe(true);
  });
});
