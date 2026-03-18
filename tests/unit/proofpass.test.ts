import { describe, expect, it, jest } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';

import {
  getLiveProofPass,
  giveFeedbackWithProof,
  openProofPass,
} from '../../src/extras/proofpass.js';

const CONFIG_DISCRIMINATOR = Buffer.from('ppasconf', 'ascii');
const SESSION_DISCRIMINATOR = Buffer.from('ppassess', 'ascii');
const ROOT_CONFIG_DISCRIMINATOR = Buffer.from([42, 216, 8, 82, 19, 209, 223, 246]);

function makeConfig(treasury: PublicKey, registryProgram: PublicKey, paused = false): Buffer {
  const data = Buffer.alloc(136, 0);
  CONFIG_DISCRIMINATOR.copy(data, 0);
  treasury.toBuffer().copy(data, 40);
  registryProgram.toBuffer().copy(data, 72);
  data.writeBigUInt64LE(5_000n, 104);
  data.writeBigUInt64LE(25_000n, 112);
  data.writeBigUInt64LE(4_096n, 120);
  data[128] = paused ? 1 : 0;
  data[130] = 2;
  return data;
}

function makeSession(params: {
  creator: PublicKey;
  reviewer: PublicKey;
  targetAsset: PublicKey;
  endpointHint?: string;
  feedbackUriHint?: string;
  feedbackFileHashHint?: Buffer | null;
}): Buffer {
  const data = Buffer.alloc(736, 0);
  SESSION_DISCRIMINATOR.copy(data, 0);
  data[8] = 2;
  data[9] = 1;
  data[10] = 0;
  const uri = params.feedbackUriHint ?? '';
  const endpoint = params.endpointHint ?? '';
  data[11] = Buffer.byteLength(uri, 'utf8');
  data[12] = Buffer.byteLength(endpoint, 'utf8');
  data[13] = params.feedbackFileHashHint ? 1 : 0;
  data.writeBigUInt64LE(100n, 16);
  data.writeBigUInt64LE(0n, 24);
  data.writeBigUInt64LE(200n, 32);
  params.creator.toBuffer().copy(data, 40);
  params.reviewer.toBuffer().copy(data, 72);
  params.targetAsset.toBuffer().copy(data, 104);
  Buffer.alloc(32, 0x22).copy(data, 136);
  (params.feedbackFileHashHint ?? Buffer.alloc(32, 0)).copy(data, 168);
  Buffer.alloc(32, 0x33).copy(data, 200);
  Buffer.from(uri, 'utf8').copy(data, 232);
  Buffer.from(endpoint, 'utf8').copy(data, 482);
  return data;
}

function makeRootConfig(baseCollection: PublicKey): Buffer {
  return Buffer.concat([
    ROOT_CONFIG_DISCRIMINATOR,
    baseCollection.toBuffer(),
    Buffer.alloc(32, 0x11),
    Buffer.from([1]),
  ]);
}

