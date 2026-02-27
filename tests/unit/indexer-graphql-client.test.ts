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

  it('getAgentByAgentId should resolve by deterministic GraphQL Agent.id', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          agent: {
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
        },
      })
    );

    const row = await client.getAgentByAgentId('AssetById333');
    expect(row?.asset).toBe('AssetById333');
    expect(row?.agent_id).toBe('AssetById333');
    const body = getBody(0);
    expect((body.variables as any)?.id).toBe('AssetById333');
  });

  it('getAgentByAgentId should safely return null for legacy numeric ids on GraphQL', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          agent: null,
        },
      })
    );

    const row = await client.getAgentByAgentId(42);
    expect(row).toBeNull();
    const body = getBody(0);
    expect((body.variables as any)?.id).toBe('42');
  });

  it('getAgentByIndexerId should remain an alias to getAgentByAgentId', async () => {
    const client = createClient();
    mockFetch.mockResolvedValue(
      mockGraphQLResponse({
        data: {
          agent: null,
        },
      })
    );

    const row = await client.getAgentByIndexerId(42);
    expect(row).toBeNull();
    const body = getBody(0);
    expect((body.variables as any)?.id).toBe('42');
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
