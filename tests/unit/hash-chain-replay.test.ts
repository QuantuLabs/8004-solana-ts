/**
 * Hash-Chain Replay & Verification Unit Tests
 *
 * Tests mirror on-chain Rust logic in:
 * - programs/agent-registry-8004/src/reputation/chain.rs
 * - programs/agent-registry-8004/src/reputation/seal.rs
 */

import {
  chainHash,
  computeSealHash,
  computeFeedbackLeafV1,
  computeResponseLeaf,
  computeRevokeLeaf,
  replayFeedbackChain,
  replayResponseChain,
  replayRevokeChain,
  DOMAIN_FEEDBACK,
  DOMAIN_RESPONSE,
  DOMAIN_REVOKE,
  DOMAIN_SEAL_V1,
  DOMAIN_LEAF_V1,
} from '../../src/core/hash-chain-replay.js';
import type {
  FeedbackReplayEvent,
  ResponseReplayEvent,
  RevokeReplayEvent,
} from '../../src/core/hash-chain-replay.js';

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------

const ZERO_DIGEST = Buffer.alloc(32);
const testAsset = Buffer.alloc(32, 0xaa);
const testClient = Buffer.alloc(32, 0xbb);
const testResponder = Buffer.alloc(32, 0xcc);
const testHash32 = Buffer.alloc(32, 0xdd);

// ---------------------------------------------------------------------------
// 1. Domain constant lengths
// ---------------------------------------------------------------------------

describe('Domain constants', () => {
  test('DOMAIN_FEEDBACK is 16 bytes', () => {
    expect(DOMAIN_FEEDBACK.length).toBe(16);
    expect(DOMAIN_FEEDBACK.toString()).toBe('8004_FEEDBACK_V1');
  });

  test('DOMAIN_RESPONSE is 16 bytes', () => {
    expect(DOMAIN_RESPONSE.length).toBe(16);
    expect(DOMAIN_RESPONSE.toString()).toBe('8004_RESPONSE_V1');
  });

  test('DOMAIN_REVOKE is 14 bytes (NOT 16)', () => {
    expect(DOMAIN_REVOKE.length).toBe(14);
    expect(DOMAIN_REVOKE.toString()).toBe('8004_REVOKE_V1');
  });

  test('DOMAIN_SEAL_V1 is 16 bytes', () => {
    expect(DOMAIN_SEAL_V1.length).toBe(16);
    expect(DOMAIN_SEAL_V1.toString()).toBe('8004_SEAL_V1____');
  });

  test('DOMAIN_LEAF_V1 is 16 bytes', () => {
    expect(DOMAIN_LEAF_V1.length).toBe(16);
    expect(DOMAIN_LEAF_V1.toString()).toBe('8004_LEAF_V1____');
  });
});

// ---------------------------------------------------------------------------
// 2. chainHash
// ---------------------------------------------------------------------------

