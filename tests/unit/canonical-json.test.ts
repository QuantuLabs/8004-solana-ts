import { describe, it, expect } from '@jest/globals';
import { canonicalizeJson } from '../../src/utils/canonical-json.js';

describe('canonicalizeJson', () => {
  it('should handle null', () => {
    expect(canonicalizeJson(null)).toBe('null');
  });

  it('should handle strings', () => {
    expect(canonicalizeJson('hello')).toBe('"hello"');
    expect(canonicalizeJson('')).toBe('""');
  });

  it('should handle numbers', () => {
    expect(canonicalizeJson(42)).toBe('42');
    expect(canonicalizeJson(0)).toBe('0');
    expect(canonicalizeJson(-1.5)).toBe('-1.5');
  });

  it('should throw on non-finite numbers', () => {
    expect(() => canonicalizeJson(Infinity)).toThrow('Non-finite');
    expect(() => canonicalizeJson(-Infinity)).toThrow('Non-finite');
    expect(() => canonicalizeJson(NaN)).toThrow('Non-finite');
  });

  it('should handle booleans', () => {
    expect(canonicalizeJson(true)).toBe('true');
    expect(canonicalizeJson(false)).toBe('false');
  });

  it('should handle arrays', () => {
    expect(canonicalizeJson([1, 2, 3])).toBe('[1,2,3]');
    expect(canonicalizeJson([])).toBe('[]');
    expect(canonicalizeJson([null, 'a', true])).toBe('[null,"a",true]');
  });

  it('should sort object keys (RFC 8785)', () => {
    expect(canonicalizeJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalizeJson({ z: 'last', a: 'first', m: 'mid' })).toBe(
      '{"a":"first","m":"mid","z":"last"}'
    );
  });

  it('should handle nested objects', () => {
    const input = { b: { d: 4, c: 3 }, a: 1 };
    expect(canonicalizeJson(input)).toBe('{"a":1,"b":{"c":3,"d":4}}');
  });

  it('should handle nested arrays in objects', () => {
    expect(canonicalizeJson({ arr: [1, 2] })).toBe('{"arr":[1,2]}');
  });

  it('should handle empty object', () => {
    expect(canonicalizeJson({})).toBe('{}');
  });

  it('should throw on unsupported types (via default)', () => {
    expect(() => canonicalizeJson(undefined as any)).toThrow('Unsupported JSON value');
  });
});
