import { describe, it, expect } from 'vitest';
import {
  SLASH_COMMANDS, filterCommands, isSlashMenuOpen, handleMenuKey, commandInsertText, moveIndex,
  starterRequests, sanitizePromptParam, PROMPT_PARAM_MAX, promptHref, readOptionsFlag, writeOptionsFlag,
} from '@/components/screens/conversation-helpers/slash-commands';

const labels = { productName: 'Acme', opponentLabel: null };

describe('slash menu', () => {
  it('opens only for a slash token and filters by prefix', () => {
    expect(isSlashMenuOpen('hello')).toBe(false);
    expect(isSlashMenuOpen('/')).toBe(true);
    expect(filterCommands('/')).toHaveLength(SLASH_COMMANDS.length);
    expect(filterCommands('/b').map((c) => c.name)).toEqual(['brief']);
    expect(filterCommands('/pla').map((c) => c.name)).toEqual(['plan']);
    expect(filterCommands('/p').map((c) => c.name)).toEqual(['peter', 'paul', 'plan']);
    expect(filterCommands('/zzz')).toEqual([]);
    expect(isSlashMenuOpen('/brief ')).toBe(false);
    expect(isSlashMenuOpen('/brief')).toBe(false);
  });
  it('keyboard: arrows wrap, Enter and Tab select, Escape dismisses', () => {
    expect(handleMenuKey('ArrowDown', 7, 8)).toEqual({ kind: 'move', index: 0 });
    expect(handleMenuKey('ArrowUp', 0, 8)).toEqual({ kind: 'move', index: 7 });
    expect(handleMenuKey('Enter', 2, 6)).toEqual({ kind: 'select', index: 2 });
    expect(handleMenuKey('Tab', 1, 6)).toEqual({ kind: 'select', index: 1 });
    expect(handleMenuKey('Escape', 0, 6)).toEqual({ kind: 'dismiss' });
    expect(handleMenuKey('a', 0, 6)).toEqual({ kind: 'none' });
    expect(handleMenuKey('Enter', 0, 0)).toEqual({ kind: 'none' });
    expect(moveIndex(0, -1, 0)).toBe(0);
  });
  it('selecting inserts the command with a trailing space and never sends', () => {
    expect(commandInsertText(SLASH_COMMANDS.find((c) => c.name === 'brief')!)).toBe('/brief ');
  });
  it('descriptions use tenant labels, no hardcoded mind name', () => {
    const mamba = SLASH_COMMANDS.find((c) => c.name === 'mamba')!;
    expect(mamba.describe(labels)).not.toMatch(/mamba/i);
    expect(mamba.describe({ ...labels, opponentLabel: 'Obsidian' })).toContain('Obsidian');
    expect(SLASH_COMMANDS.find((c) => c.name === 'whink')!.describe(labels)).toContain('Acme');
    expect(SLASH_COMMANDS.find((c) => c.name === 'peter')!.describe(labels)).toMatch(/reverse engineer/i);
    expect(SLASH_COMMANDS.find((c) => c.name === 'paul')!.describe(labels)).toMatch(/reconstruction engineer/i);
  });
});

describe('starters and prompt param', () => {
  it('has four starters and the fourth uses tenant wording', () => {
    expect(starterRequests(null)).toHaveLength(4);
    expect(starterRequests('Obsidian')[3].prompt).toContain('Obsidian');
    expect(starterRequests(null)[3].prompt).not.toMatch(/mamba/i);
  });
  it('caps and cleans ?prompt= as text', () => {
    expect(sanitizePromptParam('a'.repeat(1000))).toHaveLength(PROMPT_PARAM_MAX);
    expect(sanitizePromptParam(['first', 'second'])).toBe('first');
    expect(sanitizePromptParam(undefined)).toBe('');
    expect(sanitizePromptParam('hi\u0000\u0007there')).toBe('hi  there');
    expect(sanitizePromptParam('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });
  it('promptHref encodes and caps', () => {
    expect(promptHref('a b&c=d')).toBe('/dashboard/conversation?prompt=a%20b%26c%3Dd');
    expect(decodeURIComponent(promptHref('x'.repeat(999)).split('=')[1])).toHaveLength(PROMPT_PARAM_MAX);
  });
});

describe('options flag', () => {
  it('survives missing or throwing storage', () => {
    const throwing = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    expect(readOptionsFlag(null)).toBe(false);
    expect(readOptionsFlag(throwing)).toBe(false);
    expect(() => writeOptionsFlag(throwing)).not.toThrow();
    const m = new Map<string, string>();
    const mem = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(readOptionsFlag(mem)).toBe(false);
    writeOptionsFlag(mem);
    expect(readOptionsFlag(mem)).toBe(true);
  });
});
