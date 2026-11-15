import { describe, expect, it } from 'vitest';
import { classifyCommand, explainSandbox, sandboxDockerArgs } from '@/lib/exec-policy';

const allow = ['ls', 'cat', 'git'];
describe('classifyCommand', () => {
  it('is Class C for everything when the allow-list is empty', () => {
    expect(classifyCommand(['ls', '-la'], []).class).toBe('C');
  });
  it('is Class B for an allow-listed program with plain arguments', () => {
    expect(classifyCommand(['ls', '-la', 'docs'], allow).class).toBe('B');
    expect(classifyCommand(['git', 'log', '--oneline'], allow).class).toBe('B');
  });
  it('is Class C for paths, shell characters, writes and unlisted programs', () => {
    for (const argv of [['/bin/ls'], ['rm', 'x'], ['ls', ';rm'], ['cat', 'a|b'], ['cat', '$(id)'], ['ls', '>x'], ['git', '-o'], ['ls', '`id`'], ['ls', '*'], []])
      expect(classifyCommand(argv, allow).class, argv.join(' ')).toBe('C');
  });
});
describe('sandboxDockerArgs', () => {
  it('is locked down by default: no network, no workspace, read-only, no capabilities', () => {
    const a = sandboxDockerArgs({ image: 'alpine:3.20' }, ['ls']);
    expect(a).toEqual(expect.arrayContaining(['--read-only', '--cap-drop', 'ALL', '--network', 'none']));
    expect(a).not.toContain('-v');
    expect(a.slice(-2)).toEqual(['alpine:3.20', 'ls']);
  });
  it('mounts the workspace only when asked and rejects unsafe paths and images', () => {
    expect(sandboxDockerArgs({ image: 'alpine', workspace: '/w', workspaceAccess: 'ro' }, ['ls'])).toContain('/w:/workspace:ro');
    expect(() => sandboxDockerArgs({ image: 'alpine', workspaceAccess: 'rw' }, ['ls'])).toThrow();
    expect(() => sandboxDockerArgs({ image: 'alpine', workspace: '/a:/etc', workspaceAccess: 'rw' }, ['ls'])).toThrow();
    expect(() => sandboxDockerArgs({ image: 'alpine --privileged' }, ['ls'])).toThrow();
  });
  it('explains itself in plain words', () => {
    expect(explainSandbox({ image: 'alpine' }).join(' ')).toContain('network: off');
  });
});
