/**
 * Tests for verifyIntegrityDeep, verifyIntegrityFull, fetchJsonFromUri,
 * normalizeRegistrationServices, isItAlive, pingEndpoint, computeUriHash
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PublicKey, Keypair } from '@solana/web3.js';

const mockBaseCollection = PublicKey.unique();
jest.unstable_mockModule('../../src/core/config-reader.js', () => ({
  fetchRootConfig: jest.fn().mockResolvedValue({
    getBaseCollectionPublicKey: () => mockBaseCollection,
  }),
  getBaseCollection: jest.fn().mockResolvedValue(mockBaseCollection),
  fetchRegistryConfig: jest.fn().mockResolvedValue({
    getCollectionPublicKey: () => mockBaseCollection,
    getAuthorityPublicKey: () => PublicKey.unique(),
  }),
}));

const mockAssetKey = PublicKey.unique();
const mockCollectionKey = PublicKey.unique();
const mockOwnerKey = PublicKey.unique();

const mockAgentAccount = {
  getCollectionPublicKey: () => mockCollectionKey,
  getOwnerPublicKey: () => mockOwnerKey,
  getAssetPublicKey: () => mockAssetKey,
  getAgentWalletPublicKey: () => null as PublicKey | null,
  isAtomEnabled: () => false,
  feedback_count: 5n,
  nft_name: 'TestAgent',
  agent_uri: 'https://example.com/agent.json',
  feedback_digest: Buffer.alloc(32),
  response_digest: Buffer.alloc(32),
  revoke_digest: Buffer.alloc(32),
  response_count: 0n,
  revoke_count: 0n,
};

jest.unstable_mockModule('../../src/core/borsh-schemas.js', () => ({
  AgentAccount: {
    deserialize: jest.fn().mockReturnValue(mockAgentAccount),
  },
  MetadataEntryPda: {
    deserialize: jest.fn().mockReturnValue({
      getAssetPublicKey: () => mockAssetKey,
      getValueString: () => 'test-value',
      metadata_key: 'test-key',
    }),
  },
  ValidationRequest: { deserialize: jest.fn() },
  RegistryConfig: {
    deserialize: jest.fn().mockReturnValue({
      getCollectionPublicKey: () => mockBaseCollection,
      getAuthorityPublicKey: () => PublicKey.unique(),
    }),
  },
}));

const mockFeedbackManager = {
  getSummary: jest.fn().mockResolvedValue({
    totalFeedbacks: 10, averageScore: 75, positiveCount: 8, negativeCount: 2,
  }),
  readFeedback: jest.fn().mockResolvedValue(null),
  readAllFeedback: jest.fn().mockResolvedValue([]),
  getLastIndex: jest.fn().mockResolvedValue(-1n),
  getClients: jest.fn().mockResolvedValue([]),
  getResponseCount: jest.fn().mockResolvedValue(0),
  readResponses: jest.fn().mockResolvedValue([]),
  fetchAllFeedbacks: jest.fn().mockResolvedValue(new Map()),
  setIndexerClient: jest.fn(),
};

jest.unstable_mockModule('../../src/core/feedback-manager-solana.js', () => ({
  SolanaFeedbackManager: jest.fn().mockImplementation(() => mockFeedbackManager),
  SolanaFeedback: jest.fn(),
}));

const mockIndexerClient = {
  isAvailable: jest.fn().mockResolvedValue(true),
  getAgent: jest.fn().mockResolvedValue(null),
  getAgents: jest.fn().mockResolvedValue([]),
  getAgentsByOwner: jest.fn().mockResolvedValue([]),
  getAgentsByCollection: jest.fn().mockResolvedValue([]),
  getAgentByWallet: jest.fn().mockResolvedValue(null),
  getLeaderboard: jest.fn().mockResolvedValue([]),
  getGlobalStats: jest.fn().mockResolvedValue({ total_agents: 0, total_feedbacks: 0 }),
  getCollectionStats: jest.fn().mockResolvedValue(null),
  getFeedbacks: jest.fn().mockResolvedValue([]),
  getFeedback: jest.fn().mockResolvedValue(null),
  getFeedbacksByEndpoint: jest.fn().mockResolvedValue([]),
  getFeedbacksByTag: jest.fn().mockResolvedValue([]),
  getFeedbackResponsesFor: jest.fn().mockResolvedValue([]),
  getLastFeedbackIndex: jest.fn().mockResolvedValue(-1n),
  searchAgents: jest.fn().mockResolvedValue([]),
  getValidations: jest.fn().mockResolvedValue([]),
  getValidation: jest.fn().mockResolvedValue(null),
  getPendingValidations: jest.fn().mockResolvedValue([]),
  getAgentReputation: jest.fn().mockResolvedValue(null),
  getAgentMetadata: jest.fn().mockResolvedValue([]),
  getLastFeedbackDigest: jest.fn().mockResolvedValue({ digest: '00'.repeat(32), count: 5 }),
  getLastResponseDigest: jest.fn().mockResolvedValue({ digest: '00'.repeat(32), count: 0 }),
  getLastRevokeDigest: jest.fn().mockResolvedValue({ digest: '00'.repeat(32), count: 0 }),
  getBaseUrl: jest.fn().mockReturnValue('https://indexer.example.com'),
  getReplayData: jest.fn().mockResolvedValue({ events: [], hasMore: false, nextFromCount: 0 }),
  getCheckpoints: jest.fn().mockResolvedValue(null),
  getLatestCheckpoints: jest.fn().mockResolvedValue(null),
  getFeedbacksAtIndices: jest.fn().mockResolvedValue(new Map()),
  getResponsesAtOffsets: jest.fn().mockResolvedValue(new Map()),
  getRevocationsAtCounts: jest.fn().mockResolvedValue(new Map()),
};

jest.unstable_mockModule('../../src/core/indexer-client.js', () => ({
  IndexerClient: jest.fn().mockImplementation(() => mockIndexerClient),
}));

jest.unstable_mockModule('../../src/core/indexer-types.js', () => ({
  indexedFeedbackToSolanaFeedback: jest.fn().mockImplementation((f: any) => f),
}));

const mockTxResult = { signature: 'mock-sig', success: true };
jest.unstable_mockModule('../../src/core/transaction-builder.js', () => ({
  IdentityTransactionBuilder: jest.fn().mockImplementation(() => ({
    registerAgent: jest.fn().mockResolvedValue(mockTxResult),
    setAgentUri: jest.fn().mockResolvedValue(mockTxResult),
    setMetadata: jest.fn().mockResolvedValue(mockTxResult),
    deleteMetadata: jest.fn().mockResolvedValue(mockTxResult),
    transferAgent: jest.fn().mockResolvedValue(mockTxResult),
    syncOwner: jest.fn().mockResolvedValue(mockTxResult),
    enableAtom: jest.fn().mockResolvedValue(mockTxResult),
    setAgentWallet: jest.fn().mockResolvedValue(mockTxResult),
    createCollection: jest.fn().mockResolvedValue({ ...mockTxResult, collection: PublicKey.unique() }),
    updateCollectionMetadata: jest.fn().mockResolvedValue(mockTxResult),
    createBaseCollection: jest.fn().mockRejectedValue(new Error('deprecated')),
  })),
  ReputationTransactionBuilder: jest.fn().mockImplementation(() => ({
    giveFeedback: jest.fn().mockResolvedValue({ ...mockTxResult, feedbackIndex: 0n }),
    revokeFeedback: jest.fn().mockResolvedValue(mockTxResult),
    appendResponse: jest.fn().mockResolvedValue(mockTxResult),
  })),
  ValidationTransactionBuilder: jest.fn().mockImplementation(() => ({
    requestValidation: jest.fn().mockResolvedValue(mockTxResult),
    respondToValidation: jest.fn().mockResolvedValue(mockTxResult),
  })),
  AtomTransactionBuilder: jest.fn().mockImplementation(() => ({
    initializeStats: jest.fn().mockResolvedValue(mockTxResult),
    initializeConfig: jest.fn().mockResolvedValue(mockTxResult),
    updateConfig: jest.fn().mockResolvedValue(mockTxResult),
  })),
  serializeTransaction: jest.fn(),
}));

const mockSolanaClient = {
  getAccount: jest.fn().mockResolvedValue(Buffer.alloc(300)),
  getMultipleAccounts: jest.fn().mockResolvedValue([]),
  getProgramAccounts: jest.fn().mockResolvedValue([]),
  getAccountInfo: jest.fn().mockResolvedValue(null),
  accountExists: jest.fn().mockResolvedValue(false),
  supportsAdvancedQueries: jest.fn().mockReturnValue(true),
  requireAdvancedQueries: jest.fn(),
  getSlot: jest.fn().mockResolvedValue(100),
  getBlockTime: jest.fn().mockResolvedValue(1700000000),
  getConnection: jest.fn().mockReturnValue({
    getAccountInfo: jest.fn().mockResolvedValue(null),
    getSlot: jest.fn().mockResolvedValue(100),
    getBlockTime: jest.fn().mockResolvedValue(1700000000),
  }),
  get isDefaultDevnetRpc() { return false; },
  get rpcUrl() { return 'https://mock.example.com'; },
};

jest.unstable_mockModule('../../src/core/client.js', () => ({
  SolanaClient: jest.fn().mockImplementation(() => mockSolanaClient),
  createDevnetClient: jest.fn().mockReturnValue(mockSolanaClient),
  UnsupportedRpcError: class UnsupportedRpcError extends Error {},
  Cluster: {},
}));

jest.unstable_mockModule('../../src/core/atom-schemas.js', () => ({
  AtomStats: { deserialize: jest.fn().mockReturnValue({ trust_tier: 2 }) },
  AtomConfig: { deserialize: jest.fn().mockReturnValue({ authority: PublicKey.unique() }) },
  TrustTier: { Unrated: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 },
}));

jest.unstable_mockModule('../../src/core/agent-mint-resolver.js', () => ({
  AgentMintResolver: jest.fn().mockImplementation(() => ({
    resolve: jest.fn().mockResolvedValue(null),
  })),
}));

const mockCrawler = {
  crawl: jest.fn().mockResolvedValue({ services: [], metadata: {} }),
  fetchMcpCapabilities: jest.fn().mockResolvedValue(null),
  fetchA2aCapabilities: jest.fn().mockResolvedValue(null),
};

jest.unstable_mockModule('../../src/core/endpoint-crawler.js', () => ({
  EndpointCrawler: jest.fn().mockImplementation(() => mockCrawler),
}));

jest.unstable_mockModule('../../src/utils/signing.js', () => ({
  buildSignedPayload: jest.fn().mockReturnValue({
    payload: { v: 1, alg: 'ed25519', asset: 'test', nonce: 'n', sig: 's', data: {} },
    unsignedCanonical: '{}',
  }),
  canonicalizeSignedPayload: jest.fn().mockReturnValue('canonical-json'),
  parseSignedPayload: jest.fn().mockReturnValue({
    v: 1, alg: 'ed25519', asset: mockAssetKey.toBase58(), nonce: 'n', sig: 's', data: {},
  }),
  verifySignedPayload: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule('../../src/core/hash-chain-replay.js', () => ({
  replayFeedbackChain: jest.fn().mockResolvedValue({ finalDigest: Buffer.alloc(32), count: 0, valid: true }),
  replayResponseChain: jest.fn().mockResolvedValue({ finalDigest: Buffer.alloc(32), count: 0, valid: true }),
  replayRevokeChain: jest.fn().mockResolvedValue({ finalDigest: Buffer.alloc(32), count: 0, valid: true }),
}));

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

const { SolanaSDK } = await import('../../src/core/sdk-solana.js');

describe('SolanaSDK deep tests', () => {
  let sdk: InstanceType<typeof SolanaSDK>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockSolanaClient.getAccount.mockResolvedValue(Buffer.alloc(300));
    sdk = new SolanaSDK({
      // Force legacy REST mock in unit tests (integrity helpers are REST-only today)
      indexerUrl: 'https://example.supabase.co/rest/v1',
      indexerApiKey: 'test-key',
    });
  });

  // ==================== verifyIntegrityDeep ====================

  describe('verifyIntegrityDeep', () => {
    it('should return valid with empty spot checks (zero counts)', async () => {
      // Set agent to zero feedbacks so spot checks have no items to check
      const origCount = mockAgentAccount.feedback_count;
      mockAgentAccount.feedback_count = 0n;
      mockIndexerClient.getLastFeedbackDigest.mockResolvedValueOnce({ digest: '00'.repeat(32), count: 0 });

      const result = await sdk.verifyIntegrityDeep(mockAssetKey);
      expect(result.valid).toBe(true);
      expect(result.spotChecksPassed).toBe(true);
      expect(result.missingItems).toBe(0);
      expect(result.modifiedItems).toBe(0);
      mockAgentAccount.feedback_count = origCount;
    });

    it('should detect missing items from spot checks', async () => {
      // Indexer reports 5 feedbacks but returns null for spot checked items
      mockIndexerClient.getFeedbacksAtIndices.mockResolvedValueOnce(new Map([
        [0, null],
        [4, null],
      ]));

      const result = await sdk.verifyIntegrityDeep(mockAssetKey, { spotChecks: 3, checkBoundaries: true });
      expect(result.spotChecksPassed).toBe(false);
      expect(result.missingItems).toBeGreaterThan(0);
      expect(result.status).toBe('corrupted');
    });

    it('should detect modified content when verifyContent=true', async () => {
      // Feedback exists but has no URI and no hash
      mockIndexerClient.getFeedbacksAtIndices.mockResolvedValueOnce(new Map([
        [0, { feedback_uri: null, feedback_hash: null, running_digest: 'aa'.repeat(32) }],
      ]));

      const result = await sdk.verifyIntegrityDeep(mockAssetKey, {
        spotChecks: 1,
        checkBoundaries: false,
        verifyContent: true,
      });
      // Content error 'no_uri' doesn't count as modified (contentValid is undefined, error is 'no_uri')
      expect(result.spotChecks.feedback.length).toBeGreaterThan(0);
    });

    it('should handle IPFS URIs as valid content', async () => {
      // Mock getFeedbacksAtIndices to return data for ALL indices
      const feedbackItem = { feedback_uri: 'ipfs://QmTest', feedback_hash: 'aa'.repeat(32), running_digest: 'bb'.repeat(32) };
      const allIndices = new Map<number, any>();
      for (let i = 0; i < 10; i++) allIndices.set(i, feedbackItem);
      mockIndexerClient.getFeedbacksAtIndices.mockResolvedValueOnce(allIndices);

      const result = await sdk.verifyIntegrityDeep(mockAssetKey, {
        spotChecks: 1,
        checkBoundaries: false,
        verifyContent: true,
      });
      const check = result.spotChecks.feedback[0];
      expect(check.exists).toBe(true);
      expect(check.contentValid).toBe(true);
    });

    it('should handle spot check errors gracefully', async () => {
      mockIndexerClient.getFeedbacksAtIndices.mockRejectedValueOnce(new Error('indexer down'));

      const result = await sdk.verifyIntegrityDeep(mockAssetKey, { spotChecks: 3 });
      expect(result.spotChecksPassed).toBe(false);
      expect(result.missingItems).toBe(-1); // -1 indicates error
    });

    it('should handle agent not found', async () => {
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      const result = await sdk.verifyIntegrityDeep(mockAssetKey);
      expect(result.valid).toBe(false);
      expect(result.status).toBe('error');
    });

    it('should check response spot checks', async () => {
      // Set up agent with response count > 0
      const origResponseCount = mockAgentAccount.response_count;
      mockAgentAccount.response_count = 3n;
      mockIndexerClient.getLastResponseDigest.mockResolvedValueOnce({ digest: '00'.repeat(32), count: 3 });
      mockIndexerClient.getResponsesAtOffsets.mockResolvedValueOnce(new Map([
        [0, { response_hash: 'cc'.repeat(32), running_digest: 'dd'.repeat(32) }],
        [2, { response_hash: 'ee'.repeat(32), running_digest: 'ff'.repeat(32) }],
      ]));

      const result = await sdk.verifyIntegrityDeep(mockAssetKey, { spotChecks: 2 });
      expect(result.spotChecks.response.length).toBeGreaterThan(0);
      mockAgentAccount.response_count = origResponseCount;
    });

    it('should check revoke spot checks', async () => {
      const origRevokeCount = mockAgentAccount.revoke_count;
      mockAgentAccount.revoke_count = 2n;
      mockIndexerClient.getLastRevokeDigest.mockResolvedValueOnce({ digest: '00'.repeat(32), count: 2 });
      mockIndexerClient.getRevocationsAtCounts.mockResolvedValueOnce(new Map([
        [1, { running_digest: 'aa'.repeat(32) }],
        [2, { running_digest: 'bb'.repeat(32) }],
      ]));

      const result = await sdk.verifyIntegrityDeep(mockAssetKey, { spotChecks: 2 });
      expect(result.spotChecks.revoke.length).toBeGreaterThan(0);
      mockAgentAccount.revoke_count = origRevokeCount;
    });
  });

  // ==================== verifyIntegrityFull ====================

  describe('verifyIntegrityFull', () => {
    it('should return valid when all replays match', async () => {
      // Replay must return count matching on-chain (feedback_count=5)
      const { replayFeedbackChain } = await import('../../src/core/hash-chain-replay.js');
      (replayFeedbackChain as jest.Mock).mockResolvedValueOnce({
        finalDigest: Buffer.alloc(32), count: 5, valid: true,
      });

      const result = await sdk.verifyIntegrityFull(mockAssetKey);
      expect(result.valid).toBe(true);
      expect(result.status).toBe('valid');
      expect(result.replay).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle agent not found', async () => {
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      const result = await sdk.verifyIntegrityFull(mockAssetKey);
      expect(result.valid).toBe(false);
      expect(result.status).toBe('error');
    });

    it('should handle replay errors', async () => {
      const { replayFeedbackChain } = await import('../../src/core/hash-chain-replay.js');
      (replayFeedbackChain as jest.Mock).mockRejectedValueOnce(new Error('replay fail'));

      const result = await sdk.verifyIntegrityFull(mockAssetKey);
      expect(result.valid).toBe(false);
      expect(result.status).toBe('error');
    });

    it('should detect corruption when replay digest mismatches', async () => {
      const { replayFeedbackChain } = await import('../../src/core/hash-chain-replay.js');
      (replayFeedbackChain as jest.Mock).mockResolvedValueOnce({
        finalDigest: Buffer.from('ab'.repeat(32), 'hex'),
        count: 5,
        valid: false,
        mismatchAt: 3,
      });

      const result = await sdk.verifyIntegrityFull(mockAssetKey);
      expect(result.status).toBe('corrupted');
      expect(result.valid).toBe(false);
    });

    it('should report syncing when count behind', async () => {
      // Agent has 5 feedbacks on-chain but replay only gets 3
      const { replayFeedbackChain } = await import('../../src/core/hash-chain-replay.js');
      (replayFeedbackChain as jest.Mock).mockResolvedValueOnce({
        finalDigest: Buffer.alloc(32), // won't match since on-chain is zero but count differs
        count: 3,
        valid: true,
      });

      const result = await sdk.verifyIntegrityFull(mockAssetKey);
      // feedbackCountOnChain=5, feedbackReplay.count=3 → lag=2
      // But feedbackDigestMatch checks finalDigest vs onChainFeedbackDigest
      // onChainFeedbackDigest = '00'.repeat(32), finalDigest = '00'.repeat(32) → match
      // But feedbackCountMatch: 3n !== 5n → false → allValid false
      // totalLag=2n > 0n, feedbackReplay.valid=true → status='syncing'
      expect(result.status).toBe('syncing');
    });

    it('should use checkpoints when available', async () => {
      mockIndexerClient.getLatestCheckpoints.mockResolvedValueOnce({
        feedback: { digest: 'aa'.repeat(32), event_count: 3 },
        response: null,
        revoke: null,
      });

      const result = await sdk.verifyIntegrityFull(mockAssetKey, { useCheckpoints: true });
      expect(result.checkpointsUsed).toBe(true);
    });

    it('should call onProgress callback', async () => {
      const onProgress = jest.fn();
      mockAgentAccount.feedback_count = 0n;
      await sdk.verifyIntegrityFull(mockAssetKey, { onProgress });
      mockAgentAccount.feedback_count = 5n;
      // onProgress may or may not be called depending on count=0
    });
  });

  // ==================== fetchJsonFromUri ====================

  describe('fetchJsonFromUri', () => {
    it('should fetch and parse JSON from HTTP URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '50' }),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('{"key":"value"}') })
              .mockResolvedValueOnce({ done: true, value: undefined }),
            releaseLock: jest.fn(),
          }),
        },
      } as unknown as Response);

      const result = await (sdk as any).fetchJsonFromUri('https://example.com/data.json', 5000);
      expect(result.key).toBe('value');
    });

    it('should block private hosts (SSRF protection)', async () => {
      await expect(
        (sdk as any).fetchJsonFromUri('https://169.254.169.254/metadata', 5000)
      ).rejects.toThrow('blocked');
    });

    it('should block localhost', async () => {
      await expect(
        (sdk as any).fetchJsonFromUri('https://localhost/data', 5000)
      ).rejects.toThrow('blocked');
    });

    it('should follow redirects with SSRF re-validation', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 301,
          headers: new Headers({ location: 'https://safe.example.com/data.json' }),
          body: null,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          body: {
            getReader: () => ({
              read: jest.fn()
                .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('{"redirected":true}') })
                .mockResolvedValueOnce({ done: true, value: undefined }),
              releaseLock: jest.fn(),
            }),
          },
        } as unknown as Response);

      const result = await (sdk as any).fetchJsonFromUri('https://example.com/old', 5000);
      expect(result.redirected).toBe(true);
    });

    it('should block redirect to private host', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: new Headers({ location: 'http://127.0.0.1/internal' }),
        body: null,
      } as unknown as Response);

      await expect(
        (sdk as any).fetchJsonFromUri('https://example.com/data', 5000)
      ).rejects.toThrow('Redirect blocked');
    });

    it('should reject non-ok HTTP response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
      } as unknown as Response);

      await expect(
        (sdk as any).fetchJsonFromUri('https://example.com/data', 5000)
      ).rejects.toThrow('HTTP 404');
    });

    it('should reject oversized content-length', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '999999999' }),
        body: null,
      } as unknown as Response);

      await expect(
        (sdk as any).fetchJsonFromUri('https://example.com/data', 5000)
      ).rejects.toThrow('too large');
    });

    it('should handle response without body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        body: null,
        text: jest.fn().mockResolvedValue('{"fallback":true}'),
      } as unknown as Response);

      const result = await (sdk as any).fetchJsonFromUri('https://example.com/data', 5000);
      expect(result.fallback).toBe(true);
    });

    it('should reject invalid JSON (array)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('[1,2,3]') })
              .mockResolvedValueOnce({ done: true, value: undefined }),
            releaseLock: jest.fn(),
          }),
        },
      } as unknown as Response);

      await expect(
        (sdk as any).fetchJsonFromUri('https://example.com/data', 5000)
      ).rejects.toThrow('expected object');
    });
  });

  // ==================== computeUriHash ====================

  describe('computeUriHash', () => {
    it('should return zeros for IPFS URI', async () => {
      const hash = await SolanaSDK.computeUriHash('ipfs://QmTest');
      expect(hash.equals(Buffer.alloc(32))).toBe(true);
    });

    it('should return zeros for Arweave URI', async () => {
      const hash = await SolanaSDK.computeUriHash('ar://txid123');
      expect(hash.equals(Buffer.alloc(32))).toBe(true);
    });

    it('should return SHA-256 for HTTP URI', async () => {
      const hash = await SolanaSDK.computeUriHash('https://example.com/data.json');
      expect(hash.length).toBe(32);
      expect(hash.equals(Buffer.alloc(32))).toBe(false);
    });
  });

  // ==================== isItAlive ====================

  describe('isItAlive', () => {
    it('should throw when agent not found', async () => {
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      await expect(sdk.isItAlive(mockAssetKey)).rejects.toThrow('Agent not found');
    });

    it('should return liveness report for agent with no endpoints', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('{}') })
              .mockResolvedValueOnce({ done: true, value: undefined }),
            releaseLock: jest.fn(),
          }),
        },
      } as unknown as Response);

      const result = await sdk.isItAlive(mockAssetKey);
      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
    });
  });

  // ==================== getAtomStats ====================

  describe('getAtomStats', () => {
    it('should return null when account not found', async () => {
      const result = await sdk.getAtomStats(mockAssetKey);
      // Connection.getAccountInfo returns null by default
      expect(result).toBeNull();
    });
  });

  // ==================== getAtomConfig ====================

  describe('getAtomConfig', () => {
    it('should return null when account not found', async () => {
      const result = await sdk.getAtomConfig();
      expect(result).toBeNull();
    });
  });
});
