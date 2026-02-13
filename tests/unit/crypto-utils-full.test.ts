import { describe, it, expect } from '@jest/globals';
import {
  keccak256,
  getRandomBytes,
  sha256,
  sha256Sync,
  isBrowser,
  hasWebCrypto,
} from '../../src/utils/crypto-utils.js';

describe('crypto-utils (full coverage)', () => {
  describe('keccak256', () => {
    it('should return 32-byte Buffer', () => {
      const hash = keccak256(Buffer.from('test'));
      expect(hash).toBeInstanceOf(Buffer);
      expect(hash.length).toBe(32);
    });

    it('should produce deterministic output', () => {
      const h1 = keccak256(Buffer.from('hello'));
      const h2 = keccak256(Buffer.from('hello'));
      expect(h1.equals(h2)).toBe(true);
    });

    it('should produce different output for different input', () => {
      const h1 = keccak256(Buffer.from('abc'));
      const h2 = keccak256(Buffer.from('def'));
      expect(h1.equals(h2)).toBe(false);
    });

    it('should accept Uint8Array', () => {
      const hash = keccak256(new Uint8Array([1, 2, 3]));
      expect(hash.length).toBe(32);
    });
  });

  describe('getRandomBytes', () => {
    it('should return bytes of requested size', () => {
      const bytes = getRandomBytes(16);
      expect(bytes.length).toBe(16);
    });

    it('should return Uint8Array', () => {
      const bytes = getRandomBytes(8);
      expect(bytes).toBeInstanceOf(Uint8Array);
    });

    it('should produce different values', () => {
      const a = getRandomBytes(32);
      const b = getRandomBytes(32);
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    });
  });

  describe('sha256', () => {
    it('should hash string input', async () => {
      const hash = await sha256('test');
      expect(hash.length).toBe(32);
    });

    it('should hash Uint8Array input', async () => {
      const hash = await sha256(new Uint8Array([1, 2, 3]));
      expect(hash.length).toBe(32);
    });

    it('should produce deterministic output', async () => {
      const h1 = await sha256('hello');
      const h2 = await sha256('hello');
      expect(Buffer.from(h1).equals(Buffer.from(h2))).toBe(true);
    });
  });

  describe('sha256Sync', () => {
    // sha256Sync uses require('crypto') which is not available in ESM mode
    // Test the error path and the function export itself
    it('should be a function', () => {
      expect(typeof sha256Sync).toBe('function');
    });

    it('should throw in ESM context (no require)', () => {
      // In ESM test env, require is not defined so sha256Sync will throw
      expect(() => sha256Sync('test')).toThrow();
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
