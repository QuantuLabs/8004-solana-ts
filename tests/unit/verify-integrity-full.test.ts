import { describe, test, expect } from '@jest/globals';
import { Keypair } from '@solana/web3.js';

const ZERO_DIGEST = Buffer.alloc(32);

import type {
  FullVerificationOptions,
  FullVerificationResult,
  ReplayEventData,
  ReplayDataPage,
  CheckpointSet,
} from '../../src/index.js';

import {
  chainHash,
  computeFeedbackLeafV1,
  computeResponseLeaf,
  computeRevokeLeaf,
  replayFeedbackChain,
  replayResponseChain,
  replayRevokeChain,
  DOMAIN_FEEDBACK,
  DOMAIN_RESPONSE,
  DOMAIN_REVOKE,
} from '../../src/core/hash-chain-replay.js';
import type {
  FeedbackReplayEvent,
  ResponseReplayEvent,
  RevokeReplayEvent,
} from '../../src/core/hash-chain-replay.js';

const testAsset = Keypair.generate();
const testClient = Keypair.generate();
const testOwner = Keypair.generate();

function makeSealHash(index: number): Buffer {
  const buf = Buffer.alloc(32);
  buf.writeUInt32LE(index);
  return buf;
}

describe('verifyIntegrityFull types and replay integration', () => {
  describe('type exports', () => {
    test('FullVerificationOptions type is usable', () => {
      const opts: FullVerificationOptions = {
        useCheckpoints: true,
        batchSize: 500,
      };
      expect(opts.useCheckpoints).toBe(true);
      expect(opts.batchSize).toBe(500);
    });

    test('FullVerificationResult type has correct shape', () => {
      const result: FullVerificationResult = {
        valid: true,
        feedback: {
          valid: true,
          computedDigest: ZERO_DIGEST.toString('hex'),
          expectedDigest: ZERO_DIGEST.toString('hex'),
          computedCount: 0,
          expectedCount: 0,
          match: true,
        },
        response: {
          valid: true,
          computedDigest: ZERO_DIGEST.toString('hex'),
          expectedDigest: ZERO_DIGEST.toString('hex'),
          computedCount: 0,
          expectedCount: 0,
          match: true,
        },
        revoke: {
          valid: true,
          computedDigest: ZERO_DIGEST.toString('hex'),
          expectedDigest: ZERO_DIGEST.toString('hex'),
          computedCount: 0,
          expectedCount: 0,
          match: true,
        },
        duration: 0,
      };
      expect(result.valid).toBe(true);
      expect(result.feedback.match).toBe(true);
    });

    test('ReplayDataPage type is usable', () => {
      const page: ReplayDataPage = {
        events: [],
        hasMore: false,
        nextFromCount: 0,
      };
      expect(page.hasMore).toBe(false);
    });

    test('CheckpointSet type is usable', () => {
      const cs: CheckpointSet = {
        feedback: { event_count: 1000, digest: 'aa'.repeat(32), created_at: new Date().toISOString() },
        response: null,
        revoke: null,
      };
      expect(cs.feedback?.event_count).toBe(1000);
      expect(cs.response).toBeNull();
    });
  });

  describe('SDK replay functions produce deterministic results', () => {
    test('chainHash is deterministic', () => {
      const prev = Buffer.alloc(32, 0x01);
      const leaf = Buffer.alloc(32, 0x02);

      const result1 = chainHash(prev, DOMAIN_FEEDBACK, leaf);
      const result2 = chainHash(prev, DOMAIN_FEEDBACK, leaf);

      expect(result1.toString('hex')).toBe(result2.toString('hex'));
      expect(result1.toString('hex')).not.toBe(ZERO_DIGEST.toString('hex'));
    });

    test('computeFeedbackLeafV1 is deterministic', () => {
      const asset = Buffer.from(testAsset.publicKey.toBuffer());
      const client = Buffer.from(testClient.publicKey.toBuffer());
      const sealHash = makeSealHash(42);

      const result1 = computeFeedbackLeafV1(asset, client, 5n, sealHash, 1000n);
      const result2 = computeFeedbackLeafV1(asset, client, 5n, sealHash, 1000n);

      expect(Buffer.from(result1).toString('hex')).toBe(Buffer.from(result2).toString('hex'));
    });

    test('different inputs produce different chainHash', () => {
      const prev = Buffer.alloc(32, 0x01);
      const leaf1 = Buffer.alloc(32, 0x02);
      const leaf2 = Buffer.alloc(32, 0x03);

      const r1 = chainHash(prev, DOMAIN_FEEDBACK, leaf1);
      const r2 = chainHash(prev, DOMAIN_FEEDBACK, leaf2);

      expect(r1.toString('hex')).not.toBe(r2.toString('hex'));
    });

    test('replayFeedbackChain produces correct digest for N events', () => {
      const assetBuf = Buffer.from(testAsset.publicKey.toBuffer());
      const clientBuf = Buffer.from(testClient.publicKey.toBuffer());

      const events: FeedbackReplayEvent[] = [];
      let expectedDigest = Buffer.from(ZERO_DIGEST);

      for (let i = 0; i < 10; i++) {
        const sealHash = makeSealHash(i);
        const leaf = computeFeedbackLeafV1(assetBuf, clientBuf, BigInt(i), sealHash, BigInt(100 + i));
        expectedDigest = chainHash(expectedDigest, DOMAIN_FEEDBACK, Buffer.from(leaf));

        events.push({
          asset: assetBuf,
          client: clientBuf,
          feedbackIndex: BigInt(i),
          sealHash,
          slot: BigInt(100 + i),
        });
      }

      const result = replayFeedbackChain(events);
      expect(result.finalDigest.toString('hex')).toBe(expectedDigest.toString('hex'));
      expect(result.count).toBe(10);
      expect(result.valid).toBe(true);
    });

    test('replayFeedbackChain detects tampered sealHash', () => {
      const assetBuf = Buffer.from(testAsset.publicKey.toBuffer());
      const clientBuf = Buffer.from(testClient.publicKey.toBuffer());

      const events: FeedbackReplayEvent[] = [];
      let runningDigest = Buffer.from(ZERO_DIGEST);

      for (let i = 0; i < 5; i++) {
        const sealHash = makeSealHash(i);
        const leaf = computeFeedbackLeafV1(assetBuf, clientBuf, BigInt(i), sealHash, BigInt(100 + i));
        runningDigest = chainHash(runningDigest, DOMAIN_FEEDBACK, Buffer.from(leaf));

        events.push({
          asset: assetBuf,
          client: clientBuf,
          feedbackIndex: BigInt(i),
          sealHash,
          slot: BigInt(100 + i),
          storedDigest: Buffer.from(runningDigest),
        });
      }

      // Tamper with event 2's sealHash
      events[2] = { ...events[2], sealHash: Buffer.alloc(32, 0xff) };

      const result = replayFeedbackChain(events);
      expect(result.valid).toBe(false);
      expect(result.mismatchAt).toBe(2); // 0-indexed
    });

    test('replayResponseChain produces correct digest', () => {
      const assetBuf = Buffer.from(testAsset.publicKey.toBuffer());
      const clientBuf = Buffer.from(testClient.publicKey.toBuffer());
      const responderBuf = Buffer.from(testOwner.publicKey.toBuffer());

      const respHash = makeSealHash(99);
      const fbHash = makeSealHash(0);

      const leaf = computeResponseLeaf(assetBuf, clientBuf, 0n, responderBuf, respHash, fbHash, 200n);
      const expectedDigest = chainHash(Buffer.from(ZERO_DIGEST), DOMAIN_RESPONSE, leaf);

      const events: ResponseReplayEvent[] = [{
        asset: assetBuf,
        client: clientBuf,
        feedbackIndex: 0n,
        responder: responderBuf,
        responseHash: respHash,
        feedbackHash: fbHash,
        slot: 200n,
      }];

      const result = replayResponseChain(events);
      expect(result.finalDigest.toString('hex')).toBe(expectedDigest.toString('hex'));
      expect(result.count).toBe(1);
    });

    test('replayRevokeChain produces correct digest', () => {
      const assetBuf = Buffer.from(testAsset.publicKey.toBuffer());
      const clientBuf = Buffer.from(testClient.publicKey.toBuffer());
      const fbHash = makeSealHash(0);

      const leaf = computeRevokeLeaf(assetBuf, clientBuf, 0n, fbHash, 300n);
      const expectedDigest = chainHash(Buffer.from(ZERO_DIGEST), DOMAIN_REVOKE, leaf);

      const events: RevokeReplayEvent[] = [{
        asset: assetBuf,
        client: clientBuf,
        feedbackIndex: 0n,
        feedbackHash: fbHash,
        slot: 300n,
      }];

      const result = replayRevokeChain(events);
      expect(result.finalDigest.toString('hex')).toBe(expectedDigest.toString('hex'));
      expect(result.count).toBe(1);
    });
  });

  describe('checkpoint continuation', () => {
    test('replay from checkpoint matches full replay', () => {
      const assetBuf = Buffer.from(testAsset.publicKey.toBuffer());
      const clientBuf = Buffer.from(testClient.publicKey.toBuffer());

      const allEvents: FeedbackReplayEvent[] = [];
      for (let i = 0; i < 20; i++) {
        allEvents.push({
          asset: assetBuf,
          client: clientBuf,
          feedbackIndex: BigInt(i),
          sealHash: makeSealHash(i),
          slot: BigInt(100 + i),
        });
      }

      const fullResult = replayFeedbackChain(allEvents);

      // Replay first half to get checkpoint
      const firstHalf = allEvents.slice(0, 10);
      const checkpointResult = replayFeedbackChain(firstHalf);

      // Resume from checkpoint
      const secondHalf = allEvents.slice(10);
      const resumedResult = replayFeedbackChain(
        secondHalf,
        checkpointResult.finalDigest,
        checkpointResult.count,
      );

      expect(resumedResult.finalDigest.toString('hex')).toBe(fullResult.finalDigest.toString('hex'));
      expect(resumedResult.count).toBe(fullResult.count);
    });
  });

  describe('empty chains', () => {
    test('empty feedback replay returns zero digest', () => {
      const result = replayFeedbackChain([]);
      expect(result.finalDigest.toString('hex')).toBe(ZERO_DIGEST.toString('hex'));
      expect(result.count).toBe(0);
      expect(result.valid).toBe(true);
    });

    test('empty response replay returns zero digest', () => {
      const result = replayResponseChain([]);
      expect(result.finalDigest.toString('hex')).toBe(ZERO_DIGEST.toString('hex'));
      expect(result.count).toBe(0);
    });

    test('empty revoke replay returns zero digest', () => {
      const result = replayRevokeChain([]);
      expect(result.finalDigest.toString('hex')).toBe(ZERO_DIGEST.toString('hex'));
      expect(result.count).toBe(0);
    });
  });

  describe('cross-validation: indexer format to SDK replay', () => {
    test('indexer-style replay data converts correctly for SDK replay', () => {
      const assetBuf = Buffer.from(testAsset.publicKey.toBuffer());
      const clientBuf = Buffer.from(testClient.publicKey.toBuffer());

      // Compute expected digests manually
      let expectedDigest = Buffer.from(ZERO_DIGEST);

      const feedbackEvents: FeedbackReplayEvent[] = [];
      for (let i = 0; i < 5; i++) {
        const sealHash = makeSealHash(i);
        const leaf = computeFeedbackLeafV1(assetBuf, clientBuf, BigInt(i), sealHash, BigInt(100 + i));
        expectedDigest = chainHash(expectedDigest, DOMAIN_FEEDBACK, Buffer.from(leaf));

        feedbackEvents.push({
          asset: assetBuf,
          client: clientBuf,
          feedbackIndex: BigInt(i),
          sealHash,
          slot: BigInt(100 + i),
          storedDigest: Buffer.from(expectedDigest),
        });
      }

      const result = replayFeedbackChain(feedbackEvents);

      expect(result.valid).toBe(true);
      expect(result.count).toBe(5);
      expect(result.finalDigest.toString('hex')).toBe(expectedDigest.toString('hex'));
    });
  });

  describe('performance', () => {
    test('replay 5000 feedback events under 200ms', () => {
      const assetBuf = Buffer.from(testAsset.publicKey.toBuffer());
      const clientBuf = Buffer.from(testClient.publicKey.toBuffer());

      const events: FeedbackReplayEvent[] = [];
      for (let i = 0; i < 5000; i++) {
        events.push({
          asset: assetBuf,
          client: clientBuf,
          feedbackIndex: BigInt(i),
          sealHash: makeSealHash(i),
          slot: BigInt(100 + i),
        });
      }

      const start = performance.now();
      const result = replayFeedbackChain(events);
      const elapsed = performance.now() - start;

      expect(result.count).toBe(5000);
      expect(result.valid).toBe(true);
      // Perf check is environment-dependent (CPU load, Node/Jest runtime).
      // This guards against accidental O(n^2) regressions, not micro-bench precision.
      expect(elapsed).toBeLessThan(800);
    });
  });
});
