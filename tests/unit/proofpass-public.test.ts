import { describe, expect, it, jest } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';

import * as sdk from '../../src/index.js';
import {
  MAINNET_AGENT_REGISTRY_PROGRAM_ID,
  MAINNET_ATOM_ENGINE_PROGRAM_ID,
} from '../../src/core/programs.js';
import { PDAHelpers } from '../../src/core/pda-helpers.js';

const CONFIG_DISCRIMINATOR = Buffer.from('ppasconf', 'ascii');
const SESSION_DISCRIMINATOR = Buffer.from('ppassess', 'ascii');
const ROOT_CONFIG_DISCRIMINATOR = Buffer.from([42, 216, 8, 82, 19, 209, 223, 246]);
const CONFIG_SIZE = 136;
const SESSION_SIZE = 736;

function makeProofPassConfig(params: {
  treasury: PublicKey;
  registryProgram: PublicKey;
  openFeeLamports?: bigint;
  finalizeFeeLamports?: bigint;
  maxExpirySlots?: bigint;
  paused?: boolean;
}): Buffer {
  const data = Buffer.alloc(CONFIG_SIZE, 0);
  CONFIG_DISCRIMINATOR.copy(data, 0);
  params.treasury.toBuffer().copy(data, 40);
  params.registryProgram.toBuffer().copy(data, 72);
  data.writeBigUInt64LE(params.openFeeLamports ?? 0n, 104);
  data.writeBigUInt64LE(params.finalizeFeeLamports ?? 10_000n, 112);
  data.writeBigUInt64LE(params.maxExpirySlots ?? 4_096n, 120);
  data[128] = params.paused ? 1 : 0;
  data[130] = 2;
  return data;
}

function makeProofPassSession(params: {
  creator: PublicKey;
  reviewer: PublicKey;
  targetAsset: PublicKey;
  feedbackUriHint?: string;
  endpointHint?: string;
  feedbackFileHashHint?: Buffer | null;
  status?: number;
  openedSlot?: bigint;
  lockedFinalizeFeeLamports?: bigint;
  feeMode?: number;
  expirySlot?: bigint;
  nonce?: Buffer;
}): Buffer {
  const data = Buffer.alloc(SESSION_SIZE, 0);
  SESSION_DISCRIMINATOR.copy(data, 0);
  data[8] = 3;
  data[9] = params.status ?? 1;
  data[10] = 3;
  const feedbackUriHint = params.feedbackUriHint ?? '';
  const endpointHint = params.endpointHint ?? '';
  data[11] = Buffer.byteLength(feedbackUriHint, 'utf8');
  data[12] = Buffer.byteLength(endpointHint, 'utf8');
  data[13] = params.feedbackFileHashHint ? 1 : 0;
  data[14] = params.feeMode ?? 0;
  data.writeBigUInt64LE(params.openedSlot ?? 100n, 16);
  data.writeBigUInt64LE(params.lockedFinalizeFeeLamports ?? 10_000n, 24);
  data.writeBigUInt64LE(params.expirySlot ?? 200n, 32);
  params.creator.toBuffer().copy(data, 40);
  params.reviewer.toBuffer().copy(data, 72);
  params.targetAsset.toBuffer().copy(data, 104);
  Buffer.alloc(32, 0x44).copy(data, 136);
  (params.feedbackFileHashHint ?? Buffer.alloc(32, 0)).copy(data, 168);
  (params.nonce ?? Buffer.alloc(32, 0x55)).copy(data, 200);
  Buffer.from(feedbackUriHint, 'utf8').copy(data, 232);
  Buffer.from(endpointHint, 'utf8').copy(data, 482);
  return data;
}

function makeRootConfig(baseCollection: PublicKey): Buffer {
  return Buffer.concat([
    ROOT_CONFIG_DISCRIMINATOR,
    baseCollection.toBuffer(),
    Buffer.alloc(32, 0x77),
    Buffer.from([1]),
  ]);
}

