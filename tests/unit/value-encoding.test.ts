import { describe, it, expect } from '@jest/globals';
import {
  encodeReputationValue,
  decodeToDecimalString,
  decodeToNumber,
} from '../../src/utils/value-encoding.js';

describe('value-encoding', () => {
  describe('encodeReputationValue', () => {
    describe('string inputs', () => {
      it('should encode "99.77" correctly', () => {
        const r = encodeReputationValue('99.77');
        expect(r.value).toBe(9977n);
        expect(r.valueDecimals).toBe(2);
        expect(r.normalized).toBe('99.77');
      });

      it('should encode integer strings', () => {
        const r = encodeReputationValue('9977');
        expect(r.value).toBe(9977n);
        expect(r.valueDecimals).toBe(0);
      });

      it('should encode negative values', () => {
        const r = encodeReputationValue('-5.5');
        expect(r.value).toBe(-55n);
        expect(r.valueDecimals).toBe(1);
      });

      it('should encode zero', () => {
        const r = encodeReputationValue('0');
        expect(r.value).toBe(0n);
        expect(r.valueDecimals).toBe(0);
      });

      it('should encode "0.0" as zero', () => {
        const r = encodeReputationValue('0.0');
        expect(r.value).toBe(0n);
      });

      it('should strip trailing zeros in fractional part', () => {
        const r = encodeReputationValue('10.50');
        expect(r.valueDecimals).toBe(1);
        expect(r.value).toBe(105n);
      });

      it('should handle leading zeros', () => {
        const r = encodeReputationValue('007.25');
        expect(r.value).toBe(725n);
        expect(r.valueDecimals).toBe(2);
      });

      it('should truncate to max 6 decimals with rounding', () => {
        const r = encodeReputationValue('1.1234567');
        expect(r.valueDecimals).toBe(6);
        expect(r.value).toBe(1123457n); // rounded up
      });

      it('should handle exponential notation', () => {
        const r = encodeReputationValue('1.5e2');
        expect(r.value).toBe(150n);
        expect(r.valueDecimals).toBe(0);
      });

      it('should handle negative exponents', () => {
        const r = encodeReputationValue('1.5e-2');
        expect(r.value).toBe(15n);
        expect(r.valueDecimals).toBe(3);
      });

      it('should throw on empty string', () => {
        expect(() => encodeReputationValue('')).toThrow('Empty value');
      });

      it('should throw on NaN', () => {
        expect(() => encodeReputationValue('NaN')).toThrow('NaN not supported');
      });

      it('should throw on Infinity', () => {
        expect(() => encodeReputationValue('Infinity')).toThrow('Infinity not supported');
      });

      it('should throw on invalid strings', () => {
        expect(() => encodeReputationValue('abc')).toThrow('Invalid numeric string');
      });

      it('should handle plus sign', () => {
        const r = encodeReputationValue('+42.5');
        expect(r.value).toBe(425n);
        expect(r.valueDecimals).toBe(1);
      });
    });

    describe('number inputs', () => {
      it('should encode decimal numbers', () => {
        const r = encodeReputationValue(99.77);
        expect(r.value).toBe(9977n);
        expect(r.valueDecimals).toBe(2);
      });

      it('should encode integers', () => {
        const r = encodeReputationValue(100);
        expect(r.value).toBe(100n);
        expect(r.valueDecimals).toBe(0);
      });

      it('should encode negative numbers', () => {
        const r = encodeReputationValue(-5.5);
        expect(r.value).toBe(-55n);
        expect(r.valueDecimals).toBe(1);
      });

      it('should throw on NaN', () => {
        expect(() => encodeReputationValue(NaN)).toThrow('Non-finite');
      });

      it('should throw on Infinity', () => {
        expect(() => encodeReputationValue(Infinity)).toThrow('Non-finite');
      });

      it('should throw on -Infinity', () => {
        expect(() => encodeReputationValue(-Infinity)).toThrow('Non-finite');
      });

      it('should use explicitDecimals for integer numbers', () => {
        const r = encodeReputationValue(9977, 2);
        expect(r.value).toBe(9977n);
        expect(r.valueDecimals).toBe(2);
      });

      it('should throw on invalid explicitDecimals for number', () => {
        expect(() => encodeReputationValue(100, -1)).toThrow('valueDecimals must be');
        expect(() => encodeReputationValue(100, 7)).toThrow('valueDecimals must be');
      });

      it('should reject unsafe integers with explicitDecimals', () => {
        expect(() => encodeReputationValue(Number.MAX_SAFE_INTEGER + 1, 0)).toThrow('exceeds safe integer');
      });

      it('should reject unsafe integers without explicitDecimals', () => {
        expect(() => encodeReputationValue(Number.MAX_SAFE_INTEGER + 1)).toThrow('exceeds safe integer');
      });
    });

    describe('bigint inputs', () => {
      it('should pass through with 0 decimals', () => {
        const r = encodeReputationValue(9977n);
        expect(r.value).toBe(9977n);
        expect(r.valueDecimals).toBe(0);
      });

      it('should use explicit decimals', () => {
        const r = encodeReputationValue(9977n, 2);
        expect(r.value).toBe(9977n);
        expect(r.valueDecimals).toBe(2);
      });

      it('should throw on i64 overflow', () => {
        const overMax = 9223372036854775807n + 1n;
        expect(() => encodeReputationValue(overMax)).toThrow('exceeds i64 range');
      });

      it('should throw on i64 underflow', () => {
        const underMin = -9223372036854775808n - 1n;
        expect(() => encodeReputationValue(underMin)).toThrow('exceeds i64 range');
      });

      it('should throw on invalid decimals for bigint', () => {
        expect(() => encodeReputationValue(100n, -1)).toThrow('valueDecimals must be');
        expect(() => encodeReputationValue(100n, 7)).toThrow('valueDecimals must be');
      });
    });
  });

  describe('decodeToDecimalString', () => {
    it('should decode with 0 decimals', () => {
      expect(decodeToDecimalString(100n, 0)).toBe('100');
    });

    it('should decode with decimals', () => {
      expect(decodeToDecimalString(9977n, 2)).toBe('99.77');
    });

    it('should decode negative values', () => {
      expect(decodeToDecimalString(-55n, 1)).toBe('-5.5');
    });

    it('should handle values smaller than decimal places', () => {
      expect(decodeToDecimalString(5n, 3)).toBe('0.005');
    });

    it('should strip trailing zeros', () => {
      expect(decodeToDecimalString(1050n, 2)).toBe('10.5');
    });

    it('should handle zero', () => {
      expect(decodeToDecimalString(0n, 0)).toBe('0');
      expect(decodeToDecimalString(0n, 3)).toBe('0.000');
    });

    it('should handle negative small values', () => {
      expect(decodeToDecimalString(-5n, 3)).toBe('-0.005');
    });
  });

  describe('decodeToNumber', () => {
    it('should decode to JS number', () => {
      expect(decodeToNumber(9977n, 2)).toBeCloseTo(99.77);
    });

    it('should decode integers', () => {
      expect(decodeToNumber(100n, 0)).toBe(100);
    });

    it('should decode negative values', () => {
      expect(decodeToNumber(-55n, 1)).toBeCloseTo(-5.5);
    });

    it('should decode zero', () => {
      expect(decodeToNumber(0n, 0)).toBe(0);
    });
  });

  describe('roundtrip', () => {
    it('should roundtrip decimal strings', () => {
      const input = '42.125';
      const encoded = encodeReputationValue(input);
      const decoded = decodeToDecimalString(encoded.value, encoded.valueDecimals);
      expect(decoded).toBe('42.125');
    });

    it('should roundtrip integers', () => {
      const encoded = encodeReputationValue(1000);
      const decoded = decodeToNumber(encoded.value, encoded.valueDecimals);
      expect(decoded).toBe(1000);
    });

    it('should roundtrip negatives', () => {
      const encoded = encodeReputationValue('-3.14');
      const decoded = decodeToDecimalString(encoded.value, encoded.valueDecimals);
      expect(decoded).toBe('-3.14');
    });
  });
});
