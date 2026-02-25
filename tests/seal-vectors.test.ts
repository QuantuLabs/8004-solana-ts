/**
 * SEAL v1 Cross-Validation Test Vectors
 *
 * These test vectors are validated against the Rust on-chain implementation.
 * If any of these tests fail, it means the TypeScript and Rust implementations
 * are out of sync, which would break trustless verification.
 *
 * IMPORTANT: Do not modify these expected values without also updating the Rust tests.
 */

import { computeSealHash, computeFeedbackLeafV1 } from '../src/core/seal.js';

describe('SEAL v1 Cross-Validation', () => {
  // Expected values from Rust implementation (cargo test test_cross_validation_vectors)
  const EXPECTED = {
    vector1: '98f98e22c278d9b7fe8163399aefd87d2ab0c9e27701fcb0c40b6249501a76eb',
    vector2: 'e3a20d8bea1ef7a0a7684d885dc99267c972ef8a9854a1552039198bd186c18f',
    vector3: 'b4aaf59d1fa5cc6a3c0ba0c95d2aa363895952172e7b16330c5dc0d1d8c15383',
    vector4: '28af8ce8d3689e87398c6e9e0dd12f84e87c533dc6eccddaf4c6df83da4aa7e2',
    leaf: 'f78cdf372fa01d5c228e5e71e2d738fd1d705c3165f4b2797bd5effac0dd2627',
  };

  test('Vector 1: Minimal (score=None, fileHash=None)', () => {
    const hash = computeSealHash({
      value: 9977n,
      valueDecimals: 2,
      score: null,
      tag1: 'uptime',
      tag2: 'day',
      endpoint: '',
      feedbackUri: 'ipfs://QmTest123',
      feedbackFileHash: null,
    });

    expect(hash.toString('hex')).toBe(EXPECTED.vector1);
  });

  test('Vector 2: Full (score=Some, fileHash=Some)', () => {
    const fileHash = Buffer.alloc(32, 0x01);
    const hash = computeSealHash({
      value: -100n,
      valueDecimals: 0,
      score: 85,
      tag1: 'x402-resource-delivered',
      tag2: 'exact-svm',
      endpoint: 'https://api.agent.com/mcp',
      feedbackUri: 'ar://abc123',
      feedbackFileHash: fileHash,
    });

    expect(hash.toString('hex')).toBe(EXPECTED.vector2);
  });

  test('Vector 3: Empty strings', () => {
    const hash = computeSealHash({
      value: 0n,
      valueDecimals: 0,
      score: 0,
      tag1: '',
      tag2: '',
      endpoint: '',
      feedbackUri: '',
      feedbackFileHash: null,
    });

    expect(hash.toString('hex')).toBe(EXPECTED.vector3);
  });

  test('Vector 4: UTF-8 non-ASCII characters', () => {
    const hash = computeSealHash({
      value: 1000000n,
      valueDecimals: 6,
      score: null,
      tag1: '質量',
      tag2: 'émoji🎉',
      endpoint: 'https://例え.jp/api',
      feedbackUri: 'ipfs://QmTest',
      feedbackFileHash: null,
    });

    expect(hash.toString('hex')).toBe(EXPECTED.vector4);
  });

  test('Leaf computation from Vector 1', () => {
    const sealHash = Buffer.from(EXPECTED.vector1, 'hex');
    const asset = Buffer.alloc(32, 0xAA);
    const client = Buffer.alloc(32, 0xBB);

    const leaf = computeFeedbackLeafV1(asset, client, 0, sealHash, 12345n);

    expect(leaf.toString('hex')).toBe(EXPECTED.leaf);
  });

  test('Determinism: same inputs produce same hash', () => {
    const params = {
      value: 9977n,
      valueDecimals: 2,
      score: null,
      tag1: 'uptime',
      tag2: 'day',
      endpoint: '',
      feedbackUri: 'ipfs://QmTest123',
      feedbackFileHash: null,
    };

    const hash1 = computeSealHash(params);
    const hash2 = computeSealHash(params);

    expect(hash1.equals(hash2)).toBe(true);
  });

  test('Score None vs Score 0 produce different hashes', () => {
    const hashNone = computeSealHash({
      value: 100n,
      valueDecimals: 0,
      score: null,
      tag1: 'tag',
      tag2: '',
      endpoint: '',
      feedbackUri: '',
      feedbackFileHash: null,
    });

    const hashZero = computeSealHash({
      value: 100n,
      valueDecimals: 0,
      score: 0,
      tag1: 'tag',
      tag2: '',
      endpoint: '',
      feedbackUri: '',
      feedbackFileHash: null,
    });

    expect(hashNone.equals(hashZero)).toBe(false);
  });

  test('File hash presence affects seal hash', () => {
    const hashWithout = computeSealHash({
      value: 100n,
      valueDecimals: 0,
      score: null,
      tag1: '',
      tag2: '',
      endpoint: '',
      feedbackUri: '',
      feedbackFileHash: null,
    });

    const hashWith = computeSealHash({
      value: 100n,
      valueDecimals: 0,
      score: null,
      tag1: '',
      tag2: '',
      endpoint: '',
      feedbackUri: '',
      feedbackFileHash: Buffer.alloc(32, 0x00),
    });

    expect(hashWithout.equals(hashWith)).toBe(false);
  });
});