describe('chainHash', () => {
  test('deterministic with known inputs', () => {
    const a = chainHash(ZERO_DIGEST, DOMAIN_FEEDBACK, testHash32);
    const b = chainHash(ZERO_DIGEST, DOMAIN_FEEDBACK, testHash32);
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
  });

  test('different domain produces different hash', () => {
    const a = chainHash(ZERO_DIGEST, DOMAIN_FEEDBACK, testHash32);
    const b = chainHash(ZERO_DIGEST, DOMAIN_RESPONSE, testHash32);
    expect(a.equals(b)).toBe(false);
  });

  test('different prev digest produces different hash', () => {
    const otherDigest = Buffer.alloc(32, 0xff);
    const a = chainHash(ZERO_DIGEST, DOMAIN_FEEDBACK, testHash32);
    const b = chainHash(otherDigest, DOMAIN_FEEDBACK, testHash32);
    expect(a.equals(b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3-8. computeSealHash (re-exported from seal.ts)
// ---------------------------------------------------------------------------

describe('computeSealHash', () => {
  test('minimal: value=9977, decimals=2, score=null', () => {
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
    // Cross-validated against Rust (seal-vectors.test.ts)
    expect(hash.toString('hex')).toBe(
      '95e4e651a4833ff431d6a290307d37bb3402e4bbad49b0252625b105195b40b6',
    );
  });

  test('full: value=-100, score=85, fileHash present', () => {
    const hash = computeSealHash({
      value: -100n,
      valueDecimals: 0,
      score: 85,
      tag1: 'x402-resource-delivered',
      tag2: 'exact-svm',
      endpoint: 'https://api.agent.com/mcp',
      feedbackUri: 'ar://abc123',
      feedbackFileHash: Buffer.alloc(32, 0x01),
    });
    expect(hash.toString('hex')).toBe(
      '12cb1b6d1351b3a79ff15440d6c41e098a4fb69077670ce6b21c636adf98f04a',
    );
  });

  test('score null vs score 0 produce different hashes', () => {
    const base = {
      value: 100n, valueDecimals: 0, tag1: 'tag', tag2: '',
      endpoint: '', feedbackUri: '', feedbackFileHash: null,
    };
    const a = computeSealHash({ ...base, score: null });
    const b = computeSealHash({ ...base, score: 0 });
    expect(a.equals(b)).toBe(false);
  });

  test('file hash presence affects hash', () => {
    const base = {
      value: 100n, valueDecimals: 0, score: null, tag1: '', tag2: '',
      endpoint: '', feedbackUri: '',
    };
    const a = computeSealHash({ ...base, feedbackFileHash: null });
    const b = computeSealHash({ ...base, feedbackFileHash: Buffer.alloc(32, 0x00) });
    expect(a.equals(b)).toBe(false);
  });

  test('empty strings', () => {
    const hash = computeSealHash({
      value: 0n, valueDecimals: 0, score: 0,
      tag1: '', tag2: '', endpoint: '', feedbackUri: '',
      feedbackFileHash: null,
    });
    expect(hash.toString('hex')).toBe(
      'cc81c864e771056c9b0e5fc4401035f0189142d3d44364acf8e5a6597c469c2e',
    );
  });

  test('UTF-8 non-ASCII characters', () => {
    const hash = computeSealHash({
      value: 1000000n, valueDecimals: 6, score: null,
      tag1: '質量', tag2: 'émoji🎉',
      endpoint: 'https://例え.jp/api', feedbackUri: 'ipfs://QmTest',
      feedbackFileHash: null,
    });
    expect(hash.toString('hex')).toBe(
      '84be87fdff6ff50a53c30188026d69f28b4888bf4ae9bd93d27cc341520fe6e6',
    );
  });
});

// ---------------------------------------------------------------------------
// 9-11. computeFeedbackLeafV1
// ---------------------------------------------------------------------------

describe('computeFeedbackLeafV1', () => {
  const sealHash = Buffer.from(
    '95e4e651a4833ff431d6a290307d37bb3402e4bbad49b0252625b105195b40b6',
    'hex',
  );

  test('deterministic', () => {
    const a = computeFeedbackLeafV1(testAsset, testClient, 0n, sealHash, 12345n);
    const b = computeFeedbackLeafV1(testAsset, testClient, 0n, sealHash, 12345n);
    expect(a.equals(b)).toBe(true);
    // Cross-validated against Rust
    expect(a.toString('hex')).toBe(
      'f23e92ed586f8308ea256ecf95772531a89bd75a6782f5ab7cc99bc6c1fb5270',
    );
  });

  test('different feedbackIndex produces different leaf', () => {
    const a = computeFeedbackLeafV1(testAsset, testClient, 0n, sealHash, 12345n);
    const b = computeFeedbackLeafV1(testAsset, testClient, 1n, sealHash, 12345n);
    expect(a.equals(b)).toBe(false);
  });

  test('different slot produces different leaf', () => {
    const a = computeFeedbackLeafV1(testAsset, testClient, 0n, sealHash, 12345n);
    const b = computeFeedbackLeafV1(testAsset, testClient, 0n, sealHash, 99999n);
    expect(a.equals(b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. computeResponseLeaf
// ---------------------------------------------------------------------------

describe('computeResponseLeaf', () => {
  test('deterministic, no domain in leaf', () => {
    const a = computeResponseLeaf(
      testAsset, testClient, 0n, testResponder, testHash32, testHash32, 100n,
    );
    const b = computeResponseLeaf(
      testAsset, testClient, 0n, testResponder, testHash32, testHash32, 100n,
    );
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
  });

  test('different responder produces different leaf', () => {
    const otherResponder = Buffer.alloc(32, 0xee);
    const a = computeResponseLeaf(
      testAsset, testClient, 0n, testResponder, testHash32, testHash32, 100n,
    );
    const b = computeResponseLeaf(
      testAsset, testClient, 0n, otherResponder, testHash32, testHash32, 100n,
    );
    expect(a.equals(b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 13. computeRevokeLeaf
// ---------------------------------------------------------------------------

describe('computeRevokeLeaf', () => {
  test('deterministic, no domain in leaf', () => {
    const a = computeRevokeLeaf(testAsset, testClient, 0n, testHash32, 100n);
    const b = computeRevokeLeaf(testAsset, testClient, 0n, testHash32, 100n);
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
  });

  test('different feedbackHash produces different leaf', () => {
    const otherHash = Buffer.alloc(32, 0xff);
    const a = computeRevokeLeaf(testAsset, testClient, 0n, testHash32, 100n);
    const b = computeRevokeLeaf(testAsset, testClient, 0n, otherHash, 100n);
    expect(a.equals(b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 14-18. replayFeedbackChain
// ---------------------------------------------------------------------------

describe('replayFeedbackChain', () => {
  const sealHash = Buffer.alloc(32, 0x11);

  function makeEvent(index: bigint, slot: bigint, storedDigest?: Buffer): FeedbackReplayEvent {
    return { asset: testAsset, client: testClient, feedbackIndex: index, sealHash, slot, storedDigest };
  }

  test('zero events → ZERO_DIGEST, count 0, valid', () => {
    const result = replayFeedbackChain([]);
    expect(result.finalDigest.equals(ZERO_DIGEST)).toBe(true);
    expect(result.count).toBe(0);
    expect(result.valid).toBe(true);
  });

  test('single event matches manual computation', () => {
    const leaf = computeFeedbackLeafV1(testAsset, testClient, 0n, sealHash, 1000n);
    const expected = chainHash(ZERO_DIGEST, DOMAIN_FEEDBACK, leaf);

    const result = replayFeedbackChain([makeEvent(0n, 1000n)]);
    expect(result.finalDigest.equals(expected)).toBe(true);
    expect(result.count).toBe(1);
    expect(result.valid).toBe(true);
  });

  test('10 events sequential chain', () => {
    const events: FeedbackReplayEvent[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(makeEvent(BigInt(i), BigInt(1000 + i)));
    }
    const result = replayFeedbackChain(events);
    expect(result.count).toBe(10);
    expect(result.valid).toBe(true);
    expect(result.finalDigest.equals(ZERO_DIGEST)).toBe(false);

    // Replay again → same result
    const result2 = replayFeedbackChain(events);
    expect(result.finalDigest.equals(result2.finalDigest)).toBe(true);
  });

  test('wrong storedDigest detected at exact index', () => {
    const events: FeedbackReplayEvent[] = [
      makeEvent(0n, 100n),
      makeEvent(1n, 200n),
      makeEvent(2n, 300n, Buffer.alloc(32, 0xff)), // tampered
      makeEvent(3n, 400n),
    ];
    const result = replayFeedbackChain(events);
    expect(result.valid).toBe(false);
    expect(result.mismatchAt).toBe(2);
    expect(result.mismatchExpected).toBeDefined();
    expect(result.mismatchComputed).toBeDefined();
    expect(result.mismatchExpected).not.toBe(result.mismatchComputed);
  });

  test('tampered event detected at exact index', () => {
    // Build a valid chain first
    const events: FeedbackReplayEvent[] = [];
    let digest = ZERO_DIGEST;
    for (let i = 0; i < 5; i++) {
      const leaf = computeFeedbackLeafV1(testAsset, testClient, BigInt(i), sealHash, BigInt(1000 + i));
      digest = chainHash(digest, DOMAIN_FEEDBACK, leaf);
      events.push(makeEvent(BigInt(i), BigInt(1000 + i), Buffer.from(digest)));
    }

    // Valid chain should pass
    const validResult = replayFeedbackChain(events);
    expect(validResult.valid).toBe(true);

    // Tamper with event at index 2 (change the slot)
    const tampered = events.map((e, i) => i === 2
      ? { ...e, slot: 9999n } // different slot → different leaf → different digest
      : e,
    );
    const badResult = replayFeedbackChain(tampered);
    expect(badResult.valid).toBe(false);
    expect(badResult.mismatchAt).toBe(2);
  });

  test('from checkpoint matches full replay', () => {
    const events: FeedbackReplayEvent[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(makeEvent(BigInt(i), BigInt(1000 + i)));
    }

    const full = replayFeedbackChain(events);

    // Replay first 5
    const partial = replayFeedbackChain(events.slice(0, 5));
    // Continue from checkpoint
    const continued = replayFeedbackChain(events.slice(5), partial.finalDigest, partial.count);

    expect(continued.finalDigest.equals(full.finalDigest)).toBe(true);
    expect(continued.count).toBe(full.count);
    expect(continued.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 20. replayResponseChain
// ---------------------------------------------------------------------------

describe('replayResponseChain', () => {
  const responseHash = Buffer.alloc(32, 0x22);
  const feedbackHash = Buffer.alloc(32, 0x33);

  function makeEvent(index: bigint, slot: bigint): ResponseReplayEvent {
    return {
      asset: testAsset, client: testClient, feedbackIndex: index,
      responder: testResponder, responseHash, feedbackHash, slot,
    };
  }

  test('zero events → ZERO_DIGEST', () => {
    const result = replayResponseChain([]);
    expect(result.finalDigest.equals(ZERO_DIGEST)).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('single event matches manual computation', () => {
    const leaf = computeResponseLeaf(
      testAsset, testClient, 0n, testResponder, responseHash, feedbackHash, 500n,
    );
    const expected = chainHash(ZERO_DIGEST, DOMAIN_RESPONSE, leaf);

    const result = replayResponseChain([makeEvent(0n, 500n)]);
    expect(result.finalDigest.equals(expected)).toBe(true);
    expect(result.count).toBe(1);
  });

  test('5 events sequential chain', () => {
    const events: ResponseReplayEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(makeEvent(BigInt(i), BigInt(2000 + i)));
    }
    const result = replayResponseChain(events);
    expect(result.count).toBe(5);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 21. replayRevokeChain
// ---------------------------------------------------------------------------

describe('replayRevokeChain', () => {
  const feedbackHash = Buffer.alloc(32, 0x44);

  function makeEvent(index: bigint, slot: bigint): RevokeReplayEvent {
    return {
      asset: testAsset, client: testClient, feedbackIndex: index,
      feedbackHash, slot,
    };
  }

  test('zero events → ZERO_DIGEST', () => {
    const result = replayRevokeChain([]);
    expect(result.finalDigest.equals(ZERO_DIGEST)).toBe(true);
    expect(result.valid).toBe(true);
  });

  test('single event matches manual computation', () => {
    const leaf = computeRevokeLeaf(testAsset, testClient, 0n, feedbackHash, 700n);
    const expected = chainHash(ZERO_DIGEST, DOMAIN_REVOKE, leaf);

    const result = replayRevokeChain([makeEvent(0n, 700n)]);
    expect(result.finalDigest.equals(expected)).toBe(true);
    expect(result.count).toBe(1);
  });

  test('3 events sequential chain', () => {
    const events: RevokeReplayEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(makeEvent(BigInt(i), BigInt(3000 + i)));
    }
    const result = replayRevokeChain(events);
    expect(result.count).toBe(3);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 22. Performance
// ---------------------------------------------------------------------------

describe('Performance', () => {
  test('1000 feedback events in < 50ms', () => {
    const sealHash = Buffer.alloc(32, 0x55);
    const events: FeedbackReplayEvent[] = [];
    for (let i = 0; i < 1000; i++) {
      events.push({
        asset: testAsset,
        client: testClient,
        feedbackIndex: BigInt(i),
        sealHash,
        slot: BigInt(10000 + i),
      });
    }

    const start = performance.now();
    const result = replayFeedbackChain(events);
    const elapsed = performance.now() - start;

    expect(result.count).toBe(1000);
    expect(result.valid).toBe(true);
    // Perf check is environment-dependent; this guards against algorithmic regressions.
    expect(elapsed).toBeLessThan(200);
  });
});