describe('proofpass request flow', () => {
  const creator = new PublicKey(Buffer.alloc(32, 21));
  const reviewer = new PublicKey(Buffer.alloc(32, 22));
  const targetAsset = new PublicKey(Buffer.alloc(32, 23));
  const treasury = new PublicKey(Buffer.alloc(32, 24));
  const registryProgram = new PublicKey(Buffer.alloc(32, 25));
  const collection = new PublicKey(Buffer.alloc(32, 26));
  const atomEngineProgram = new PublicKey(Buffer.alloc(32, 27));

  it('requires contextRef or contextRefHash at open', async () => {
    await expect(
      openProofPass({
        connection: { getAccountInfo: async () => ({ data: makeConfig(treasury, registryProgram) }) } as any,
        creator,
        reviewer,
        targetAgent: targetAsset,
      } as any)
    ).rejects.toThrow('contextRef or contextRefHash');
  });

  it('gets live session attachment hints back from on-chain session state', async () => {
    const session = PublicKey.unique();
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeSession({
          creator,
          reviewer,
          targetAsset,
          endpointHint: '/service/live',
          feedbackUriHint: 'ipfs://payment-live',
          feedbackFileHashHint: Buffer.alloc(32, 0xcc),
        }),
      }),
    };

    const live = await getLiveProofPass({
      connection: connection as any,
      session,
    });

    expect(live?.endpointHint).toBe('/service/live');
    expect(live?.feedbackUriHint).toBe('ipfs://payment-live');
    expect(live?.feedbackFileHashHint?.equals(Buffer.alloc(32, 0xcc))).toBe(true);
  });

  it('builds the full requester-driven flow and auto-merges service attachment hints', async () => {
    const openConnection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeConfig(treasury, registryProgram),
      }),
    };

    const flow = await openProofPass({
      connection: openConnection as any,
      creator,
      reviewer,
      targetAgent: targetAsset,
      contextRef: 'x402:demo:happy',
      ttlSlots: 90n,
      endpoint: '/service/happy',
      feedbackUri: 'ipfs://payment-happy',
      feedbackFileHash: Buffer.alloc(32, 0xdd),
    });

    const session = flow.sessionPda;
    const finalizeConnection = {
      getAccountInfo: jest.fn(async (pubkey: PublicKey) => {
        const [rootConfigPda] = sdkPdaRootConfig(registryProgram);
        if (pubkey.equals(session)) {
          return {
            data: makeSession({
              creator,
              reviewer,
              targetAsset,
              endpointHint: '/service/happy',
              feedbackUriHint: 'ipfs://payment-happy',
              feedbackFileHashHint: Buffer.alloc(32, 0xdd),
            }),
          };
        }
        if (pubkey.equals(rootConfigPda)) {
          return {
            data: makeRootConfig(collection),
          };
        }
        return {
          data: makeConfig(treasury, registryProgram),
        };
      }),
      getSlot: jest.fn().mockResolvedValue(150),
    };

    const finalizeIx = await giveFeedbackWithProof({
      connection: finalizeConnection as any,
      session,
      reviewer,
      atomEngineProgramId: atomEngineProgram,
      feedback: {
        value: '42.5',
        tag1: 'latency',
      },
    });

    expect(flow.sessionAddress).toBe(flow.sessionPda.toBase58());
    expect(finalizeIx.keys[0]?.pubkey.toBase58()).toBe(reviewer.toBase58());
    expect(finalizeIx.keys[12]?.pubkey.toBase58()).toBe(atomEngineProgram.toBase58());
    expect(Buffer.from(finalizeIx.data).includes(Buffer.from('/service/happy'))).toBe(true);
    expect(Buffer.from(finalizeIx.data).includes(Buffer.from('ipfs://payment-happy'))).toBe(true);
    expect(Buffer.from(finalizeIx.data).includes(Buffer.alloc(32, 0xdd))).toBe(true);
  });

  it('rejects reviewer payloads that conflict with the service-provided attachment hints', async () => {
    const session = PublicKey.unique();
    const finalizeConnection = {
      getAccountInfo: jest.fn(async (pubkey: PublicKey) => {
        const [rootConfigPda] = sdkPdaRootConfig(registryProgram);
        if (pubkey.equals(session)) {
          return {
            data: makeSession({
              creator,
              reviewer,
              targetAsset,
              endpointHint: '/service/lock',
              feedbackUriHint: 'ipfs://payment-lock',
              feedbackFileHashHint: Buffer.alloc(32, 0xef),
            }),
          };
        }
        if (pubkey.equals(rootConfigPda)) {
          return {
            data: makeRootConfig(collection),
          };
        }
        return {
          data: makeConfig(treasury, registryProgram),
        };
      }),
      getSlot: jest.fn().mockResolvedValue(150),
    };

    await expect(
      giveFeedbackWithProof({
        connection: finalizeConnection as any,
        session,
        reviewer,
        feedback: {
          value: '7',
          tag1: 'quality',
          endpoint: '/other',
          feedbackUri: 'ipfs://other',
        },
      })
    ).rejects.toThrow(/does not match/);
  });

  it('treats empty endpoint and feedbackUri as omission when service hints are present', async () => {
    const session = PublicKey.unique();
    const finalizeConnection = {
      getAccountInfo: jest.fn(async (pubkey: PublicKey) => {
        const [rootConfigPda] = sdkPdaRootConfig(registryProgram);
        if (pubkey.equals(session)) {
          return {
            data: makeSession({
              creator,
              reviewer,
              targetAsset,
              endpointHint: '/service/empty-override',
              feedbackUriHint: 'ipfs://service-empty-override',
              feedbackFileHashHint: Buffer.alloc(32, 0xaa),
            }),
          };
        }
        if (pubkey.equals(rootConfigPda)) {
          return {
            data: makeRootConfig(collection),
          };
        }
        return {
          data: makeConfig(treasury, registryProgram),
        };
      }),
      getSlot: jest.fn().mockResolvedValue(150),
    };

    const finalizeIx = await giveFeedbackWithProof({
      connection: finalizeConnection as any,
      session,
      reviewer,
      atomEngineProgramId: atomEngineProgram,
      feedback: {
        value: '7',
        tag1: 'quality',
        endpoint: '',
        feedbackUri: '',
      },
    });

    expect(finalizeIx.keys[0]?.pubkey.toBase58()).toBe(reviewer.toBase58());
    expect(finalizeIx.keys[3]?.pubkey.toBase58()).toBe(creator.toBase58());
    expect(Buffer.from(finalizeIx.data).includes(Buffer.from('/service/empty-override'))).toBe(true);
    expect(Buffer.from(finalizeIx.data).includes(Buffer.from('ipfs://service-empty-override'))).toBe(true);
  });

  it('requires atomEngineProgramId when ProofPass config points to an unknown registry', async () => {
    const session = PublicKey.unique();
    const finalizeConnection = {
      getAccountInfo: jest.fn(async (pubkey: PublicKey) => {
        const [rootConfigPda] = sdkPdaRootConfig(registryProgram);
        if (pubkey.equals(session)) {
          return {
            data: makeSession({
              creator,
              reviewer,
              targetAsset,
            }),
          };
        }
        if (pubkey.equals(rootConfigPda)) {
          return {
            data: makeRootConfig(collection),
          };
        }
        return {
          data: makeConfig(treasury, registryProgram),
        };
      }),
      getSlot: jest.fn().mockResolvedValue(150),
    };

    await expect(
      giveFeedbackWithProof({
        connection: finalizeConnection as any,
        session,
        reviewer,
        feedback: {
          value: '1',
          tag1: 'quality',
        },
      })
    ).rejects.toThrow(`atomEngineProgramId is required for registry ${registryProgram.toBase58()}`);
  });

  it('rejects public open/finalize helpers when ProofPass is paused', async () => {
    await expect(
      openProofPass({
        connection: {
          getAccountInfo: async () => ({ data: makeConfig(treasury, registryProgram, true) }),
        } as any,
        creator,
        reviewer,
        targetAgent: targetAsset,
        contextRef: 'x402:demo:paused',
      })
    ).rejects.toThrow(/paused/);

    await expect(
      giveFeedbackWithProof({
        connection: {
          getSlot: async () => 150,
          getAccountInfo: async () => ({ data: makeConfig(treasury, registryProgram, true) }),
        } as any,
        session: PublicKey.unique(),
        reviewer,
        feedback: {
          value: '1',
          tag1: 'quality',
        },
      })
    ).rejects.toThrow(/paused|No live ProofPass request/);
  });

  it('rejects finalize when the live session has already expired', async () => {
    const session = PublicKey.unique();
    const finalizeConnection = {
      getAccountInfo: jest.fn(async (pubkey: PublicKey) => {
        const [rootConfigPda] = sdkPdaRootConfig(registryProgram);
        if (pubkey.equals(session)) {
          return {
            data: makeSession({
              creator,
              reviewer,
              targetAsset,
              endpointHint: '/service/expired',
              feedbackUriHint: 'ipfs://payment-expired',
            }),
          };
        }
        if (pubkey.equals(rootConfigPda)) {
          return {
            data: makeRootConfig(collection),
          };
        }
        return {
          data: makeConfig(treasury, registryProgram),
        };
      }),
      getSlot: jest.fn().mockResolvedValue(201),
    };

    await expect(
      giveFeedbackWithProof({
        connection: finalizeConnection as any,
        session,
        reviewer,
        feedback: {
          value: '7',
          tag1: 'quality',
        },
      })
    ).rejects.toThrow('has expired and must be closed instead of finalized');
  });
});

function sdkPdaRootConfig(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('root_config')], programId);
}
