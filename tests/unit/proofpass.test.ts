import { describe, expect, it } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';

import {
  DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS,
  DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS,
  PROOFPASS_BYTES32_LEN,
  PROOFPASS_MODE_8004,
  buildProofPassIntent,
  computeProofPassSessionBlindCommitment,
  hashProofPassContextRef,
  resolveProofPassFeeConfig,
} from '../../src/extras/proofpass.js';

describe('proofpass', () => {
  it('applies the default 25k / 25k fee profile', () => {
    const resolved = resolveProofPassFeeConfig();
    expect(resolved.openFeeLamports).toBe(DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS);
    expect(resolved.finalizeFeeLamports).toBe(DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS);
  });

  it('builds a blind 8004 intent with sealHash-backed content hash', () => {
    const asset = PublicKey.unique();
    const client = PublicKey.unique();
    const blindNonce = Buffer.alloc(PROOFPASS_BYTES32_LEN, 0x17);
    const nonce = Buffer.alloc(PROOFPASS_BYTES32_LEN, 0x29);
    const contextRef = 'x402:demo:request-1';

    const intent = buildProofPassIntent({
      asset,
      client,
      contextRef,
      currentSlot: 100n,
      ttlSlots: 50n,
      advanced: {
        blindNonce,
        nonce,
      },
      feedback: {
        value: '99.77',
        tag1: 'uptime',
        tag2: 'day',
        endpoint: 'https://api.example.com/mcp',
        feedbackUri: 'ipfs://feedback',
      },
    });

    expect(intent.mode).toBe(PROOFPASS_MODE_8004);
    expect(intent.asset).toBe(asset.toBase58());
    expect(intent.client).toBe(client.toBase58());
    expect(intent.contentHash.equals(intent.sealHashPreview)).toBe(true);
    expect(intent.blindCommitment.length).toBe(PROOFPASS_BYTES32_LEN);
    expect(intent.blindNonce.length).toBe(PROOFPASS_BYTES32_LEN);
    expect(intent.nonce.length).toBe(PROOFPASS_BYTES32_LEN);
    expect(intent.expirySlot).toBe(150n);
    expect(intent.feeConfig.openFeeLamports).toBe(25_000n);
    expect(intent.feeConfig.finalizeFeeLamports).toBe(25_000n);
    expect(intent.blindNonce).toEqual(blindNonce);
    expect(intent.nonce).toEqual(nonce);
    expect(intent.blindCommitment.equals(
      computeProofPassSessionBlindCommitment(
        {
          client,
          asset,
          contextType: intent.contextType,
          contextRefHash: hashProofPassContextRef(contextRef),
        },
        intent.contentHash,
        blindNonce
      )
    )).toBe(true);
  });
});
