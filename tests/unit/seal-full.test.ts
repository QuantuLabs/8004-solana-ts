import { describe, it, expect } from '@jest/globals';
import {
  computeSealHash,
  computeFeedbackLeafV1,
  verifySealHash,
  createSealParams,
  validateSealInputs,
  MAX_TAG_LEN,
  MAX_ENDPOINT_LEN,
  MAX_URI_LEN,
} from '../../src/core/seal.js';

describe('seal (full coverage)', () => {
  const baseSealParams = {
    value: 100n,
    valueDecimals: 2,
    score: 85,
    tag1: 'quality',
    tag2: 'speed',
    endpoint: '/api/chat',
    feedbackUri: 'ipfs://QmTest',
    feedbackFileHash: null,
  };

  describe('validateSealInputs', () => {
    it('should pass for valid inputs', () => {
      expect(() => validateSealInputs(baseSealParams)).not.toThrow();
    });

    it('should throw for tag1 exceeding max length', () => {
      expect(() =>
        validateSealInputs({ ...baseSealParams, tag1: 'a'.repeat(MAX_TAG_LEN + 1) })
      ).toThrow(`tag1 exceeds ${MAX_TAG_LEN} bytes`);
    });

    it('should throw for tag2 exceeding max length', () => {
      expect(() =>
        validateSealInputs({ ...baseSealParams, tag2: 'b'.repeat(MAX_TAG_LEN + 1) })
      ).toThrow(`tag2 exceeds ${MAX_TAG_LEN} bytes`);
    });

    it('should throw for endpoint exceeding max length', () => {
      expect(() =>
        validateSealInputs({ ...baseSealParams, endpoint: 'x'.repeat(MAX_ENDPOINT_LEN + 1) })
      ).toThrow(`endpoint exceeds ${MAX_ENDPOINT_LEN} bytes`);
    });

    it('should throw for feedbackUri exceeding max length', () => {
      expect(() =>
        validateSealInputs({ ...baseSealParams, feedbackUri: 'u'.repeat(MAX_URI_LEN + 1) })
      ).toThrow(`feedbackUri exceeds ${MAX_URI_LEN} bytes`);
    });

    it('should throw for valueDecimals out of range', () => {
      expect(() => validateSealInputs({ ...baseSealParams, valueDecimals: -1 })).toThrow('valueDecimals must be 0-18');
      expect(() => validateSealInputs({ ...baseSealParams, valueDecimals: 19 })).toThrow('valueDecimals must be 0-18');
    });

    it('should throw for score out of range', () => {
      expect(() => validateSealInputs({ ...baseSealParams, score: -1 })).toThrow('score must be 0-100');
      expect(() => validateSealInputs({ ...baseSealParams, score: 101 })).toThrow('score must be 0-100');
    });

    it('should allow score=null', () => {
      expect(() => validateSealInputs({ ...baseSealParams, score: null })).not.toThrow();
    });
  });

  describe('computeSealHash', () => {
    it('should return a 32-byte Buffer', () => {
      const hash = computeSealHash(baseSealParams);
      expect(hash).toBeInstanceOf(Buffer);
      expect(hash.length).toBe(32);
    });

    it('should be deterministic', () => {
      const h1 = computeSealHash(baseSealParams);
      const h2 = computeSealHash(baseSealParams);
      expect(h1.equals(h2)).toBe(true);
    });

    it('should change with different values', () => {
      const h1 = computeSealHash(baseSealParams);
      const h2 = computeSealHash({ ...baseSealParams, value: 200n });
      expect(h1.equals(h2)).toBe(false);
    });

    it('should handle null score (flag=0)', () => {
      const hash = computeSealHash({ ...baseSealParams, score: null });
      expect(hash.length).toBe(32);
    });

    it('should handle non-null feedbackFileHash', () => {
      const fileHash = Buffer.alloc(32, 0xab);
      const hash = computeSealHash({ ...baseSealParams, feedbackFileHash: fileHash });
      expect(hash.length).toBe(32);
    });

    it('should throw for wrong-length feedbackFileHash', () => {
      const badHash = Buffer.alloc(16);
      expect(() => computeSealHash({ ...baseSealParams, feedbackFileHash: badHash })).toThrow(
        'feedbackFileHash must be 32 bytes'
      );
    });

    it('should handle empty strings', () => {
      const hash = computeSealHash({
        ...baseSealParams,
        tag1: '',
        tag2: '',
        endpoint: '',
        feedbackUri: '',
      });
      expect(hash.length).toBe(32);
    });

    it('should handle negative value (i64)', () => {
      const hash = computeSealHash({ ...baseSealParams, value: -50n });
      expect(hash.length).toBe(32);
    });
  });

  describe('computeFeedbackLeafV1', () => {
    it('should return a 32-byte Buffer', () => {
      const asset = Buffer.alloc(32, 1);
      const client = Buffer.alloc(32, 2);
      const sealHash = computeSealHash(baseSealParams);
      const leaf = computeFeedbackLeafV1(asset, client, 0, sealHash, 12345n);
      expect(leaf).toBeInstanceOf(Buffer);
      expect(leaf.length).toBe(32);
    });

    it('should be deterministic', () => {
      const asset = Buffer.alloc(32, 1);
      const client = Buffer.alloc(32, 2);
      const sealHash = computeSealHash(baseSealParams);
      const l1 = computeFeedbackLeafV1(asset, client, 0, sealHash, 100n);
      const l2 = computeFeedbackLeafV1(asset, client, 0, sealHash, 100n);
      expect(l1.equals(l2)).toBe(true);
    });

    it('should accept number feedbackIndex', () => {
      const asset = Buffer.alloc(32, 1);
      const client = Buffer.alloc(32, 2);
      const sealHash = computeSealHash(baseSealParams);
      const leaf = computeFeedbackLeafV1(asset, client, 5, sealHash, 100n);
      expect(leaf.length).toBe(32);
    });

    it('should accept bigint feedbackIndex', () => {
      const asset = Buffer.alloc(32, 1);
      const client = Buffer.alloc(32, 2);
      const sealHash = computeSealHash(baseSealParams);
      const leaf = computeFeedbackLeafV1(asset, client, 5n, sealHash, 100n);
      expect(leaf.length).toBe(32);
    });

    it('should throw on wrong-size asset', () => {
      expect(() =>
        computeFeedbackLeafV1(Buffer.alloc(16), Buffer.alloc(32), 0, Buffer.alloc(32), 0n)
      ).toThrow('asset must be 32 bytes');
    });

    it('should throw on wrong-size client', () => {
      expect(() =>
        computeFeedbackLeafV1(Buffer.alloc(32), Buffer.alloc(16), 0, Buffer.alloc(32), 0n)
      ).toThrow('client must be 32 bytes');
    });

    it('should throw on wrong-size sealHash', () => {
      expect(() =>
        computeFeedbackLeafV1(Buffer.alloc(32), Buffer.alloc(32), 0, Buffer.alloc(16), 0n)
      ).toThrow('sealHash must be 32 bytes');
    });
  });

  describe('verifySealHash', () => {
    it('should return true for matching hash', () => {
      const sealHash = computeSealHash(baseSealParams);
      expect(verifySealHash({ ...baseSealParams, sealHash })).toBe(true);
    });

    it('should return false for non-matching hash', () => {
      const sealHash = Buffer.alloc(32, 0xff);
      expect(verifySealHash({ ...baseSealParams, sealHash })).toBe(false);
    });
  });

  describe('createSealParams', () => {
    it('should create params with defaults', () => {
      const params = createSealParams(50n, 0, 80, 't1', 't2', '/api', 'ipfs://x');
      expect(params.value).toBe(50n);
      expect(params.valueDecimals).toBe(0);
      expect(params.score).toBe(80);
      expect(params.tag1).toBe('t1');
      expect(params.tag2).toBe('t2');
      expect(params.endpoint).toBe('/api');
      expect(params.feedbackUri).toBe('ipfs://x');
      expect(params.feedbackFileHash).toBeNull();
    });

    it('should accept explicit feedbackFileHash', () => {
      const hash = Buffer.alloc(32, 0xcc);
      const params = createSealParams(0n, 0, null, '', '', '', '', hash);
      expect(params.feedbackFileHash).toEqual(hash);
    });

    it('should default feedbackFileHash to null when undefined', () => {
      const params = createSealParams(0n, 0, null, '', '', '', '', undefined);
      expect(params.feedbackFileHash).toBeNull();
    });
  });
});
