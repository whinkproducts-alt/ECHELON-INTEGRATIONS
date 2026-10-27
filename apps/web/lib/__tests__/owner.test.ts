import { describe, it, expect } from 'vitest';
import { isOwnerEmail, ownerEmails } from '../owner';

describe('owner accounts', () => {
  it('unset or empty means nobody', () => {
    expect(isOwnerEmail('a@b.co', {})).toBe(false);
    expect(isOwnerEmail('a@b.co', { WHINK_OWNER_EMAILS: ' , ' })).toBe(false);
  });
  it('exact, case-insensitive match only', () => {
    const env = { WHINK_OWNER_EMAILS: 'Victor@whinkgroup.com, b@c.co' };
    expect(isOwnerEmail('victor@WHINKGROUP.com', env)).toBe(true);
    expect(isOwnerEmail('b@c.co', env)).toBe(true);
    expect(isOwnerEmail('evil+victor@whinkgroup.com', env)).toBe(false);
    expect(isOwnerEmail('victor@whinkgroup.com.evil.io', env)).toBe(false);
    expect(isOwnerEmail(null, env)).toBe(false);
    expect(ownerEmails(env).size).toBe(2);
  });
});
