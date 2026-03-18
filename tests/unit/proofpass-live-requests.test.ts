import { describe, expect, it, jest } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';

import {
  closeProofPass,
  getLiveProofPass,
  getLiveProofPassesByCreator,
} from '../../src/extras/proofpass.js';

const SESSION_OFF = {
  discriminator: 0,
  version: 8,
  status: 9,
  contextType: 10,
  feedbackUriLen: 11,
  endpointLen: 12,
  hasFeedbackFileHashHint: 13,
  feeMode: 14,
  openedSlot: 16,
  lockedFinalizeFeeLamports: 24,
  expirySlot: 32,
  creator: 40,
  reviewer: 72,
  targetAsset: 104,
  contextRefHash: 136,
  feedbackFileHashHint: 168,
  nonce: 200,
  feedbackUriHint: 232,
  endpointHint: 482,
} as const;

const SESSION_DISCRIMINATOR = Buffer.from('ppassess', 'ascii');
const SESSION_SIZE = 736;

function makeSessionAccount(params: {
  creator: PublicKey;
  reviewer: PublicKey;
  targetAsset: PublicKey;
  status?: number;
  openedSlot?: bigint;
  lockedFinalizeFeeLamports?: bigint;
  feeMode?: number;
  expirySlot?: bigint;
  feedbackFileHashHint?: Buffer;
  feedbackUriHint?: string;
  endpointHint?: string;
  nonce?: Buffer;
}): Buffer {
  const data = Buffer.alloc(SESSION_SIZE, 0);
  SESSION_DISCRIMINATOR.copy(data, SESSION_OFF.discriminator);
  data[SESSION_OFF.version] = 3;
  data[SESSION_OFF.status] = params.status ?? 1;
  data[SESSION_OFF.contextType] = 3;
  const feedbackUriHint = params.feedbackUriHint ?? '';
  const endpointHint = params.endpointHint ?? '';
  data[SESSION_OFF.feedbackUriLen] = Buffer.byteLength(feedbackUriHint, 'utf8');
  data[SESSION_OFF.endpointLen] = Buffer.byteLength(endpointHint, 'utf8');
  data[SESSION_OFF.hasFeedbackFileHashHint] = params.feedbackFileHashHint ? 1 : 0;
  data[SESSION_OFF.feeMode] = params.feeMode ?? 0;
  data.writeBigUInt64LE(params.openedSlot ?? 100n, SESSION_OFF.openedSlot);
  data.writeBigUInt64LE(params.lockedFinalizeFeeLamports ?? 10_000n, SESSION_OFF.lockedFinalizeFeeLamports);
  data.writeBigUInt64LE(params.expirySlot ?? 200n, SESSION_OFF.expirySlot);
  params.creator.toBuffer().copy(data, SESSION_OFF.creator);
  params.reviewer.toBuffer().copy(data, SESSION_OFF.reviewer);
  params.targetAsset.toBuffer().copy(data, SESSION_OFF.targetAsset);
  Buffer.alloc(32, 0x33).copy(data, SESSION_OFF.contextRefHash);
  (params.feedbackFileHashHint ?? Buffer.alloc(32, 0)).copy(data, SESSION_OFF.feedbackFileHashHint);
  (params.nonce ?? Buffer.alloc(32, 0x22)).copy(data, SESSION_OFF.nonce);
  Buffer.from(feedbackUriHint, 'utf8').copy(data, SESSION_OFF.feedbackUriHint);
  Buffer.from(endpointHint, 'utf8').copy(data, SESSION_OFF.endpointHint);
  return data;
}

