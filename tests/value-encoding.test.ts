/**
 * Tests for value encoding utility
 */

import { encodeReputationValue, decodeToDecimalString, decodeToNumber } from '../src/utils/value-encoding.js';

describe('encodeReputationValue', () => {
  test('decimal string "99.77" → value=9977, decimals=2', () => {
    const result = encodeReputationValue('99.77');
    expect(result.value).toBe(9977n);
    expect(result.valueDecimals).toBe(2);
    expect(result.normalized).toBe('99.77');
  });

  test('decimal number 99.77 → value=9977, decimals=2', () => {
    const result = encodeReputationValue(99.77);
    expect(result.value).toBe(9977n);
    expect(result.valueDecimals).toBe(2);
  });

  test('integer 9977 → value=9977, decimals=0', () => {
    const result = encodeReputationValue(9977);
    expect(result.value).toBe(9977n);
    expect(result.valueDecimals).toBe(0);
  });

  test('bigint 9977n with explicit decimals=2', () => {
    const result = encodeReputationValue(9977n, 2);
    expect(result.value).toBe(9977n);
    expect(result.valueDecimals).toBe(2);
  });

  test('negative "-5.5" → value=-55, decimals=1', () => {
    const result = encodeReputationValue('-5.5');
    expect(result.value).toBe(-55n);
    expect(result.valueDecimals).toBe(1);
  });

  test('zero "0" → value=0, decimals=0', () => {
    const result = encodeReputationValue('0');
    expect(result.value).toBe(0n);
    expect(result.valueDecimals).toBe(0);
  });

  test('keeps up to 18 decimals', () => {
    const result = encodeReputationValue('1.12345678');
    expect(result.valueDecimals).toBe(8);
    expect(result.value).toBe(112345678n);
  });

  test('scientific notation "1.5e2" → 150', () => {
    const result = encodeReputationValue('1.5e2');
    expect(result.value).toBe(150n);
    expect(result.valueDecimals).toBe(0);
  });

  test('small decimal "0.001" → value=1, decimals=3', () => {
    const result = encodeReputationValue('0.001');
    expect(result.value).toBe(1n);
    expect(result.valueDecimals).toBe(3);
  });

  test('throws on NaN', () => {
    expect(() => encodeReputationValue('NaN')).toThrow('NaN not supported');
  });

  test('throws on Infinity', () => {
    expect(() => encodeReputationValue('Infinity')).toThrow('Infinity not supported');
  });

  test('throws on non-integer explicitDecimals for bigint', () => {
    expect(() => encodeReputationValue(9977n, 1.5)).toThrow('valueDecimals must be integer 0-18');
  });

  test('throws on non-integer explicitDecimals for number', () => {
    expect(() => encodeReputationValue(9977, 2.5)).toThrow('valueDecimals must be integer 0-18');
  });

  test('throws on unsafe integer with explicitDecimals', () => {
    const unsafeInt = Number.MAX_SAFE_INTEGER + 1;
    expect(() => encodeReputationValue(unsafeInt, 0)).toThrow('exceeds safe integer range');
  });

  test('throws on unsafe integer without explicitDecimals', () => {
    const unsafeInt = Number.MAX_SAFE_INTEGER + 1;
    expect(() => encodeReputationValue(unsafeInt)).toThrow('exceeds safe integer range');
  });

  test('accepts bigint for large values', () => {
    const largeBigint = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    const result = encodeReputationValue(largeBigint, 0);
    expect(result.value).toBe(largeBigint);
  });
});

describe('decodeToDecimalString', () => {
  test('9977n, 2 → "99.77"', () => {
    expect(decodeToDecimalString(9977n, 2)).toBe('99.77');
  });

  test('9977n, 0 → "9977"', () => {
    expect(decodeToDecimalString(9977n, 0)).toBe('9977');
  });

  test('-55n, 1 → "-5.5"', () => {
    expect(decodeToDecimalString(-55n, 1)).toBe('-5.5');
  });

  test('1n, 3 → "0.001"', () => {
    expect(decodeToDecimalString(1n, 3)).toBe('0.001');
  });

  test('trailing zeros removed: 1000n, 2 → "10"', () => {
    expect(decodeToDecimalString(1000n, 2)).toBe('10');
  });
});

describe('decodeToNumber', () => {
  test('9977n, 2 → 99.77', () => {
    expect(decodeToNumber(9977n, 2)).toBeCloseTo(99.77);
  });

  test('-55n, 1 → -5.5', () => {
    expect(decodeToNumber(-55n, 1)).toBeCloseTo(-5.5);
  });
});
