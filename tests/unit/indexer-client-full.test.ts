import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock compression
jest.unstable_mockModule('../../src/utils/compression.js', () => ({
  decompressBase64Value: jest.fn(async (v: string) => v),
}));

// Mock validation
jest.unstable_mockModule('../../src/utils/validation.js', () => ({
  validateNonce: jest.fn(),
}));

const { IndexerClient } = await import('../../src/core/indexer-client.js');
const { IndexerError, IndexerErrorCode, IndexerUnauthorizedError, IndexerTimeoutError, IndexerRateLimitError, IndexerUnavailableError } = await import('../../src/core/indexer-errors.js');

const createClient = (overrides: Record<string, unknown> = {}) =>
  new IndexerClient({
    baseUrl: 'https://test.supabase.co/rest/v1',
    apiKey: 'test-key',
    timeout: 1000,
    retries: 0,
    ...overrides,
  });

function mockJsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(headers),
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

describe('IndexerClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should strip trailing slash from baseUrl', () => {
      const client = new IndexerClient({
        baseUrl: 'https://test.supabase.co/rest/v1/',
        apiKey: 'key',
      });
      expect(client.getBaseUrl()).toBe('https://test.supabase.co/rest/v1');
    });

    it('should use default timeout and retries', () => {
      const client = new IndexerClient({
        baseUrl: 'https://test.supabase.co/rest/v1',
        apiKey: 'key',
      });
      expect(client).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should throw IndexerUnauthorizedError on 401', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse({}, 401));
      await expect(client.getAgent('test')).rejects.toBeInstanceOf(IndexerUnauthorizedError);
    });

    it('should throw IndexerRateLimitError on 429', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse({}, 429, { 'Retry-After': '30' }));
      try {
        await client.getAgent('test');
      } catch (e) {
        expect(e).toBeInstanceOf(IndexerRateLimitError);
        expect((e as IndexerRateLimitError).retryAfter).toBe(30);
      }
    });

    it('should throw IndexerError on 500', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse({}, 500));
      await expect(client.getAgent('test')).rejects.toThrow('Server error');
    });

    it('should throw on other HTTP errors', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse({}, 400));
      await expect(client.getAgent('test')).rejects.toThrow();
    });

    it('should handle timeout (AbortError)', async () => {
      const client = createClient();
      const err = new Error('aborted');
      err.name = 'AbortError';
      mockFetch.mockRejectedValue(err);
      await expect(client.getAgent('test')).rejects.toBeInstanceOf(IndexerTimeoutError);
    });

    it('should handle network errors', async () => {
      const client = createClient();
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));
      await expect(client.getAgent('test')).rejects.toBeInstanceOf(IndexerUnavailableError);
    });

    it('should retry on server errors', async () => {
      const client = createClient({ retries: 1 });
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({}, 500))
        .mockResolvedValueOnce(mockJsonResponse([{ asset: 'test' }]));
      const result = await client.getAgent('test');
      expect(result).toEqual({ asset: 'test' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('isAvailable', () => {
    it('should return true when accessible', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      expect(await client.isAvailable()).toBe(true);
    });

    it('should return false when unavailable', async () => {
      const client = createClient();
      mockFetch.mockRejectedValue(new Error('fail'));
      expect(await client.isAvailable()).toBe(false);
    });
  });

  describe('getAgent', () => {
    it('should return agent when found', async () => {
      const client = createClient();
      const agent = { asset: 'test', owner: 'owner1' };
      mockFetch.mockResolvedValue(mockJsonResponse([agent]));
      const result = await client.getAgent('test');
      expect(result).toEqual(agent);
    });

    it('should return null when not found', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      expect(await client.getAgent('test')).toBeNull();
    });
  });

  describe('getAgents', () => {
    it('should return agents with pagination', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([{ asset: 'a' }, { asset: 'b' }]));
      const result = await client.getAgents({ limit: 10, offset: 0 });
      expect(result.length).toBe(2);
    });

    it('should use default order', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getAgents();
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('order=created_at.desc');
    });

    it('should apply creator/pointer/parent filters', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));

      await client.getAgents({
        creator: 'creator1',
        collectionPointer: 'c1:abc123',
        parentAsset: 'parent1',
        parentCreator: 'parentCreator1',
        colLocked: true,
        parentLocked: false,
      });

      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('creator=eq.creator1');
      expect(url).toContain('collection_pointer=eq.c1%3Aabc123');
      expect(url).toContain('parent_asset=eq.parent1');
      expect(url).toContain('parent_creator=eq.parentCreator1');
      expect(url).toContain('col_locked=eq.true');
      expect(url).toContain('parent_locked=eq.false');
    });
  });

  describe('getAgentsByOwner', () => {
    it('should filter by owner', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getAgentsByOwner('owner1');
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('owner=eq.owner1');
    });
  });

  describe('getAgentsByCollection', () => {
    it('should filter by collection', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getAgentsByCollection('coll1');
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('collection=eq.coll1');
    });
  });

  describe('getAgentByWallet', () => {
    it('should return agent by wallet', async () => {
      const client = createClient();
      const agent = { asset: 'a', agent_wallet: 'wallet1' };
      mockFetch.mockResolvedValue(mockJsonResponse([agent]));
      const result = await client.getAgentByWallet('wallet1');
      expect(result?.agent_wallet).toBe('wallet1');
    });

    it('should return null when not found', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      expect(await client.getAgentByWallet('missing')).toBeNull();
    });
  });

  describe('getAgentByAgentId', () => {
    it('should return agent by agent_id', async () => {
      const client = createClient();
      const agent = { agent_id: '42', asset: 'a' };
      mockFetch.mockResolvedValue(mockJsonResponse([agent]));
      const result = await client.getAgentByAgentId('42');
      expect(result?.agent_id).toBe('42');
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('agent_id=eq.42');
    });

    it('should return null when not found', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      expect(await client.getAgentByAgentId(999n)).toBeNull();
    });

    it('should keep getAgentByIndexerId as an alias', async () => {
      const client = createClient();
      const agent = { agent_id: '77', asset: 'a' };
      mockFetch.mockResolvedValue(mockJsonResponse([agent]));
      const result = await client.getAgentByIndexerId('77');
      expect(result?.agent_id).toBe('77');
    });
  });

  describe('getAgentReputation', () => {
    it('should return reputation data', async () => {
      const client = createClient();
      const rep = { asset: 'a', feedback_count: 10 };
      mockFetch.mockResolvedValue(mockJsonResponse([rep]));
      const result = await client.getAgentReputation('a');
      expect(result?.feedback_count).toBe(10);
    });

    it('should return null when not found', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      expect(await client.getAgentReputation('missing')).toBeNull();
    });
  });

  describe('getLeaderboard', () => {
    it('should order by sort_key desc', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getLeaderboard();
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('order=sort_key.desc');
    });

    it('should apply filters', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getLeaderboard({ collection: 'c1', minTier: 2, cursorSortKey: '999' });
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('collection=eq.c1');
      expect(url).toContain('trust_tier=gte.2');
      expect(url).toContain('sort_key=lt.999');
    });
  });

  describe('getLeaderboardRPC', () => {
    it('should call RPC endpoint', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getLeaderboardRPC({ collection: 'c1', minTier: 1, limit: 10 });
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('/rpc/get_leaderboard');
    });
  });

  describe('getFeedbacks', () => {
    it('should filter by asset', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getFeedbacks('asset1');
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('asset=eq.asset1');
    });

    it('should exclude revoked by default', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getFeedbacks('asset1');
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('is_revoked=eq.false');
    });

    it('should include revoked when requested', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getFeedbacks('asset1', { includeRevoked: true });
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).not.toContain('is_revoked');
    });
  });

  describe('getFeedback', () => {
    it('should filter by asset, client, and index', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([{ id: '1' }]));
      const result = await client.getFeedback('asset1', 'client1', 5n);
      expect(result).not.toBeNull();
    });

    it('should return null when not found', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      expect(await client.getFeedback('a', 'c', 0)).toBeNull();
    });
  });

  describe('getFeedbacksByClient', () => {
    it('should filter by client', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getFeedbacksByClient('client1');
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('client_address=eq.client1');
    });
  });

  describe('getFeedbacksByTag', () => {
    it('should search in both tag1 and tag2', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getFeedbacksByTag('uptime');
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('tag1.eq.uptime');
      expect(url).toContain('tag2.eq.uptime');
    });
  });

  describe('getFeedbacksByEndpoint', () => {
    it('should filter by endpoint', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getFeedbacksByEndpoint('https://api.test.com');
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('endpoint=eq.https');
    });
  });

  describe('getAllFeedbacks', () => {
    it('should use bulk query', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getAllFeedbacks({ limit: 100 });
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('limit=100');
    });
  });

  describe('getLastFeedbackIndex', () => {
    it('should return -1n when no feedbacks', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      const result = await client.getLastFeedbackIndex('asset', 'client');
      expect(result).toBe(-1n);
    });

    it('should return BigInt index', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([{ feedback_index: '42' }]));
      const result = await client.getLastFeedbackIndex('asset', 'client');
      expect(result).toBe(42n);
    });
  });

  describe('getMetadata', () => {
    it('should return decompressed metadata', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([
        { asset: 'a', key: 'k1', value: 'base64val' },
      ]));
      const result = await client.getMetadata('a');
      expect(result.length).toBe(1);
    });
  });

  describe('getMetadataByKey', () => {
    it('should return specific metadata entry', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([{ key: 'k1', value: 'v1' }]));
      const result = await client.getMetadataByKey('a', 'k1');
      expect(result?.key).toBe('k1');
    });

    it('should return null when not found', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      expect(await client.getMetadataByKey('a', 'missing')).toBeNull();
    });
  });

  describe('getValidations', () => {
    it('should return validations for asset', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      const result = await client.getValidations('asset1');
      expect(result).toEqual([]);
    });
  });

  describe('getValidationsByValidator', () => {
    it('should filter by validator', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getValidationsByValidator('val1');
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('validator_address=eq.val1');
    });
  });

  describe('getPendingValidations', () => {
    it('should filter by PENDING status', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getPendingValidations('val1');
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('status=eq.PENDING');
    });
  });

  describe('getValidation', () => {
    it('should find specific validation', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([{ id: '1' }]));
      const result = await client.getValidation('a', 'v', 0);
      expect(result).not.toBeNull();
    });

    it('should accept bigint nonce', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      expect(await client.getValidation('a', 'v', 5n)).toBeNull();
    });
  });

  describe('getGlobalStats', () => {
    it('should return global stats', async () => {
      const client = createClient();
      const stats = { total_agents: 100, total_feedbacks: 500 };
      mockFetch.mockResolvedValue(mockJsonResponse([stats]));
      const result = await client.getGlobalStats();
      expect(result.total_agents).toBe(100);
    });

    it('should return defaults when empty', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      const result = await client.getGlobalStats();
      expect(result.total_agents).toBe(0);
    });
  });

  describe('collection read compatibility', () => {
    it('getCollectionPointers should use /collections + collection filter', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([
        {
          collection: 'c1:abc',
          creator: 'creator1',
          first_seen_asset: 'asset1',
          first_seen_at: '2026-01-01T00:00:00.000Z',
          first_seen_slot: '10',
          first_seen_tx_signature: null,
          last_seen_at: '2026-01-02T00:00:00.000Z',
          last_seen_slot: '11',
          last_seen_tx_signature: null,
          asset_count: '1',
        },
      ]));

      const rows = await client.getCollectionPointers({ collection: 'c1:abc', creator: 'creator1' });
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('/collections?');
      expect(url).toContain('collection=eq.c1%3Aabc');
      expect(rows[0]).toMatchObject({ collection: 'c1:abc', col: 'c1:abc', creator: 'creator1' });
    });

    it('getCollectionPointers should fallback to legacy endpoint on 404', async () => {
      const client = createClient();
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({}, 404))
        .mockResolvedValueOnce(mockJsonResponse([
          {
            col: 'c1:legacy',
            creator: 'legacyCreator',
            first_seen_asset: 'assetLegacy',
            first_seen_at: '2026-01-01T00:00:00.000Z',
            first_seen_slot: '42',
            first_seen_tx_signature: null,
            last_seen_at: '2026-01-02T00:00:00.000Z',
            last_seen_slot: '43',
            last_seen_tx_signature: null,
            asset_count: '7',
          },
        ]));

      const rows = await client.getCollectionPointers({ col: 'c1:legacy' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const firstUrl = (mockFetch.mock.calls[0][0] as string);
      const secondUrl = (mockFetch.mock.calls[1][0] as string);
      expect(firstUrl).toContain('/collections?');
      expect(secondUrl).toContain('/collection_pointers?');
      expect(secondUrl).toContain('col=eq.c1%3Alegacy');
      expect(rows[0]).toMatchObject({ collection: 'c1:legacy', col: 'c1:legacy', creator: 'legacyCreator' });
    });

    it('getCollectionAssetCount should use collection query param', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse({ collection: 'c1:abc', asset_count: 12 }));
      const count = await client.getCollectionAssetCount('c1:abc', 'creator1');
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('/collection_asset_count?');
      expect(url).toContain('collection=eq.c1%3Aabc');
      expect(count).toBe(12);
    });

    it('getCollectionAssetCount should fallback to legacy col param on 400', async () => {
      const client = createClient();
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({}, 400))
        .mockResolvedValueOnce(mockJsonResponse({ col: 'c1:legacy', asset_count: '9' }));

      const count = await client.getCollectionAssetCount('c1:legacy');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const secondUrl = (mockFetch.mock.calls[1][0] as string);
      expect(secondUrl).toContain('/collection_asset_count?');
      expect(secondUrl).toContain('col=eq.c1%3Alegacy');
      expect(count).toBe(9);
    });

    it('getCollectionAssets should use collection query param', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([{ asset: 'agent1' }]));
      const rows = await client.getCollectionAssets('c1:abc', { limit: 5, offset: 2 });
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('/collection_assets?');
      expect(url).toContain('collection=eq.c1%3Aabc');
      expect(rows).toEqual([{ asset: 'agent1' }]);
    });

    it('getCollectionAssets should fallback to legacy col param on 400', async () => {
      const client = createClient();
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({}, 400))
        .mockResolvedValueOnce(mockJsonResponse([{ asset: 'agentLegacy' }]));

      const rows = await client.getCollectionAssets('c1:legacy');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const secondUrl = (mockFetch.mock.calls[1][0] as string);
      expect(secondUrl).toContain('/collection_assets?');
      expect(secondUrl).toContain('col=eq.c1%3Alegacy');
      expect(rows).toEqual([{ asset: 'agentLegacy' }]);
    });
  });

  describe('getCollectionStats', () => {
    it('should return collection stats', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([{ collection: 'c1' }]));
      const result = await client.getCollectionStats('c1');
      expect(result?.collection).toBe('c1');
    });

    it('should return null when not found', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      expect(await client.getCollectionStats('missing')).toBeNull();
    });
  });

  describe('getAllCollectionStats', () => {
    it('should return all stats', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([{ collection: 'c1' }]));
      const result = await client.getAllCollectionStats();
      expect(result.length).toBe(1);
    });
  });

  describe('getCollectionAgents', () => {
    it('should call RPC function', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getCollectionAgents('coll1', 20, 0);
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('rpc/get_collection_agents');
    });
  });

  describe('getFeedbackResponses', () => {
    it('should return responses', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      const result = await client.getFeedbackResponses('asset1');
      expect(result).toEqual([]);
    });
  });

  describe('getFeedbackResponsesFor', () => {
    it('should filter by asset, client, index', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      await client.getFeedbackResponsesFor('a', 'c', 0n);
      const url = (mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('asset=eq.a');
      expect(url).toContain('client_address=eq.c');
      expect(url).toContain('feedback_index=eq.0');
    });
  });

  describe('getRevocations', () => {
    it('should return revocations', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      const result = await client.getRevocations('asset1');
      expect(result).toEqual([]);
    });
  });

  describe('getLastFeedbackDigest', () => {
    it('should return null digest when no feedbacks', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      const result = await client.getLastFeedbackDigest('asset');
      expect(result.digest).toBeNull();
      expect(result.count).toBe(0);
    });

    it('should return digest and count', async () => {
      const client = createClient();
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse([{ running_digest: 'abc123', feedback_index: 41 }])
      );
      const result = await client.getLastFeedbackDigest('asset');
      expect(result.digest).toBe('abc123');
      expect(result.count).toBe(42);
    });
  });

  describe('getLastResponseDigest', () => {
    it('should return null when no responses', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      const result = await client.getLastResponseDigest('asset');
      expect(result.digest).toBeNull();
    });
  });

  describe('getLastRevokeDigest', () => {
    it('should return null when no revocations', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      const result = await client.getLastRevokeDigest('asset');
      expect(result.digest).toBeNull();
    });
  });

  describe('getFeedbacksAtIndices', () => {
    it('should return empty map for empty indices', async () => {
      const client = createClient();
      const result = await client.getFeedbacksAtIndices('asset', []);
      expect(result.size).toBe(0);
    });

    it('should return map with null for missing indices', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      const result = await client.getFeedbacksAtIndices('asset', [0, 5, 10]);
      expect(result.size).toBe(3);
      expect(result.get(0)).toBeNull();
    });

    it('should populate found feedbacks', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([
        { feedback_index: 5, asset: 'a' },
      ]));
      const result = await client.getFeedbacksAtIndices('asset', [0, 5]);
      expect(result.get(5)).not.toBeNull();
      expect(result.get(0)).toBeNull();
    });
  });

  describe('getResponseCount', () => {
    it('should return count', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([], 200, { 'Content-Range': '0-0/15' }));
      const result = await client.getResponseCount('asset');
      expect(result).toBe(15);
    });
  });

  describe('getResponsesAtOffsets', () => {
    it('should return empty map for empty offsets', async () => {
      const client = createClient();
      const result = await client.getResponsesAtOffsets('asset', []);
      expect(result.size).toBe(0);
    });

    it('should fetch each offset', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([]));
      const result = await client.getResponsesAtOffsets('asset', [0, 1]);
      expect(result.size).toBe(2);
    });
  });

  describe('getRevocationsAtCounts', () => {
    it('should return empty map for empty counts', async () => {
      const client = createClient();
      const result = await client.getRevocationsAtCounts('asset', []);
      expect(result.size).toBe(0);
    });
  });

  describe('getCount', () => {
    it('should parse Content-Range header', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse([], 200, { 'Content-Range': '0-0/42' }));
      const count = await client.getCount('feedbacks', { asset: 'eq.test' });
      expect(count).toBe(42);
    });

    it('should fallback to array length', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [1, 2, 3],
      } as Response);
      const count = await client.getCount('feedbacks', {});
      expect(count).toBe(3);
    });
  });

  describe('getReplayData', () => {
    it('should fetch replay data', async () => {
      const client = createClient();
      const events = [{ asset: 'a', client: 'c', feedback_index: '0', slot: 100 }];
      mockFetch.mockResolvedValue(mockJsonResponse(events));
      const result = await client.getReplayData('asset', 'feedback');
      expect(result.events.length).toBe(1);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getLatestCheckpoints', () => {
    it('should fetch checkpoint set', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse({ feedback: null, response: null, revoke: null }));
      const result = await client.getLatestCheckpoints('asset');
      expect(result.feedback).toBeNull();
    });
  });

  describe('triggerReplay', () => {
    it('should trigger replay', async () => {
      const client = createClient();
      mockFetch.mockResolvedValue(mockJsonResponse({ valid: true }));
      const result = await client.triggerReplay('asset');
      expect(result.valid).toBe(true);
    });
  });
});
