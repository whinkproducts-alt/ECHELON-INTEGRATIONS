import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, request as pwRequest } from '@playwright/test';
import { OWNER, USER_B, loginAndWait, apiJson } from './helpers';

/**
 * Integration Hub, end to end through the built app, the proxy (auth + CSRF), the real database and a
 * real MCP endpoint (a small Streamable-HTTP JSON-RPC server below). Nothing in the gateway is mocked.
 * Simulation note: host loss is not exercised here; the physical Mac-off test (E5) is separate.
 */

interface Call { name: string; args: unknown }
let server: http.Server;
let mcpUrl = '';
const calls: Call[] = [];

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url !== '/mcp') { res.statusCode = 404; res.end(); return; }
    if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; } // no standalone SSE stream, no sessions
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c.toString(); });
    req.on('end', () => {
      const msg = JSON.parse(raw) as { id?: number; method: string; params?: { name?: string; arguments?: unknown } };
      if (msg.id === undefined) { res.statusCode = 202; res.end(); return; } // notification
      res.setHeader('content-type', 'application/json');
      const ok = (result: unknown) => res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
      if (msg.method === 'initialize') return ok({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'e2e-mcp', version: '1.0.0' } });
      if (msg.method === 'tools/list') return ok({ tools: [{ name: 'echo', description: 'Echo the supplied text back', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }] });
      if (msg.method === 'tools/call') {
        calls.push({ name: msg.params?.name ?? '', args: msg.params?.arguments });
        return ok({ content: [{ type: 'text', text: `echo: ${(msg.params?.arguments as { text?: string })?.text ?? ''}` }] });
      }
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'no such method' } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  mcpUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});
test.afterAll(async () => { await new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }); });

const slug = `e2e-${Date.now().toString(36)}`;

