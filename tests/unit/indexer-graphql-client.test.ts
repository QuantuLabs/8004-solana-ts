import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

const { IndexerGraphQLClient } = await import('../../src/core/indexer-graphql-client.js');

function createClient(overrides: Record<string, unknown> = {}) {
  return new IndexerGraphQLClient({
    graphqlUrl: 'http://localhost:3000/graphql',
    timeout: 1000,
    retries: 0,
    ...overrides,
  });
}

function mockGraphQLResponse(payload: { data?: unknown; errors?: Array<{ message: string }> }, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function getBody(callIndex: number): { query: string; variables?: Record<string, unknown> } {
  const [, init] = mockFetch.mock.calls[callIndex] as [string, RequestInit];
  const rawBody = typeof init.body === 'string' ? init.body : '{}';
  return JSON.parse(rawBody) as { query: string; variables?: Record<string, unknown> };
}

describe('IndexerGraphQLClient collection compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getCollectionPointers should use modern collections query', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(mockGraphQLResponse({
      data: {
        collections: [
          {
            collection: 'c1:abc',
            creator: 'creator1',
            firstSeenAsset: 'asset1',
            firstSeenAt: '1770000000',
            firstSeenSlot: '10',
            firstSeenTxSignature: null,
            lastSeenAt: '1770000100',
            lastSeenSlot: '11',
            lastSeenTxSignature: null,
            assetCount: '1',
          },
        ],
      },
    }));

    const rows = await client.getCollectionPointers({ collection: 'c1:abc', creator: 'creator1' });
    const body = getBody(0);
    expect(body.query).toContain('collections(');
    expect(body.variables?.collection).toBe('c1:abc');
    expect(rows[0]).toMatchObject({
      collection: 'c1:abc',
      col: 'c1:abc',
      creator: 'creator1',
      asset_count: '1',
    });
  });

  it('getCollectionPointers should fallback to legacy collectionPointers query', async () => {
    const client = createClient();
    mockFetch
      .mockResolvedValueOnce(mockGraphQLResponse({
        errors: [{ message: 'Cannot query field "collections" on type "Query".' }],
      }))
      .mockResolvedValueOnce(mockGraphQLResponse({
        data: {
          collectionPointers: [
            {
              col: 'c1:legacy',
              creator: 'legacyCreator',
              firstSeenAsset: 'assetLegacy',
              firstSeenAt: '1771000000',
              firstSeenSlot: '42',
              firstSeenTxSignature: null,
              lastSeenAt: '1771000100',
              lastSeenSlot: '43',
              lastSeenTxSignature: null,
              assetCount: '7',
            },
          ],
        },
      }));

    const rows = await client.getCollectionPointers({ col: 'c1:legacy' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstBody = getBody(0);
    const secondBody = getBody(1);
    expect(firstBody.query).toContain('collections(');
    expect(secondBody.query).toContain('collectionPointers(');
    expect(secondBody.variables?.col).toBe('c1:legacy');
    expect(rows[0]).toMatchObject({
      collection: 'c1:legacy',
      col: 'c1:legacy',
      creator: 'legacyCreator',
      asset_count: '7',
    });
  });

  it('getCollectionAssetCount should use modern collection argument', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(mockGraphQLResponse({
      data: { collectionAssetCount: '12' },
    }));

    const count = await client.getCollectionAssetCount('c1:abc', 'creator1');
    const body = getBody(0);
    expect(body.query).toContain('collectionAssetCount(collection: $collection');
    expect(body.variables?.collection).toBe('c1:abc');
    expect(count).toBe(12);
  });

  it('getCollectionAssetCount should fallback to legacy col argument', async () => {
    const client = createClient();
    mockFetch
      .mockResolvedValueOnce(mockGraphQLResponse({
        errors: [{ message: 'Unknown argument "collection" on field "Query.collectionAssetCount".' }],
      }))
      .mockResolvedValueOnce(mockGraphQLResponse({
        data: { collectionAssetCount: '9' },
      }));

    const count = await client.getCollectionAssetCount('c1:legacy');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondBody = getBody(1);
    expect(secondBody.query).toContain('collectionAssetCount(col: $col');
    expect(secondBody.variables?.col).toBe('c1:legacy');
    expect(count).toBe(9);
  });

  it('getCollectionAssets should fallback to legacy col argument when needed', async () => {
    const client = createClient();
    const node = {
      owner: 'owner1',
      creator: 'creator1',
      agentURI: null,
      agentWallet: null,
      collectionPointer: 'c1:legacy',
      colLocked: false,
      parentAsset: null,
      parentCreator: null,
      parentLocked: false,
      createdAt: '1772000000',
      updatedAt: '1772000100',
      totalFeedback: '2',
      solana: {
        assetPubkey: 'asset1',
        collection: 'base',
        atomEnabled: true,
        trustTier: 1,
        qualityScore: 100,
        confidence: 50,
        riskScore: 3,
        diversityRatio: 2,
      },
    };

    mockFetch
      .mockResolvedValueOnce(mockGraphQLResponse({
        errors: [{ message: 'Unknown argument "collection" on field "Query.collectionAssets".' }],
      }))
      .mockResolvedValueOnce(mockGraphQLResponse({
        data: { collectionAssets: [node] },
      }));

    const rows = await client.getCollectionAssets('c1:legacy');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstBody = getBody(0);
    const secondBody = getBody(1);
    expect(firstBody.query).toContain('collectionAssets(');
    expect(firstBody.query).toContain('collection: $collection');
    expect(secondBody.query).toContain('col: $col');
    expect(rows[0]).toMatchObject({ asset: 'asset1', collection_pointer: 'c1:legacy' });
  });

  it('getAgent should query by raw asset id', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          agent: {
            id: 'AssetCanonical111',
            owner: 'owner1',
            creator: 'creator1',
            agentURI: null,
            agentWallet: null,
            collectionPointer: null,
            colLocked: false,
            parentAsset: null,
            parentCreator: null,
            parentLocked: false,
            createdAt: '1773000000',
            updatedAt: '1773000001',
            totalFeedback: '0',
            solana: {
              assetPubkey: 'AssetCanonical111',
              collection: 'base',
              atomEnabled: true,
              trustTier: 0,
              qualityScore: 0,
              confidence: 0,
              riskScore: 0,
              diversityRatio: 0,
            },
          },
        },
      })
    );

    await client.getAgent('AssetCanonical111');
    const body = getBody(0);
    expect(body.variables?.id).toBe('AssetCanonical111');
  });

  it('getAgentByAgentId should resolve by sequential GraphQL agentId', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          agents: [
            {
              id: 'AssetById333',
              owner: 'owner1',
              creator: 'creator1',
              agentURI: null,
              agentWallet: null,
              collectionPointer: null,
              colLocked: false,
              parentAsset: null,
              parentCreator: null,
              parentLocked: false,
              createdAt: '1773000000',
              updatedAt: '1773000001',
              totalFeedback: '0',
              solana: {
                assetPubkey: 'AssetById333',
                collection: 'base',
                atomEnabled: true,
                trustTier: 0,
                qualityScore: 0,
                confidence: 0,
                riskScore: 0,
                diversityRatio: 0,
              },
            },
          ],
        },
      })
    );

    const row = await client.getAgentByAgentId(42);
    expect(row?.asset).toBe('AssetById333');
    expect(row?.agent_id).toBe('42');
    const body = getBody(0);
    expect(body.query).toContain('where: { agentId: $agentId }');
    expect((body.variables as any)?.agentId).toBe('42');
  });

  it('getAgentByAgentId should retry with BigInt variable type when String is rejected', async () => {
    const client = createClient();
    const largeAgentId = '9007199254740993';

    mockFetch
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          errors: [{ message: 'Variable "$agentId" of type "String!" used in position expecting type "BigInt".' }],
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            agents: [
              {
                id: 'AssetByIdBigInt',
                owner: 'owner1',
                creator: 'creator1',
                agentURI: null,
                agentWallet: null,
                collectionPointer: null,
                colLocked: false,
                parentAsset: null,
                parentCreator: null,
                parentLocked: false,
                createdAt: '1773000000',
                updatedAt: '1773000001',
                totalFeedback: '0',
                solana: {
                  assetPubkey: 'AssetByIdBigInt',
                  collection: 'base',
                  atomEnabled: true,
                  trustTier: 0,
                  qualityScore: 0,
                  confidence: 0,
                  riskScore: 0,
                  diversityRatio: 0,
                },
              },
            ],
          },
        }),
      );

    const row = await client.getAgentByAgentId(BigInt(largeAgentId));
    expect(row?.asset).toBe('AssetByIdBigInt');
    expect(row?.agent_id).toBe(largeAgentId);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstBody = getBody(0);
    const secondBody = getBody(1);
    expect(firstBody.query).toContain('query($agentId: String!)');
    expect(secondBody.query).toContain('query($agentId: BigInt!)');
    expect((secondBody.variables as any)?.agentId).toBe(largeAgentId);
  });

  it('getAgentByAgentId should retry BigInt filter with numeric variable for strict scalar parsers', async () => {
    const client = createClient();

    mockFetch
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          errors: [{ message: 'Variable "$agentId" of type "String!" used in position expecting type "BigInt".' }],
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          errors: [{ message: 'BigInt cannot represent non-integer value: "42"' }],
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            agents: [
              {
                id: 'AssetByIdNumericBigInt',
                owner: 'owner1',
                creator: 'creator1',
                agentURI: null,
                agentWallet: null,
                collectionPointer: null,
                colLocked: false,
                parentAsset: null,
                parentCreator: null,
                parentLocked: false,
                createdAt: '1773000000',
                updatedAt: '1773000001',
                totalFeedback: '0',
                solana: {
                  assetPubkey: 'AssetByIdNumericBigInt',
                  collection: 'base',
                  atomEnabled: true,
                  trustTier: 0,
                  qualityScore: 0,
                  confidence: 0,
                  riskScore: 0,
                  diversityRatio: 0,
                },
              },
            ],
          },
        }),
      );

    const row = await client.getAgentByAgentId(42);
    expect(row?.asset).toBe('AssetByIdNumericBigInt');
    expect(row?.agent_id).toBe('42');
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const secondBody = getBody(1);
    const thirdBody = getBody(2);
    expect(secondBody.query).toContain('query($agentId: BigInt!)');
    expect((secondBody.variables as any)?.agentId).toBe('42');
    expect(thirdBody.query).toContain('query($agentId: BigInt!)');
    expect((thirdBody.variables as any)?.agentId).toBe(42);
  });

  it('getAgentByAgentId should fallback to legacy agentid filter when needed', async () => {
    const client = createClient();
    mockFetch
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          errors: [{ message: 'Cannot query field "agentId" on type "AgentFilter".' }],
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            agents: [
              {
                id: 'AssetById444',
                owner: 'owner1',
                creator: 'creator1',
                agentURI: null,
                agentWallet: null,
                collectionPointer: null,
                colLocked: false,
                parentAsset: null,
                parentCreator: null,
                parentLocked: false,
                createdAt: '1773000000',
                updatedAt: '1773000001',
                totalFeedback: '0',
                solana: {
                  assetPubkey: 'AssetById444',
                  collection: 'base',
                  atomEnabled: true,
                  trustTier: 0,
                  qualityScore: 0,
                  confidence: 0,
                  riskScore: 0,
                  diversityRatio: 0,
                },
              },
            ],
          },
        }),
      );

    const row = await client.getAgentByAgentId(77);
    expect(row?.asset).toBe('AssetById444');
    expect(row?.agent_id).toBe('77');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondBody = getBody(1);
    expect(secondBody.query).toContain('where: { agentid: $agentId }');
    expect((secondBody.variables as any)?.agentId).toBe('77');
  });

  it('getAgentByAgentId should fallback to legacy agent(id) lookup when sequence fields are unavailable', async () => {
    const client = createClient();
    mockFetch
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          errors: [{ message: 'Cannot query field "agentId" on type "AgentFilter".' }],
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          errors: [{ message: 'Cannot query field "agentid" on type "AgentFilter".' }],
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            agent: {
              id: 'LegacyAssetId',
              owner: 'owner1',
              creator: 'creator1',
              agentURI: null,
              agentWallet: null,
              collectionPointer: null,
              colLocked: false,
              parentAsset: null,
              parentCreator: null,
              parentLocked: false,
              createdAt: '1773000000',
              updatedAt: '1773000001',
              totalFeedback: '0',
              solana: {
                assetPubkey: 'LegacyAssetId',
                collection: 'base',
                atomEnabled: true,
                trustTier: 0,
                qualityScore: 0,
                confidence: 0,
                riskScore: 0,
                diversityRatio: 0,
              },
            },
          },
        }),
      );

    const row = await client.getAgentByAgentId('123');
    expect(row?.asset).toBe('LegacyAssetId');
    expect(row?.agent_id).toBe('123');
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const thirdBody = getBody(2);
    expect(thirdBody.query).toContain('agent(id: $id)');
    expect((thirdBody.variables as any)?.id).toBe('123');
  });

  it('getAgentByIndexerId should remain an alias to getAgentByAgentId', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          agents: [],
        },
      })
    );

    const row = await client.getAgentByIndexerId(42);
    expect(row).toBeNull();
    const body = getBody(0);
    expect((body.variables as any)?.agentId).toBe('42');
  });

  it('getFeedbacks should query using raw asset agent filter', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          feedbacks: [],
        },
      })
    );

    await client.getFeedbacks('AssetFeedback222', { includeRevoked: false, limit: 10, offset: 0 });
    const body = getBody(0);
    expect((body.variables as any)?.where?.agent).toBe('AssetFeedback222');
    expect((body.variables as any)?.where?.isRevoked).toBe(false);
  });

  it('getFeedback should query canonical feedback id and preserve sequential row ids', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          feedback: {
            id: '123',
            clientAddress: 'ClientFeedback111',
            feedbackIndex: '7',
            tag1: 'quality',
            tag2: null,
            endpoint: '/chat',
            feedbackURI: 'ipfs://feedback',
            feedbackHash: 'ab'.repeat(32),
            isRevoked: false,
            createdAt: '1773000001',
            revokedAt: null,
            solana: {
              valueRaw: '100',
              valueDecimals: 0,
              score: 95,
              txSignature: 'sig1',
              blockSlot: '100',
            },
          },
        },
      }),
    );

    const row = await client.getFeedback('AssetFeedback222', 'ClientFeedback111', 7n);
    expect(row?.id).toBe('123');
    expect(row?.asset).toBe('AssetFeedback222');
    expect(row?.client_address).toBe('ClientFeedback111');
    expect(row?.feedback_index).toBe(7);
    const body = getBody(0);
    expect((body.variables as any)?.id).toBe('AssetFeedback222:ClientFeedback111:7');
  });

  it('getFeedback should return null without fallback when canonical id misses', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          feedback: null,
        },
      }),
    );

    await expect(client.getFeedback('AssetFeedback222', 'ClientFeedback111', 7n)).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('getFeedbackResponsesFor should query canonical feedback id and preserve sequential response ids', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          feedbackResponses: [
            {
              id: '901',
              responder: 'Responder111',
              responseUri: 'ipfs://response-901',
              responseHash: 'cd'.repeat(32),
              createdAt: '1773000002',
              solana: {
                txSignature: 'respSig901',
                blockSlot: '101',
              },
            },
          ],
        },
      }),
    );

    const rows = await client.getFeedbackResponsesFor('AssetFeedback222', 'ClientFeedback111', 7, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: '901',
      asset: 'AssetFeedback222',
      client_address: 'ClientFeedback111',
      feedback_index: 7,
      responder: 'Responder111',
    });
    const body = getBody(0);
    expect((body.variables as any)?.feedback).toBe('AssetFeedback222:ClientFeedback111:7');
  });

  it('getFeedbackResponsesFor should return [] without fallback when canonical id has no rows', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          feedbackResponses: [],
        },
      }),
    );

    await expect(
      client.getFeedbackResponsesFor('AssetFeedback222', 'ClientFeedback111', 7, 10)
    ).resolves.toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('getFeedbacksByClient should decode legacy sol-prefixed feedback ids', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          feedbacks: [
            {
              id: 'sol:LegacyAsset555:ClientFeedback111:7',
              clientAddress: 'ClientFeedback111',
              feedbackIndex: '7',
              tag1: 'quality',
              tag2: null,
              endpoint: '/chat',
              feedbackURI: 'ipfs://feedback',
              feedbackHash: 'ab'.repeat(32),
              isRevoked: false,
              createdAt: '1773000001',
              revokedAt: null,
              solana: {
                valueRaw: '100',
                valueDecimals: 0,
                score: 95,
                txSignature: 'sig1',
                blockSlot: '100',
              },
            },
          ],
        },
      }),
    );

    const rows = await client.getFeedbacksByClient('ClientFeedback111');
    expect(rows[0]?.asset).toBe('LegacyAsset555');
  });

  it('getFeedbacksByClient should preserve asset when ids are sequential and agent linkage is present', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          feedbacks: [
            {
              id: '123',
              clientAddress: 'ClientFeedback111',
              feedbackIndex: '7',
              tag1: 'quality',
              tag2: null,
              endpoint: '/chat',
              feedbackURI: 'ipfs://feedback',
              feedbackHash: 'ab'.repeat(32),
              isRevoked: false,
              createdAt: '1773000001',
              revokedAt: null,
              agent: { id: 'RecoveredAsset333' },
              solana: {
                valueRaw: '100',
                valueDecimals: 0,
                score: 95,
                txSignature: 'sig1',
                blockSlot: '100',
              },
            },
          ],
        },
      }),
    );

    const rows = await client.getFeedbacksByClient('ClientFeedback111');
    expect(rows[0]?.asset).toBe('RecoveredAsset333');
    const body = getBody(0);
    expect(body.query).toContain('agent { id }');
  });

  it('getAgentReputation should throw to allow SDK on-chain fallback', async () => {
    const client = createClient();
    await expect(client.getAgentReputation('AssetCanonical111')).rejects.toThrow(
      'GraphQL backend does not expose getAgentReputation',
    );
  });

  it('getAgents should map updated_at filters and orderBy to GraphQL variables', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: { agents: [] },
      }),
    );

    await client.getAgents({
      order: 'updated_at.asc',
      updatedAtGt: '1770421000',
      updatedAtLt: '1770422000',
      limit: 10,
      offset: 5,
    });

    const body = getBody(0);
    expect(body.query).toContain('orderBy: $orderBy');
    expect((body.variables as any)?.orderBy).toBe('updatedAt');
    expect((body.variables as any)?.dir).toBe('asc');
    expect((body.variables as any)?.where?.updatedAt_gt).toBe('1770421000');
    expect((body.variables as any)?.where?.updatedAt_lt).toBe('1770422000');
  });

  it('getAgents should map legacy agent_id order alias to createdAt', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: { agents: [] },
      }),
    );

    await client.getAgents({
      order: 'agent_id.desc',
      limit: 5,
    });

    const body = getBody(0);
    expect((body.variables as any)?.orderBy).toBe('createdAt');
    expect((body.variables as any)?.dir).toBe('desc');
  });

  it('getLeaderboard should throw when cursorSortKey is requested on GraphQL backend', async () => {
    const client = createClient();
    await expect(
      client.getLeaderboard({ cursorSortKey: '12345', limit: 10 }),
    ).rejects.toThrow('GraphQL backend does not support cursorSortKey keyset pagination');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
