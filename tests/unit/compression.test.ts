/**
 * Unit tests for compression utilities
 */

import { describe, it, expect } from '@jest/globals';
import { decompressBase64Value, decompressFromStorage, isCompressed } from '../../src/utils/compression.js';

describe('Compression Utilities', () => {
  describe('decompressFromStorage', () => {
    it('should handle empty buffer', async () => {
      const result = await decompressFromStorage(Buffer.alloc(0));
      expect(result.length).toBe(0);
    });

    it('should strip PREFIX_RAW (0x00) and return data', async () => {
      const data = Buffer.from('hello world');
      const stored = Buffer.concat([Buffer.from([0x00]), data]);

      const result = await decompressFromStorage(stored);
      expect(result.toString()).toBe('hello world');
    });

    it('should handle legacy data without prefix', async () => {
      // Legacy data: no prefix, just raw bytes
      const data = Buffer.from('legacy data without prefix');

      const result = await decompressFromStorage(data);
      expect(result.toString()).toBe('legacy data without prefix');
    });

    it('should detect PREFIX_ZSTD (0x01) and throw if zstd not available', async () => {
      const data = Buffer.from('compressed data');
      const stored = Buffer.concat([Buffer.from([0x01]), data]);

      // This should throw because zstd is not installed in SDK by default
      await expect(decompressFromStorage(stored)).rejects.toThrow('ZSTD decompression required');
    });
  });

  describe('decompressBase64Value', () => {
    it('should handle empty string', async () => {
      const result = await decompressBase64Value('');
      expect(result).toBe('');
    });

    it('should decode base64 with PREFIX_RAW', async () => {
      // PREFIX_RAW (0x00) + "hello" in base64
      const data = Buffer.concat([Buffer.from([0x00]), Buffer.from('hello')]);
      const base64 = data.toString('base64');

      const result = await decompressBase64Value(base64);
      expect(result).toBe('hello');
    });

    it('should return plain text as-is if not valid base64', async () => {
      const plainText = 'This is plain text with spaces!';

      const result = await decompressBase64Value(plainText);
      expect(result).toBe(plainText);
    });

    it('should handle legacy base64 without prefix', async () => {
      // Plain string encoded as base64 (no prefix)
      const original = 'legacy value';
      const base64 = Buffer.from(original).toString('base64');

      const result = await decompressBase64Value(base64);
      expect(result).toBe(original);
    });

    it('should handle JSON-like strings', async () => {
      const jsonString = '{"name":"test","value":123}';

      // If passed as plain text
      const result1 = await decompressBase64Value(jsonString);
      expect(result1).toBe(jsonString);

      // If passed as base64 with prefix
      const prefixed = Buffer.concat([Buffer.from([0x00]), Buffer.from(jsonString)]);
      const base64 = prefixed.toString('base64');
      const result2 = await decompressBase64Value(base64);
      expect(result2).toBe(jsonString);
    });
  });

  describe('isCompressed', () => {
    it('should return false for empty buffer', () => {
      expect(isCompressed(Buffer.alloc(0))).toBe(false);
    });

    it('should return true for PREFIX_ZSTD', () => {
      const data = Buffer.concat([Buffer.from([0x01]), Buffer.from('data')]);
      expect(isCompressed(data)).toBe(true);
    });

    it('should return false for PREFIX_RAW', () => {
      const data = Buffer.concat([Buffer.from([0x00]), Buffer.from('data')]);
      expect(isCompressed(data)).toBe(false);
    });

    it('should return true for ZSTD magic bytes', () => {
      // ZSTD magic: 0x28 0xB5 0x2F 0xFD
      const data = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x00]);
      expect(isCompressed(data)).toBe(true);
    });

    it('should return false for other data', () => {
      const data = Buffer.from('plain text');
      expect(isCompressed(data)).toBe(false);
    });
  });
});
