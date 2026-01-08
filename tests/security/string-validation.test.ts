/**
 * Security tests for UTF-8 byte length validation
 * Ensures string validation prevents bypassing on-chain byte limits
 */

import { validateByteLength, validateNonce } from '../../src/utils/validation.js';

describe('UTF-8 Byte Length Validation', () => {
  describe('validateByteLength', () => {
    it('should accept ASCII strings within byte limit', () => {
      expect(() => validateByteLength('hello', 32, 'tag1')).not.toThrow();
      expect(() => validateByteLength('a'.repeat(32), 32, 'tag1')).not.toThrow();
    });

    it('should reject ASCII strings exceeding byte limit', () => {
      expect(() => validateByteLength('a'.repeat(33), 32, 'tag1')).toThrow(
        /tag1 must be <= 32 bytes/
      );
    });

    it('should correctly count multi-byte UTF-8 characters', () => {
      // Japanese characters: 3 bytes each in UTF-8
      const japanese = '日本語'; // 9 bytes (3 chars x 3 bytes)
      expect(() => validateByteLength(japanese, 9, 'field')).not.toThrow();
      expect(() => validateByteLength(japanese, 8, 'field')).toThrow(
        /field must be <= 8 bytes \(got 9 bytes\)/
      );
    });

    it('should reject emoji strings that exceed byte limit', () => {
      // Heart emoji: 4 bytes in UTF-8 (or more with variation selector)
      const emoji = '❤️'; // Can be 6 bytes with variation selector
      const byteLength = Buffer.byteLength(emoji, 'utf8');

      // Test with limit smaller than actual byte length
      expect(() => validateByteLength(emoji, byteLength - 1, 'tag1')).toThrow();
    });

    it('should handle mixed ASCII and Unicode strings', () => {
      // 'test' = 4 bytes, '日本' = 6 bytes = 10 bytes total
      const mixed = 'test日本';
      expect(() => validateByteLength(mixed, 10, 'field')).not.toThrow();
      expect(() => validateByteLength(mixed, 9, 'field')).toThrow(
        /field must be <= 9 bytes \(got 10 bytes\)/
      );
    });

    it('should accept empty strings', () => {
      expect(() => validateByteLength('', 32, 'tag1')).not.toThrow();
    });

    it('should include actual byte count in error message', () => {
      const testString = 'a'.repeat(50);
      expect(() => validateByteLength(testString, 32, 'myField')).toThrow(
        /myField must be <= 32 bytes \(got 50 bytes\)/
      );
    });

    it('should handle different field names in error messages', () => {
      const long = 'x'.repeat(201);
      expect(() => validateByteLength(long, 200, 'fileUri')).toThrow(/fileUri/);
      expect(() => validateByteLength(long, 200, 'responseUri')).toThrow(/responseUri/);
    });

    // Security: Verify that character count != byte count for multi-byte chars
    it('should demonstrate character vs byte count difference', () => {
      const text = '❤️❤️❤️'; // 3 characters visually
      const charCount = text.length; // Character count (can vary by JS engine)
      const byteCount = Buffer.byteLength(text, 'utf8');

      // Key security assertion: byte count is greater than naive character count
      // This proves the validation is necessary
      expect(byteCount).toBeGreaterThan(3);
    });
  });
});

describe('Nonce Validation', () => {
  describe('validateNonce', () => {
    it('should accept valid u32 values', () => {
      expect(() => validateNonce(0)).not.toThrow();
      expect(() => validateNonce(1)).not.toThrow();
      expect(() => validateNonce(1000)).not.toThrow();
      expect(() => validateNonce(4294967295)).not.toThrow(); // Max u32
    });

    it('should reject negative numbers', () => {
      expect(() => validateNonce(-1)).toThrow(/nonce must be a u32 integer/);
      expect(() => validateNonce(-100)).toThrow(/nonce must be a u32 integer/);
    });

    it('should reject numbers above u32 max', () => {
      expect(() => validateNonce(4294967296)).toThrow(/nonce must be a u32 integer/);
      expect(() => validateNonce(5000000000)).toThrow(/nonce must be a u32 integer/);
    });

    it('should reject non-integer numbers', () => {
      expect(() => validateNonce(1.5)).toThrow(/nonce must be a u32 integer/);
      expect(() => validateNonce(0.1)).toThrow(/nonce must be a u32 integer/);
    });

    it('should reject NaN and Infinity', () => {
      expect(() => validateNonce(NaN)).toThrow(/nonce must be a u32 integer/);
      expect(() => validateNonce(Infinity)).toThrow(/nonce must be a u32 integer/);
      expect(() => validateNonce(-Infinity)).toThrow(/nonce must be a u32 integer/);
    });
  });
});
