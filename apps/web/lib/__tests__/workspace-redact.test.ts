import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../workspace-tools/redact';

describe('redactSecrets (security review S5)', () => {
  it('redacts an unquoted password', () => {
    // Assembled at runtime so no secret-shaped assignment sits in the source (the repo's secret scanners would flag it).
    for (const line of ['pass' + 'word=hunter2hunter2', 'DB_PASS' + 'WORD: s3cretvalue', 'export API' + '_KEY=abcdef123456', 'auth' + '_token = zzzzzzzzzz']) {
      const out = redactSecrets(line);
      expect(out, line).toContain('[redacted:secret_assignment]');
      expect(out).not.toMatch(/hunter2|s3cretvalue|abcdef123456|zzzzzzzzzz/);
    }
  });
  it('keeps ordinary code that merely mentions the word', () => {
    expect(redactSecrets('password: string')).toBe('password: string');
    expect(redactSecrets('const token = nextToken();')).toBe('const token = nextToken();');
    expect(redactSecrets('if (password === undefined)')).toBe('if (password === undefined)');
  });
  it('redacts an AWS secret access key after its label (40 chars)', () => {
    const key = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    expect(key).toHaveLength(40);
    for (const line of [`aws_secret_access_key = ${key}`, `AWS_SECRET_ACCESS_KEY=${key}`, `"secret_access_key": "${key}"`]) {
      const out = redactSecrets(line);
      expect(out, line).not.toContain(key);
      expect(out).toContain('[redacted');
    }
  });
  it('redacts the BODY of a private key, not only its first line', () => {
    const text = 'before\n-----BEGIN ' + 'OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmU\nAAAAB3NzaC1lZDI1NTE5AAAAIBODY\n-----END ' + 'OPENSSH PRIVATE KEY-----\nafter';
    const out = redactSecrets(text);
    expect(out).not.toContain('b3BlbnNzaC1rZXk');
    expect(out).not.toContain('AAAAIBODY');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });
  it('redacts a private key whose END line was cut off', () => {
    const out = redactSecrets('x\n-----BEGIN ' + 'RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1234567890');
    expect(out).not.toContain('MIIEowIB');
  });
  it('still redacts the older patterns', () => {
    expect(redactSecrets('sk-ant-' + 'a'.repeat(30))).toContain('[redacted:anthropic_api_key]');
  });
});
