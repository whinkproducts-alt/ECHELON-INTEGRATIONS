import { vi } from 'vitest';

type Fn = ReturnType<typeof vi.fn>;
const models = new Map<string, Map<string, Fn>>();

/** Auto-mocking Prisma stand-in: db.<model>.<method> is a cached vi.fn(). Tests set return values. */
export const db: any = new Proxy({}, {
  get(_t, model: string) {
    if (model === 'then') return undefined;
    if (!models.has(model)) models.set(model, new Map());
    const methods = models.get(model)!;
    return new Proxy({}, {
      get(_m, method: string) {
        if (!methods.has(method)) methods.set(method, vi.fn());
        return methods.get(method)!;
      },
    });
  },
});

export function resetDb(): void {
  for (const methods of models.values()) for (const fn of methods.values()) fn.mockReset();
  db.userProfile.findUnique.mockResolvedValue({ autonomyLevel: 1 });
  db.delegation.findFirst.mockResolvedValue(null);
}
