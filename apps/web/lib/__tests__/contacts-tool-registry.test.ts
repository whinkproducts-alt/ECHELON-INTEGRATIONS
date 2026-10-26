import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('contact_message / contact_call in the tool registry', () => {
  const recordActionSafe = vi.fn();
  const recordAction = vi.fn();
  const checkPermission = vi.fn();
  const checkApprovedAction = vi.fn();
  const createApproval = vi.fn();
  const contactFindFirst = vi.fn();
  const updateMany = vi.fn();
  const sendToContact = vi.fn();
  const placeCall = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    for (const f of [recordActionSafe, recordAction]) f.mockReset().mockResolvedValue({ id: 'row1' });
    checkPermission.mockReset().mockResolvedValue({ allowed: false, method: 'requires_confirmation', reason: 'Class C' });
    checkApprovedAction.mockReset().mockResolvedValue({ allowed: true, method: 'human_approved' });
    createApproval.mockReset().mockResolvedValue({ id: 'ap1' });
    contactFindFirst.mockReset();
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    sendToContact.mockReset().mockResolvedValue({ sent: false, channel: 'SMS', reason: 'not_configured' });
    placeCall.mockReset().mockResolvedValue({ sent: false, channel: 'PHONE_CALL', reason: 'not_configured' });
    vi.doMock('@/lib/db', () => ({ prisma: { contact: { findFirst: contactFindFirst }, approvalRequest: { updateMany } } }));
    vi.doMock('@/lib/ledger', () => ({ recordAction, recordActionSafe, updateActionStatus: vi.fn().mockResolvedValue(true) }));
    vi.doMock('@/lib/permission-engine', () => ({ checkPermission, checkApprovedAction, logSecurityEvent: vi.fn() }));
    vi.doMock('@/lib/approvals', () => ({ createApproval }));
    vi.doMock('@/lib/comms/delivery', () => ({ sendToContact, placeCall }));
    vi.doMock('@/lib/openclaw-client', () => ({ isGatewayConfigured: () => false, listOpenClawTools: vi.fn(), callOpenClawTool: vi.fn() }));
  });

  const approved = { id: 'ap1', contentHash: 'h', correlationId: 'cid', persona: 'WHINK' };
  const contact = { id: 'c1', userId: 'u1', phone: '+14035550123', email: 'j@x.com', tags: [] };

  it('a direct call is Class C: queued as an approval, nothing sent', async () => {
    const { executeTool } = await import('../tool-registry');
    const res = await executeTool('u1', 'contact_message', { contactId: 'c1', channel: 'SMS', to: '+14035550123', body: 'hi' });
    expect(checkPermission.mock.calls[0][2]).toBe('C');
    expect(res.success).toBe(false);
    expect(res.approvalRequired).toBeTruthy();
    expect(sendToContact).not.toHaveBeenCalled();
  });

  it('after approval it re-reads the contact (scoped by user) and calls delivery once', async () => {
    contactFindFirst.mockResolvedValue(contact);
    const { executeApprovedTool } = await import('../tool-registry');
    const res = await executeApprovedTool('u1', { ...approved, tool: 'contact_message', params: { contactId: 'c1', channel: 'SMS', to: '+14035550123', body: 'hi' } });
    expect(contactFindFirst.mock.calls[0][0].where).toEqual({ id: 'c1', userId: 'u1' });
    expect(sendToContact).toHaveBeenCalledTimes(1);
    expect(sendToContact).toHaveBeenCalledWith({ userId: 'u1', channel: 'SMS', to: '+14035550123', body: 'hi' });
    expect(res.success).toBe(false); // stub: truthful, not sent
    expect(res.error).toContain('not_configured');
  });

  it('the ledger never receives the recipient number or the message text', async () => {
    contactFindFirst.mockResolvedValue(contact);
    const { executeApprovedTool } = await import('../tool-registry');
    await executeApprovedTool('u1', { ...approved, tool: 'contact_message', params: { contactId: 'c1', channel: 'SMS', to: '+14035550123', body: 'private strategy text' } });
    const written = JSON.stringify([...recordAction.mock.calls, ...recordActionSafe.mock.calls]);
    expect(written).not.toContain('+14035550123');
    expect(written).not.toContain('private strategy text');
  });

  it('if the contact destination changed since approval, nothing is sent', async () => {
    contactFindFirst.mockResolvedValue({ ...contact, phone: '+19995550000' });
    const { executeApprovedTool } = await import('../tool-registry');
    const res = await executeApprovedTool('u1', { ...approved, tool: 'contact_message', params: { contactId: 'c1', channel: 'SMS', to: '+14035550123', body: 'hi' } });
    expect(res.error).toMatch(/changed since approval/);
    expect(sendToContact).not.toHaveBeenCalled();
  });

  it("another user's contact id: not found, nothing sent", async () => {
    contactFindFirst.mockResolvedValue(null);
    const { executeApprovedTool } = await import('../tool-registry');
    const res = await executeApprovedTool('u2', { ...approved, tool: 'contact_call', params: { contactId: 'c1', to: '+14035550123' } });
    expect(res.error).toBe('Contact not found');
    expect(placeCall).not.toHaveBeenCalled();
  });

  it('the permission engine refusing the approval means nothing runs', async () => {
    checkApprovedAction.mockResolvedValue({ allowed: false, method: 'requires_confirmation', reason: 'Approved content hash mismatch' });
    const { executeApprovedTool } = await import('../tool-registry');
    const res = await executeApprovedTool('u1', { ...approved, tool: 'contact_call', params: { contactId: 'c1', to: '+14035550123' } });
    expect(res.success).toBe(false);
    expect(contactFindFirst).not.toHaveBeenCalled();
    expect(placeCall).not.toHaveBeenCalled();
  });
});