describe('proofpass public surface', () => {
  const creator = new PublicKey(Buffer.alloc(32, 7));
  const reviewer = new PublicKey(Buffer.alloc(32, 8));
  const targetAsset = new PublicKey(Buffer.alloc(32, 9));
  const treasury = new PublicKey(Buffer.alloc(32, 10));
  const registryProgram = new PublicKey(Buffer.alloc(32, 11));
  const collection = new PublicKey(Buffer.alloc(32, 12));
  const atomEngineProgram = new PublicKey(Buffer.alloc(32, 13));

  it('exposes only the high-level ProofPass helpers from the package root', () => {
    expect(typeof sdk.openProofPass).toBe('function');
    expect(typeof sdk.giveFeedbackWithProof).toBe('function');
    expect(typeof sdk.closeProofPass).toBe('function');
    expect(typeof sdk.getLiveProofPass).toBe('function');
    expect(typeof sdk.getLiveProofPassesByCreator).toBe('function');

    const rootProofPassExports = Object.keys(sdk).filter(
      (key) =>
        ![
          'openProofPass',
          'giveFeedbackWithProof',
          'closeProofPass',
          'getLiveProofPass',
          'getLiveProofPassesByCreator',
        ].includes(key) && key.toLowerCase().includes('proofpass')
    );

    expect(rootProofPassExports).toEqual([]);
  });

  it('openProofPass resolves treasury from on-chain config and stores optional service attachment hints', async () => {
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeProofPassConfig({
          treasury,
          registryProgram,
        }),
      }),
    };

    const feedbackFileHash = Buffer.alloc(32, 0x99);
    const flow = await sdk.openProofPass({
      connection: connection as any,
      creator,
      reviewer,
      targetAgent: targetAsset,
      contextRef: 'x402:demo:request-1',
      ttlSlots: 25n,
      endpoint: '/service/request-1',
      feedbackUri: 'ipfs://payment-1',
      feedbackFileHash,
    });

    expect(flow.creator).toBe(creator.toBase58());
    expect(flow.reviewer).toBe(reviewer.toBase58());
    expect(flow.targetAsset).toBe(targetAsset.toBase58());
    expect(flow.targetAgent).toBe(targetAsset.toBase58());
    expect(flow.treasury.toBase58()).toBe(treasury.toBase58());
    expect(flow.endpoint).toBe('/service/request-1');
    expect(flow.feedbackUri).toBe('ipfs://payment-1');
    expect(flow.feedbackFileHash?.equals(feedbackFileHash)).toBe(true);
    expect(flow.feeMode).toBe('creator_pays_all');
    expect(flow.sessionAddress).toBe(flow.sessionPda.toBase58());
    expect(flow.openInstruction.keys[0]?.pubkey.toBase58()).toBe(creator.toBase58());
    expect(flow.openInstruction.keys[2]?.pubkey.toBase58()).toBe(treasury.toBase58());
    expect(flow.openInstruction.keys[3]?.pubkey.toBase58()).toBe(flow.sessionPda.toBase58());
    expect(flow.openInstruction.keys[5]?.pubkey.toBase58()).toBe(
      PDAHelpers.getAgentPDA(targetAsset, registryProgram)[0].toBase58()
    );
  });

  it('openProofPass accepts targetAgent as the friendly alias for targetAsset', async () => {
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeProofPassConfig({
          treasury,
          registryProgram,
        }),
      }),
    };

    const flow = await sdk.openProofPass({
      connection: connection as any,
      creator,
      reviewer,
      targetAgent: targetAsset,
      contextRef: 'proofpass:test:target-agent',
    });

    expect(flow.targetAsset).toBe(targetAsset.toBase58());
    expect(flow.targetAgent).toBe(targetAsset.toBase58());
  });

  it('openProofPass resolves a sequential targetAgent through the provided indexer client', async () => {
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeProofPassConfig({
          treasury,
          registryProgram,
        }),
      }),
    };
    const indexerClient = {
      getAgentByAgentId: jest.fn().mockResolvedValue({
        asset: targetAsset.toBase58(),
      }),
    };

    const flow = await sdk.openProofPass({
      connection: connection as any,
      creator,
      reviewer,
      targetAgent: 42,
      contextRef: 'proofpass:test:sequential-agent-id',
      indexerClient,
    });

    expect(indexerClient.getAgentByAgentId).toHaveBeenCalledWith(42);
    expect(flow.targetAsset).toBe(targetAsset.toBase58());
    expect(flow.targetAgent).toBe(targetAsset.toBase58());
  });

  it('openProofPass rejects a sequential targetAgent when the indexer cannot resolve it', async () => {
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeProofPassConfig({
          treasury,
          registryProgram,
        }),
      }),
    };
    const indexerClient = {
      getAgentByAgentId: jest.fn().mockResolvedValue(null),
    };

    await expect(
      sdk.openProofPass({
        connection: connection as any,
        creator,
        reviewer,
        targetAgent: '42',
        contextRef: 'proofpass:test:missing-sequential-agent-id',
        indexerClient,
      })
    ).rejects.toThrow('Unable to resolve targetAgent 42 to an agent asset');
  });

  it('openProofPass falls back to an explicit targetAsset when sequential lookup misses', async () => {
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeProofPassConfig({
          treasury,
          registryProgram,
        }),
      }),
    };
    const indexerClient = {
      getAgentByAgentId: jest.fn().mockResolvedValue(null),
    };

    const flow = await sdk.openProofPass({
      connection: connection as any,
      creator,
      reviewer,
      targetAgent: '42',
      targetAsset,
      contextRef: 'proofpass:test:explicit-target-asset-fallback',
      indexerClient,
    });

    expect(indexerClient.getAgentByAgentId).toHaveBeenCalledWith('42');
    expect(flow.targetAsset).toBe(targetAsset.toBase58());
    expect(flow.targetAgent).toBe(targetAsset.toBase58());
  });

  it('openProofPass falls back to explicit targetAsset on custom registries without building a default indexer client', async () => {
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeProofPassConfig({
          treasury,
          registryProgram,
        }),
      }),
    };

    const typedParams: sdk.OpenProofPassParams = {
      connection: connection as any,
      creator,
      reviewer,
      targetAgent: '42',
      targetAsset,
      contextRef: 'proofpass:test:custom-registry-target-asset-fallback',
    };

    const flow = await sdk.openProofPass(typedParams);

    expect(flow.targetAsset).toBe(targetAsset.toBase58());
    expect(flow.targetAgent).toBe(targetAsset.toBase58());
  });

  it('openProofPass forwards reviewer-paid fee mode into the built flow', async () => {
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeProofPassConfig({
          treasury,
          registryProgram,
        }),
      }),
    };

    const flow = await sdk.openProofPass({
      connection: connection as any,
      creator,
      reviewer,
      targetAgent: targetAsset,
      contextRef: 'proofpass:test:reviewer-paid',
      feeMode: 'reviewer_pays_finalize',
    });

    expect(flow.feeMode).toBe('reviewer_pays_finalize');
    expect(flow.openInstruction.data[flow.openInstruction.data.length - 1]).toBe(1);
  });

  it('openProofPass rejects ttlSlots above the on-chain maxExpirySlots', async () => {
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeProofPassConfig({
          treasury,
          registryProgram,
          maxExpirySlots: 32n,
        }),
      }),
    };

    await expect(
      sdk.openProofPass({
        connection: connection as any,
        creator,
        reviewer,
        targetAgent: targetAsset,
        contextRef: 'service:order:ttl-overflow',
        ttlSlots: 33n,
      })
    ).rejects.toThrow('ProofPass ttlSlots exceeds configured maxExpirySlots (32)');
  });

  it('giveFeedbackWithProof resolves session/config/collection and merges service attachment hints automatically', async () => {
    const session = PublicKey.unique();
    const [rootConfigPda] = PDAHelpers.getRootConfigPDA(registryProgram);
    const connection = {
      getAccountInfo: jest.fn(async (pubkey: PublicKey) => {
        if (pubkey.equals(session)) {
          return {
            data: makeProofPassSession({
              creator,
              reviewer,
              targetAsset,
              endpointHint: '/service/payment-2',
              feedbackUriHint: 'ipfs://payment-2',
              feedbackFileHashHint: Buffer.alloc(32, 0xab),
            }),
          };
        }
        if (pubkey.equals(rootConfigPda)) {
          return {
            data: makeRootConfig(collection),
          };
        }
        return {
          data: makeProofPassConfig({
            treasury,
            registryProgram,
          }),
        };
      }),
      getSlot: jest.fn().mockResolvedValue(150),
    };

    const finalizeIx = await sdk.giveFeedbackWithProof({
      connection: connection as any,
      session,
      reviewer,
      atomEngineProgramId: atomEngineProgram,
      feedback: {
        value: '88.5',
        tag1: 'successrate',
      },
    });

    const [expectedAgent] = PDAHelpers.getAgentPDA(targetAsset, registryProgram);
    expect(finalizeIx.keys[0]?.pubkey.toBase58()).toBe(reviewer.toBase58());
    expect(finalizeIx.keys[2]?.pubkey.toBase58()).toBe(treasury.toBase58());
    expect(finalizeIx.keys[3]?.pubkey.toBase58()).toBe(creator.toBase58());
    expect(finalizeIx.keys[4]?.pubkey.toBase58()).toBe(session.toBase58());
    expect(finalizeIx.keys[5]?.pubkey.toBase58()).toBe(expectedAgent.toBase58());
    expect(finalizeIx.keys[7]?.pubkey.toBase58()).toBe(collection.toBase58());
    expect(finalizeIx.keys[12]?.pubkey.toBase58()).toBe(atomEngineProgram.toBase58());
    expect(finalizeIx.keys).toHaveLength(14);

    const data = Buffer.from(finalizeIx.data);
    expect(data[0]).toBe(5);
    expect(data.includes(Buffer.from('/service/payment-2'))).toBe(true);
    expect(data.includes(Buffer.from('ipfs://payment-2'))).toBe(true);
    expect(data.includes(Buffer.alloc(32, 0xab))).toBe(true);
  });

  it('giveFeedbackWithProof derives the mainnet ATOM engine from a known mainnet registry', async () => {
    const session = PublicKey.unique();
    const [rootConfigPda] = PDAHelpers.getRootConfigPDA(MAINNET_AGENT_REGISTRY_PROGRAM_ID);
    const connection = {
      getAccountInfo: jest.fn(async (pubkey: PublicKey) => {
        if (pubkey.equals(session)) {
          return {
            data: makeProofPassSession({
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
          data: makeProofPassConfig({
            treasury,
            registryProgram: MAINNET_AGENT_REGISTRY_PROGRAM_ID,
          }),
        };
      }),
      getSlot: jest.fn().mockResolvedValue(150),
    };

    const finalizeIx = await sdk.giveFeedbackWithProof({
      connection: connection as any,
      session,
      reviewer,
      feedback: {
        value: '5',
        tag1: 'quality',
      },
    });

    expect(finalizeIx.keys[8]?.pubkey.toBase58()).toBe(MAINNET_AGENT_REGISTRY_PROGRAM_ID.toBase58());
    expect(finalizeIx.keys[12]?.pubkey.toBase58()).toBe(MAINNET_ATOM_ENGINE_PROGRAM_ID.toBase58());
  });

  it('lets a service batch many ProofPass requests with minimal inputs', async () => {
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeProofPassConfig({
          treasury,
          registryProgram,
        }),
      }),
    };

    const requests = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        sdk.openProofPass({
          connection: connection as any,
          creator,
          reviewer: new PublicKey(Buffer.alloc(32, 20 + index)),
          targetAgent: targetAsset,
          contextRef: `service:order:${index}`,
          ttlSlots: 64n,
        })
      )
    );

    expect(new Set(requests.map((flow) => flow.sessionAddress)).size).toBe(requests.length);
    for (const request of requests) {
      expect(request.creator).toBe(creator.toBase58());
      expect(request.targetAsset).toBe(targetAsset.toBase58());
      expect(request.openInstruction.keys[0]?.pubkey.toBase58()).toBe(creator.toBase58());
      expect(request.openInstruction.keys[2]?.pubkey.toBase58()).toBe(treasury.toBase58());
      expect(request.openInstruction.keys[5]?.pubkey.toBase58()).toBe(
        PDAHelpers.getAgentPDA(targetAsset, registryProgram)[0].toBase58()
      );
    }
  });

  it('requires atomEngineProgramId when ProofPass config points to an unknown registry', async () => {
    const session = PublicKey.unique();
    const [rootConfigPda] = PDAHelpers.getRootConfigPDA(registryProgram);
    const connection = {
      getAccountInfo: jest.fn(async (pubkey: PublicKey) => {
        if (pubkey.equals(session)) {
          return {
            data: makeProofPassSession({
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
          data: makeProofPassConfig({
            treasury,
            registryProgram,
          }),
        };
      }),
      getSlot: jest.fn().mockResolvedValue(150),
    };

    await expect(
      sdk.giveFeedbackWithProof({
        connection: connection as any,
        session,
        reviewer,
        feedback: {
          value: '1',
          tag1: 'quality',
        },
      })
    ).rejects.toThrow(`atomEngineProgramId is required for registry ${registryProgram.toBase58()}`);
  });

  it('giveFeedbackWithProof rejects expired sessions before building finalize', async () => {
    const session = PublicKey.unique();
    const [rootConfigPda] = PDAHelpers.getRootConfigPDA(registryProgram);
    const connection = {
      getAccountInfo: jest.fn(async (pubkey: PublicKey) => {
        if (pubkey.equals(session)) {
          return {
            data: makeProofPassSession({
              creator,
              reviewer,
              targetAsset,
              expirySlot: 120n,
            }),
          };
        }
        if (pubkey.equals(rootConfigPda)) {
          return {
            data: makeRootConfig(collection),
          };
        }
        return {
          data: makeProofPassConfig({
            treasury,
            registryProgram,
          }),
        };
      }),
      getSlot: jest.fn().mockResolvedValue(121),
    };

    await expect(
      sdk.giveFeedbackWithProof({
        connection: connection as any,
        session,
        reviewer,
        feedback: {
          value: '1',
          tag1: 'quality',
        },
      })
    ).rejects.toThrow('has expired and must be closed instead of finalized');
  });
});
