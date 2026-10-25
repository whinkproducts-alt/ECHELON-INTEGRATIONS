import { describe, it, expect } from 'vitest';
import { classifyProtected, protectedCapabilities, PROTECTED_REGISTRY, LOCAL_SAFE_REGISTRY } from '@/lib/protected-actions';

const cls = (toolName: string, extra: { description?: string; params?: unknown } = {}) =>
  classifyProtected({ toolName, capability: toolName, ...extra });

describe('classifyProtected: tool name table', () => {
  it.each([
    // protected: explicit registry
    ['contact_message', 'proprietary'],
    ['contact_call', 'proprietary'],
    ['sms_briefing_send', 'proprietary'],
    ['social_schedule_post', 'proprietary'],
    ['openclaw__x__post', 'proprietary'],
    ['openclaw__x__reply', 'proprietary'],
    ['openclaw__x__send_dm', 'proprietary'],
    ['openclaw__x__follow', 'proprietary'],
    ['openclaw__x__unfollow', 'proprietary'],
    ['openclaw__x__delete_post', 'proprietary'],
    ['openclaw__instagram__publish_post', 'proprietary'],
    ['openclaw__instagram__reply_comment', 'proprietary'],
    ['openclaw__tiktok__publish_video', 'proprietary'],
    ['email_send', 'proprietary'],
    ['stripe_refund', 'money'],
    // protected: keyword rules on unknown names
    ['bank_transfer', 'money'],
    ['wire_funds', 'money'],
    ['pay_invoice', 'money'],
    ['create_payout', 'money'],
    ['withdraw_crypto', 'money'],
    ['whink_trades_execute_trade', 'money'],
    ['place_order', 'money'],
    ['update_bank_details', 'money'],
    ['change_payment_method', 'money'],
    ['buyShares', 'money'],
    ['share_document', 'proprietary'],
    ['export_ledger', 'proprietary'],
    ['publish_report', 'proprietary'],
    ['forward_message', 'proprietary'],
    ['upload_to_dropbox', 'proprietary'],
    ['post_comment', 'proprietary'],
    ['openclaw__slack__chat_post', 'proprietary'],
    ['openclaw__github__create_issue', 'proprietary'],
    ['openclaw__acme__send_report', 'proprietary'],
  ])('%s is protected (%s)', (name, category) => {
    const r = cls(name);
    expect(r.protected).toBe(true);
    expect(r.category).toBe(category);
    expect(r.reason).toBeTruthy();
  });

  it.each([
    'calendar_list', 'memory_read', 'memory_write', 'web_search', 'note_write', 'task_create', 'entity_create',
    'document_search', 'document_upload', 'document_delete', 'project_create', 'contact_create',
    'memory_auto_write_sensitive', 'connector_manage', 'gesture_request_brief', 'usage_budget_set',
    'openclaw__ref__echo', 'openclaw__x__read_home_timeline', 'openclaw__x__read_mentions', 'openclaw__x__read_dms',
    'openclaw__instagram__read_comments', 'openclaw__tiktok__read_videos', 'openclaw__github__get_issue',
    'payments_read', 'email_read', 'list_invoices', 'get_order_status', 'search_trades',
    'summarise_notes', 'compute_totals',
  ])('%s is NOT protected', (name) => {
    expect(cls(name).protected).toBe(false);
  });

  it('document upload and delete go to the user\'s own recall workspace, so they stay unprotected', () => {
    expect(cls('document_upload').protected).toBe(false);
    expect(cls('document_delete').protected).toBe(false);
  });

  it('matches whole words only', () => {
    expect(cls('spaying_unit').protected).toBe(false);
    expect(cls('transferable_skills_list').protected).toBe(false);
    expect(cls('shared').protected).toBe(false);
  });

  it('judges the capability when the tool name is absent or different', () => {
    expect(classifyProtected({ capability: 'stripe_refund' }).protected).toBe(true);
    expect(classifyProtected({ toolName: 'memory_read', capability: 'email_send' }).protected).toBe(true);
    expect(classifyProtected({}).protected).toBe(false);
  });

  it('a description can protect an unknown tool, but not a read-named one or a local tool', () => {
    expect(cls('do_thing', { description: 'Wire money to a supplier' }).protected).toBe(true);
    expect(cls('do_thing', { description: 'Send the report to a recipient' }).category).toBe('proprietary');
    expect(cls('do_thing', { description: 'Counts rows in a table' }).protected).toBe(false);
    expect(cls('list_things', { description: 'Lists items you can send later' }).protected).toBe(false);
    expect(cls('memory_read', { description: 'send everything' }).protected).toBe(false);
  });

  it('parameter key names can protect an unknown tool', () => {
    expect(cls('do_thing', { params: { amount: 5000, currency: 'CAD', iban: 'x' } }).category).toBe('money');
    expect(cls('do_thing', { params: { recipient: 'a@b.c' } }).category).toBe('proprietary');
    expect(cls('do_thing', { params: { title: 'x' } }).protected).toBe(false);
    expect(cls('memory_write', { params: { amount: 1 } }).protected).toBe(false);
  });

  it('the two registries do not overlap', () => {
    for (const k of Object.keys(PROTECTED_REGISTRY)) expect(LOCAL_SAFE_REGISTRY.has(k)).toBe(false);
  });

  it('protectedCapabilities lists only the protected ones', () => {
    expect(protectedCapabilities(['email_read', 'email_send', 'calendar_read']).map((p) => p.capability)).toEqual(['email_send']);
  });
});
