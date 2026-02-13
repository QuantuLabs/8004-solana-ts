import { describe, it, expect } from '@jest/globals';
import { toBigInt } from '../../src/core/utils.js';

describe('toBigInt', () => {
  it('should pass through native bigint', () => {
    expect(toBigInt(123n)).toBe(123n);
    expect(toBigInt(0n)).toBe(0n);
  });

  it('should convert number to bigint', () => {
    expect(toBigInt(42)).toBe(42n);
    expect(toBigInt(0)).toBe(0n);
  });

  it('should convert string to bigint', () => {
    expect(toBigInt('999')).toBe(999n);
    expect(toBigInt('0')).toBe(0n);
  });

  it('should convert BN-like object with toString', () => {
    const bn = { toString: () => '12345' };
    expect(toBigInt(bn)).toBe(12345n);
  });

  it('should throw on invalid BN-like toString', () => {
    const bad = { toString: () => 'not-a-number' };
    expect(() => toBigInt(bad, 'myField')).toThrow('Invalid numeric value for myField');
  });

  it('should throw on unsupported type', () => {
    expect(() => toBigInt(null as any, 'test')).toThrow('Invalid numeric value for test');
    expect(() => toBigInt(undefined as any)).toThrow('Invalid numeric value for unknown');
  });

  it('should use default field name when not provided', () => {
    const bad = { toString: () => 'abc' };
    expect(() => toBigInt(bad)).toThrow('Invalid numeric value for unknown');
  });
});
