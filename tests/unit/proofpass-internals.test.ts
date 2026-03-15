import { describe, expect, it } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';

import {
  PROOFPASS_MODE_8004,
  buildProofPassIntent,
  computeProofPassBlindCommitment,
  computeProofPassSessionBlindCommitment,
  hashProofPassContextRef,
  normalizeProofPassPayload,
  resolveProofPassExpirySlot,
  resolveProofPassFeeConfig,
} from '../../src/extras/internal/proofpass-internals.js';
import { computeSealHash } from '../../src/core/seal.js';

describe('proofpass internals', () => {
  const asset = new PublicKey(Buffer.alloc(32, 1));
  const client = new PublicKey(Buffer.alloc(32, 2));

  it('normalizes 8004 feedback exactly like giveFeedback for sealHash preview', () => {
    const normalized = normalizeProofPassPayload({
      value: '84.00',
      tag1: 'starred',
      endpoint: '/chat',
    });

    expect(normalized.value).toBe(84n);
    expect(normalized.valueDecimals).toBe(0);
    expect(normalized.normalizedValue).toBe('84');
    expect(normalized.score).toBe(84);
    expect(normalized.feedbackUri).toBe('');

    const expectedSealHash = computeSealHash({
      value: 84n,
      valueDecimals: 0,
      score: 84,
      tag1: 'starred',
      tag2: '',
      endpoint: '/chat',
      feedbackUri: '',
      feedbackFileHash: null,
    });

    expect(normalized.sealHashPreview.equals(expectedSealHash)).toBe(true);
  });

  it('preserves explicit score and feedback file hash in the preview payload', () => {
    const feedbackFileHash = Buffer.alloc(32, 0xab);
    const normalized = normalizeProofPassPayload({
      value: 1234567890123n,
      valueDecimals: 12,
      score: 73,
      tag1: 'starred',
      tag2: 'latency',
      endpoint: 'https://agent.example/api',
      feedbackUri: 'ipfs://feedback',
      feedbackFileHash,
    });

    expect(normalized.score).toBe(73);
    expect(normalized.feedbackFileHash).toEqual(feedbackFileHash);
    expect(normalized.sealHashPreview.equals(
      computeSealHash({
        value: 1234567890123n,
        valueDecimals: 12,
        score: 73,
        tag1: 'starred',
        tag2: 'latency',
        endpoint: 'https://agent.example/api',
        feedbackUri: 'ipfs://feedback',
        feedbackFileHash,
      })
    )).toBe(true);
  });

  it('keeps the same atom inference limits as giveFeedback', () => {
    expect(() =>
      normalizeProofPassPayload({
        value: 1234567n,
        valueDecimals: 7,
        tag1: 'starred',
      })
    ).toThrow('Invalid decimals: 7');
  });

  it('computes blind commitments deterministically from content hash and blind nonce', () => {
    const contentHash = Buffer.alloc(32, 0x11);
    const blindNonce = Buffer.alloc(32, 0x22);

    const first = computeProofPassBlindCommitment(contentHash, blindNonce);
    const second = computeProofPassBlindCommitment(contentHash, blindNonce);
    const changed = computeProofPassBlindCommitment(contentHash, Buffer.alloc(32, 0x23));

    expect(first.length).toBe(32);
    expect(first.equals(second)).toBe(true);
    expect(first.equals(changed)).toBe(false);
  });

  it('builds a canonical off-chain intent with hashed context, fees, and expiry', () => {
    const blindNonce = Buffer.alloc(32, 0x44);
    const nonce = Buffer.alloc(32, 0x55);
    const intent = buildProofPassIntent({
      asset,
      client,
      feedback: {
        value: '42',
        tag1: 'starred',
        endpoint: '/chat',
      },
      contextType: 3,
      contextRef: 'deal-42',
      blindNonce,
      nonce,
      issuedAt: 1712345678901,
      ttlConfig: {
        currentSlot: 10_000,
        defaultExpirySlots: 25,
        maxExpirySlots: 100,
      },
      feeConfig: {
        openFeeLamports: 5_000,
        finalizeFeeLamports: 9_000,
      },
    });

    expect(intent.mode).toBe(PROOFPASS_MODE_8004);
    expect(intent.asset).toBe(asset.toBase58());
    expect(intent.client).toBe(client.toBase58());
    expect(intent.contextType).toBe(3);
    expect(intent.contextRefHash.equals(hashProofPassContextRef('deal-42'))).toBe(true);
    expect(intent.contentHash.equals(intent.sealHashPreview)).toBe(true);
    expect(intent.blindNonce).toEqual(blindNonce);
    expect(intent.nonce).toEqual(nonce);
    expect(intent.issuedAt).toBe(1712345678901);
    expect(intent.expirySlot).toBe(10_025n);
    expect(intent.feeConfig.openFeeLamports).toBe(5_000n);
    expect(intent.feeConfig.finalizeFeeLamports).toBe(9_000n);
    expect(intent.blindCommitment.equals(
      computeProofPassSessionBlindCommitment(
        {
          reviewer: client,
          asset,
          contextType: 3,
          contextRefHash: hashProofPassContextRef('deal-42'),
        },
        intent.contentHash,
        blindNonce
      )
    )).toBe(true);
  });

  it('rejects ambiguous context inputs', () => {
    expect(() =>
      buildProofPassIntent({
        asset,
        client,
        feedback: { value: '1' },
        contextRef: 'deal-42',
        contextRefHash: Buffer.alloc(32, 0x01),
      })
    ).toThrow('Provide either contextRef or contextRefHash, not both');
  });

  it('resolves expiry and fee helpers with safe defaults and guardrails', () => {
    expect(resolveProofPassExpirySlot()).toBeNull();
    expect(resolveProofPassExpirySlot({ currentSlot: 200n, defaultExpirySlots: 5n })).toBe(205n);
    expect(() =>
      resolveProofPassExpirySlot({ currentSlot: 200n, maxExpirySlots: 5n }, 206n)
    ).toThrow('expirySlot window must be <= maxExpirySlots');

    const fees = resolveProofPassFeeConfig();
    expect(fees.openFeeLamports).toBe(0n);
    expect(fees.finalizeFeeLamports).toBe(0n);
  });
});
