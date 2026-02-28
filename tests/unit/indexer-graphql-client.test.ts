import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

const { IndexerGraphQLClient } = await import('../../src/core/indexer-graphql-client.js');
const {
  IndexerError,
  IndexerErrorCode,
  IndexerRateLimitError,
  IndexerUnauthorizedError,
} = await import('../../src/core/indexer-errors.js');

function createClient(overrides: Record<string, unknown> = {}) {
  return new IndexerGraphQLClient({
    graphqlUrl: 'http://localhost:3000/graphql',
    timeout: 1000,
    retries: 0,
    ...overrides,
  });
}

function mockGraphQLResponse(
  payload: { data?: unknown; errors?: Array<{ message: string }> },
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function getBody(callIndex: number): { query: string; variables?: Record<string, unknown> } {
  const [, init] = mockFetch.mock.calls[callIndex] as [string, RequestInit];
  const rawBody = typeof init.body === 'string' ? init.body : '{}';
  return JSON.parse(rawBody) as { query: string; variables?: Record<string, unknown> };
}

function mockFeedbackRows(count: number, startIndex = 0): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => {
    const i = startIndex + index;
    return {
      id: `fb-${i}`,
      clientAddress: `Client${i}`,
      feedbackIndex: String(i),
      tag1: 'quality',
      tag2: null,
      endpoint: '/chat',
      feedbackURI: `ipfs://feedback-${i}`,
      feedbackHash: 'ab'.repeat(32),
      isRevoked: false,
      createdAt: String(1773000000 + i),
      revokedAt: null,
      solana: {
        valueRaw: '100',
        valueDecimals: 0,
        score: 90,
        txSignature: `sig-${i}`,
        blockSlot: String(1000 + i),
      },
    };
  });
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

  it('getCollectionAssets should map creator/paging/order params to GraphQL variables', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: { collectionAssets: [] },
      }),
    );

    await client.getCollectionAssets('c1:abc', {
      creator: 'creator1',
      order: 'trust_tier.asc',
      limit: 12,
      offset: 3,
    });

    const body = getBody(0);
    expect(body.query).toContain('collection: $collection');
    expect((body.variables as any)?.collection).toBe('c1:abc');
    expect((body.variables as any)?.creator).toBe('creator1');
    expect((body.variables as any)?.first).toBe(12);
    expect((body.variables as any)?.skip).toBe(3);
    expect((body.variables as any)?.orderBy).toBe('trustTier');
    expect((body.variables as any)?.dir).toBe('asc');
  });

  it('getCollectionAssets should not fallback on unrelated GraphQL validation errors', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        errors: [{ message: 'Unknown argument "creatorAddress" on field "Query.collectionAssets".' }],
      }),
    );

    await expect(client.getCollectionAssets('c1:abc')).rejects.toThrow(
      'Unknown argument "creatorAddress" on field "Query.collectionAssets".',
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = getBody(0);
    expect(body.query).toContain('collection: $collection');
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

  it('getAgentByAgentId should not fallback fields on server internal errors', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse(
        {
          errors: [{ message: 'Unexpected error while resolving query.' }],
        },
        500,
      ),
    );

    let thrown: unknown;
    try {
      await client.getAgentByAgentId(77);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IndexerError);
    expect((thrown as IndexerError).code).toBe(IndexerErrorCode.SERVER_ERROR);
    expect((thrown as Error).message).toContain('GraphQL request failed: HTTP 500');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const firstBody = getBody(0);
    expect(firstBody.query).toContain('where: { agentId: $agentId }');
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

  it('getFeedbacks should omit isRevoked filter when includeRevoked is true', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          feedbacks: [],
        },
      }),
    );

    await client.getFeedbacks('sol:AssetFeedback222', { includeRevoked: true, limit: 10, offset: 0 });
    const body = getBody(0);
    expect((body.variables as any)?.where?.agent).toBe('AssetFeedback222');
    expect((body.variables as any)?.where).not.toHaveProperty('isRevoked');
  });

  it('getFeedbacks should paginate in complexity-safe chunks until limit is reached', async () => {
    const client = createClient();
    mockFetch
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            feedbacks: mockFeedbackRows(100, 0),
          },
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            feedbacks: mockFeedbackRows(100, 100),
          },
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            feedbacks: mockFeedbackRows(50, 200),
          },
        }),
      );

    const rows = await client.getFeedbacks('AssetFeedback222', { includeRevoked: false, limit: 250, offset: 5 });
    expect(rows).toHaveLength(250);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const firstBody = getBody(0);
    const secondBody = getBody(1);
    const thirdBody = getBody(2);
    expect(firstBody.query).toContain('feedbacks(first: 100, skip: 5');
    expect(secondBody.query).toContain('feedbacks(first: 100, skip: 105');
    expect(thirdBody.query).toContain('feedbacks(first: 50, skip: 205');
    expect((firstBody.variables as any)?.where?.agent).toBe('AssetFeedback222');
    expect((firstBody.variables as any)?.where?.isRevoked).toBe(false);
  });

  it('getFeedbacks should stop chunked pagination when a page is empty', async () => {
    const client = createClient();
    mockFetch
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            feedbacks: mockFeedbackRows(100, 0),
          },
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            feedbacks: [],
          },
        }),
      );

    const rows = await client.getFeedbacks('AssetFeedback222', { includeRevoked: false, limit: 250, offset: 0 });
    expect(rows).toHaveLength(100);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstBody = getBody(0);
    const secondBody = getBody(1);
    expect(firstBody.query).toContain('feedbacks(first: 100, skip: 0');
    expect(secondBody.query).toContain('feedbacks(first: 100, skip: 100');
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

  it('getAgentReputation should map agent totals and feedback scores', async () => {
    const client = createClient();
    mockFetch
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            agent: {
              id: 'AssetCanonical111',
              owner: 'owner1',
              agentURI: 'ipfs://agent',
              totalFeedback: '3',
              solana: {
                assetPubkey: 'AssetCanonical111',
                collection: 'base',
                qualityScore: 7500,
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            feedbacks: [
              { solana: { score: 90 } },
              { solana: { score: 30 } },
              { solana: { score: null } },
            ],
          },
        }),
      );

    const row = await client.getAgentReputation('sol:AssetCanonical111');
    expect(row).toMatchObject({
      asset: 'AssetCanonical111',
      owner: 'owner1',
      collection: 'base',
      agent_uri: 'ipfs://agent',
      feedback_count: 3,
      avg_score: 60,
      positive_count: 2,
      negative_count: 1,
      validation_count: 0,
      nft_name: null,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstBody = getBody(0);
    const secondBody = getBody(1);
    expect((firstBody.variables as any)?.id).toBe('AssetCanonical111');
    expect(secondBody.query).toContain('feedbacks(');
    expect((secondBody.variables as any)?.agent).toBe('AssetCanonical111');
  });

  it('getAgentReputation should return null when the agent is missing', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          agent: null,
        },
      }),
    );

    await expect(client.getAgentReputation('AssetCanonical111')).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should map HTTP 401 responses to IndexerUnauthorizedError', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse(
        {
          errors: [{ message: 'Unauthorized' }],
        },
        401,
      ),
    );

    await expect(client.getGlobalStats()).rejects.toBeInstanceOf(IndexerUnauthorizedError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should map HTTP 429 responses to IndexerRateLimitError with retryAfter', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse(
        {
          errors: [{ message: 'Too many requests' }],
        },
        429,
        { 'Retry-After': '7' },
      ),
    );

    let thrown: unknown;
    try {
      await client.getGlobalStats();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IndexerRateLimitError);
    expect((thrown as IndexerRateLimitError).retryAfter).toBe(7);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('getAgents should map filter params into GraphQL where clause', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: { agents: [] },
      }),
    );

    await client.getAgents({
      owner: 'owner1',
      creator: 'creator1',
      collection: 'base',
      collectionPointer: 'c1:pointer',
      wallet: 'wallet1',
      parentAsset: 'parentAsset1',
      parentCreator: 'parentCreator1',
      colLocked: true,
      parentLocked: false,
      updatedAt: '1770421500',
      order: 'total_feedback.asc',
      limit: 20,
      offset: 4,
    });

    const body = getBody(0);
    expect((body.variables as any)?.orderBy).toBe('totalFeedback');
    expect((body.variables as any)?.dir).toBe('asc');
    expect((body.variables as any)?.where).toMatchObject({
      owner: 'owner1',
      creator: 'creator1',
      collection: 'base',
      collectionPointer: 'c1:pointer',
      agentWallet: 'wallet1',
      parentAsset: 'parentAsset1',
      parentCreator: 'parentCreator1',
      colLocked: true,
      parentLocked: false,
      updatedAt_gt: '1770421499',
      updatedAt_lt: '1770421501',
    });
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

  it('getAgentsByOwner should delegate owner query with default paging/sort', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: { agents: [] },
      }),
    );

    await client.getAgentsByOwner('Owner111');
    const body = getBody(0);
    expect((body.variables as any)?.where?.owner).toBe('Owner111');
    expect((body.variables as any)?.orderBy).toBe('createdAt');
    expect((body.variables as any)?.dir).toBe('desc');
    expect(body.query).toContain('agents(first: 250, skip: 0');
  });

  it('getAgentsByCollection should delegate collection query with default paging/sort', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: { agents: [] },
      }),
    );

    await client.getAgentsByCollection('BaseCollection111');
    const body = getBody(0);
    expect((body.variables as any)?.where?.collection).toBe('BaseCollection111');
    expect((body.variables as any)?.orderBy).toBe('createdAt');
    expect((body.variables as any)?.dir).toBe('desc');
    expect(body.query).toContain('agents(first: 250, skip: 0');
  });

  it('getAgentByWallet should return first result and use wallet filter', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          agents: [
            {
              id: 'AssetWalletA',
              owner: 'ownerA',
              creator: 'creatorA',
              agentURI: null,
              agentWallet: 'WalletABC',
              collectionPointer: null,
              colLocked: false,
              parentAsset: null,
              parentCreator: null,
              parentLocked: false,
              createdAt: '1773000000',
              updatedAt: '1773000001',
              totalFeedback: '0',
              solana: {
                assetPubkey: 'AssetWalletA',
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

    const row = await client.getAgentByWallet('WalletABC');
    expect(row?.asset).toBe('AssetWalletA');
    const body = getBody(0);
    expect((body.variables as any)?.where?.agentWallet).toBe('WalletABC');
    expect(body.query).toContain('agents(first: 1, skip: 0');
  });

  it('getGlobalStats should map totals from globalStats and default total_validations to 0', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          globalStats: {
            totalAgents: '11',
            totalFeedback: '22',
            totalCollections: '4',
            tags: ['tag-a'],
          },
        },
      }),
    );

    const stats = await client.getGlobalStats();
    expect(stats).toMatchObject({
      total_agents: 11,
      total_feedbacks: 22,
      total_validations: 0,
      total_collections: 4,
    });
    const body = getBody(0);
    expect(body.query).toContain('globalStats { totalAgents totalFeedback totalCollections tags }');
    expect(body.query).not.toContain('totalValidations');
    expect(body.query).not.toContain('globalStats(id: $id)');
    expect(body.variables).toBeUndefined();
  });

  it('getFeedbacksByTag should query tag1 and tag2 then dedupe by id', async () => {
    const client = createClient();
    const shared = {
      id: 'Asset1:Client1:1',
      agent: { id: 'Asset1' },
      clientAddress: 'Client1',
      feedbackIndex: '1',
      tag1: 'uptime',
      tag2: 'latency',
      endpoint: '/api',
      feedbackURI: 'ipfs://f1',
      feedbackHash: 'ab'.repeat(32),
      isRevoked: false,
      createdAt: '1773000001',
      revokedAt: null,
      solana: { valueRaw: '1', valueDecimals: 0, score: 99, txSignature: 's1', blockSlot: '9' },
    };
    mockFetch
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: { feedbacks: [shared] },
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            feedbacks: [
              shared,
              {
                ...shared,
                id: 'Asset1:Client2:2',
                clientAddress: 'Client2',
                feedbackIndex: '2',
              },
            ],
          },
        }),
      );

    const rows = await client.getFeedbacksByTag('uptime');
    expect(rows).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstBody = getBody(0);
    const secondBody = getBody(1);
    expect(firstBody.query).toContain('where: { tag1: $tag }');
    expect(secondBody.query).toContain('where: { tag2: $tag }');
    expect((firstBody.variables as any)?.tag).toBe('uptime');
  });

  it('getFeedbacksByTag should paginate tag queries under complexity limits', async () => {
    const client = createClient();
    const tag1Page1 = mockFeedbackRows(100, 0).map((row) => ({
      ...row,
      id: `AssetA:Client${row.feedbackIndex}:${row.feedbackIndex}`,
      agent: { id: 'AssetA' },
      tag1: 'uptime',
      tag2: 'latency',
    }));
    const tag1Page2 = [
      {
        ...mockFeedbackRows(1, 100)[0],
        id: 'AssetA:Client100:100',
        agent: { id: 'AssetA' },
        tag1: 'uptime',
        tag2: 'latency',
      },
    ];
    const tag2Page1 = [
      {
        ...tag1Page1[0],
        id: tag1Page1[0]?.id,
      },
    ];
    const tag2Page2 = [] as Array<Record<string, unknown>>;

    mockFetch.mockImplementation(async (_url: string | URL | globalThis.Request, init?: RequestInit) => {
      const rawBody = typeof init?.body === 'string' ? init.body : '{}';
      const body = JSON.parse(rawBody) as { query: string; variables?: Record<string, unknown> };
      const query = body.query ?? '';

      if (query.includes('where: { tag1: $tag }') && query.includes('skip: 0')) {
        return mockGraphQLResponse({ data: { feedbacks: tag1Page1 } });
      }
      if (query.includes('where: { tag1: $tag }') && query.includes('skip: 100')) {
        return mockGraphQLResponse({ data: { feedbacks: tag1Page2 } });
      }
      if (query.includes('where: { tag2: $tag }') && query.includes('skip: 0')) {
        return mockGraphQLResponse({ data: { feedbacks: tag2Page1 } });
      }
      if (query.includes('where: { tag2: $tag }') && query.includes('skip: 1')) {
        return mockGraphQLResponse({ data: { feedbacks: tag2Page2 } });
      }
      return mockGraphQLResponse({ data: { feedbacks: [] } });
    });

    const rows = await client.getFeedbacksByTag('uptime');
    expect(rows).toHaveLength(101);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('getFeedbacksByEndpoint should apply endpoint variable', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: { feedbacks: [] },
      }),
    );

    await client.getFeedbacksByEndpoint('/v1/chat');
    const body = getBody(0);
    expect(body.query).toContain('where: { endpoint: $endpoint }');
    expect((body.variables as any)?.endpoint).toBe('/v1/chat');
  });

  it('getFeedbacksByEndpoint should paginate until a short page is returned', async () => {
    const client = createClient();
    const page1 = mockFeedbackRows(100, 0).map((row) => ({
      ...row,
      id: `AssetB:Client${row.feedbackIndex}:${row.feedbackIndex}`,
      agent: { id: 'AssetB' },
      endpoint: '/v1/chat',
    }));
    const page2 = mockFeedbackRows(3, 100).map((row) => ({
      ...row,
      id: `AssetB:Client${row.feedbackIndex}:${row.feedbackIndex}`,
      agent: { id: 'AssetB' },
      endpoint: '/v1/chat',
    }));

    mockFetch.mockImplementation(async (_url: string | URL | globalThis.Request, init?: RequestInit) => {
      const rawBody = typeof init?.body === 'string' ? init.body : '{}';
      const body = JSON.parse(rawBody) as { query: string; variables?: Record<string, unknown> };
      const query = body.query ?? '';
      if (query.includes('where: { endpoint: $endpoint }') && query.includes('skip: 0')) {
        return mockGraphQLResponse({ data: { feedbacks: page1 } });
      }
      if (query.includes('where: { endpoint: $endpoint }') && query.includes('skip: 100')) {
        return mockGraphQLResponse({ data: { feedbacks: page2 } });
      }
      return mockGraphQLResponse({ data: { feedbacks: [] } });
    });

    const rows = await client.getFeedbacksByEndpoint('/v1/chat');
    expect(rows).toHaveLength(103);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('getAllFeedbacks should exclude revoked by default and include when requested', async () => {
    const client = createClient();
    mockFetch
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: { feedbacks: [] },
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: { feedbacks: [] },
        }),
      );

    await client.getAllFeedbacks();
    await client.getAllFeedbacks({ includeRevoked: true, limit: 12 });

    const firstBody = getBody(0);
    const secondBody = getBody(1);
    expect((firstBody.variables as any)?.where?.isRevoked).toBe(false);
    expect(secondBody.query).toContain('feedbacks(first: 12');
    expect((secondBody.variables as any)?.where).toBeNull();
  });

  it('getLastFeedbackIndex should return -1n when empty and latest index when present', async () => {
    const client = createClient();
    mockFetch
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: { feedbacks: [] },
        }),
      )
      .mockResolvedValueOnce(
        mockGraphQLResponse({
          data: {
            feedbacks: [{ feedbackIndex: '42' }],
          },
        }),
      );

    const none = await client.getLastFeedbackIndex('AssetA', 'ClientA');
    const latest = await client.getLastFeedbackIndex('AssetA', 'ClientA');
    expect(none).toBe(-1n);
    expect(latest).toBe(42n);
    const body = getBody(1);
    expect((body.variables as any)?.agent).toBe('AssetA');
    expect((body.variables as any)?.client).toBe('ClientA');
  });

  it('getPendingValidations should throw because validation feature is archived', async () => {
    const client = createClient();
    await expect(client.getPendingValidations('ValidatorX')).rejects
      .toThrow('Validation feature is archived (v0.5.0+) and is not exposed by indexers.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('getLatestCheckpoints should normalize digests and timestamps', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          hashChainLatestCheckpoints: {
            feedback: { eventCount: '10', digest: '0xAABB', createdAt: '1773000000' },
            response: null,
            revoke: { eventCount: '3', digest: '\\xCCDD', createdAt: '1773000010' },
          },
        },
      }),
    );

    const cps = await client.getLatestCheckpoints('AssetDigest');
    expect(cps.feedback?.event_count).toBe(10);
    expect(cps.feedback?.digest).toBe('aabb');
    expect(cps.response).toBeNull();
    expect(cps.revoke?.digest).toBe('ccdd');
  });

  it('getReplayData should uppercase chain type, stringify bounds and map event payloads', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          hashChainReplayData: {
            hasMore: true,
            nextFromCount: '13',
            events: [
              {
                asset: 'AssetReplay',
                client: 'ClientReplay',
                feedbackIndex: '2',
                slot: '999',
                runningDigest: '0xEEFF',
                feedbackHash: '11'.repeat(32),
                responder: 'ResponderR',
                responseHash: '22'.repeat(32),
                responseCount: '4',
                revokeCount: '1',
              },
            ],
          },
        },
      }),
    );

    const page = await client.getReplayData('AssetReplay', 'response', 10, 20, 5);
    expect(page.hasMore).toBe(true);
    expect(page.nextFromCount).toBe(13);
    expect(page.events[0]).toMatchObject({
      asset: 'AssetReplay',
      client: 'ClientReplay',
      feedback_index: '2',
      slot: 999,
      running_digest: 'eeff',
      response_count: 4,
      revoke_count: 1,
    });
    const body = getBody(0);
    expect((body.variables as any)?.chainType).toBe('RESPONSE');
    expect((body.variables as any)?.fromCount).toBe('10');
    expect((body.variables as any)?.toCount).toBe('20');
  });

  it('hash-chain event convenience methods should map replay rows to response objects', async () => {
    const client = createClient();
    const replaySpy = jest
      .spyOn(client, 'getReplayData')
      .mockResolvedValue({
        events: [
          {
            asset: 'AssetHash',
            client: 'ClientHash',
            feedback_index: '5',
            slot: 1200,
            running_digest: 'abcd',
            feedback_hash: 'efgh',
            responder: 'ResponderHash',
            response_hash: 'ijkl',
            response_count: 3,
            revoke_count: 2,
          },
        ],
        hasMore: false,
        nextFromCount: 0,
      });

    const feedbacks = await client.getFeedbacksAtIndices('AssetHash', [5]);
    const responses = await client.getResponsesAtOffsets('AssetHash', [3]);
    const revocations = await client.getRevocationsAtCounts('AssetHash', [2]);

    expect(feedbacks.get(5)).toMatchObject({
      asset: 'AssetHash',
      client_address: 'ClientHash',
      feedback_index: 5,
      running_digest: 'abcd',
    });
    expect(responses.get(3)).toMatchObject({
      asset: 'AssetHash',
      client_address: 'ClientHash',
      responder: 'ResponderHash',
      response_hash: 'ijkl',
    });
    expect(revocations.get(2)).toMatchObject({
      asset: 'AssetHash',
      client_address: 'ClientHash',
      revoke_count: 2,
      running_digest: 'abcd',
    });

    replaySpy.mockRestore();
  });

  it('should clear request timeout timer when fetch rejects', async () => {
    jest.useFakeTimers();
    try {
      const client = createClient({ timeout: 60_000, retries: 0 });
      mockFetch.mockRejectedValue(new TypeError('network down'));

      await expect(client.getAgent('AssetCanonical111')).rejects.toThrow('network down');
      expect(jest.getTimerCount()).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
