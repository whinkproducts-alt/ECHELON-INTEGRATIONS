import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isModelAllowed, isModelNameShape, allowedModelSet, byokProviderFor, DEFAULT_SELECTABLE_MODELS } from '../model-policy';

describe('model policy', () => {
  it('allows the models the picker offers and refuses an unlisted one', () => {
    for (const m of DEFAULT_SELECTABLE_MODELS) expect(isModelAllowed(m, { hasOwnKey: false, env: {} })).toBe(true);
    expect(isModelAllowed('claude-opus-9-9-secret', { hasOwnKey: false, env: {} })).toBe(false);
  });

  it('every option in the chat screen model picker is on the default allow-list', () => {
    const src = readFileSync('app/dashboard/conversation/_components/conversation-surface.tsx', 'utf8');
    const block = src.slice(src.indexOf('const MODEL_OPTIONS'), src.indexOf('];', src.indexOf('const MODEL_OPTIONS')));
    const values = [...block.matchAll(/value:\s*'([^']*)'/g)].map((m) => m[1]).filter(Boolean);
    expect(values.length).toBeGreaterThan(3);
    for (const v of values) expect(DEFAULT_SELECTABLE_MODELS).toContain(v);
  });

  it('a user paying with their own key may use any model of that provider', () => {
    expect(isModelAllowed('claude-future-model', { hasOwnKey: true, env: {} })).toBe(true);
  });

  it('WHINK_ALLOWED_MODELS replaces the built-in list; DEFAULT_MODEL is added when no list is set', () => {
    expect(isModelAllowed('claude-sonnet-4-5', { hasOwnKey: false, env: { WHINK_ALLOWED_MODELS: 'gpt-4o' } })).toBe(false);
    expect(isModelAllowed('gpt-4o', { hasOwnKey: false, env: { WHINK_ALLOWED_MODELS: 'gpt-4o' } })).toBe(true);
    expect(allowedModelSet({ DEFAULT_MODEL: 'my-local:7b' }).has('my-local:7b')).toBe(true);
  });

  it('rejects odd shapes even with a key', () => {
    for (const bad of ['', ' x', 'a b', '../x', 'x'.repeat(101), '<script>', 'claude\nopus']) {
      expect(isModelNameShape(bad)).toBe(false);
      expect(isModelAllowed(bad, { hasOwnKey: true, env: {} })).toBe(false);
    }
    expect(isModelNameShape(42)).toBe(false);
  });

  it('maps model names to the provider whose stored key would pay', () => {
    expect(byokProviderFor('claude-sonnet-4-5')).toBe('anthropic');
    expect(byokProviderFor('gpt-4o')).toBe('openai');
    expect(byokProviderFor('llama3.1:8b')).toBeNull();
  });
});
