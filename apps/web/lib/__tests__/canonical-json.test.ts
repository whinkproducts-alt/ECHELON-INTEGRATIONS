import { describe, it, expect } from 'vitest';
import { canonicalJson, approvalContentHash } from '../canonical-json';

describe('canonicalJson strictness', () => {
  it('sorts keys recursively and accepts plain JSON values', () => {
    expect(canonicalJson({ b: [1, 'x', true, null], a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":[1,"x",true,null]}');
    expect(canonicalJson(Object.create(null))).toBe('{}');
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it('rejects Dates, Maps, Sets, class instances, functions, symbols, bigint', () => {
    class Foo { x = 1; }
    for (const v of [new Date(), new Map(), new Set(), new Foo(), () => 1, Symbol('s'), BigInt(1), /re/, new Uint8Array(1)]) {
      expect(() => canonicalJson(v)).toThrow(TypeError);
      expect(() => canonicalJson({ nested: [v] })).toThrow(TypeError);
    }
  });

  it('rejects undefined at the top level and inside arrays', () => {
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
    expect(() => canonicalJson([1, undefined])).toThrow(TypeError);
  });

  it('rejects non-finite numbers', () => {
    for (const n of [NaN, Infinity, -Infinity]) {
      expect(() => canonicalJson(n)).toThrow(TypeError);
      expect(() => canonicalJson({ a: [n] })).toThrow(TypeError);
    }
  });

  it('approvalContentHash throws on non-canonical params', () => {
    expect(() => approvalContentHash({ kind: 'tool_call', tool: 't', params: { when: new Date() } })).toThrow(TypeError);
  });
});
