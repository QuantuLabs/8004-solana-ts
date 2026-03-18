import { describe, expect, it } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';

import {
  buildInitializeProofPassConfigInstruction,
  buildProofPassFinalizeAndGiveFeedbackInstruction,
  buildProofPassOpenSessionInstruction,
  buildProofPassUpdateTreasuryInstruction,
  getProofPassSessionPda,
  PROOFPASS_PROGRAM_ID,
} from '../../src/extras/proofpass.js';
import {
  MAINNET_AGENT_REGISTRY_PROGRAM_ID,
  MAINNET_ATOM_ENGINE_PROGRAM_ID,
} from '../../src/core/programs.js';

describe('proofpass builders', () => {
  const creator = new PublicKey(Buffer.alloc(32, 4));
  const reviewer = new PublicKey(Buffer.alloc(32, 5));
  const targetAsset = new PublicKey(Buffer.alloc(32, 6));
  const treasury = new PublicKey(Buffer.alloc(32, 7));
  const agentAccount = new PublicKey(Buffer.alloc(32, 8));
  const collection = new PublicKey(Buffer.alloc(32, 9));
  const registryProgram = new PublicKey(Buffer.alloc(32, 10));
  const atomEngineProgram = new PublicKey(Buffer.alloc(32, 11));

  it('derives the session PDA from creator + reviewer + targetAsset + nonce', () => {
    const nonce = Buffer.alloc(32, 0x44);
    const [session] = getProofPassSessionPda(
      creator,
      reviewer,
      targetAsset,
      nonce,
      PROOFPASS_PROGRAM_ID
    );

    expect(session).toBeInstanceOf(PublicKey);
  });

  it('encodes an open instruction with optional endpoint, feedback uri and file hash hints', () => {
    const feedbackFileHashHint = Buffer.alloc(32, 0x11);
    const ix = buildProofPassOpenSessionInstruction({
      creator,
      reviewer,
      targetAgent: targetAsset,
      treasury,
      contextRef: 'x402:demo:builder-open',
      ttlSlots: 20n,
      nonce: Buffer.alloc(32, 0x22),
      endpoint: '/service/builder-open',
      feedbackUri: 'ipfs://payment-builder',
      feedbackFileHashHint,
      feeMode: 'reviewer_pays_finalize',
    });

    expect(ix.keys[0]?.pubkey.toBase58()).toBe(creator.toBase58());
    expect(ix.keys[4]?.pubkey.toBase58()).toBe(targetAsset.toBase58());
    expect(ix.data[0]).toBe(1);
    expect(Buffer.from(ix.data.subarray(1, 33)).equals(reviewer.toBuffer())).toBe(true);
    expect(Buffer.from(ix.data).includes(Buffer.from('/service/builder-open'))).toBe(true);
    expect(Buffer.from(ix.data).includes(Buffer.from('ipfs://payment-builder'))).toBe(true);
    expect(Buffer.from(ix.data).includes(feedbackFileHashHint)).toBe(true);
    expect(ix.data[ix.data.length - 1]).toBe(1);
  });

  it('accepts targetAgent as the friendly alias for the target asset pubkey', () => {
    const ix = buildProofPassOpenSessionInstruction({
      creator,
      reviewer,
      targetAgent: targetAsset,
      treasury,
      contextRef: 'x402:demo:builder-open-alias',
    });

    expect(ix.keys[4]?.pubkey.toBase58()).toBe(targetAsset.toBase58());
  });

  it('rejects mismatched targetAgent and targetAsset values', () => {
    expect(() =>
      buildProofPassOpenSessionInstruction({
        creator,
        reviewer,
        targetAgent: targetAsset,
        targetAsset: PublicKey.unique(),
        treasury,
        contextRef: 'x402:demo:builder-open-mismatch',
      })
    ).toThrow('targetAgent and targetAsset must match when both are provided');
  });

  it('requires an explicit registryProgramId when initializing ProofPass config', () => {
    expect(() =>
      buildInitializeProofPassConfigInstruction({
        authority: creator,
        treasury,
        maxExpirySlots: 64n,
      } as any)
    ).toThrow('registryProgramId is required');
  });

  it('encodes finalize directly as the 8004 giveFeedback payload', () => {
    const ix = buildProofPassFinalizeAndGiveFeedbackInstruction({
      session: PublicKey.unique(),
      creator,
      reviewer,
      asset: targetAsset,
      treasury,
      agentAccount,
      collection,
      registryProgramId: registryProgram,
      atomEngineProgramId: atomEngineProgram,
      feedback: {
        value: '99.1',
        tag1: 'uptime',
        feedbackUri: 'ipfs://feedback-builder',
      },
    });

    expect(ix.data[0]).toBe(5);
    expect(Buffer.from(ix.data).includes(Buffer.from('ipfs://feedback-builder'))).toBe(true);
    expect(ix.keys[3]?.pubkey.toBase58()).toBe(creator.toBase58());
    expect(ix.keys[8]?.pubkey.toBase58()).toBe(registryProgram.toBase58());
    expect(ix.keys[12]?.pubkey.toBase58()).toBe(atomEngineProgram.toBase58());
    expect(ix.keys).toHaveLength(14);
  });

  it('derives the mainnet ATOM engine automatically for the known mainnet registry', () => {
    const ix = buildProofPassFinalizeAndGiveFeedbackInstruction({
      session: PublicKey.unique(),
      creator,
      reviewer,
      asset: targetAsset,
      treasury,
      agentAccount,
      collection,
      registryProgramId: MAINNET_AGENT_REGISTRY_PROGRAM_ID,
      feedback: {
        value: '1',
        tag1: 'quality',
      },
    });

    expect(ix.keys[8]?.pubkey.toBase58()).toBe(MAINNET_AGENT_REGISTRY_PROGRAM_ID.toBase58());
    expect(ix.keys[12]?.pubkey.toBase58()).toBe(MAINNET_ATOM_ENGINE_PROGRAM_ID.toBase58());
  });

  it('encodes config updates for treasury, paused, registry program and fees in one instruction', () => {
    const registryProgramId = new PublicKey(Buffer.alloc(32, 0x21));
    const rotatedAuthority = new PublicKey(Buffer.alloc(32, 0x31));
    const ix = buildProofPassUpdateTreasuryInstruction({
      authority: creator,
      newTreasury: treasury,
      newAuthority: rotatedAuthority,
      registryProgramId,
      paused: true,
      openFeeLamports: 10_000n,
      finalizeFeeLamports: 20_000n,
      maxExpirySlots: 4_096n,
    });

    expect(ix.data[0]).toBe(6);
    expect(ix.data[1]).toBe(0b111_1111);
    expect(Buffer.from(ix.data.subarray(2, 34)).equals(registryProgramId.toBuffer())).toBe(true);
    expect(ix.data[34]).toBe(1);
    expect(Buffer.from(ix.data.subarray(35, 43)).readBigUInt64LE(0)).toBe(10_000n);
    expect(Buffer.from(ix.data.subarray(43, 51)).readBigUInt64LE(0)).toBe(20_000n);
    expect(Buffer.from(ix.data.subarray(51, 59)).readBigUInt64LE(0)).toBe(4_096n);
    expect(ix.keys).toHaveLength(4);
    expect(ix.keys[2]?.pubkey.toBase58()).toBe(treasury.toBase58());
    expect(ix.keys[3]?.pubkey.toBase58()).toBe(rotatedAuthority.toBase58());
  });

  it('encodes non-treasury config updates without forcing a treasury account', () => {
    const ix = buildProofPassUpdateTreasuryInstruction({
      authority: creator,
      paused: true,
      openFeeLamports: 10_000n,
    });

    expect(ix.data[0]).toBe(6);
    expect(ix.data[1]).toBe(0b110);
    expect(ix.keys).toHaveLength(2);
  });

  it('encodes authority-only config rotation without forcing treasury or fees', () => {
    const rotatedAuthority = new PublicKey(Buffer.alloc(32, 0x41));
    const ix = buildProofPassUpdateTreasuryInstruction({
      authority: creator,
      newAuthority: rotatedAuthority,
    });

    expect(ix.data[0]).toBe(6);
    expect(ix.data[1]).toBe(0b10_0000);
    expect(ix.keys).toHaveLength(3);
    expect(ix.keys[2]?.pubkey.toBase58()).toBe(rotatedAuthority.toBase58());
  });

  it('rejects config updates that do not change any field', () => {
    expect(() =>
      buildProofPassUpdateTreasuryInstruction({
        authority: creator,
      })
    ).toThrow(
      'ProofPass update config requires at least one of newTreasury, newAuthority, registryProgramId, paused, openFeeLamports, finalizeFeeLamports or maxExpirySlots'
    );
  });
});
