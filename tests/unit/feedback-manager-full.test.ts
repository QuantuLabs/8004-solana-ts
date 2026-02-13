import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';

// Mock logger
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock atom-pda
jest.unstable_mockModule('../../src/core/atom-pda.js', () => ({
  getAtomStatsPDA: jest.fn().mockReturnValue([new PublicKey('11111111111111111111111111111111'), 255]),
}));

// Mock atom-schemas
jest.unstable_mockModule('../../src/core/atom-schemas.js', () => ({
  AtomStats: {
    deserialize: jest.fn(),
  },
}));

// Mock indexer-types
jest.unstable_mockModule('../../src/core/indexer-types.js', () => ({
  indexedFeedbackToSolanaFeedback: jest.fn((f: any) => ({
    asset: new PublicKey(f.asset),
    client: new PublicKey(f.client_address),
    feedbackIndex: BigInt(f.feedback_index),
    value: BigInt(f.value ?? 0),
    valueDecimals: f.value_decimals ?? 0,
    score: f.score,
    tag1: f.tag1 || '',
    tag2: f.tag2 || '',
    isRevoked: f.is_revoked,
  })),
}));

const { SolanaFeedbackManager } = await import('../../src/core/feedback-manager-solana.js');
const { AtomStats } = await import('../../src/core/atom-schemas.js');

const mockAsset = new PublicKey('So11111111111111111111111111111111111111112');
const mockClient = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

const createMockIndexer = (overrides: Record<string, unknown> = {}) => ({
  getFeedbacks: jest.fn().mockResolvedValue([]),
  getFeedback: jest.fn().mockResolvedValue(null),
  getFeedbackResponsesFor: jest.fn().mockResolvedValue([]),
  getLastFeedbackIndex: jest.fn().mockResolvedValue(-1n),
  getAllFeedbacks: jest.fn().mockResolvedValue([]),
  ...overrides,
} as any);

const createMockClient = (overrides: Record<string, unknown> = {}) => ({
  getAccount: jest.fn().mockResolvedValue(null),
  ...overrides,
} as any);

