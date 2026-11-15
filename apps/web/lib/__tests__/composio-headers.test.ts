import { describe, it, expect } from 'vitest';
import { credentialHeaders } from '@/lib/capability/mcp-http';

describe('provider credential headers', () => {
  it('Composio Connect gets its own header and no bearer token', () => {
    expect(credentialHeaders('https://connect.composio.dev/mcp', 'ck_123')).toEqual({ 'x-consumer-api-key': 'ck_123' });
  });
  it('any other provider, including a look-alike host, gets a standard bearer token', () => {
    expect(credentialHeaders('https://example.com/mcp', 'k')).toEqual({ Authorization: 'Bearer k' });
    expect(credentialHeaders('https://connect.composio.dev.evil.test/mcp', 'k')).toEqual({ Authorization: 'Bearer k' });
    expect(credentialHeaders('https://evil.test/connect.composio.dev', 'k')).toEqual({ Authorization: 'Bearer k' });
  });
  it('no credential means no auth header at all', () => {
    expect(credentialHeaders('https://connect.composio.dev/mcp', null)).toEqual({});
    expect(credentialHeaders('http://localhost:3100/mcp', '')).toEqual({});
  });
});
