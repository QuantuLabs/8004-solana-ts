import { describe, it, expect } from '@jest/globals';
import {
  decompressFromStorage,
  decompressBase64Value,
  isCompressed,
} from '../../src/utils/compression.js';

describe('compression (full coverage)', () => {
  describe('decompressFromStorage', () => {
    it('should return empty buffer for empty input', async () => {
      const result = await decompressFromStorage(Buffer.alloc(0));
      expect(result.length).toBe(0);
    });

    it('should return empty buffer for null-ish input', async () => {
      const result = await decompressFromStorage(null as any);
      expect(result.length).toBe(0);
    });

    it('should strip PREFIX_RAW (0x00) and return rest', async () => {
      const data = Buffer.from([0x00, 0x48, 0x65, 0x6c, 0x6c, 0x6f]); // 0x00 + "Hello"
      const result = await decompressFromStorage(data);
      expect(result.toString('utf8')).toBe('Hello');
    });

    it('should throw for ZSTD prefix without zstd installed', async () => {
      const data = Buffer.from([0x01, 0x28, 0xb5, 0x2f, 0xfd]);
      await expect(decompressFromStorage(data)).rejects.toThrow('ZSTD');
    });

    it('should return as-is for legacy format (no prefix)', async () => {
      const data = Buffer.from('Hello World');
      const result = await decompressFromStorage(data);
      expect(result.toString('utf8')).toBe('Hello World');
    });
  });

  describe('decompressBase64Value', () => {
    it('should return empty string for empty/falsy input', async () => {
      expect(await decompressBase64Value('')).toBe('');
      expect(await decompressBase64Value(null as any)).toBe('');
      expect(await decompressBase64Value(undefined as any)).toBe('');
    });

    it('should return short strings as-is (< 4 chars)', async () => {
      expect(await decompressBase64Value('AB')).toBe('AB');
      expect(await decompressBase64Value('abc')).toBe('abc');
    });

    it('should return non-base64 strings as-is', async () => {
      expect(await decompressBase64Value('hello world!')).toBe('hello world!');
      expect(await decompressBase64Value('not-base64-chars-here!')).toBe('not-base64-chars-here!');
    });

    it('should decode base64 with PREFIX_RAW (0x00)', async () => {
      // 0x00 + "test" in base64
      const raw = Buffer.from([0x00, ...Buffer.from('test')]);
      const base64 = raw.toString('base64');
      const result = await decompressBase64Value(base64);
      expect(result).toBe('test');
    });

    it('should return plain text for base64-looking string without prefix', async () => {
      // Base64 string that decodes to bytes where first byte is NOT 0x00 or 0x01
      const result = await decompressBase64Value('SGVsbG8='); // "Hello" in base64, first byte = 0x48
      expect(result).toBe('SGVsbG8='); // returned as-is
    });

    it('should handle base64 decode failure gracefully', async () => {
      // This looks like base64 but we test edge cases
      const result = await decompressBase64Value('AAAA');
      // 0x00 0x00 0x00 → PREFIX_RAW + 0x00 0x00 → decompresses to two null bytes
      expect(typeof result).toBe('string');
    });
  });

  describe('isCompressed', () => {
    it('should return false for empty data', () => {
      expect(isCompressed(Buffer.alloc(0))).toBe(false);
      expect(isCompressed(null as any)).toBe(false);
    });

    it('should return true for ZSTD prefix', () => {
      expect(isCompressed(Buffer.from([0x01, 0x00]))).toBe(true);
    });

    it('should return true for raw ZSTD magic', () => {
      expect(isCompressed(Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00]))).toBe(true);
    });

    it('should return false for uncompressed data', () => {
      expect(isCompressed(Buffer.from([0x00, 0x48]))).toBe(false);
      expect(isCompressed(Buffer.from('Hello'))).toBe(false);
    });

    it('should return false for RAW prefix (0x00)', () => {
      expect(isCompressed(Buffer.from([0x00]))).toBe(false);
    });
  });
});
