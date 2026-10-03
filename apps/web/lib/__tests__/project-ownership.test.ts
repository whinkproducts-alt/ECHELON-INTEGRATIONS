import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('project ownership scoping: task_create', () => {
  const recordActionSafe = vi.fn();
  const recordAction = vi.fn();
  const updateActionStatus = vi.fn();
  const checkPermission = vi.fn();
  const projectFindFirst = vi.fn();
  const taskCreate = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    recordActionSafe.mockReset().mockResolvedValue({ id: 'row1' });
    recordAction.mockReset().mockResolvedValue({ id: 'row1' });
    updateActionStatus.mockReset().mockResolvedValue(true);
    checkPermission.mockReset().mockResolvedValue({ allowed: true, method: 'delegated' });
    projectFindFirst.mockReset();
    taskCreate.mockReset();
    vi.doMock('@/lib/db', () => ({
      prisma: { project: { findFirst: projectFindFirst }, projectTask: { create: taskCreate } },
    }));
    vi.doMock('@/lib/ledger', () => ({ recordAction, recordActionSafe, updateActionStatus }));
    vi.doMock('@/lib/permission-engine', () => ({ checkPermission }));
    vi.doMock('@/lib/memory-engine', () => ({ writeMemory: vi.fn(), correctMemory: vi.fn(), searchMemory: vi.fn() }));
    vi.doMock('@/lib/openclaw-client', () => ({ listOpenClawTools: vi.fn(), callOpenClawTool: vi.fn() }));
  });

  it("another user's project: scoped by ownerId, returns 'Project not found', never creates a task", async () => {
    projectFindFirst.mockResolvedValue(null);
    const { executeTool } = await import('../tool-registry');
    const res = await executeTool('attacker', 'task_create', { projectId: 'proj-victim', title: 'x' });
    expect(projectFindFirst).toHaveBeenCalledTimes(1);
    expect(projectFindFirst.mock.calls[0][0].where).toEqual({ id: 'proj-victim', ownerId: 'attacker' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Project not found');
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it('owner happy path creates the task', async () => {
    projectFindFirst.mockResolvedValue({ id: 'p1', ownerId: 'owner' });
    taskCreate.mockResolvedValue({ id: 't1', title: 'Ship it' });
    const { executeTool } = await import('../tool-registry');
    const res = await executeTool('owner', 'task_create', { projectId: 'p1', title: 'Ship it' });
    expect(projectFindFirst.mock.calls[0][0].where).toEqual({ id: 'p1', ownerId: 'owner' });
    expect(res.success).toBe(true);
    expect(taskCreate).toHaveBeenCalledTimes(1);
    expect(taskCreate.mock.calls[0][0].data).toMatchObject({ projectId: 'p1', title: 'Ship it' });
  });
});

describe('project ownership scoping: context engine', () => {
  const projectFindFirst = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    projectFindFirst.mockReset().mockResolvedValue(null);
    vi.doMock('@/lib/working-memory', () => ({ listWorkingMemory: vi.fn().mockResolvedValue([]) }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        project: { findFirst: projectFindFirst },
        memorySemantic: { findMany: vi.fn().mockResolvedValue([]) },
        memoryEpisode: { findMany: vi.fn().mockResolvedValue([]) },
        entityNode: { findMany: vi.fn().mockResolvedValue([]) },
        hypothesis: { findMany: vi.fn().mockResolvedValue([]) },
      },
    }));
  });

  it('assembleContext looks up the project with ownerId, not userId', async () => {
    const { assembleContext } = await import('../context-engine');
    await assembleContext('callerA', 'conv1', 'projB');
    expect(projectFindFirst).toHaveBeenCalledTimes(1);
    const where = projectFindFirst.mock.calls[0][0].where;
    expect(where).toEqual({ id: 'projB', ownerId: 'callerA' });
    expect(where).not.toHaveProperty('userId');
  });

  it('a project owned by someone else yields no project context', async () => {
    const { assembleContext } = await import('../context-engine');
    const ctx = await assembleContext('callerA', 'conv1', 'projB');
    expect(ctx.projectContext).toBeNull();
  });
});

describe('static guard: prisma.project calls must scope by ownerId, never userId alone', () => {
  const webRoot = path.resolve(__dirname, '..', '..');
  const CALL_RE = /prisma\.project\.(findFirst|findMany|findUnique|update|updateMany|delete|deleteMany)\s*\(/g;

  function walk(dir: string, out: string[]) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '__tests__' || e.name === '.next') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
  }

  it('finds no prisma.project call whose where uses userId without ownerId', () => {
    const files: string[] = [];
    walk(path.join(webRoot, 'lib'), files);
    walk(path.join(webRoot, 'app'), files);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(CALL_RE)) {
        const window = src.slice(m.index!, m.index! + m[0].length + 200);
        if (/\buserId\b/.test(window) && !/\bownerId\b/.test(window)) {
          offenders.push(`${path.relative(webRoot, f)}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('guard regex detects a known-bad snippet (self-check)', () => {
    const bad = 'prisma.project.findFirst({ where: { id, userId } })';
    const m = [...bad.matchAll(CALL_RE)][0];
    const window = bad.slice(m.index!, m.index! + m[0].length + 200);
    expect(/\buserId\b/.test(window) && !/\bownerId\b/.test(window)).toBe(true);
  });
});
