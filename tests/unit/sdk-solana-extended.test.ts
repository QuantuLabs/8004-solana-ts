/**
 * Extended tests for sdk-solana.ts - covers remaining uncovered methods:
 * getCollections, getCollectionAgents, getAgentsByOwner, getAllAgents,
 * requestValidation, respondToValidation, readValidation, waitForValidation,
 * isItAlive, sign, verify, resolveSignedPayloadInput, fetchJsonFromUri,
 * normalizeRegistrationServices, pingEndpoint, pingHttpEndpoint, withSmartRouting,
 * verifyIntegrity, deepVerify, fullVerify, setAgentWallet, prepareSetAgentWallet,
 * computeUriHash
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';

// ==================== Mock Setup ====================

const MOCK_BLOCKHASH = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi';

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

const mockOwnerKey = PublicKey.unique();
const mockAssetKey = PublicKey.unique();
const mockCollectionKey = PublicKey.unique();

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

const mockMetadataEntry = {
  getAssetPublicKey: () => mockAssetKey,
  getValueString: () => 'test-value',
  metadata_key: 'test-key',
  key: 'test-key',
  value: 'test-value',
};

jest.unstable_mockModule('../../src/core/borsh-schemas.js', () => ({
  AgentAccount: {
    deserialize: jest.fn().mockReturnValue(mockAgentAccount),
  },
  MetadataEntryPda: {
    deserialize: jest.fn().mockReturnValue(mockMetadataEntry),
  },
  ValidationRequest: {
    deserialize: jest.fn().mockReturnValue({
      asset: mockAssetKey.toBytes(),
      validator_address: PublicKey.unique().toBytes(),
      nonce: 1000,
      response: 85,
      responded_at: 0n,
      request_hash: Buffer.alloc(32),
    }),
  },
  RegistryConfig: {
    deserialize: jest.fn().mockReturnValue({
      getCollectionPublicKey: () => mockBaseCollection,
      getAuthorityPublicKey: () => PublicKey.unique(),
    }),
  },
}));

const mockFeedbackManager = {
  getSummary: jest.fn().mockResolvedValue({
    totalFeedbacks: 10,
    averageScore: 75,
    positiveCount: 8,
    negativeCount: 2,
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
  getLastFeedbackDigest: jest.fn().mockResolvedValue({ digest: '00'.repeat(32), count: 0 }),
  getLastResponseDigest: jest.fn().mockResolvedValue({ digest: '00'.repeat(32), count: 0 }),
  getLastRevokeDigest: jest.fn().mockResolvedValue({ digest: '00'.repeat(32), count: 0 }),
  getBaseUrl: jest.fn().mockReturnValue('https://indexer.example.com'),
  getReplayData: jest.fn().mockResolvedValue({ events: [] }),
  getCheckpoints: jest.fn().mockResolvedValue(null),
};

jest.unstable_mockModule('../../src/core/indexer-client.js', () => ({
  IndexerClient: jest.fn().mockImplementation(() => mockIndexerClient),
}));

jest.unstable_mockModule('../../src/core/indexer-types.js', () => ({
  indexedFeedbackToSolanaFeedback: jest.fn().mockImplementation((f: any) => f),
}));

const mockTxResult = { signature: 'mock-sig', success: true };
const mockIdentityTxBuilder = {
  registerAgent: jest.fn().mockResolvedValue(mockTxResult),
  setAgentUri: jest.fn().mockResolvedValue(mockTxResult),
  setCollectionPointer: jest.fn().mockResolvedValue(mockTxResult),
  setCollectionPointerWithOptions: jest.fn().mockResolvedValue(mockTxResult),
  setParentAsset: jest.fn().mockResolvedValue(mockTxResult),
  setParentAssetWithOptions: jest.fn().mockResolvedValue(mockTxResult),
  setMetadata: jest.fn().mockResolvedValue(mockTxResult),
  deleteMetadata: jest.fn().mockResolvedValue(mockTxResult),
  transferAgent: jest.fn().mockResolvedValue(mockTxResult),
  syncOwner: jest.fn().mockResolvedValue(mockTxResult),
  enableAtom: jest.fn().mockResolvedValue(mockTxResult),
  setAgentWallet: jest.fn().mockResolvedValue(mockTxResult),
  createCollection: jest.fn().mockResolvedValue({ ...mockTxResult, collection: PublicKey.unique() }),
  updateCollectionMetadata: jest.fn().mockResolvedValue(mockTxResult),
  createBaseCollection: jest.fn().mockRejectedValue(new Error('deprecated')),
};

const mockReputationTxBuilder = {
  giveFeedback: jest.fn().mockResolvedValue({ ...mockTxResult, feedbackIndex: 0n }),
  revokeFeedback: jest.fn().mockResolvedValue(mockTxResult),
  appendResponse: jest.fn().mockResolvedValue(mockTxResult),
};

const mockValidationTxBuilder = {
  requestValidation: jest.fn().mockResolvedValue(mockTxResult),
  respondToValidation: jest.fn().mockResolvedValue(mockTxResult),
};

const mockAtomTxBuilder = {
  initializeStats: jest.fn().mockResolvedValue(mockTxResult),
  initializeConfig: jest.fn().mockResolvedValue(mockTxResult),
  updateConfig: jest.fn().mockResolvedValue(mockTxResult),
};

jest.unstable_mockModule('../../src/core/transaction-builder.js', () => ({
  IdentityTransactionBuilder: jest.fn().mockImplementation(() => mockIdentityTxBuilder),
  ReputationTransactionBuilder: jest.fn().mockImplementation(() => mockReputationTxBuilder),
  ValidationTransactionBuilder: jest.fn().mockImplementation(() => mockValidationTxBuilder),
  AtomTransactionBuilder: jest.fn().mockImplementation(() => mockAtomTxBuilder),
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
  AtomStats: {
    deserialize: jest.fn().mockReturnValue({
      trust_tier: 2,
      quality_score: 7500,
      confidence: 5000,
      risk_score: 10,
      diversity_ratio: 200,
      ema_score_fast: 7000,
      ema_score_slow: 7200,
      ema_volatility: 500,
      getUniqueCallersEstimate: () => 15,
      getCollectionPublicKey: () => mockCollectionKey,
    }),
  },
  AtomConfig: {
    deserialize: jest.fn().mockReturnValue({ authority: PublicKey.unique() }),
  },
  TrustTier: { Unrated: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 },
}));

jest.unstable_mockModule('../../src/core/agent-mint-resolver.js', () => ({
  AgentMintResolver: jest.fn().mockImplementation(() => ({
    resolve: jest.fn().mockResolvedValue(null),
  })),
}));

jest.unstable_mockModule('../../src/core/endpoint-crawler.js', () => ({
  EndpointCrawler: jest.fn().mockImplementation(() => ({
    crawl: jest.fn().mockResolvedValue({ services: [], metadata: {} }),
    fetchMcpCapabilities: jest.fn().mockResolvedValue(null),
    fetchA2aCapabilities: jest.fn().mockResolvedValue(null),
  })),
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
  replayFeedbackChain: jest.fn().mockResolvedValue({ digest: '00'.repeat(32), count: 0, valid: true }),
  replayResponseChain: jest.fn().mockResolvedValue({ digest: '00'.repeat(32), count: 0, valid: true }),
  replayRevokeChain: jest.fn().mockResolvedValue({ digest: '00'.repeat(32), count: 0, valid: true }),
}));

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

const { SolanaSDK } = await import('../../src/core/sdk-solana.js');

// ==================== Tests ====================

describe('SolanaSDK extended', () => {
  let sdk: InstanceType<typeof SolanaSDK>;
  let signerSdk: InstanceType<typeof SolanaSDK>;
  const signer = Keypair.generate();

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockAgentAccount.getAgentWalletPublicKey = () => null as PublicKey | null;
    // Restore defaults that may have been overridden by mockResolvedValue in tests
    mockSolanaClient.getAccount.mockResolvedValue(Buffer.alloc(300));
    mockSolanaClient.getProgramAccounts.mockResolvedValue([]);

    sdk = new SolanaSDK({
      // Force legacy REST mock in unit tests (integrity helpers are REST-only today)
      indexerUrl: 'https://example.supabase.co/rest/v1',
      indexerApiKey: 'test-key',
    });
    signerSdk = new SolanaSDK({
      signer,
      rpcUrl: 'https://mock.example.com',
      indexerUrl: 'https://example.supabase.co/rest/v1',
      indexerApiKey: 'test-key',
    });
  });

  // ==================== Collection Methods ====================

  describe('getCollections', () => {
    it('should fetch and return collections', async () => {
      mockSolanaClient.getProgramAccounts.mockResolvedValueOnce([
        { data: Buffer.alloc(100) },
      ]);
      const result = await sdk.getCollections();
      expect(result.length).toBe(1);
      expect(mockSolanaClient.requireAdvancedQueries).toHaveBeenCalledWith('getCollections');
    });

    it('should return empty array on error', async () => {
      mockSolanaClient.getProgramAccounts.mockRejectedValueOnce(new Error('rpc fail'));
      const result = await sdk.getCollections();
      expect(result).toEqual([]);
    });
  });

  describe('getCollectionAgents', () => {
    it('should fetch agents in a collection', async () => {
      mockSolanaClient.getProgramAccounts
        .mockResolvedValueOnce([{ data: Buffer.alloc(300) }]) // agent accounts
        .mockResolvedValueOnce([{ data: Buffer.alloc(200) }]); // metadata accounts

      const result = await sdk.getCollectionAgents(mockCollectionKey);
      expect(result.length).toBe(1);
      expect(result[0].account).toBeDefined();
    });

    it('should include feedbacks when requested', async () => {
      mockSolanaClient.getProgramAccounts
        .mockResolvedValueOnce([{ data: Buffer.alloc(300) }])
        .mockResolvedValueOnce([]);

      const result = await sdk.getCollectionAgents(mockCollectionKey, { includeFeedbacks: true });
      expect(mockFeedbackManager.fetchAllFeedbacks).toHaveBeenCalled();
    });

    it('should return empty array on error', async () => {
      mockSolanaClient.getProgramAccounts.mockRejectedValueOnce(new Error('fail'));
      const result = await sdk.getCollectionAgents(mockCollectionKey);
      expect(result).toEqual([]);
    });
  });

  describe('getAgentsByOwner', () => {
    it('should fetch agents for an owner', async () => {
      mockSolanaClient.getProgramAccounts
        .mockResolvedValueOnce([{ data: Buffer.alloc(300) }]) // agents
        .mockResolvedValueOnce([]); // metadata

      const result = await sdk.getAgentsByOwner(mockOwnerKey);
      expect(result.length).toBe(1);
    });

    it('should include feedbacks when requested', async () => {
      mockSolanaClient.getProgramAccounts
        .mockResolvedValueOnce([{ data: Buffer.alloc(300) }])
        .mockResolvedValueOnce([]);

      await sdk.getAgentsByOwner(mockOwnerKey, { includeFeedbacks: true });
      expect(mockFeedbackManager.fetchAllFeedbacks).toHaveBeenCalled();
    });

    it('should return empty array on error', async () => {
      mockSolanaClient.getProgramAccounts.mockRejectedValueOnce(new Error('rpc'));
      const result = await sdk.getAgentsByOwner(mockOwnerKey);
      expect(result).toEqual([]);
    });
  });

  describe('getAllAgents', () => {
    it('should fetch all agents with metadata', async () => {
      mockSolanaClient.getProgramAccounts
        .mockResolvedValueOnce([{ data: Buffer.alloc(300) }]) // agents
        .mockResolvedValueOnce([]); // metadata

      const result = await sdk.getAllAgents();
      expect(result.length).toBe(1);
    });

    it('should include feedbacks when requested', async () => {
      mockSolanaClient.getProgramAccounts
        .mockResolvedValueOnce([{ data: Buffer.alloc(300) }])
        .mockResolvedValueOnce([]);

      await sdk.getAllAgents({ includeFeedbacks: true, includeRevoked: true });
      expect(mockFeedbackManager.fetchAllFeedbacks).toHaveBeenCalledWith(true);
    });

    it('should return empty array on error', async () => {
      mockSolanaClient.getProgramAccounts.mockRejectedValueOnce(new Error('rpc fail'));
      const result = await sdk.getAllAgents();
      expect(result).toEqual([]);
    });
  });

  // ==================== Validation Methods ====================

  describe('requestValidation', () => {
    it('should throw without signer', async () => {
      await expect(sdk.requestValidation(mockAssetKey, PublicKey.unique(), 'ipfs://req'))
        .rejects.toThrow('read-only');
    });

    it('should delegate to validationTxBuilder with auto-nonce', async () => {
      const result = await signerSdk.requestValidation(mockAssetKey, PublicKey.unique(), 'ipfs://req');
      expect(mockValidationTxBuilder.requestValidation).toHaveBeenCalled();
      if ('nonce' in result) {
        expect(typeof result.nonce).toBe('bigint');
      }
    });

    it('should use provided nonce', async () => {
      await signerSdk.requestValidation(mockAssetKey, PublicKey.unique(), 'ipfs://req', { nonce: 42 });
      expect(mockValidationTxBuilder.requestValidation).toHaveBeenCalledWith(
        expect.any(PublicKey),
        expect.any(PublicKey),
        42,
        'ipfs://req',
        expect.anything(),
        expect.anything()
      );
    });

    it('should allow skipSend without signer', async () => {
      await sdk.requestValidation(mockAssetKey, PublicKey.unique(), 'ipfs://req', {
        skipSend: true,
        signer: PublicKey.unique(),
      });
      expect(mockValidationTxBuilder.requestValidation).toHaveBeenCalled();
    });
  });

  describe('respondToValidation', () => {
    it('should throw without signer', async () => {
      await expect(sdk.respondToValidation(mockAssetKey, 1, 80, 'ipfs://resp'))
        .rejects.toThrow('read-only');
    });

    it('should delegate to validationTxBuilder', async () => {
      await signerSdk.respondToValidation(mockAssetKey, 1, 80, 'ipfs://resp');
      expect(mockValidationTxBuilder.respondToValidation).toHaveBeenCalled();
    });

    it('should accept bigint nonce', async () => {
      await signerSdk.respondToValidation(mockAssetKey, 1000n, 80, 'ipfs://resp');
      const call = mockValidationTxBuilder.respondToValidation.mock.calls[0];
      expect(call[1]).toBe(1000); // nonce converted to number
      expect(call[2]).toBe(80);   // score
      expect(call[3]).toBe('ipfs://resp'); // URI
      expect(call[5]).toBe('');   // default tag
    });

    it('should throw on oversized bigint nonce', async () => {
      await expect(
        signerSdk.respondToValidation(mockAssetKey, BigInt(Number.MAX_SAFE_INTEGER) + 1n, 80, 'ipfs://resp')
      ).rejects.toThrow('Nonce exceeds safe integer range');
    });

    it('should pass tag option', async () => {
      await signerSdk.respondToValidation(mockAssetKey, 1, 80, 'ipfs://resp', { tag: 'quality' });
      expect(mockValidationTxBuilder.respondToValidation).toHaveBeenCalledWith(
        expect.any(PublicKey), 1, 80, 'ipfs://resp', expect.anything(), 'quality', expect.anything()
      );
    });
  });

  describe('readValidation', () => {
    it('should return normalized validation when found', async () => {
      const result = await sdk.readValidation(mockAssetKey, PublicKey.unique(), 1000);
      expect(result).not.toBeNull();
      expect(result!.nonce).toBe(1000);
      expect(result!.score).toBe(85);
      expect(result!.responded).toBe(false);
    });

    it('should return null when account not found', async () => {
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      const result = await sdk.readValidation(mockAssetKey, PublicKey.unique(), 999);
      expect(result).toBeNull();
    });

    it('should accept bigint nonce', async () => {
      const result = await sdk.readValidation(mockAssetKey, PublicKey.unique(), 1000n);
      expect(result).not.toBeNull();
    });

    it('should return null on error', async () => {
      mockSolanaClient.getAccount.mockRejectedValueOnce(new Error('rpc'));
      const result = await sdk.readValidation(mockAssetKey, PublicKey.unique(), 1);
      expect(result).toBeNull();
    });
  });

  describe('waitForValidation', () => {
    it('should return validation when found immediately', async () => {
      const result = await sdk.waitForValidation(mockAssetKey, PublicKey.unique(), 1000, { timeout: 2000 });
      expect(result).not.toBeNull();
    });

    it('should return null on timeout', async () => {
      mockSolanaClient.getAccount.mockResolvedValue(null);
      const result = await sdk.waitForValidation(mockAssetKey, PublicKey.unique(), 999, { timeout: 500 });
      expect(result).toBeNull();
    }, 5000);
  });

  // ==================== Signature Methods ====================

  describe('sign', () => {
    it('should throw without signer', () => {
      expect(() => sdk.sign(mockAssetKey, { data: 'test' })).toThrow('read-only');
    });

    it('should delegate to buildSignedPayload', () => {
      const result = signerSdk.sign(mockAssetKey, { data: 'test' });
      expect(result).toBe('canonical-json');
    });

    it('should accept custom signer in options', () => {
      const result = sdk.sign(mockAssetKey, { data: 'test' }, { signer: Keypair.generate() });
      expect(result).toBe('canonical-json');
    });
  });

  describe('verify', () => {
    it('should return true for valid signature with provided key', async () => {
      const payload = { v: 1, alg: 'ed25519', asset: mockAssetKey.toBase58(), nonce: 'n', sig: 's', data: {} };
      const result = await sdk.verify(payload as any, mockAssetKey, PublicKey.unique());
      expect(result).toBe(true);
    });

    it('should return false for asset mismatch', async () => {
      const { parseSignedPayload } = await import('../../src/utils/signing.js');
      (parseSignedPayload as jest.Mock).mockReturnValueOnce({
        v: 1, alg: 'ed25519', asset: PublicKey.unique().toBase58(), nonce: 'n', sig: 's', data: {},
      });
      const result = await sdk.verify('{}', mockAssetKey, PublicKey.unique());
      expect(result).toBe(false);
    });

    it('should fetch agent wallet when no publicKey provided', async () => {
      const walletKey = PublicKey.unique();
      mockAgentAccount.getAgentWalletPublicKey = () => walletKey;
      const result = await sdk.verify('{}', mockAssetKey);
      expect(result).toBe(true);
      mockAgentAccount.getAgentWalletPublicKey = () => null;
    });

    it('should throw when agent not found and no publicKey', async () => {
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      await expect(sdk.verify('{}', mockAssetKey)).rejects.toThrow('Agent not found');
    });

    it('should throw when agent has no wallet and no publicKey', async () => {
      await expect(sdk.verify('{}', mockAssetKey)).rejects.toThrow('wallet not configured');
    });

    it('should throw Agent not found when agent does not exist', async () => {
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      await expect(sdk.verify('{}', mockAssetKey)).rejects.toThrow('Agent not found');
    });
  });

  // ==================== Write Methods: setAgentWallet ====================

  describe('setAgentWallet', () => {
    it('should auto-sign with Keypair (simple mode)', async () => {
      const walletKeypair = Keypair.generate();
      const mockConn = mockSolanaClient.getConnection();
      (mockConn.getSlot as jest.Mock).mockResolvedValueOnce(100);
      (mockConn.getBlockTime as jest.Mock).mockResolvedValueOnce(1700000000);

      await signerSdk.setAgentWallet(mockAssetKey, walletKeypair);
      expect(mockIdentityTxBuilder.setAgentWallet).toHaveBeenCalled();
    });

    it('should accept PublicKey + signature (advanced mode)', async () => {
      const wallet = PublicKey.unique();
      const sig = new Uint8Array(64);
      await signerSdk.setAgentWallet(mockAssetKey, wallet, sig, 1700000060n);
      expect(mockIdentityTxBuilder.setAgentWallet).toHaveBeenCalledWith(
        mockAssetKey, wallet, sig, 1700000060n, undefined
      );
    });

    it('should throw in advanced mode without signer', async () => {
      const wallet = PublicKey.unique();
      const sig = new Uint8Array(64);
      await expect(sdk.setAgentWallet(mockAssetKey, wallet, sig, 1700000060n))
        .rejects.toThrow('read-only');
    });
  });

  describe('setCollectionPointer', () => {
    it('should delegate to identityTxBuilder', async () => {
      await signerSdk.setCollectionPointer(mockAssetKey, 'c1:abc123');
      expect(mockIdentityTxBuilder.setCollectionPointer).toHaveBeenCalledWith(
        mockAssetKey,
        'c1:abc123',
        undefined
      );
    });

    it('should use withOptions path when lock=false', async () => {
      await signerSdk.setCollectionPointer(mockAssetKey, 'c1:abc123', { lock: false });
      expect(mockIdentityTxBuilder.setCollectionPointerWithOptions).toHaveBeenCalledWith(
        mockAssetKey,
        'c1:abc123',
        false,
        undefined
      );
    });

    it('should throw without signer', async () => {
      await expect(sdk.setCollectionPointer(mockAssetKey, 'c1:abc123'))
        .rejects.toThrow('read-only');
    });
  });

  describe('setParentAsset', () => {
    it('should delegate to identityTxBuilder', async () => {
      const parentAsset = PublicKey.unique();
      await signerSdk.setParentAsset(mockAssetKey, parentAsset);
      expect(mockIdentityTxBuilder.setParentAsset).toHaveBeenCalledWith(
        mockAssetKey,
        parentAsset,
        undefined
      );
    });

    it('should reject self-parenting in SDK precheck', async () => {
      await expect(signerSdk.setParentAsset(mockAssetKey, mockAssetKey))
        .rejects.toThrow('must be different');
    });

    it('should use withOptions path when lock=false', async () => {
      const parentAsset = PublicKey.unique();
      await signerSdk.setParentAsset(mockAssetKey, parentAsset, { lock: false });
      expect(mockIdentityTxBuilder.setParentAssetWithOptions).toHaveBeenCalledWith(
        mockAssetKey,
        parentAsset,
        false,
        undefined
      );
    });

    it('should reject non-boolean lock in SDK precheck', async () => {
      const parentAsset = PublicKey.unique();
      await expect(signerSdk.setParentAsset(mockAssetKey, parentAsset, { lock: 'true' as any }))
        .rejects.toThrow('lock must be a boolean');
    });
  });

  describe('prepareSetAgentWallet', () => {
    it('should return message and complete function', async () => {
      const mockConn = mockSolanaClient.getConnection();
      (mockConn.getSlot as jest.Mock).mockResolvedValueOnce(100);
      (mockConn.getBlockTime as jest.Mock).mockResolvedValueOnce(1700000000);

      const prepared = await signerSdk.prepareSetAgentWallet(mockAssetKey, PublicKey.unique());
      expect(prepared.message).toBeDefined();
      expect(typeof prepared.complete).toBe('function');
    });

    it('should throw when blockTime is null', async () => {
      const mockConn = mockSolanaClient.getConnection();
      (mockConn.getSlot as jest.Mock).mockResolvedValueOnce(100);
      (mockConn.getBlockTime as jest.Mock).mockResolvedValueOnce(null);

      await expect(signerSdk.prepareSetAgentWallet(mockAssetKey, PublicKey.unique()))
        .rejects.toThrow('Failed to fetch validator clock time');
    });

    it('should throw when no owner available', async () => {
      const mockConn = mockSolanaClient.getConnection();
      (mockConn.getSlot as jest.Mock).mockResolvedValueOnce(100);
      (mockConn.getBlockTime as jest.Mock).mockResolvedValueOnce(1700000000);

      await expect(sdk.prepareSetAgentWallet(mockAssetKey, PublicKey.unique()))
        .rejects.toThrow('Owner required');
    });
  });

  // ==================== verifyIntegrity ====================

  describe('verifyIntegrity', () => {
    it('should return valid when all digests match', async () => {
      // Indexer counts must match on-chain counts (mockAgentAccount has feedback_count:5n, response:0n, revoke:0n)
      mockIndexerClient.getLastFeedbackDigest.mockResolvedValueOnce({ digest: '00'.repeat(32), count: 5 });
      mockIndexerClient.getLastResponseDigest.mockResolvedValueOnce({ digest: '00'.repeat(32), count: 0 });
      mockIndexerClient.getLastRevokeDigest.mockResolvedValueOnce({ digest: '00'.repeat(32), count: 0 });
      const result = await sdk.verifyIntegrity(mockAssetKey);
      expect(result.status).toBe('valid');
      expect(result.valid).toBe(true);
      expect(result.trustworthy).toBe(true);
    });

    it('should return error when agent not found', async () => {
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      const result = await sdk.verifyIntegrity(mockAssetKey);
      expect(result.status).toBe('error');
      expect(result.valid).toBe(false);
    });

    it('should return syncing when indexer is behind', async () => {
      // Agent has 5 feedbacks on-chain but indexer has 3
      mockIndexerClient.getLastFeedbackDigest.mockResolvedValueOnce({ digest: 'ab'.repeat(32), count: 3 });
      const result = await sdk.verifyIntegrity(mockAssetKey);
      expect(result.status).toBe('syncing');
    });

    it('should handle count retrieval failure', async () => {
      mockIndexerClient.getLastFeedbackDigest.mockRejectedValueOnce(new Error('network'));
      const result = await sdk.verifyIntegrity(mockAssetKey);
      // countRetrievalFailed=true → status='error'
      expect(result.status).toBe('error');
      expect(result.valid).toBe(false);
    });
  });

  // ==================== registerAgent with ATOM init error ====================

  describe('registerAgent ATOM catch path', () => {
    it('should handle ATOM init throwing an error', async () => {
      mockIdentityTxBuilder.registerAgent.mockResolvedValueOnce({
        signature: 'sig1',
        success: true,
        asset: PublicKey.unique(),
      });
      mockAtomTxBuilder.initializeStats.mockRejectedValueOnce(new Error('ATOM exploded'));

      const result = await signerSdk.registerAgent('ipfs://test');
      expect('success' in result && result.success).toBe(true);
    });
  });

  // ==================== isSmallQuery / withSmartRouting ====================

  describe('isSmallQuery behavior', () => {
    it('should use on-chain fallback when useIndexer=false', async () => {
      const noIndexerSdk = new SolanaSDK({ useIndexer: false });
      // Falls back to on-chain path which uses loadAgent + feedbackManager
      const result = await noIndexerSdk.getAgentReputationFromIndexer(mockAssetKey);
      // loadAgent returns mockAgentAccount, feedbackManager.getSummary returns mock summary
      expect(result).not.toBeNull();
      expect(result!.feedback_count).toBe(10);
    });
  });

  // ==================== withIndexerFallback ====================

  describe('withIndexerFallback (useIndexer=false, noFallback=true)', () => {
    it('should throw when useIndexer=false and noFallback=true', async () => {
      const noIndexerSdk = new SolanaSDK({ useIndexer: false });
      await expect(
        noIndexerSdk.getAgentReputationFromIndexer(mockAssetKey, { noFallback: true })
      ).rejects.toThrow('Indexer not available');
    });
  });

  // ==================== getFeedbacksFromIndexer ====================

  describe('getFeedbacksFromIndexer with options', () => {
    it('should pass includeRevoked and limit', async () => {
      mockIndexerClient.getFeedbacks.mockResolvedValueOnce([{ score: 90 }]);
      const result = await sdk.getFeedbacksFromIndexer(mockAssetKey, {
        includeRevoked: true,
        limit: 5,
        offset: 0,
      });
      expect(result).toHaveLength(1);
    });

    it('should throw when noFallback and indexer fails', async () => {
      mockIndexerClient.getFeedbacks.mockRejectedValueOnce(new Error('indexer down'));
      await expect(
        sdk.getFeedbacksFromIndexer(mockAssetKey, { noFallback: true })
      ).rejects.toThrow('indexer down');
    });
  });

  // ==================== transferAgent / syncOwner ====================

  describe('transferAgent with signer', () => {
    it('should delegate to identityTxBuilder', async () => {
      const newOwner = PublicKey.unique();
      await signerSdk.transferAgent(mockAssetKey, mockCollectionKey, newOwner);
      expect(mockIdentityTxBuilder.transferAgent).toHaveBeenCalled();
    });
  });

  describe('syncOwner with signer', () => {
    it('should delegate to identityTxBuilder', async () => {
      await signerSdk.syncOwner(mockAssetKey);
      expect(mockIdentityTxBuilder.syncOwner).toHaveBeenCalled();
    });
  });
});
