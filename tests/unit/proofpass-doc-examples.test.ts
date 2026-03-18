import { describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { PublicKey } from '@solana/web3.js';

import { buildRegistrationFileJson } from '../../src/index.js';
import { PDAHelpers } from '../../src/core/pda-helpers.js';
import {
  getLiveProofPass,
  giveFeedbackWithProof,
  openProofPass,
} from '../../src/extras/proofpass.js';

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
}): Buffer {
  const data = Buffer.alloc(CONFIG_SIZE, 0);
  CONFIG_DISCRIMINATOR.copy(data, 0);
  params.treasury.toBuffer().copy(data, 40);
  params.registryProgram.toBuffer().copy(data, 72);
  data.writeBigUInt64LE(params.openFeeLamports ?? 0n, 104);
  data.writeBigUInt64LE(params.finalizeFeeLamports ?? 10_000n, 112);
  data.writeBigUInt64LE(params.maxExpirySlots ?? 4_096n, 120);
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
}): Buffer {
  const data = Buffer.alloc(SESSION_SIZE, 0);
  SESSION_DISCRIMINATOR.copy(data, 0);
  data[8] = 2;
  data[9] = 1;
  data[10] = 3;
  const feedbackUriHint = params.feedbackUriHint ?? '';
  const endpointHint = params.endpointHint ?? '';
  data[11] = Buffer.byteLength(feedbackUriHint, 'utf8');
  data[12] = Buffer.byteLength(endpointHint, 'utf8');
  data[13] = params.feedbackFileHashHint ? 1 : 0;
  data.writeBigUInt64LE(100n, 16);
  data.writeBigUInt64LE(0n, 24);
  data.writeBigUInt64LE(200n, 32);
  params.creator.toBuffer().copy(data, 40);
  params.reviewer.toBuffer().copy(data, 72);
  params.targetAsset.toBuffer().copy(data, 104);
  Buffer.alloc(32, 0x44).copy(data, 136);
  (params.feedbackFileHashHint ?? Buffer.alloc(32, 0)).copy(data, 168);
  Buffer.alloc(32, 0x55).copy(data, 200);
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

describe('proofpass doc examples', () => {
  const creator = new PublicKey(Buffer.alloc(32, 7));
  const reviewer = new PublicKey(Buffer.alloc(32, 8));
  const targetAsset = new PublicKey(Buffer.alloc(32, 9));
  const treasury = new PublicKey(Buffer.alloc(32, 10));
  const registryProgram = new PublicKey(Buffer.alloc(32, 11));
  const collection = new PublicKey(Buffer.alloc(32, 12));
  const atomEngineProgram = new PublicKey(Buffer.alloc(32, 13));

  it('keeps the generic proofpass markdown generic and minimal', () => {
    const markdown = fs.readFileSync(
      path.resolve('examples/proofpass.md'),
      'utf8'
    );

    expect(markdown).toContain('openProofPass');
    expect(markdown).toContain('giveFeedbackWithProof');
    expect(markdown).toContain('getLiveProofPass');
    expect(markdown).toContain('closeProofPass');
    expect(markdown).not.toContain('402 Payment Required');
    expect(markdown).not.toContain('PAYMENT-RESPONSE');
    expect(markdown).not.toContain('8004-reputation');
  });

  it('keeps the public ProofPass guide asset-first while documenting compatibility correctly', () => {
    const markdown = fs.readFileSync(
      path.resolve('docs/PROOFPASS.md'),
      'utf8'
    );

    expect(markdown).toContain('agent asset pubkey directly');
    expect(markdown).toContain('also still accepts a sequential `targetAgent`');
    expect(markdown).toContain('defaults to `0`');
  });

  it('matches the generic proofpass example call shape', async () => {
    const openConnection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeProofPassConfig({
          treasury,
          registryProgram,
        }),
      }),
    };

    const flow = await openProofPass({
      connection: openConnection as any,
      creator,
      reviewer,
      targetAgent: targetAsset,
      contextRef: 'request:req-1',
    });

    expect(flow.sessionAddress).toBe(flow.sessionPda.toBase58());

    const session = PublicKey.unique();
    const [rootConfigPda] = PDAHelpers.getRootConfigPDA(registryProgram);
    const finalizeConnection = {
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

    const finalizeIx = await giveFeedbackWithProof({
      connection: finalizeConnection as any,
      session,
      reviewer,
      atomEngineProgramId: atomEngineProgram,
      feedback: {
        value: '42',
        tag1: 'quality',
      },
    });

    expect(finalizeIx.keys[0]?.pubkey.toBase58()).toBe(reviewer.toBase58());
    expect(Buffer.from(finalizeIx.data).includes(Buffer.from('quality'))).toBe(true);
  });

  it('keeps the x402 markdown aligned with the minimum x402 flow and matching sdk calls', async () => {
    const markdown = fs.readFileSync(
      path.resolve('examples/proofpass-x402.md'),
      'utf8'
    );

    expect(markdown).toContain('8004-reputation');
    expect(markdown).toContain('feedbackEndpoint');
    expect(markdown).toContain('PAYMENT-RESPONSE');
    expect(markdown).toContain('interactionHash');
    expect(markdown).toContain('reviewerSignature');

    const registration = buildRegistrationFileJson({
      name: 'Weather Agent',
      description: 'x402 weather endpoint with verifiable feedback',
      x402Support: true,
      services: [{ type: 'MCP', value: 'https://agent.example/weather' }],
      walletAddress: reviewer.toBase58(),
    });

    expect(registration.x402Support).toBe(true);

    const openConnection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeProofPassConfig({
          treasury,
          registryProgram,
        }),
      }),
    };

    const flow = await openProofPass({
      connection: openConnection as any,
      creator,
      reviewer,
      targetAgent: targetAsset,
      contextRef: 'x402:weather:invoice-1',
      ttlSlots: 64n,
      endpoint: 'https://agent.example/weather',
      feedbackUri: 'ipfs://feedback-artifact',
    });

    expect(flow.endpoint).toBe('https://agent.example/weather');
    expect(flow.feedbackUri).toBe('ipfs://feedback-artifact');

    const session = PublicKey.unique();
    const [rootConfigPda] = PDAHelpers.getRootConfigPDA(registryProgram);
    const finalizeConnection = {
      getAccountInfo: jest.fn(async (pubkey: PublicKey) => {
        if (pubkey.equals(session)) {
          return {
            data: makeProofPassSession({
              creator,
              reviewer,
              targetAsset,
              endpointHint: 'https://agent.example/weather',
              feedbackUriHint: 'ipfs://feedback-artifact',
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

    const finalizeIx = await giveFeedbackWithProof({
      connection: finalizeConnection as any,
      session,
      reviewer,
      atomEngineProgramId: atomEngineProgram,
      feedback: {
        value: '95',
        score: 95,
        tag1: 'starred',
        tag2: 'x402',
        endpoint: 'https://agent.example/weather',
      },
    });

    expect(Buffer.from(finalizeIx.data).includes(Buffer.from('starred'))).toBe(true);
    expect(Buffer.from(finalizeIx.data).includes(Buffer.from('x402'))).toBe(true);

    const liveConnection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeProofPassSession({
          creator,
          reviewer,
          targetAsset,
          endpointHint: 'https://agent.example/weather',
          feedbackUriHint: 'ipfs://feedback-artifact',
        }),
      }),
    };

    const live = await getLiveProofPass({
      connection: liveConnection as any,
      session,
    });

    expect(live?.endpointHint).toBe('https://agent.example/weather');
    expect(live?.feedbackUriHint).toBe('ipfs://feedback-artifact');
  });
});