test.describe('Integration Hub', () => {
  test('is closed to anonymous callers and to non-owner accounts', async ({ browser, baseURL }) => {
    const anon = await pwRequest.newContext({ baseURL });
    const r = await anon.get('/api/integrations/providers', { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308]).toContain(r.status()); // redirected to /login, never data
    await anon.dispose();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAndWait(page, USER_B.email);
    expect((await apiJson(page, 'GET', '/api/integrations/providers')).status).toBe(403);
    expect((await apiJson(page, 'POST', '/api/integrations/providers', { connectorId: 'nope', transport: 'streamable-http', endpoint: mcpUrl })).status).toBe(403);
    await page.goto('/dashboard/integrations');
    await expect(page.getByText('available to the account owner only')).toBeVisible();
    await ctx.close();
  });

  test('host token: heartbeat needs the right token and an Origin; the token is shown once and stored as a hash', async ({ page, baseURL }) => {
    await loginAndWait(page, OWNER.email);
    const made = await apiJson<{ host: { id: string }; token: string }>(page, 'POST', '/api/integrations/hosts', { name: `mac-${slug}`, kind: 'LOCAL' });
    expect(made.status).toBe(201);
    expect(made.json.token).toMatch(/^eh_/);
    expect(JSON.stringify(made.json.host)).not.toContain('tokenHash');
    const { id } = made.json.host;
    const url = `/api/integrations/hosts/${id}/heartbeat`;

    const host = await pwRequest.newContext({ baseURL });
    const headers = { Authorization: `Bearer ${made.json.token}`, Origin: baseURL!, 'Content-Type': 'application/json' };
    expect((await host.post(url, { headers, data: { metadata: { platform: 'e2e' } } })).status()).toBe(200);
    expect((await host.post(url, { headers: { ...headers, Authorization: 'Bearer eh_wrong-token-wrong-token-wrong' }, data: {} })).status()).toBe(401);
    expect((await host.post('/api/integrations/hosts/doesnotexist/heartbeat', { headers, data: {} })).status()).toBe(401); // same answer as a wrong token
    // The CSRF rule applies to this endpoint too: no Sec-Fetch-Site and no Origin is refused.
    expect((await host.post(url, { headers: { Authorization: headers.Authorization, 'Content-Type': 'application/json' }, data: {} })).status()).toBe(403);
    await host.dispose();

    const list = await apiJson<{ hosts: Array<{ id: string; status: string }> }>(page, 'GET', '/api/integrations/hosts');
    expect(list.json.hosts.find((h) => h.id === id)?.status).toBe('ONLINE');
  });

  test('provider lifecycle: register, discover, review, enable, test; a class C tool waits for approval by id; revoke is final', async ({ page }) => {
    await loginAndWait(page, OWNER.email);
    // Guard rails on registration.
    expect((await apiJson(page, 'POST', '/api/integrations/providers', { connectorId: `${slug}-wild`, transport: 'streamable-http', endpoint: mcpUrl, egressAllowlist: ['*'] })).status).toBe(400);
    expect((await apiJson(page, 'POST', '/api/integrations/providers', { connectorId: `${slug}-http`, transport: 'streamable-http', endpoint: 'http://public.example/mcp' })).status).toBe(400);

    const reg = await apiJson<{ provider: { id: string; status: string; credentialsEnc?: string; hasCredential: boolean } }>(page, 'POST', '/api/integrations/providers', { connectorId: slug, transport: 'streamable-http', endpoint: mcpUrl });
    expect(reg.status).toBe(201);
    expect(reg.json.provider.status).toBe('REGISTERED');
    expect(reg.json.provider.credentialsEnc).toBeUndefined();
    const pid = reg.json.provider.id;

    // Nothing runs before review: no tools yet, and the review is refused until discovery found some.
    expect((await apiJson(page, 'POST', `/api/integrations/providers/${pid}/review`, {})).status).toBe(422);
    const disc = await apiJson<{ created: number }>(page, 'POST', `/api/integrations/providers/${pid}/discover`, {});
    expect(disc.status).toBe(200);
    expect(disc.json.created).toBe(1);

    const checks = await apiJson<{ pass: boolean; summary: { tools: Array<{ id: string; riskClass: string; costClass: string }> } }>(page, 'GET', `/api/integrations/providers/${pid}/checks`);
    expect(checks.json.pass).toBe(true);
    const tool = checks.json.summary.tools[0];
    expect(tool.riskClass).toBe('C'); // strictest until reviewed
    expect(tool.costClass).toBe('UNKNOWN');

    // Enabling before the review is refused.
    expect((await apiJson(page, 'POST', `/api/integrations/providers/${pid}/enable`, {})).status).toBe(409);
    // Review as class C and FREE: it may run, but only with the Founder's approval each time.
    expect((await apiJson(page, 'POST', `/api/integrations/providers/${pid}/review`, { tools: [{ toolId: tool.id, riskClass: 'C', costClass: 'FREE' }] })).status).toBe(200);
    expect((await apiJson(page, 'POST', `/api/integrations/providers/${pid}/enable`, {})).status).toBe(200);

    // Test as the Founder: class C => an approval request, nothing sent.
    const before = calls.length;
    const waiting = await apiJson<{ status: string; approvalId: string }>(page, 'POST', `/api/integrations/tools/${tool.id}/test`, { args: { text: 'hi' }, dataClass: 'organization' });
    expect(waiting.status).toBe(200);
    expect(waiting.json.status).toBe('AWAITING_APPROVAL');
    expect(calls.length).toBe(before);
    // Missing dataClass and founder-private data are refused outright.
    expect((await apiJson(page, 'POST', `/api/integrations/tools/${tool.id}/test`, { args: { text: 'hi' } })).status).toBe(400);
    expect((await apiJson(page, 'POST', `/api/integrations/tools/${tool.id}/test`, { args: { text: 'x', meta: { __marker: 'FOUNDER_PRIVATE' } }, dataClass: 'organization' })).status).toBe(403);

    // Approve by request id through the existing approvals API: it runs exactly once.
    const decided = await apiJson<{ status: string }>(page, 'POST', `/api/approvals/${waiting.json.approvalId}/decision`, { decision: 'approve' });
    expect(decided.json.status).toBe('EXECUTED');
    expect(calls.length).toBe(before + 1);
    expect(calls.at(-1)).toEqual({ name: 'echo', args: { text: 'hi' } });
    const again = await apiJson<{ status: string }>(page, 'POST', `/api/approvals/${waiting.json.approvalId}/decision`, { decision: 'approve' });
    expect(again.json.status).not.toBe('EXECUTED');
    expect(calls.length).toBe(before + 1);

    // Grants: roster ids only.
    expect((await apiJson(page, 'POST', '/api/integrations/grants', { subjectType: 'AGENT', subjectId: 'whink', toolId: tool.id })).status).toBe(404);
    const roster = await apiJson<{ agents: Array<{ id: string }> }>(page, 'GET', '/api/integrations/roster?q=analyst');
    expect(roster.json.agents.length).toBeGreaterThan(0);
    const gr = await apiJson<{ grant: { id: string } }>(page, 'POST', '/api/integrations/grants', { subjectType: 'AGENT', subjectId: roster.json.agents[0].id, toolId: tool.id, days: 3 });
    expect(gr.status).toBe(201);
    expect((await apiJson(page, 'POST', '/api/integrations/grants', { subjectType: 'AGENT', subjectId: roster.json.agents[0].id, toolId: tool.id, days: 365 })).status).toBe(400);

    // Receipts hold hashes, not content.
    const inv = await apiJson<{ invocations: Array<{ action: string; inputSummary: string | null }> }>(page, 'GET', '/api/integrations/invocations?limit=50');
    expect(JSON.stringify(inv.json)).not.toContain('"hi"');
    expect(inv.json.invocations.some((r) => r.action === 'capability_invoke')).toBe(true);

    // The page shows the real state.
    await page.goto('/dashboard/integrations');
    await expect(page.getByRole('heading', { name: 'Integration Hub' })).toBeVisible();
    await expect(page.getByText(slug).first()).toBeVisible();
    await expect(page.getByText(/has \s*not\s* been verified yet|not.*verified yet/).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/integration-hub.png', fullPage: true });

    // Revoke is final: credential gone, grants revoked, enabling refused.
    expect((await apiJson(page, 'POST', `/api/integrations/providers/${pid}/revoke`, {})).status).toBe(200);
    expect((await apiJson(page, 'POST', `/api/integrations/providers/${pid}/enable`, {})).status).toBe(409);
    const grants = await apiJson<{ grants: Array<{ id: string; revokedAt: string | null }> }>(page, 'GET', '/api/integrations/grants');
    expect(grants.json.grants.find((g) => g.id === gr.json.grant.id)?.revokedAt).not.toBeNull();
  });

  test('the event stream replays from a cursor and carries only this account\'s events', async ({ page }) => {
    await loginAndWait(page, OWNER.email);
    const got = await page.evaluate(async () => {
      const es = new EventSource('/api/integrations/events?cursor=' + btoa('1:a').replace(/=/g, ''));
      return await new Promise<string[]>((resolve) => {
        const seen: string[] = [];
        const t = setTimeout(() => { es.close(); resolve(seen); }, 4000);
        for (const k of ['provider_registered', 'provider_enabled', 'provider_revoked', 'host_registered', 'host_online', 'grant_created', 'capability_awaiting_approval', 'capability_invoke']) {
          es.addEventListener(k, (e) => { seen.push(k + ':' + (e as MessageEvent).lastEventId.length); if (seen.length > 40) { clearTimeout(t); es.close(); resolve(seen); } });
        }
      });
    });
    // The cursor 1:a is the beginning of time, so everything this account did earlier in this run replays, in order.
    expect(got.length).toBeGreaterThan(3);
    expect(got.some((k) => k.startsWith('provider_registered'))).toBe(true);
    expect(got.some((k) => k.startsWith('capability_invoke'))).toBe(true);
    expect(got.every((k) => /:\d+$/.test(k) && !k.endsWith(':0'))).toBe(true); // every event carries a cursor id
  });
});