describe('SolanaFeedbackManager', () => {
  describe('constructor', () => {
    it('should create with all params', () => {
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, createMockIndexer());
      expect(fm).toBeDefined();
    });

    it('should create without optional params', () => {
      const fm = new SolanaFeedbackManager(createMockClient());
      expect(fm).toBeDefined();
    });
  });

  describe('setIndexerClient', () => {
    it('should set indexer for late binding', () => {
      const fm = new SolanaFeedbackManager(createMockClient());
      fm.setIndexerClient(createMockIndexer());
      // Should not throw when calling methods that require indexer
    });
  });

  describe('getSummary', () => {
    it('should return empty summary when no data available', async () => {
      const fm = new SolanaFeedbackManager(createMockClient());
      const summary = await fm.getSummary(mockAsset);
      expect(summary.averageScore).toBe(0);
      expect(summary.totalFeedbacks).toBe(0);
      expect(summary.positiveCount).toBe(0);
      expect(summary.negativeCount).toBe(0);
    });

    it('should use AtomStats when available', async () => {
      const mockStats = {
        quality_score: 7500,
        feedback_count: 100n,
        getUniqueCallersEstimate: () => 42,
      };
      const client = createMockClient({
        getAccount: jest.fn().mockResolvedValue(Buffer.alloc(561)),
      });
      (AtomStats.deserialize as jest.Mock).mockReturnValue(mockStats);

      const fm = new SolanaFeedbackManager(client);
      const summary = await fm.getSummary(mockAsset);
      expect(summary.averageScore).toBe(75);
      expect(summary.totalFeedbacks).toBe(100);
      expect(summary.totalClients).toBe(42);
    });

    it('should use indexer when filters provided', async () => {
      const indexer = createMockIndexer({
        getFeedbacks: jest.fn().mockResolvedValue([
          { asset: mockAsset.toBase58(), client_address: mockClient.toBase58(), score: 80, feedback_index: 0, is_revoked: false },
          { asset: mockAsset.toBase58(), client_address: mockClient.toBase58(), score: 60, feedback_index: 1, is_revoked: false },
        ]),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const summary = await fm.getSummary(mockAsset, 50);
      expect(summary.totalFeedbacks).toBe(2);
      expect(summary.averageScore).toBe(70);
    });

    it('should handle clientFilter', async () => {
      const indexer = createMockIndexer({
        getFeedbacks: jest.fn().mockResolvedValue([
          { asset: mockAsset.toBase58(), client_address: mockClient.toBase58(), score: 90, feedback_index: 0, is_revoked: false },
          { asset: mockAsset.toBase58(), client_address: 'other', score: 50, feedback_index: 1, is_revoked: false },
        ]),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const summary = await fm.getSummary(mockAsset, undefined, mockClient);
      expect(summary.totalFeedbacks).toBe(1);
    });

    it('should fallback to indexer when AtomStats fails', async () => {
      const client = createMockClient({
        getAccount: jest.fn().mockResolvedValue(null),
      });
      const indexer = createMockIndexer({
        getFeedbacks: jest.fn().mockResolvedValue([]),
      });
      const fm = new SolanaFeedbackManager(client, undefined, indexer);
      const summary = await fm.getSummary(mockAsset);
      expect(summary.averageScore).toBe(0);
    });

    it('should return empty summary on error', async () => {
      const client = createMockClient({
        getAccount: jest.fn().mockRejectedValue(new Error('rpc fail')),
      });
      const fm = new SolanaFeedbackManager(client);
      const summary = await fm.getSummary(mockAsset);
      expect(summary.averageScore).toBe(0);
    });

    it('should handle null scores in indexer data', async () => {
      const indexer = createMockIndexer({
        getFeedbacks: jest.fn().mockResolvedValue([
          { asset: mockAsset.toBase58(), client_address: mockClient.toBase58(), score: null, feedback_index: 0, is_revoked: false },
          { asset: mockAsset.toBase58(), client_address: mockClient.toBase58(), score: 80, feedback_index: 1, is_revoked: false },
        ]),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const summary = await fm.getSummary(mockAsset, undefined, mockClient);
      expect(summary.totalFeedbacks).toBe(2);
      expect(summary.averageScore).toBe(80); // Only 1 has score
    });
  });

  describe('readFeedback', () => {
    it('should throw without indexer', async () => {
      const fm = new SolanaFeedbackManager(createMockClient());
      await expect(fm.readFeedback(mockAsset, mockClient, 0n)).rejects.toThrow('Indexer required');
    });

    it('should return null when not found', async () => {
      const indexer = createMockIndexer({ getFeedback: jest.fn().mockResolvedValue(null) });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const result = await fm.readFeedback(mockAsset, mockClient, 99n);
      expect(result).toBeNull();
    });

    it('should return mapped feedback when found', async () => {
      const indexed = {
        asset: mockAsset.toBase58(),
        client_address: mockClient.toBase58(),
        feedback_index: 0,
        score: 85,
        value: '100',
        value_decimals: 0,
        is_revoked: false,
        tag1: 'uptime',
        tag2: 'day',
      };
      const indexer = createMockIndexer({ getFeedback: jest.fn().mockResolvedValue(indexed) });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const result = await fm.readFeedback(mockAsset, mockClient, 0n);
      expect(result).not.toBeNull();
    });
  });

  describe('readAllFeedback', () => {
    it('should throw without indexer', async () => {
      const fm = new SolanaFeedbackManager(createMockClient());
      await expect(fm.readAllFeedback(mockAsset)).rejects.toThrow('Indexer required');
    });

    it('should return feedbacks from indexer', async () => {
      const indexer = createMockIndexer({
        getFeedbacks: jest.fn().mockResolvedValue([
          { asset: mockAsset.toBase58(), client_address: mockClient.toBase58(), feedback_index: 0, score: 80, value: 0, value_decimals: 0, is_revoked: false },
        ]),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const results = await fm.readAllFeedback(mockAsset);
      expect(results.length).toBe(1);
    });

    it('should pass includeRevoked and maxResults', async () => {
      const mockGetFeedbacks = jest.fn().mockResolvedValue([]);
      const indexer = createMockIndexer({ getFeedbacks: mockGetFeedbacks });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      await fm.readAllFeedback(mockAsset, true, { maxResults: 50 });
      expect(mockGetFeedbacks).toHaveBeenCalledWith(mockAsset.toBase58(), { includeRevoked: true, limit: 50 });
    });
  });

  describe('getLastIndex', () => {
    it('should throw without indexer', async () => {
      const fm = new SolanaFeedbackManager(createMockClient());
      await expect(fm.getLastIndex(mockAsset, mockClient)).rejects.toThrow('Indexer required');
    });

    it('should delegate to indexer', async () => {
      const indexer = createMockIndexer({
        getLastFeedbackIndex: jest.fn().mockResolvedValue(42n),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const result = await fm.getLastIndex(mockAsset, mockClient);
      expect(result).toBe(42n);
    });
  });

  describe('getClients', () => {
    it('should throw without indexer', async () => {
      const fm = new SolanaFeedbackManager(createMockClient());
      await expect(fm.getClients(mockAsset)).rejects.toThrow('Indexer required');
    });

    it('should return unique client pubkeys', async () => {
      const client2 = new PublicKey('11111111111111111111111111111111');
      const indexer = createMockIndexer({
        getFeedbacks: jest.fn().mockResolvedValue([
          { client_address: mockClient.toBase58() },
          { client_address: mockClient.toBase58() },
          { client_address: client2.toBase58() },
        ]),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const clients = await fm.getClients(mockAsset);
      expect(clients.length).toBe(2);
    });
  });

  describe('getResponseCount', () => {
    it('should throw without indexer', async () => {
      const fm = new SolanaFeedbackManager(createMockClient());
      await expect(fm.getResponseCount(mockAsset, mockClient, 0n)).rejects.toThrow('Indexer required');
    });

    it('should return response count', async () => {
      const indexer = createMockIndexer({
        getFeedbackResponsesFor: jest.fn().mockResolvedValue([{}, {}, {}]),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const count = await fm.getResponseCount(mockAsset, mockClient, 0n);
      expect(count).toBe(3);
    });
  });

  describe('readResponses', () => {
    it('should throw without indexer', async () => {
      const fm = new SolanaFeedbackManager(createMockClient());
      await expect(fm.readResponses(mockAsset, mockClient, 0n)).rejects.toThrow('Indexer required');
    });

    it('should return mapped responses', async () => {
      const indexer = createMockIndexer({
        getFeedbackResponsesFor: jest.fn().mockResolvedValue([
          { responder: mockClient.toBase58() },
        ]),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const responses = await fm.readResponses(mockAsset, mockClient, 0n);
      expect(responses.length).toBe(1);
      expect(responses[0].responseIndex).toBe(0n);
    });

    it('should handle empty responses', async () => {
      const indexer = createMockIndexer({
        getFeedbackResponsesFor: jest.fn().mockResolvedValue([]),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const responses = await fm.readResponses(mockAsset, mockClient, 0n);
      expect(responses.length).toBe(0);
    });

    it('should propagate errors', async () => {
      const indexer = createMockIndexer({
        getFeedbackResponsesFor: jest.fn().mockRejectedValue(new Error('network')),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      await expect(fm.readResponses(mockAsset, mockClient, 0n)).rejects.toThrow('network');
    });
  });

  describe('readFeedbackListFromIndexer', () => {
    it('should throw without indexer', async () => {
      const fm = new SolanaFeedbackManager(createMockClient());
      await expect(fm.readFeedbackListFromIndexer(mockAsset)).rejects.toThrow('Indexer required');
    });

    it('should return feedbacks with options', async () => {
      const indexer = createMockIndexer({
        getFeedbacks: jest.fn().mockResolvedValue([]),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const result = await fm.readFeedbackListFromIndexer(mockAsset, { limit: 10 });
      expect(result).toEqual([]);
    });
  });

  describe('fetchFeedbackFile', () => {
    it('should return null without IPFS client', async () => {
      const fm = new SolanaFeedbackManager(createMockClient());
      const result = await fm.fetchFeedbackFile('ipfs://test');
      expect(result).toBeNull();
    });
  });

  describe('fetchAllFeedbacks', () => {
    it('should throw without indexer', async () => {
      const fm = new SolanaFeedbackManager(createMockClient());
      await expect(fm.fetchAllFeedbacks()).rejects.toThrow('Indexer required');
    });

    it('should group feedbacks by asset', async () => {
      const asset2 = new PublicKey('11111111111111111111111111111111');
      const indexer = createMockIndexer({
        getAllFeedbacks: jest.fn().mockResolvedValue([
          { asset: mockAsset.toBase58(), client_address: mockClient.toBase58(), feedback_index: 0, score: 80, value: 0, value_decimals: 0, is_revoked: false },
          { asset: mockAsset.toBase58(), client_address: mockClient.toBase58(), feedback_index: 1, score: 90, value: 0, value_decimals: 0, is_revoked: false },
          { asset: asset2.toBase58(), client_address: mockClient.toBase58(), feedback_index: 0, score: 70, value: 0, value_decimals: 0, is_revoked: false },
        ]),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const result = await fm.fetchAllFeedbacks();
      expect(result.size).toBe(2);
      expect(result.get(mockAsset.toBase58())?.length).toBe(2);
      expect(result.get(asset2.toBase58())?.length).toBe(1);
    });

    it('should return empty map on error', async () => {
      const indexer = createMockIndexer({
        getAllFeedbacks: jest.fn().mockRejectedValue(new Error('fail')),
      });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      const result = await fm.fetchAllFeedbacks();
      expect(result.size).toBe(0);
    });

    it('should pass options', async () => {
      const mockGetAll = jest.fn().mockResolvedValue([]);
      const indexer = createMockIndexer({ getAllFeedbacks: mockGetAll });
      const fm = new SolanaFeedbackManager(createMockClient(), undefined, indexer);
      await fm.fetchAllFeedbacks(true, { maxResults: 100 });
      expect(mockGetAll).toHaveBeenCalledWith({ includeRevoked: true, limit: 100 });
    });
  });
});
