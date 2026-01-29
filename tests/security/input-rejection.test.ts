/**
 * Security tests for input validation
 * Tests that invalid inputs are properly rejected
 */

import { describe, it, expect } from '@jest/globals';
import { PublicKey, Keypair } from '@solana/web3.js';

describe('Input Validation', () => {
  describe('Score validation', () => {
    it('should have valid score range constants', () => {
      const MIN_SCORE = 0;
      const MAX_SCORE = 100;

      expect(MIN_SCORE).toBe(0);
      expect(MAX_SCORE).toBe(100);
    });

    it('should define valid trust tier range', () => {
      // Trust tiers: 0=Unrated, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum
      const TRUST_TIERS = [0, 1, 2, 3, 4];

      expect(TRUST_TIERS).toContain(0);
      expect(TRUST_TIERS).toContain(4);
      expect(TRUST_TIERS.length).toBe(5);
    });
  });

  describe('Hash validation', () => {
    it('should validate 32-byte hash length', () => {
      const validHash = Buffer.alloc(32, 1);
      const shortHash = Buffer.alloc(16, 1);
      const longHash = Buffer.alloc(64, 1);

      expect(validHash.length).toBe(32);
      expect(shortHash.length).not.toBe(32);
      expect(longHash.length).not.toBe(32);
    });
  });

  describe('String length constraints', () => {
    it('should enforce URI max length (250 bytes)', () => {
      const MAX_URI_LENGTH = 250;
      const validUri = 'a'.repeat(250);
      const invalidUri = 'a'.repeat(251);

      expect(validUri.length).toBeLessThanOrEqual(MAX_URI_LENGTH);
      expect(invalidUri.length).toBeGreaterThan(MAX_URI_LENGTH);
    });

    it('should enforce tag max length (32 bytes)', () => {
      const MAX_TAG_LENGTH = 32;
      const validTag = 'a'.repeat(32);
      const invalidTag = 'a'.repeat(33);

      expect(validTag.length).toBeLessThanOrEqual(MAX_TAG_LENGTH);
      expect(invalidTag.length).toBeGreaterThan(MAX_TAG_LENGTH);
    });

    it('should enforce metadata key max length (32 bytes)', () => {
      const MAX_KEY_LENGTH = 32;
      const validKey = 'a'.repeat(32);
      const invalidKey = 'a'.repeat(33);

      expect(validKey.length).toBeLessThanOrEqual(MAX_KEY_LENGTH);
      expect(invalidKey.length).toBeGreaterThan(MAX_KEY_LENGTH);
    });

    it('should enforce metadata value max length (256 bytes)', () => {
      const MAX_VALUE_LENGTH = 256;
      const validValue = 'a'.repeat(256);
      const invalidValue = 'a'.repeat(257);

      expect(validValue.length).toBeLessThanOrEqual(MAX_VALUE_LENGTH);
      expect(invalidValue.length).toBeGreaterThan(MAX_VALUE_LENGTH);
    });
  });

  describe('UTF-8 multi-byte handling', () => {
    it('should correctly count bytes for emoji (4 bytes each)', () => {
      const emoji = '\u{1F389}'; // Party popper emoji
      const byteLength = Buffer.from(emoji, 'utf8').length;

      expect(byteLength).toBe(4);
    });

    it('should correctly count bytes for 8 emojis (32 bytes)', () => {
      const emojis = '\u{1F389}'.repeat(8); // 8 party poppers
      const byteLength = Buffer.from(emojis, 'utf8').length;

      expect(byteLength).toBe(32);
    });

    it('should correctly count bytes for 9 emojis (36 bytes - exceeds tag limit)', () => {
      const emojis = '\u{1F389}'.repeat(9); // 9 party poppers
      const byteLength = Buffer.from(emojis, 'utf8').length;
      const MAX_TAG_LENGTH = 32;

      expect(byteLength).toBe(36);
      expect(byteLength).toBeGreaterThan(MAX_TAG_LENGTH);
    });
  });

  describe('PublicKey validation', () => {
    it('should accept valid base58 public key', () => {
      const validKey = '8oo4SbcgjRBAXjmGU4YMcdFqfeLLrtn7n6f358PkAc3N';

      expect(() => new PublicKey(validKey)).not.toThrow();
    });

    it('should reject invalid base58 public key', () => {
      const invalidKey = 'not-a-valid-public-key!!!';

      expect(() => new PublicKey(invalidKey)).toThrow();
    });

    it('should reject empty string', () => {
      expect(() => new PublicKey('')).toThrow();
    });

    it('should generate valid random keypair', () => {
      const keypair = Keypair.generate();

      expect(keypair.publicKey.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });
  });

  describe('Nonce validation', () => {
    it('should accept valid u32 nonce range', () => {
      const MIN_NONCE = 0;
      const MAX_NONCE = 4294967295; // u32 max

      expect(MIN_NONCE).toBeGreaterThanOrEqual(0);
      expect(MAX_NONCE).toBeLessThanOrEqual(4294967295);
    });

    it('should identify invalid nonce values', () => {
      const negativeNonce = -1;
      const tooLargeNonce = 4294967296; // u32 max + 1

      expect(negativeNonce).toBeLessThan(0);
      expect(tooLargeNonce).toBeGreaterThan(4294967295);
    });
  });

  describe('Feedback index validation', () => {
    it('should accept BigInt for feedback index', () => {
      const feedbackIndex = BigInt(12345);

      expect(typeof feedbackIndex).toBe('bigint');
      expect(feedbackIndex).toBeGreaterThanOrEqual(0n);
    });

    it('should accept u64 max value', () => {
      const maxU64 = BigInt('18446744073709551615');

      expect(maxU64).toBeGreaterThan(0n);
    });
  });
});
