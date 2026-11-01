import { describe, it, expect } from 'vitest';
import config from '@/config/tool-classes.json';
import { sanitiseToolDefinition, defHash } from '@/lib/tool-definition';

// Definition of ref__echo as advertised by the reference MCP server (captured from the local gateway).
const echo = {
  description: 'Echoes back the input string',
  inputSchema: { type: 'object', properties: { message: { type: 'string', description: 'Message to echo' } }, required: ['message'] },
};

describe('config/tool-classes.json', () => {
  it('openclaw__ref__echo is Class A bound to the sanitised definition hash', () => {
    const s = sanitiseToolDefinition(echo);
    expect(s.ok).toBe(true);
    if (s.ok) expect((config as unknown as Record<string, { class: string; defHash: string }>).openclaw__ref__echo).toEqual({ class: 'A', defHash: defHash(s.definition) });
  });
});
