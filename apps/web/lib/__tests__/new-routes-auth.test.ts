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
  it('GET /api/board gives a non-owner an empty roster, and unset WHINK_OWNER_EMAILS means nobody is owner', async () => {
    const { GET } = await import('../../app/api/board/route');
    delete process.env.WHINK_OWNER_EMAILS;
    expect((await (await GET()).json()).members).toEqual([]);
    process.env.WHINK_OWNER_EMAILS = 'someone.else@example.com';
    expect((await (await GET()).json()).members).toEqual([]);
    delete process.env.WHINK_OWNER_EMAILS;
  });
  it('GET /api/board returns members including pending ones with null email, to an owner', async () => {
    vi.resetModules();
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1', email: 'Victor@Example.com' } }) }));
    process.env.WHINK_OWNER_EMAILS = ' other@x.com, victor@example.com ';
    const { GET } = await import('../../app/api/board/route');
    const body = await (await GET()).json();
    delete process.env.WHINK_OWNER_EMAILS;
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

describe('body size is enforced while streaming', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
  });
  function endless(chunk: Uint8Array, state: { pulled: number }) {
    return new ReadableStream<Uint8Array>({ pull(c) { state.pulled++; c.enqueue(chunk); } });
  }
  it('readBodyCapped aborts an endless body without buffering it (no content-length)', async () => {
    const { readBodyCapped, BodyTooLargeError } = await import('../api-helpers');
    const state = { pulled: 0 };
    const req = new Request('http://localhost/x', { method: 'POST', body: endless(new Uint8Array(1024), state), duplex: 'half' } as RequestInit);
    await expect(readBodyCapped(req, 10 * 1024)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(state.pulled).toBeLessThan(40);
  });
  it('a lying content-length cannot bypass the cap, and a big declared length is refused up front', async () => {
    const { readBodyCapped } = await import('../api-helpers');
    const big = new Uint8Array(20_000);
    await expect(readBodyCapped(new Request('http://localhost/x', { method: 'POST', body: big, headers: { 'content-length': '5' } }), 10_000)).rejects.toThrow();
    await expect(readBodyCapped(new Request('http://localhost/x', { method: 'POST', body: 'a', headers: { 'content-length': '999999' } }), 10)).rejects.toThrow();
  });
  it('JSON route returns 413 for an oversized streamed body', async () => {
    const { POST } = await import('../../app/api/contacts/route');
    const state = { pulled: 0 };
    const res = await POST(new Request('http://localhost/api/contacts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: endless(new Uint8Array(4096), state), duplex: 'half' } as RequestInit));
    expect(res.status).toBe(413);
  });
  it('vCard import returns 413 for an endless streamed body', async () => {
    const { POST } = await import('../../app/api/contacts/import/route');
    const state = { pulled: 0 };
    const res = await POST(new Request('http://localhost/api/contacts/import', { method: 'POST', headers: { 'content-type': 'text/vcard' }, body: endless(new Uint8Array(65536), state), duplex: 'half' } as RequestInit));
    expect(res.status).toBe(413);
    expect(state.pulled).toBeLessThan(80);
  });
});
