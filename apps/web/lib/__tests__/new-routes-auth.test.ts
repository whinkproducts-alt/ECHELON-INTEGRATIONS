import { describe, it, expect, vi, beforeEach } from 'vitest';

const ctx = { params: Promise.resolve({ id: 'x' }) };
const req = (method = 'GET', body?: unknown) =>
  new Request('http://localhost/api/x', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

const routes: Array<[string, string, string]> = [
  ['@/app/api/board/route', 'GET', 'board'],
  ['@/app/api/board/meetings/route', 'GET', 'meetings list'],
  ['@/app/api/board/meetings/route', 'POST', 'meetings create'],
  ['@/app/api/board/meetings/[id]/minutes/route', 'POST', 'minutes'],
  ['@/app/api/connectors/route', 'GET', 'connectors'],
  ['@/app/api/connectors/[id]/install/route', 'POST', 'install'],
  ['@/app/api/connectors/[id]/install/route', 'DELETE', 'uninstall'],
  ['@/app/api/connectors/[id]/route', 'DELETE', 'uninstall alias'],
  ['@/app/api/connectors/manifest/validate/route', 'POST', 'validate'],
  ['@/app/api/usage/route', 'GET', 'usage'],
  ['@/app/api/usage/budget/route', 'PUT', 'budget'],
  ['@/app/api/contacts/route', 'GET', 'contacts list'],
  ['@/app/api/contacts/route', 'POST', 'contacts create'],
  ['@/app/api/contacts/[id]/route', 'PATCH', 'contact patch'],
  ['@/app/api/contacts/[id]/route', 'DELETE', 'contact delete'],
  ['@/app/api/contacts/import/route', 'POST', 'import'],
  ['@/app/api/contacts/[id]/message/route', 'POST', 'message'],
  ['@/app/api/contacts/[id]/call/route', 'POST', 'call'],
  ['@/app/api/security/status/route', 'GET', 'security status'],
];

describe('every new route requires a session', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@/auth', () => ({ auth: async () => null }));
  });
  for (const [mod, method, label] of routes) {
    it(`${method} ${label} -> 401`, async () => {
      const m = await import(/* @vite-ignore */ mod.replace('@/', '../../'));
      const res: Response = await m[method](req(method, method === 'GET' ? undefined : {}), ctx);
      expect(res.status).toBe(401);
    });
  }
});

describe('route behaviour with a session', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
  });
  it('GET /api/board returns members including pending ones with null email', async () => {
    const { GET } = await import('../../app/api/board/route');
    const body = await (await GET()).json();
    expect(body.members.length).toBe(6);
    expect(body.members.find((m: { id: string }) => m.id === 'dr-tinaye')).toMatchObject({ email: null, needsDetails: true });
  });
  it('manifest validate: 200 valid, 422 invalid licence, never executes anything', async () => {
    const { POST } = await import('../../app/api/connectors/manifest/validate/route');
    const ok = await POST(req('POST', { id: 'acme', name: 'Acme', version: '1.0.0', publisher: 'A', license: 'MIT', kind: 'mcp' }));
    expect(ok.status).toBe(200);
    const bad = await POST(req('POST', { id: 'acme', name: 'Acme', version: '1.0.0', publisher: 'A', license: 'AGPL-3.0', kind: 'mcp' }));
    expect(bad.status).toBe(422);
  });
  it('usage rejects an unknown range', async () => {
    const { GET } = await import('../../app/api/usage/route');
    expect((await GET(new Request('http://localhost/api/usage?range=999d'))).status).toBe(400);
  });
  it('JSON-only: wrong content type is 415', async () => {
    const { POST } = await import('../../app/api/contacts/route');
    const res = await POST(new Request('http://localhost/api/contacts', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }));
    expect(res.status).toBe(415);
  });
});