describe('proofpass live requests', () => {
  it('decodes a live requester-driven request', async () => {
    const session = PublicKey.unique();
    const creator = PublicKey.unique();
    const reviewer = PublicKey.unique();
    const targetAsset = PublicKey.unique();

    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeSessionAccount({
          creator,
          reviewer,
          targetAsset,
          status: 1,
          endpointHint: '/service/payment-3',
          feedbackUriHint: 'ipfs://payment-3',
          feedbackFileHashHint: Buffer.alloc(32, 0xa4),
        }),
      }),
    };

    const request = await getLiveProofPass({
      connection: connection as any,
      session,
    });

    expect(request?.creator).toBe(creator.toBase58());
    expect(request?.reviewer).toBe(reviewer.toBase58());
    expect(request?.targetAsset).toBe(targetAsset.toBase58());
    expect(request?.status).toBe('open');
    expect(request?.answeredSlot).toBeNull();
    expect(request?.feeMode).toBe('creator_pays_all');
    expect(request?.lockedFinalizeFeeLamports).toBe(10_000n);
    expect(request?.endpointHint).toBe('/service/payment-3');
    expect(request?.feedbackUriHint).toBe('ipfs://payment-3');
    expect(request?.feedbackFileHashHint?.equals(Buffer.alloc(32, 0xa4))).toBe(true);
  });

  it('preserves an explicit all-zero feedback file hash hint when the presence flag is set', async () => {
    const session = PublicKey.unique();
    const creator = PublicKey.unique();
    const reviewer = PublicKey.unique();
    const targetAsset = PublicKey.unique();

    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeSessionAccount({
          creator,
          reviewer,
          targetAsset,
          feedbackFileHashHint: Buffer.alloc(32, 0),
        }),
      }),
    };

    const request = await getLiveProofPass({
      connection: connection as any,
      session,
    });

    expect(request?.feedbackFileHashHint?.equals(Buffer.alloc(32, 0))).toBe(true);
  });

  it('decodes reviewer-paid finalize mode from live sessions', async () => {
    const session = PublicKey.unique();
    const creator = PublicKey.unique();
    const reviewer = PublicKey.unique();
    const targetAsset = PublicKey.unique();

    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeSessionAccount({
          creator,
          reviewer,
          targetAsset,
          feeMode: 1,
          lockedFinalizeFeeLamports: 33_000n,
        }),
      }),
    };

    const request = await getLiveProofPass({
      connection: connection as any,
      session,
    });

    expect(request?.feeMode).toBe('reviewer_pays_finalize');
    expect(request?.lockedFinalizeFeeLamports).toBe(33_000n);
  });

  it('lists live requests by creator', async () => {
    const creator = PublicKey.unique();
    const reviewer = PublicKey.unique();
    const targetAsset = PublicKey.unique();

    const connection = {
      getProgramAccounts: jest.fn().mockResolvedValue([
        {
          pubkey: PublicKey.unique(),
          account: {
            data: makeSessionAccount({
              creator,
              reviewer,
              targetAsset,
              openedSlot: 60n,
            }),
          },
        },
      ]),
    };

    const requests = await getLiveProofPassesByCreator({
      connection: connection as any,
      creator,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.creator).toBe(creator.toBase58());
    expect(requests[0]?.reviewer).toBe(reviewer.toBase58());
  });

  it('returns null when a session is missing', async () => {
    const session = PublicKey.unique();
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue(null),
    };

    await expect(
      getLiveProofPass({
        connection: connection as any,
        session,
      })
    ).resolves.toBeNull();
  });

  it('returns null when session data is malformed', async () => {
    const session = PublicKey.unique();
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: Buffer.alloc(32, 0),
      }),
    };

    await expect(
      getLiveProofPass({
        connection: connection as any,
        session,
      })
    ).resolves.toBeNull();
  });

  it('filters malformed sessions and sorts creator requests by newest first', async () => {
    const creator = PublicKey.unique();
    const reviewer = PublicKey.unique();
    const targetAsset = PublicKey.unique();
    const newest = PublicKey.unique();
    const oldest = PublicKey.unique();

    const connection = {
      getProgramAccounts: jest.fn().mockResolvedValue([
        {
          pubkey: oldest,
          account: {
            data: makeSessionAccount({
              creator,
              reviewer,
              targetAsset,
              openedSlot: 20n,
            }),
          },
        },
        {
          pubkey: PublicKey.unique(),
          account: {
            data: Buffer.alloc(8, 0),
          },
        },
        {
          pubkey: newest,
          account: {
            data: makeSessionAccount({
              creator,
              reviewer,
              targetAsset,
              openedSlot: 99n,
            }),
          },
        },
      ]),
    };

    const requests = await getLiveProofPassesByCreator({
      connection: connection as any,
      creator,
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]?.sessionAddress).toBe(newest.toBase58());
    expect(requests[1]?.sessionAddress).toBe(oldest.toBase58());
  });

  it('handles a service-sized batch of live requests in newest-first order', async () => {
    const creator = PublicKey.unique();
    const targetAsset = PublicKey.unique();
    const sessionCount = 32;
    const sessions = Array.from({ length: sessionCount }, (_, index) => {
      const session = PublicKey.unique();
      return {
        pubkey: session,
        account: {
          data: makeSessionAccount({
            creator,
            reviewer: new PublicKey(Buffer.alloc(32, index + 1)),
            targetAsset,
            openedSlot: BigInt(1_000 + index),
            status: 1,
          }),
        },
      };
    });

    const connection = {
      getProgramAccounts: jest.fn().mockResolvedValue([
        ...sessions,
        {
          pubkey: PublicKey.unique(),
          account: {
            data: Buffer.alloc(4, 0),
          },
        },
      ]),
    };

    const requests = await getLiveProofPassesByCreator({
      connection: connection as any,
      creator,
    });

    expect(requests).toHaveLength(sessionCount);
    expect(requests[0]?.sessionAddress).toBe(sessions[sessionCount - 1]?.pubkey.toBase58());
    expect(requests[0]?.openedSlot).toBe(1_031n);
    expect(requests[sessionCount - 1]?.sessionAddress).toBe(sessions[0]?.pubkey.toBase58());
    expect(requests[sessionCount - 1]?.openedSlot).toBe(1_000n);
  });

  it('returns an empty list when the listing service has no live requests', async () => {
    const creator = PublicKey.unique();
    const connection = {
      getProgramAccounts: jest.fn().mockResolvedValue([]),
    };

    await expect(
      getLiveProofPassesByCreator({
        connection: connection as any,
        creator,
      })
    ).resolves.toEqual([]);
  });

  it('builds cancel open directly from live session', async () => {
    const session = PublicKey.unique();
    const creator = PublicKey.unique();
    const reviewer = PublicKey.unique();
    const targetAsset = PublicKey.unique();

    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeSessionAccount({ creator, reviewer, targetAsset, status: 1 }),
      }),
      getSlot: jest.fn().mockResolvedValue(100n),
    };

    const result = await closeProofPass({
      connection: connection as any,
      session,
    });

    expect(result.closeMode).toBe('open');
    expect(result.request.creator).toBe(creator.toBase58());
    expect(result.instruction.keys[0]?.pubkey.toBase58()).toBe(creator.toBase58());
  });

  it('builds cancel expired when open session is past expiry', async () => {
    const session = PublicKey.unique();
    const creator = PublicKey.unique();
    const reviewer = PublicKey.unique();
    const targetAsset = PublicKey.unique();

    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeSessionAccount({
          creator,
          reviewer,
          targetAsset,
          status: 1,
          expirySlot: 200n,
        }),
      }),
      getSlot: jest.fn().mockResolvedValue(250n),
    };

    const result = await closeProofPass({
      connection: connection as any,
      session,
    });

    expect(result.closeMode).toBe('expired');
    expect(result.instruction.keys[0]?.pubkey.toBase58()).toBe(creator.toBase58());
  });

  it('keeps cancel open on non-expired live sessions', async () => {
    const session = PublicKey.unique();
    const creator = PublicKey.unique();
    const reviewer = PublicKey.unique();
    const targetAsset = PublicKey.unique();

    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeSessionAccount({
          creator,
          reviewer,
          targetAsset,
          status: 1,
          expirySlot: 400n,
        }),
      }),
      getSlot: jest.fn().mockResolvedValue(399n),
    };

    await expect(
      closeProofPass({
        connection: connection as any,
        session,
      })
    ).resolves.toMatchObject({
      closeMode: 'open',
    });
  });

  it('requires a slot source to choose between close open and close expired', async () => {
    const session = PublicKey.unique();
    const creator = PublicKey.unique();
    const reviewer = PublicKey.unique();
    const targetAsset = PublicKey.unique();

    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({
        data: makeSessionAccount({
          creator,
          reviewer,
          targetAsset,
          status: 1,
          expirySlot: 200n,
        }),
      }),
    };

    await expect(
      closeProofPass({
        connection: connection as any,
        session,
      })
    ).rejects.toThrow(
      'closeProofPass requires currentSlot or connection.getSlot() to determine whether the request is expired'
    );
  });
});
