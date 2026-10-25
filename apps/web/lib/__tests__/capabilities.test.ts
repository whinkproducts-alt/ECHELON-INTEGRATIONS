import { describe, it, expect } from 'vitest';
import { CAPABILITY_CLASSES, capabilityClass } from '../permission-engine';

describe('registered capabilities', () => {
  it('connector_manage is Class B; message and call are Class C', () => {
    expect(capabilityClass('connector_manage')).toBe('B');
    expect(capabilityClass('contact_message')).toBe('C');
    expect(capabilityClass('contact_call')).toBe('C');
  });
  it('unregistered and prototype names are Class C', () => {
    for (const n of ['nope', '__proto__', 'constructor', 'toString']) expect(capabilityClass(n)).toBe('C');
  });
  it('the registry is frozen', () => {
    expect(Object.isFrozen(CAPABILITY_CLASSES)).toBe(true);
  });
});
