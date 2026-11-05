import { vi } from 'vitest';

type Row = Record<string, any>;

function match(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return (v as { in: unknown[] }).in.includes(row[k]);
      return true;
    }
    return row[k] === v;
  });
}

function apply(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) row[k] = (row[k] ?? 0) + (v as { increment: number }).increment;
    else row[k] = v;
  }
}

/** Small in-memory stand-in for the four swarm tables, honouring the unique indexes. */
export function createSwarmFakeDb() {
  let seq = 0;
  const tables = { run: [] as Row[], task: [] as Row[], claim: [] as Row[], learning: [] as Row[] };
  const p2002 = () => Object.assign(new Error('unique'), { code: 'P2002' });
  const defaults: Record<string, Row> = {
    run: { status: 'PLANNED', tokensUsed: 0, cancelRequested: false, stopReason: null, result: null, startedAt: null, finishedAt: null, projectId: null, subsidiary: null },
    task: { status: 'PENDING', attempts: 0, output: null, error: null, tokensIn: 0, tokensOut: 0, startedAt: null, finishedAt: null, estimatedCalls: 1, claimOwner: null, heartbeatAt: null },
  };
  const sortDesc = (rows: Row[]) => rows.slice().sort((a, b) => b._seq - a._seq);
  const take = (rows: Row[], n?: number) => (n ? rows.slice(0, n) : rows);
  const mk = (name: keyof typeof tables, unique: string[][]) => ({
    create: vi.fn(async ({ data }: { data: Row }) => {
      for (const u of unique) if (tables[name].some((r) => u.every((k) => r[k] === data[k]))) throw p2002();
      const row = { id: data.id ?? `${name}-${++seq}`, ...(defaults[name] ?? {}), ...data, createdAt: new Date(), _seq: ++seq };
      tables[name].push(row);
      return row;
    }),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      for (const d of data) {
        for (const u of unique) if (tables[name].some((r) => u.every((k) => r[k] === d[k]))) throw p2002();
        tables[name].push({ id: `${name}-${++seq}`, ...(defaults[name] ?? {}), ...d, createdAt: new Date(), _seq: ++seq });
      }
      return { count: data.length };
    }),
    findFirst: vi.fn(async ({ where }: { where: Row }) => tables[name].find((r) => match(r, where)) ?? null),
    findMany: vi.fn(async ({ where, orderBy, take: n }: { where?: Row; orderBy?: Row; take?: number } = {}) => {
      let rows = tables[name].filter((r) => match(r, where));
      rows = orderBy && Object.values(orderBy)[0] === 'desc' ? sortDesc(rows) : rows.slice().sort((a, b) => a._seq - b._seq);
      return take(rows, n);
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const rows = tables[name].filter((r) => match(r, where));
      rows.forEach((r) => apply(r, data));
      return { count: rows.length };
    }),
    deleteMany: vi.fn(async ({ where }: { where: Row }) => {
      const keep = tables[name].filter((r) => !match(r, where));
      const count = tables[name].length - keep.length;
      tables[name] = keep;
      return { count };
    }),
  });
  const db: any = {
    swarmRun: mk('run', [['id']]),
    swarmTask: mk('task', [['runId', 'lane']]),
    swarmClaim: mk('claim', [['runId', 'lane']]),
    swarmLearning: mk('learning', [['runId', 'sha256']]),
    userProfile: { findUnique: vi.fn(async () => ({ autonomyLevel: 1 })) },
    delegation: { findFirst: vi.fn(async () => null) },
    project: { findFirst: vi.fn(async () => null) },
    userPreference: { findUnique: vi.fn(async () => null) },
    usageEvent: {
      aggregate: vi.fn(async () => ({ _sum: {} })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: Row }) => ({ id: `usage-${++seq}`, ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    accountSafetyState: { findUnique: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => ({ id: 'user' })) },
  };
  db.$transaction = vi.fn(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.$queryRaw = vi.fn(async () => [{ id: 'user' }]);
  db.reset = () => { (Object.keys(tables) as Array<keyof typeof tables>).forEach((k) => { tables[k] = []; }); seq = 0; };
  // Table accessors for assertions. Getters so reassignment inside deleteMany stays visible.
  Object.defineProperty(db, 'tables', { get: () => tables });
  return db;
}
