import { describe, expect, it } from '@jest/globals';
import { PublicKey, SystemProgram } from '@solana/web3.js';

import {
  MAINNET_AGENT_REGISTRY_PROGRAM_ID,
  MAINNET_ATOM_ENGINE_PROGRAM_ID,
  PDAHelpers,
} from '../../src/index.js';
import {
  DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS,
  DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS,
  PROOFPASS_PROGRAM_ID,
  buildInitializeProofPassConfigInstruction,
  buildProofPassFinalizeAndGiveFeedbackInstruction,
  buildProofPassIntent,
  buildProofPassOpenSessionInstruction,
  buildProofPassUpdateTreasuryInstruction,
  getProofPassConfigPda,
  getProofPassProgramDataPda,
  getProofPassSessionPda,
} from '../../src/extras/proofpass.js';
import {
  getAtomConfigPDAWithProgram,
  getAtomStatsPDAWithProgram,
} from '../../src/core/atom-pda.js';

function readU64(buffer: Buffer, offset: number): bigint {
  return buffer.readBigUInt64LE(offset);
}

describe('proofpass builders', () => {
  it('builds initialize_config with the derived config and program data PDAs', () => {
    const authority = PublicKey.unique();
    const treasury = PublicKey.unique();
    const [config] = getProofPassConfigPda(PROOFPASS_PROGRAM_ID);
    const [programData] = getProofPassProgramDataPda(PROOFPASS_PROGRAM_ID);

    const ix = buildInitializeProofPassConfigInstruction({
      authority,
      treasury,
      maxExpirySlots: 4096n,
    });

    expect(ix.programId.toBase58()).toBe(PROOFPASS_PROGRAM_ID.toBase58());
    expect(ix.keys.map((key) => key.pubkey.toBase58())).toEqual([
      authority.toBase58(),
      config.toBase58(),
      treasury.toBase58(),
      programData.toBase58(),
      SystemProgram.programId.toBase58(),
    ]);
    expect(ix.data[0]).toBe(0);
    expect(new PublicKey(ix.data.subarray(1, 33)).toBase58()).toBe(
      MAINNET_AGENT_REGISTRY_PROGRAM_ID.toBase58()
    );
    expect(readU64(ix.data, 33)).toBe(DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS);
    expect(readU64(ix.data, 41)).toBe(DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS);
    expect(readU64(ix.data, 49)).toBe(4096n);
  });

  it('builds open_session from the intent client, asset and blind nonce', () => {
    const client = PublicKey.unique();
    const asset = PublicKey.unique();
    const treasury = PublicKey.unique();
    const intent = buildProofPassIntent({
      asset,
      client,
      contextRef: 'x402:demo:open',
      currentSlot: 10n,
      ttlSlots: 90n,
      advanced: {
        blindNonce: Buffer.alloc(32, 0x55),
      },
      feedback: {
        value: '12.34',
        tag1: 'latency',
        endpoint: 'https://api.example.com',
      },
    });
    const [config] = getProofPassConfigPda(PROOFPASS_PROGRAM_ID);
    const [session] = getProofPassSessionPda(client, asset, intent.blindNonce, PROOFPASS_PROGRAM_ID);

    const ix = buildProofPassOpenSessionInstruction({
      intent,
      treasury,
    });

    expect(ix.programId.toBase58()).toBe(PROOFPASS_PROGRAM_ID.toBase58());
    expect(ix.keys.map((key) => key.pubkey.toBase58())).toEqual([
      client.toBase58(),
      config.toBase58(),
      treasury.toBase58(),
      session.toBase58(),
      asset.toBase58(),
      SystemProgram.programId.toBase58(),
    ]);
    expect(ix.keys[0]?.isSigner).toBe(true);
    expect(ix.data[0]).toBe(1);
    expect(ix.data[1]).toBe(intent.contextType);
    expect(Buffer.from(ix.data.subarray(2, 34)).equals(intent.contextRefHash)).toBe(true);
    expect(Buffer.from(ix.data.subarray(34, 66)).equals(intent.blindCommitment)).toBe(true);
    expect(Buffer.from(ix.data.subarray(66, 98)).equals(intent.blindNonce)).toBe(true);
    expect(readU64(ix.data, 98)).toBe(90n);
  });

  it('builds finalize_and_give_feedback with derived ATOM trailing accounts', () => {
    const client = PublicKey.unique();
    const treasury = PublicKey.unique();
    const asset = PublicKey.unique();
    const agentAccount = PublicKey.unique();
    const collection = PublicKey.unique();
    const intent = buildProofPassIntent({
      asset,
      client,
      contextRef: 'x402:demo:finalize',
      currentSlot: 1_000n,
      ttlSlots: 25n,
      advanced: {
        blindNonce: Buffer.alloc(32, 0x11),
      },
      feedback: {
        value: '99.77',
        tag1: 'uptime',
        tag2: 'day',
        endpoint: 'https://api.example.com/mcp',
        feedbackUri: 'ipfs://proofpass',
      },
    });
    const [config] = getProofPassConfigPda(PROOFPASS_PROGRAM_ID);
    const [session] = getProofPassSessionPda(client, asset, intent.blindNonce, PROOFPASS_PROGRAM_ID);
    const [atomConfig] = getAtomConfigPDAWithProgram(MAINNET_ATOM_ENGINE_PROGRAM_ID);
    const [atomStats] = getAtomStatsPDAWithProgram(asset, MAINNET_ATOM_ENGINE_PROGRAM_ID);
    const [registryAuthority] = PDAHelpers.getAtomCpiAuthorityPDA(MAINNET_AGENT_REGISTRY_PROGRAM_ID);

    const ix = buildProofPassFinalizeAndGiveFeedbackInstruction({
      intent,
      treasury,
      agentAccount,
      collection,
    });

    expect(ix.keys).toHaveLength(13);
    expect(ix.keys.map((key) => key.pubkey.toBase58())).toEqual([
      client.toBase58(),
      config.toBase58(),
      treasury.toBase58(),
      session.toBase58(),
      agentAccount.toBase58(),
      asset.toBase58(),
      collection.toBase58(),
      MAINNET_AGENT_REGISTRY_PROGRAM_ID.toBase58(),
      SystemProgram.programId.toBase58(),
      atomConfig.toBase58(),
      atomStats.toBase58(),
      MAINNET_ATOM_ENGINE_PROGRAM_ID.toBase58(),
      registryAuthority.toBase58(),
    ]);
    expect(ix.data[0]).toBe(5);
    expect(Buffer.from(ix.data.subarray(1, 33)).equals(intent.contentHash)).toBe(true);
    expect(Buffer.from(ix.data.subarray(33, 65)).equals(intent.blindNonce)).toBe(true);
  });

  it('builds update_treasury against the canonical config PDA', () => {
    const authority = PublicKey.unique();
    const newTreasury = PublicKey.unique();
    const [config] = getProofPassConfigPda(PROOFPASS_PROGRAM_ID);

    const ix = buildProofPassUpdateTreasuryInstruction({
      authority,
      newTreasury,
    });

    expect(ix.keys.map((key) => key.pubkey.toBase58())).toEqual([
      authority.toBase58(),
      config.toBase58(),
      newTreasury.toBase58(),
    ]);
    expect(ix.keys[0]?.isSigner).toBe(true);
    expect(ix.data[0]).toBe(6);
  });
});
