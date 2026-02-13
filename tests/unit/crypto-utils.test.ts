import { describe, it, expect } from '@jest/globals';
import {
  keccak256,
  getRandomBytes,
  sha256,
  sha256Sync,
  isBrowser,
  hasWebCrypto,
} from '../../src/utils/crypto-utils.js';

describe('crypto-utils', () => {
  describe('keccak256', () => {
    it('should hash empty input', () => {
      const hash = keccak256(new Uint8Array(0));
      expect(hash.length).toBe(32);
    });

    it('should produce deterministic output', () => {
      const data = Buffer.from('hello world');
      const h1 = keccak256(data);
      const h2 = keccak256(data);
      expect(Buffer.compare(h1, h2)).toBe(0);
    });

    it('should produce different hashes for different inputs', () => {
      const h1 = keccak256(Buffer.from('a'));
      const h2 = keccak256(Buffer.from('b'));
      expect(Buffer.compare(h1, h2)).not.toBe(0);
    });

    it('should accept Uint8Array input', () => {
      const data = new Uint8Array([1, 2, 3]);
      const hash = keccak256(data);
      expect(hash.length).toBe(32);
    });

    it('should accept Buffer input', () => {
      const data = Buffer.from([1, 2, 3]);
      const hash = keccak256(data);
      expect(hash.length).toBe(32);
    });
  });

  describe('getRandomBytes', () => {
    it('should return requested size', () => {
      const bytes = getRandomBytes(32);
      expect(bytes.length).toBe(32);
    });

    it('should return Uint8Array', () => {
      const bytes = getRandomBytes(16);
      expect(bytes).toBeInstanceOf(Uint8Array);
    });

    it('should produce different outputs', () => {
      const a = getRandomBytes(32);
      const b = getRandomBytes(32);
      // Extremely unlikely to be equal
      expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0);
    });

    it('should handle zero size', () => {
      const bytes = getRandomBytes(0);
      expect(bytes.length).toBe(0);
    });

    it('should handle large sizes', () => {
      const bytes = getRandomBytes(1024);
      expect(bytes.length).toBe(1024);
    });
  });

  describe('sha256', () => {
    it('should hash string input', async () => {
      const hash = await sha256('hello');
      expect(hash.length).toBe(32);
      expect(hash).toBeInstanceOf(Uint8Array);
    });

    it('should hash Uint8Array input', async () => {
      const hash = await sha256(new Uint8Array([1, 2, 3]));
      expect(hash.length).toBe(32);
    });

    it('should be deterministic', async () => {
      const h1 = await sha256('test');
      const h2 = await sha256('test');
      expect(Buffer.compare(Buffer.from(h1), Buffer.from(h2))).toBe(0);
    });

    it('should produce different hashes for different inputs', async () => {
      const h1 = await sha256('a');
      const h2 = await sha256('b');
      expect(Buffer.compare(Buffer.from(h1), Buffer.from(h2))).not.toBe(0);
    });

    it('should hash empty string', async () => {
      const hash = await sha256('');
      expect(hash.length).toBe(32);
    });
  });

  describe('sha256Sync', () => {
    // sha256Sync uses require('crypto') which is not available in ESM context
    it('should throw in ESM context (require not defined)', () => {
      expect(() => sha256Sync('hello')).toThrow();
    });

    it('should throw for Uint8Array input in ESM context', () => {
      expect(() => sha256Sync(new Uint8Array([1, 2, 3]))).toThrow();
    });
  });

  describe('isBrowser', () => {
    it('should return false in Node.js', () => {
      expect(isBrowser()).toBe(false);
    });
  });

  describe('hasWebCrypto', () => {
    it('should return a boolean', () => {
      expect(typeof hasWebCrypto()).toBe('boolean');
    });
  });
});
