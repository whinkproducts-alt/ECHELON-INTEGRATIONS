import { test, expect } from '@playwright/test';
import { OWNER, loginAndWait, apiJson, unique } from './helpers';

type LedgerRow = { action: string; status: string; validationResult?: string | null };

test.describe('Class C approvals (protected action)', () => {
  test('message request creates a protected approval; approving by id is recorded in the ledger', async ({ page }) => {
    const contactName = unique('E2E Contact');
    await loginAndWait(page, OWNER.email);

    const made = await apiJson<{ contact: { id: string } }>(page, 'POST', '/api/contacts', { name: contactName, phone: '+14035550123' });
    expect(made.status).toBe(201);

    await page.goto('/dashboard/contacts');
    await page.getByRole('article', { name: contactName }).getByRole('button', { name: `Message ${contactName}` }).click();
    await page.getByLabel('Message', { exact: true }).fill('Hello from the e2e suite');
    await page.getByRole('button', { name: 'Request send approval' }).click();

    const card = page.getByRole('group', { name: /Approval request/ });
    await expect(card).toBeVisible();
    await expect(card.getByText(/^Protected/)).toBeVisible();
    await expect(card.getByText(/Expires in \d+s/)).toBeVisible();
    await expect(card.getByText('Hello from the e2e suite').first()).toBeVisible();

    // Approve by request id inside the 30 s window.
    const decided = page.waitForResponse((r) => /\/api\/approvals\/[^/]+\/decision$/.test(r.url()));
    await card.getByRole('button', { name: /^Approve/ }).click();
    const res = await decided;
    expect(res.status()).toBe(200);
    const outcome = (await res.json()) as { id: string; status: string };
    expect(['EXECUTED', 'FAILED']).toContain(outcome.status); // no delivery provider is configured in e2e: FAILED/not configured is expected, nothing is sent

    const ledger = await apiJson<LedgerRow[]>(page, 'GET', '/api/ledger?limit=200');
    const mine = ledger.json.filter((r) => (r.validationResult ?? '').includes(outcome.id));
    const actions = mine.map((r) => r.action);
    expect(actions).toContain('approval_created');
    expect(actions).toContain('approval_approved');
    expect(actions.some((a) => a === 'approval_executed' || a === 'approval_failed')).toBe(true);

    // Exactly once: a second approval of the same id does nothing.
    const again = await apiJson<{ status: string }>(page, 'POST', `/api/approvals/${outcome.id}/decision`, { decision: 'approve' });
    expect(again.status).toBe(200);
    expect(again.json.status).not.toBe('EXECUTED');
  });

  test('the "approve all" chat phrase approves nothing', async ({ page }) => {
    await loginAndWait(page, OWNER.email);
    const contact = await apiJson<{ contact: { id: string } }>(page, 'POST', '/api/contacts', { name: unique('E2E Pending'), phone: '+14035550124' });
    const req = await apiJson<{ approvalId: string }>(page, 'POST', `/api/contacts/${contact.json.contact.id}/message`, { channel: 'SMS', body: 'must not be sent' });
    expect(req.status).toBe(202);

    const conv = await apiJson<{ id: string }>(page, 'POST', '/api/conversations', { title: 'e2e approve-all' });
    expect(conv.status).toBe(200);
    const reply = await page.evaluate(async (cid) => {
      const r = await fetch(`/api/conversations/${cid}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'approve all' }),
      });
      return { status: r.status, text: await r.text() };
    }, conv.json.id);
    expect(reply.status).toBe(200);
    expect(reply.text).toContain('nothing was approved from chat');

    // The list only returns requests still waiting; the request is either still listed or has expired (30 s window). It was never approved or run (ledger check below).
    const pending = await apiJson<{ approvals: Array<{ id: string }> }>(page, 'GET', '/api/approvals');
    expect(pending.status).toBe(200);
    const ledger = await apiJson<LedgerRow[]>(page, 'GET', '/api/ledger?limit=200');
    const rows = ledger.json.filter((r) => (r.validationResult ?? '').includes(req.json.approvalId)).map((r) => r.action);
    expect(rows).not.toContain('approval_approved');
    expect(rows).not.toContain('approval_executed');
  });
});
