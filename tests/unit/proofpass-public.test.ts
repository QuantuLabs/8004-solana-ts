import { describe, expect, it } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';

import {
  DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS,
  DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS,
  PROOFPASS_BLIND_COMMITMENT_DOMAIN,
  PROOFPASS_BYTES32_LEN,
  PROOFPASS_MODE_8004,
  PROOFPASS_PROGRAM_ID,
  buildProofPassAcceptSessionInstruction,
  buildProofPassCancelBeforeAcceptInstruction,
  buildProofPassCancelExpiredInstruction,
  buildProofPassFinalizeAndGiveFeedbackInstruction,
  buildProofPassIntent,
  buildProofPassOpenSessionInstruction,
  computeProofPassBlindCommitment,
  computeProofPassSessionBlindCommitment,
  createProofPassBlindNonce,
  createProofPassNonce,
  getProofPassConfigPda,
  getProofPassSessionBinding,
  getProofPassSessionPda,
  hashProofPassContextRef,
  normalizeProofPassPayload,
  resolveProofPassIntentTiming,
  resolveProofPassExpirySlot,
  resolveProofPassFeeConfig,
} from '../../src/index.js';

describe('proofpass public surface', () => {
  const asset = new PublicKey(Buffer.alloc(32, 7));
  const client = new PublicKey(Buffer.alloc(32, 8));

  it('re-exports the core ProofPass constants and basic helpers from the package root', () => {
    expect(PROOFPASS_MODE_8004).toBe('8004');
    expect(PROOFPASS_BYTES32_LEN).toBe(32);
    expect(PROOFPASS_BLIND_COMMITMENT_DOMAIN).toBeInstanceOf(Buffer);
    expect(PROOFPASS_BLIND_COMMITMENT_DOMAIN.length).toBeGreaterThan(0);
    expect(createProofPassBlindNonce().length).toBe(PROOFPASS_BYTES32_LEN);
    expect(createProofPassNonce().length).toBe(PROOFPASS_BYTES32_LEN);
  });

  it('re-exports the default fee profile and TTL helper from the package root', () => {
    const resolved = resolveProofPassFeeConfig();
    const timing = resolveProofPassIntentTiming({ currentSlot: 1_000n });

    expect(resolved.openFeeLamports).toBe(DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS);
    expect(resolved.finalizeFeeLamports).toBe(DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS);
    expect(timing.ttlSlots).toBe(512n);
    expect(timing.expirySlot).toBe(1_512n);
    expect(
      resolveProofPassExpirySlot({
        currentSlot: 1_000n,
        defaultExpirySlots: 25n,
        maxExpirySlots: 100n,
      })
    ).toBe(1_025n);
  });

  it('builds a root-level intent with default fees and reviewer/client coherence', () => {
    const blindNonce = Buffer.alloc(PROOFPASS_BYTES32_LEN, 0x31);
    const nonce = Buffer.alloc(PROOFPASS_BYTES32_LEN, 0x42);
    const contextRef = 'x402:demo:request-1';
    const normalized = normalizeProofPassPayload({
      value: '99.77',
      tag1: 'uptime',
      tag2: 'day',
      endpoint: 'https://api.example.com/mcp',
    });

    const directCommitment = computeProofPassBlindCommitment(
      normalized.sealHashPreview,
      blindNonce
    );
    const intent = buildProofPassIntent({
      asset,
      client,
      contextRef,
      currentSlot: 500n,
      ttlSlots: 25n,
      advanced: {
        blindNonce,
        nonce,
      },
      feedback: {
        value: '99.77',
        tag1: 'uptime',
        tag2: 'day',
        endpoint: 'https://api.example.com/mcp',
      },
    });

    expect(intent.mode).toBe(PROOFPASS_MODE_8004);
    expect(intent.asset).toBe(asset.toBase58());
    expect(intent.client).toBe(client.toBase58());
    expect(intent.contentHash.equals(normalized.sealHashPreview)).toBe(true);
    expect(intent.expirySlot).toBe(525n);
    expect(intent.feeConfig.openFeeLamports).toBe(DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS);
    expect(intent.feeConfig.finalizeFeeLamports).toBe(DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS);
    expect(intent.blindCommitment.equals(directCommitment)).toBe(false);
    expect(
      intent.blindCommitment.equals(
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
      )
    ).toBe(true);
  });

  it('reuses the same derived session account across the public session builders', () => {
    const treasury = new PublicKey(Buffer.alloc(32, 9));
    const revieweeApprover = new PublicKey(Buffer.alloc(32, 10));
    const agentAccount = new PublicKey(Buffer.alloc(32, 11));
    const collection = new PublicKey(Buffer.alloc(32, 12));
    const blindNonce = Buffer.alloc(PROOFPASS_BYTES32_LEN, 0x51);
    const nonce = Buffer.alloc(PROOFPASS_BYTES32_LEN, 0x61);
    const intent = buildProofPassIntent({
      asset,
      client,
      contextRef: 'x402:demo:builders',
      currentSlot: 2_000n,
      ttlSlots: 40n,
      advanced: {
        blindNonce,
        nonce,
      },
      feedback: {
        value: '88.5',
        tag1: 'successrate',
        endpoint: 'https://api.example.com/score',
      },
    });
    const binding = getProofPassSessionBinding(intent);
    const [config] = getProofPassConfigPda(PROOFPASS_PROGRAM_ID);
    const [session] = getProofPassSessionPda(
      binding.client,
      binding.asset,
      intent.blindNonce,
      PROOFPASS_PROGRAM_ID
    );

    const openIx = buildProofPassOpenSessionInstruction({ intent, treasury });
    const acceptIx = buildProofPassAcceptSessionInstruction({ intent, revieweeApprover });
    const cancelBeforeIx = buildProofPassCancelBeforeAcceptInstruction({ intent });
    const cancelExpiredIx = buildProofPassCancelExpiredInstruction({ intent });
    const finalizeIx = buildProofPassFinalizeAndGiveFeedbackInstruction({
      intent,
      treasury,
      agentAccount,
      collection,
    });

    expect(binding).toEqual(intent.sessionBinding);
    expect(openIx.programId.toBase58()).toBe(PROOFPASS_PROGRAM_ID.toBase58());
    expect(openIx.keys[1]?.pubkey.toBase58()).toBe(config.toBase58());
    expect(openIx.keys[3]?.pubkey.toBase58()).toBe(session.toBase58());
    expect(openIx.keys[4]?.pubkey.toBase58()).toBe(binding.asset);

    expect(acceptIx.keys[1]?.pubkey.toBase58()).toBe(session.toBase58());
    expect(acceptIx.keys[2]?.pubkey.toBase58()).toBe(binding.asset);

    expect(cancelBeforeIx.keys[0]?.pubkey.toBase58()).toBe(binding.client);
    expect(cancelBeforeIx.keys[1]?.pubkey.toBase58()).toBe(session.toBase58());

    expect(cancelExpiredIx.keys[0]?.pubkey.toBase58()).toBe(binding.client);
    expect(cancelExpiredIx.keys[1]?.pubkey.toBase58()).toBe(session.toBase58());

    expect(finalizeIx.keys[1]?.pubkey.toBase58()).toBe(config.toBase58());
    expect(finalizeIx.keys[3]?.pubkey.toBase58()).toBe(session.toBase58());
    expect(finalizeIx.keys[5]?.pubkey.toBase58()).toBe(binding.asset);
  });

  it('derives the public session PDA from intent.blindNonce when nonce and blindNonce diverge', () => {
    const treasury = new PublicKey(Buffer.alloc(32, 13));
    const blindNonce = Buffer.alloc(PROOFPASS_BYTES32_LEN, 0x71);
    const nonce = Buffer.alloc(PROOFPASS_BYTES32_LEN, 0x82);
    const intent = buildProofPassIntent({
      asset,
      client,
      contextRef: 'x402:demo:nonce-vs-blind',
      currentSlot: 3_000n,
      ttlSlots: 30n,
      advanced: {
        blindNonce,
        nonce,
      },
      feedback: {
        value: '77.7',
        tag1: 'reachable',
        endpoint: 'https://api.example.com/health',
      },
    });
    const [sessionFromNonce] = getProofPassSessionPda(
      intent.client,
      intent.asset,
      intent.nonce,
      PROOFPASS_PROGRAM_ID
    );
    const [sessionFromBlindNonce] = getProofPassSessionPda(
      intent.client,
      intent.asset,
      intent.blindNonce,
      PROOFPASS_PROGRAM_ID
    );
    const openIx = buildProofPassOpenSessionInstruction({
      intent,
      treasury,
    });

    expect(sessionFromNonce.toBase58()).not.toBe(sessionFromBlindNonce.toBase58());
    expect(openIx.keys[3]?.pubkey.toBase58()).toBe(sessionFromBlindNonce.toBase58());
  });
});
