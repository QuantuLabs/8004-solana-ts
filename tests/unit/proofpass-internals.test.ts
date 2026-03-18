import { describe, expect, it } from '@jest/globals';

import { hashProofPassContextRef } from '../../src/extras/internal/proofpass-internals.js';

describe('proofpass requester-driven internals', () => {
  it('keeps contextRef hashing stable for identical inputs', () => {
    const first = hashProofPassContextRef('x402:proofpass:stable');
    const second = hashProofPassContextRef('x402:proofpass:stable');
    expect(first.equals(second)).toBe(true);
  });

  it('changes contextRef hash when the input changes', () => {
    const first = hashProofPassContextRef('x402:proofpass:stable');
    const second = hashProofPassContextRef('x402:proofpass:other');
    expect(first.equals(second)).toBe(false);
  });
});
