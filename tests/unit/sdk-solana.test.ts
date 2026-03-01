/**
 * Comprehensive tests for src/core/sdk-solana.ts (SolanaSDK)
 * Tests constructor, read methods, write methods, indexer methods, ATOM methods, utility methods
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';

// ==================== Mock Setup ====================

const MOCK_BLOCKHASH = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi';

// Mock config-reader
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

// Mock borsh-schemas
const mockOwnerKey = PublicKey.unique();
const mockAssetKey = PublicKey.unique();
const mockCollectionKey = PublicKey.unique();

const mockAgentAccount = {
  getCollectionPublicKey: () => mockCollectionKey,
  getOwnerPublicKey: () => mockOwnerKey,
  getAssetPublicKey: () => mockAssetKey,
  isAtomEnabled: () => false,
  feedback_count: 5n,
  nft_name: 'TestAgent',
  agent_uri: 'ipfs://test-agent',
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
      getAssetPublicKey: () => mockAssetKey,
      getValidatorPublicKey: () => PublicKey.unique(),
      nonce: 1,
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

// Mock feedback-manager-solana
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

// Mock indexer-client
const mockIndexerClient = {
  isAvailable: jest.fn().mockResolvedValue(true),
  getAgent: jest.fn().mockResolvedValue(null),
  getAgents: jest.fn().mockResolvedValue([]),
  getAgentsByOwner: jest.fn().mockResolvedValue([]),
  getAgentsByCollection: jest.fn().mockResolvedValue([]),
  getAgentByAgentId: jest.fn().mockResolvedValue(null),
  getAgentByWallet: jest.fn().mockResolvedValue(null),
  getCollectionPointers: jest.fn().mockResolvedValue([]),
  getCollectionAssetCount: jest.fn().mockResolvedValue(0),
  getCollectionAssets: jest.fn().mockResolvedValue([]),
  getLeaderboard: jest.fn().mockResolvedValue([]),
  getGlobalStats: jest.fn().mockResolvedValue({ total_agents: 0, total_feedbacks: 0 }),
  getCollectionStats: jest.fn().mockResolvedValue(null),
  getFeedbacks: jest.fn().mockResolvedValue([]),
  getFeedback: jest.fn().mockResolvedValue(null),
  getFeedbackById: jest.fn().mockResolvedValue(null),
  getFeedbacksByClient: jest.fn().mockResolvedValue([]),
  getFeedbacksByEndpoint: jest.fn().mockResolvedValue([]),
  getFeedbacksByTag: jest.fn().mockResolvedValue([]),
  getFeedbackResponsesFor: jest.fn().mockResolvedValue([]),
  getFeedbackResponsesByFeedbackId: jest.fn().mockResolvedValue([]),
  getLastFeedbackIndex: jest.fn().mockResolvedValue(-1n),
  searchAgents: jest.fn().mockResolvedValue([]),
  getValidations: jest.fn().mockResolvedValue([]),
  getValidation: jest.fn().mockResolvedValue(null),
  getPendingValidations: jest.fn().mockResolvedValue([]),
  getAgentReputation: jest.fn().mockResolvedValue(null),
  getAgentMetadata: jest.fn().mockResolvedValue([]),
};

jest.unstable_mockModule('../../src/core/indexer-client.js', () => ({
  IndexerClient: jest.fn().mockImplementation(() => mockIndexerClient),
  encodeCanonicalFeedbackId: jest.fn((asset: string, client: string, index: number | bigint | string) => `${asset}:${client}:${index.toString()}`),
  encodeCanonicalResponseId: jest.fn(
    (
      asset: string,
      client: string,
      index: number | bigint | string,
      responder: string,
      sequenceOrSig: number | bigint | string
    ) => `${asset}:${client}:${index.toString()}:${responder}:${sequenceOrSig.toString()}`
  ),
  decodeCanonicalFeedbackId: jest.fn((id: string) => {
    const parts = id.split(':');
    if (parts.length === 3) {
      const [asset, client, index] = parts;
      if (!asset || !client || !index || asset === 'sol') return null;
      return { asset, client, index };
    }
    if (parts.length === 4 && parts[0] === 'sol') {
      const [, asset, client, index] = parts;
      if (!asset || !client || !index) return null;
      return { asset, client, index };
    }
    return null;
  }),
}));

// Mock indexer-types
jest.unstable_mockModule('../../src/core/indexer-types.js', () => ({
  indexedFeedbackToSolanaFeedback: jest.fn().mockImplementation((f: any) => f),
}));

// Mock transaction builders
const mockTxResult = { signature: 'mock-sig', success: true };
const mockPreparedTx = {
  transaction: 'base64tx',
  blockhash: MOCK_BLOCKHASH,
  lastValidBlockHeight: 999,
  signer: 'mock-signer',
  signed: false as const,
};

const mockIpfsClient = {
  addJson: jest.fn().mockResolvedValue('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'),
};

const mockIdentityTxBuilder = {
  registerAgent: jest.fn().mockResolvedValue(mockTxResult),
  setAgentUri: jest.fn().mockResolvedValue(mockTxResult),
  setCollectionPointer: jest.fn().mockResolvedValue(mockTxResult),
  setCollectionPointerWithOptions: jest.fn().mockResolvedValue(mockTxResult),
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
  setFeedbackTags: jest.fn().mockResolvedValue({ success: false, error: 'deprecated' }),
};

const mockValidationTxBuilder = {
  requestValidation: jest.fn().mockResolvedValue(mockTxResult),
  respondToValidation: jest.fn().mockResolvedValue(mockTxResult),
  updateValidation: jest.fn().mockResolvedValue({ success: false, error: 'deprecated' }),
  closeValidation: jest.fn().mockResolvedValue({ success: false, error: 'deprecated' }),
};

const mockAtomTxBuilder = {
  initializeStats: jest.fn().mockResolvedValue(mockTxResult),
  initializeConfig: jest.fn().mockResolvedValue(mockTxResult),
  updateConfig: jest.fn().mockResolvedValue(mockTxResult),
};

const mockValidateCollectionPointer = jest.fn((col: string) => {
  if (typeof col !== 'string') {
    throw new Error('col must be a string');
  }
  if (!col.startsWith('c1:')) {
    throw new Error('col must start with "c1:"');
  }
  const payload = col.slice(3);
  if (!payload) {
    throw new Error('col payload cannot be empty after "c1:"');
  }
  if (!/^[a-z0-9]+$/.test(payload)) {
    throw new Error('col payload must contain only [a-z0-9]');
  }
});

jest.unstable_mockModule('../../src/core/transaction-builder.js', () => ({
  IdentityTransactionBuilder: jest.fn().mockImplementation(() => mockIdentityTxBuilder),
  ReputationTransactionBuilder: jest.fn().mockImplementation(() => mockReputationTxBuilder),
  ValidationTransactionBuilder: jest.fn().mockImplementation(() => mockValidationTxBuilder),
  AtomTransactionBuilder: jest.fn().mockImplementation(() => mockAtomTxBuilder),
  validateCollectionPointer: mockValidateCollectionPointer,
  serializeTransaction: jest.fn(),
}));

// Mock client
const mockSolanaClient = {
  getAccount: jest.fn().mockResolvedValue(Buffer.alloc(300)),
  getMultipleAccounts: jest.fn().mockResolvedValue([]),
  getProgramAccounts: jest.fn().mockResolvedValue([]),
  getProgramAccountsWithMemcmp: jest.fn().mockResolvedValue([]),
  getProgramAccountsBySize: jest.fn().mockResolvedValue([]),
  getAccountInfo: jest.fn().mockResolvedValue(null),
  accountExists: jest.fn().mockResolvedValue(false),
  supportsAdvancedQueries: jest.fn().mockReturnValue(true),
  requireAdvancedQueries: jest.fn(),
  getSlot: jest.fn().mockResolvedValue(100),
  getBlockTime: jest.fn().mockResolvedValue(1700000000),
  getConnection: jest.fn().mockReturnValue(new Connection('https://mock.example.com')),
  get isDefaultDevnetRpc() { return false; },
  get rpcUrl() { return 'https://mock.example.com'; },
};

jest.unstable_mockModule('../../src/core/client.js', () => ({
  SolanaClient: jest.fn().mockImplementation(() => mockSolanaClient),
  createDevnetClient: jest.fn().mockReturnValue(mockSolanaClient),
  UnsupportedRpcError: class UnsupportedRpcError extends Error {},
  Cluster: {},
}));

// Mock atom-schemas
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
    deserialize: jest.fn().mockReturnValue({
      authority: PublicKey.unique(),
    }),
  },
  TrustTier: { Unrated: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 },
}));

// Mock agent-mint-resolver
jest.unstable_mockModule('../../src/core/agent-mint-resolver.js', () => ({
  AgentMintResolver: jest.fn().mockImplementation(() => ({
    resolve: jest.fn().mockResolvedValue(null),
  })),
}));

// Mock endpoint-crawler
jest.unstable_mockModule('../../src/core/endpoint-crawler.js', () => ({
  EndpointCrawler: jest.fn().mockImplementation(() => ({
    crawl: jest.fn().mockResolvedValue({ services: [], metadata: {} }),
  })),
}));

// Mock signing utilities
jest.unstable_mockModule('../../src/utils/signing.js', () => ({
  buildSignedPayload: jest.fn().mockReturnValue('signed-payload'),
  canonicalizeSignedPayload: jest.fn().mockReturnValue('canonical'),
  parseSignedPayload: jest.fn().mockReturnValue({ version: 1, data: {} }),
  verifySignedPayload: jest.fn().mockReturnValue(true),
}));

// Mock hash-chain-replay
jest.unstable_mockModule('../../src/core/hash-chain-replay.js', () => ({
  replayFeedbackChain: jest.fn().mockResolvedValue({ digest: '00'.repeat(32), count: 0, valid: true }),
  replayResponseChain: jest.fn().mockResolvedValue({ digest: '00'.repeat(32), count: 0, valid: true }),
  replayRevokeChain: jest.fn().mockResolvedValue({ digest: '00'.repeat(32), count: 0, valid: true }),
}));

// Import SolanaSDK after mocks
const { SolanaSDK } = await import('../../src/core/sdk-solana.js');

// ==================== Tests ====================

describe('SolanaSDK', () => {
  let sdk: InstanceType<typeof SolanaSDK>;
  let signerSdk: InstanceType<typeof SolanaSDK>;
  const signer = Keypair.generate();

  beforeEach(() => {
    jest.clearAllMocks();
    mockIpfsClient.addJson.mockResolvedValue('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');

    // Read-only SDK
    sdk = new SolanaSDK({
      indexerUrl: 'https://example.supabase.co/rest/v1',
      indexerApiKey: 'test-key',
    });

    // SDK with signer
    signerSdk = new SolanaSDK({
      signer,
      rpcUrl: 'https://mock.example.com',
      indexerUrl: 'https://example.supabase.co/rest/v1',
      indexerApiKey: 'test-key',
    });
  });

  // ==================== Constructor ====================

  describe('constructor', () => {
    it('should create read-only SDK by default', () => {
      const s = new SolanaSDK();
      expect(s.isReadOnly).toBe(true);
      expect(s.canWrite).toBe(false);
    });

    it('should create writable SDK with signer', () => {
      const s = new SolanaSDK({ signer: Keypair.generate() });
      expect(s.isReadOnly).toBe(false);
      expect(s.canWrite).toBe(true);
    });

    it('should default to devnet cluster', () => {
      const s = new SolanaSDK();
      expect(s.getCluster()).toBe('devnet');
    });

    it('should accept custom rpcUrl', () => {
      const s = new SolanaSDK({ rpcUrl: 'https://custom-rpc.example.com' });
      expect(s).toBeDefined();
    });

    it('should accept useIndexer=false', () => {
      const s = new SolanaSDK({ useIndexer: false });
      expect(s).toBeDefined();
    });

    it('should accept forceOnChain=true', () => {
      const s = new SolanaSDK({ forceOnChain: true });
      expect(s).toBeDefined();
    });

    it('should accept custom indexer url and key', () => {
      const s = new SolanaSDK({
        indexerUrl: 'https://indexer.example.com',
        indexerApiKey: 'test-key',
      });
      expect(s).toBeDefined();
    });
  });

  // ==================== Utility / Accessor Methods ====================

  describe('utility methods', () => {
    it('chainId should return solana-cluster string', async () => {
      const id = await sdk.chainId();
      expect(id).toBe('solana-devnet');
    });

    it('getCluster should return cluster', () => {
      expect(sdk.getCluster()).toBe('devnet');
    });

    it('getProgramIds should return program IDs', () => {
      const ids = sdk.getProgramIds();
      expect(ids.agentRegistry).toBeDefined();
      expect(ids.atomEngine).toBeDefined();
    });

    it('should apply programIds overrides from config', () => {
      const customSdk = new SolanaSDK({
        programIds: {
          agentRegistry: '11111111111111111111111111111111',
          atomEngine: 'SysvarRent111111111111111111111111111111111',
        },
      });
      const ids = customSdk.getProgramIds();
      expect(ids.agentRegistry.toBase58()).toBe('11111111111111111111111111111111');
      expect(ids.identityRegistry.toBase58()).toBe('11111111111111111111111111111111');
      expect(ids.atomEngine.toBase58()).toBe('SysvarRent111111111111111111111111111111111');
    });

    it('registries should return registry addresses', () => {
      const regs = sdk.registries();
      expect(regs.IDENTITY).toBeDefined();
      expect(regs.REPUTATION).toBeDefined();
      expect(regs.VALIDATION).toBeDefined();
    });

    it('getSolanaClient should return client', () => {
      const client = sdk.getSolanaClient();
      expect(client).toBeDefined();
    });

    it('getFeedbackManager should return feedback manager', () => {
      const fm = sdk.getFeedbackManager();
      expect(fm).toBeDefined();
    });

    it('getIndexerClient should return indexer client', () => {
      const ic = sdk.getIndexerClient();
      expect(ic).toBeDefined();
    });

    it('isUsingDefaultDevnetRpc should return boolean', () => {
      expect(typeof sdk.isUsingDefaultDevnetRpc()).toBe('boolean');
    });

    it('supportsAdvancedQueries should return boolean', () => {
      expect(typeof sdk.supportsAdvancedQueries()).toBe('boolean');
    });

    it('getRpcUrl should return string', () => {
      expect(typeof sdk.getRpcUrl()).toBe('string');
    });
  });

  // ==================== Agent Read Methods ====================

  describe('loadAgent', () => {
    it('should return agent when found', async () => {
      const result = await sdk.loadAgent(mockAssetKey);
      expect(result).not.toBeNull();
    });

    it('should return null when not found', async () => {
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      const result = await sdk.loadAgent(mockAssetKey);
      expect(result).toBeNull();
    });

    it('should return null on deserialization error', async () => {
      const { AgentAccount } = await import('../../src/core/borsh-schemas.js');
      (AgentAccount.deserialize as jest.Mock).mockImplementationOnce(() => {
        throw new Error('bad data');
      });
      const result = await sdk.loadAgent(mockAssetKey);
      expect(result).toBeNull();
    });
  });

  describe('getAgent', () => {
    it('should be alias for loadAgent', async () => {
      const result = await sdk.getAgent(mockAssetKey);
      expect(result).not.toBeNull();
    });
  });

  describe('agentExists', () => {
    it('should return true when agent exists', async () => {
      const result = await sdk.agentExists(mockAssetKey);
      expect(result).toBe(true);
    });

    it('should return false when agent not found', async () => {
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      const result = await sdk.agentExists(mockAssetKey);
      expect(result).toBe(false);
    });
  });

  describe('isAgentOwner', () => {
    it('should return true when address matches owner', async () => {
      const result = await sdk.isAgentOwner(mockAssetKey, mockOwnerKey);
      expect(result).toBe(true);
    });

    it('should return false when address does not match', async () => {
      const result = await sdk.isAgentOwner(mockAssetKey, PublicKey.unique());
      expect(result).toBe(false);
    });

    it('should return false when agent not found', async () => {
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      const result = await sdk.isAgentOwner(mockAssetKey, mockOwnerKey);
      expect(result).toBe(false);
    });
  });

  describe('getAgentOwner', () => {
    it('should return owner pubkey', async () => {
      const result = await sdk.getAgentOwner(mockAssetKey);
      expect(result).toEqual(mockOwnerKey);
    });

    it('should return null when agent not found', async () => {
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      const result = await sdk.getAgentOwner(mockAssetKey);
      expect(result).toBeNull();
    });
  });

  describe('getMetadata', () => {
    it('should return metadata value when found', async () => {
      const result = await sdk.getMetadata(mockAssetKey, 'test-key');
      expect(result).toBe('test-value');
    });

    it('should return null when metadata not found', async () => {
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      const result = await sdk.getMetadata(mockAssetKey, 'missing-key');
      expect(result).toBeNull();
    });
  });

  describe('getReputationSummary', () => {
    it('should return count and averageScore', async () => {
      const result = await sdk.getReputationSummary(mockAssetKey);
      expect(result.count).toBe(10);
      expect(result.averageScore).toBe(75);
    });
  });

  // ==================== Reputation Methods ====================

  describe('getSummary', () => {
    it('should delegate to feedbackManager', async () => {
      const result = await sdk.getSummary(mockAssetKey);
      expect(result.totalFeedbacks).toBe(10);
      expect(mockFeedbackManager.getSummary).toHaveBeenCalledWith(mockAssetKey, undefined, undefined);
    });

    it('should pass filters', async () => {
      const client = PublicKey.unique();
      await sdk.getSummary(mockAssetKey, 50, client);
      expect(mockFeedbackManager.getSummary).toHaveBeenCalledWith(mockAssetKey, 50, client);
    });
  });

  describe('readFeedback', () => {
    it('should convert number to bigint', async () => {
      await sdk.readFeedback(mockAssetKey, PublicKey.unique(), 5);
      expect(mockFeedbackManager.readFeedback).toHaveBeenCalledWith(mockAssetKey, expect.any(PublicKey), 5n);
    });

    it('should accept bigint directly', async () => {
      await sdk.readFeedback(mockAssetKey, PublicKey.unique(), 5n);
      expect(mockFeedbackManager.readFeedback).toHaveBeenCalledWith(mockAssetKey, expect.any(PublicKey), 5n);
    });
  });

  describe('getFeedback', () => {
    it('should be alias for readFeedback', async () => {
      await sdk.getFeedback(mockAssetKey, PublicKey.unique(), 3);
      expect(mockFeedbackManager.readFeedback).toHaveBeenCalled();
    });
  });

  describe('feedback id indexer reads', () => {
    it('getFeedbackById should delegate sequential id to indexer client', async () => {
      mockIndexerClient.getFeedbackById.mockResolvedValueOnce({ id: '123' });

      const result = await sdk.getFeedbackById(' 123 ');
      expect(mockIndexerClient.getFeedbackById).toHaveBeenCalledWith('123');
      expect(result).toEqual({ id: '123' });
    });

    it('getFeedbackById should reject non-numeric ids', async () => {
      const result = await sdk.getFeedbackById('asset1:client1:7');
      expect(result).toBeNull();
      expect(mockIndexerClient.getFeedbackById).not.toHaveBeenCalled();
    });

    it('getFeedbackById should return null when direct method is unavailable', async () => {
      const original = mockIndexerClient.getFeedbackById;
      (mockIndexerClient as any).getFeedbackById = undefined;

      try {
        await expect(sdk.getFeedbackById('123')).resolves.toBeNull();
      } finally {
        (mockIndexerClient as any).getFeedbackById = original;
      }
    });

    it('getFeedbackResponsesByFeedbackId should delegate sequential id to indexer client', async () => {
      mockIndexerClient.getFeedbackResponsesByFeedbackId.mockResolvedValueOnce([{ id: 'r1' }]);

      const result = await sdk.getFeedbackResponsesByFeedbackId(' 123 ', 5);
      expect(mockIndexerClient.getFeedbackResponsesByFeedbackId).toHaveBeenCalledWith('123', 5);
      expect(result).toEqual([{ id: 'r1' }]);
    });

    it('getFeedbackResponsesByFeedbackId should propagate fail-closed ambiguity errors', async () => {
      mockIndexerClient.getFeedbackResponsesByFeedbackId.mockRejectedValueOnce(
        new Error('Ambiguous feedback_id "123": multiple assets found (asset1, asset2).')
      );

      await expect(sdk.getFeedbackResponsesByFeedbackId('123', 5)).rejects.toThrow(
        'Ambiguous feedback_id "123"'
      );
    });

    it('getFeedbackResponsesByFeedbackId should reject non-numeric ids', async () => {
      const result = await sdk.getFeedbackResponsesByFeedbackId('asset1:client1:7', 5);
      expect(result).toEqual([]);
      expect(mockIndexerClient.getFeedbackResponsesByFeedbackId).not.toHaveBeenCalled();
    });

    it('getFeedbackResponsesByFeedbackId should return [] when direct method is unavailable', async () => {
      const original = mockIndexerClient.getFeedbackResponsesByFeedbackId;
      (mockIndexerClient as any).getFeedbackResponsesByFeedbackId = undefined;

      try {
        await expect(sdk.getFeedbackResponsesByFeedbackId('123', 5)).resolves.toEqual([]);
      } finally {
        (mockIndexerClient as any).getFeedbackResponsesByFeedbackId = original;
      }
    });
  });

  describe('readAllFeedback', () => {
    it('should delegate to feedbackManager', async () => {
      await sdk.readAllFeedback(mockAssetKey);
      expect(mockFeedbackManager.readAllFeedback).toHaveBeenCalledWith(mockAssetKey, false);
    });

    it('should pass includeRevoked flag', async () => {
      await sdk.readAllFeedback(mockAssetKey, true);
      expect(mockFeedbackManager.readAllFeedback).toHaveBeenCalledWith(mockAssetKey, true);
    });
  });

  describe('getLastIndex', () => {
    it('should delegate to feedbackManager', async () => {
      const client = PublicKey.unique();
      await sdk.getLastIndex(mockAssetKey, client);
      expect(mockFeedbackManager.getLastIndex).toHaveBeenCalledWith(mockAssetKey, client);
    });
  });

  describe('getClients', () => {
    it('should delegate to feedbackManager', async () => {
      await sdk.getClients(mockAssetKey);
      expect(mockFeedbackManager.getClients).toHaveBeenCalledWith(mockAssetKey);
    });
  });

  describe('getResponseCount', () => {
    it('should convert number to bigint', async () => {
      await sdk.getResponseCount(mockAssetKey, PublicKey.unique(), 3);
      expect(mockFeedbackManager.getResponseCount).toHaveBeenCalledWith(mockAssetKey, expect.any(PublicKey), 3n);
    });
  });

  describe('readResponses', () => {
    it('should convert number to bigint', async () => {
      await sdk.readResponses(mockAssetKey, PublicKey.unique(), 1);
      expect(mockFeedbackManager.readResponses).toHaveBeenCalledWith(mockAssetKey, expect.any(PublicKey), 1n);
    });
  });

  describe('getAllFeedbacks', () => {
    it('should delegate to feedbackManager', async () => {
      await sdk.getAllFeedbacks();
      expect(mockFeedbackManager.fetchAllFeedbacks).toHaveBeenCalledWith(false);
    });

    it('should pass includeRevoked', async () => {
      await sdk.getAllFeedbacks(true);
      expect(mockFeedbackManager.fetchAllFeedbacks).toHaveBeenCalledWith(true);
    });
  });

  // ==================== Collection Methods ====================

  describe('getCollection', () => {
    it('should return collection info', async () => {
      const result = await sdk.getCollection(mockBaseCollection);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.collection).toBeDefined();
        expect(result.authority).toBeDefined();
      }
    });

    it('should return null when not found', async () => {
      const { fetchRegistryConfig } = await import('../../src/core/config-reader.js');
      (fetchRegistryConfig as jest.Mock).mockResolvedValueOnce(null);
      const result = await sdk.getCollection(PublicKey.unique());
      expect(result).toBeNull();
    });
  });

  // ==================== ATOM Methods ====================

  describe('getAtomStats', () => {
    it('should return stats when found', async () => {
      // Mock the connection.getAccountInfo to return data
      const mockConn = mockSolanaClient.getConnection();
      jest.spyOn(mockConn, 'getAccountInfo').mockResolvedValueOnce({
        data: Buffer.alloc(200),
        executable: false,
        lamports: 1000000,
        owner: PublicKey.default,
      } as any);

      const result = await sdk.getAtomStats(mockAssetKey);
      expect(result).not.toBeNull();
    });

    it('should return null when not found', async () => {
      const mockConn = mockSolanaClient.getConnection();
      jest.spyOn(mockConn, 'getAccountInfo').mockResolvedValueOnce(null);

      const result = await sdk.getAtomStats(mockAssetKey);
      expect(result).toBeNull();
    });
  });

  describe('getTrustTier', () => {
    it('should return Unrated when no stats', async () => {
      const mockConn = mockSolanaClient.getConnection();
      jest.spyOn(mockConn, 'getAccountInfo').mockResolvedValueOnce(null);

      const result = await sdk.getTrustTier(mockAssetKey);
      expect(result).toBe(0); // TrustTier.Unrated
    });

    it('should return trust tier from stats', async () => {
      const mockConn = mockSolanaClient.getConnection();
      jest.spyOn(mockConn, 'getAccountInfo').mockResolvedValueOnce({
        data: Buffer.alloc(200),
        executable: false,
        lamports: 1000000,
        owner: PublicKey.default,
      } as any);

      const result = await sdk.getTrustTier(mockAssetKey);
      expect(result).toBe(2); // Silver
    });
  });

  describe('getAtomConfig', () => {
    it('should return config when found', async () => {
      const mockConn = mockSolanaClient.getConnection();
      jest.spyOn(mockConn, 'getAccountInfo').mockResolvedValueOnce({
        data: Buffer.alloc(100),
        executable: false,
        lamports: 1000000,
        owner: PublicKey.default,
      } as any);

      const result = await sdk.getAtomConfig();
      expect(result).not.toBeNull();
    });

    it('should return null when not found', async () => {
      const mockConn = mockSolanaClient.getConnection();
      jest.spyOn(mockConn, 'getAccountInfo').mockResolvedValueOnce(null);

      const result = await sdk.getAtomConfig();
      expect(result).toBeNull();
    });
  });

  describe('initializeAtomStats', () => {
    it('should throw when no signer and not skipSend', async () => {
      await expect(sdk.initializeAtomStats(mockAssetKey)).rejects.toThrow('read-only');
    });

    it('should delegate to atomTxBuilder with skipSend', async () => {
      const result = await sdk.initializeAtomStats(mockAssetKey, {
        skipSend: true,
        signer: PublicKey.unique(),
      });
      expect(mockAtomTxBuilder.initializeStats).toHaveBeenCalled();
    });

    it('should allow when signer configured', async () => {
      await signerSdk.initializeAtomStats(mockAssetKey);
      expect(mockAtomTxBuilder.initializeStats).toHaveBeenCalled();
    });
  });

  describe('initializeAtomConfig', () => {
    it('should throw when no signer and not skipSend', async () => {
      await expect(sdk.initializeAtomConfig()).rejects.toThrow('read-only');
    });

    it('should delegate to atomTxBuilder', async () => {
      await signerSdk.initializeAtomConfig();
      expect(mockAtomTxBuilder.initializeConfig).toHaveBeenCalled();
    });
  });

  describe('updateAtomConfig', () => {
    it('should throw when no signer and not skipSend', async () => {
      await expect(sdk.updateAtomConfig({})).rejects.toThrow('read-only');
    });

    it('should delegate to atomTxBuilder', async () => {
      await signerSdk.updateAtomConfig({ paused: true });
      expect(mockAtomTxBuilder.updateConfig).toHaveBeenCalled();
    });
  });

  // ==================== Indexer Methods ====================

  describe('isIndexerAvailable', () => {
    it('should delegate to indexerClient', async () => {
      const result = await sdk.isIndexerAvailable();
      expect(result).toBe(true);
    });
  });

  describe('searchAgents', () => {
    it('should search by owner', async () => {
      await sdk.searchAgents({ owner: 'test-owner' });
      expect(mockIndexerClient.getAgents).toHaveBeenCalledWith(
        expect.objectContaining({ owner: 'test-owner' })
      );
    });

    it('should search by collection', async () => {
      await sdk.searchAgents({ collection: 'test-collection' });
      expect(mockIndexerClient.getAgents).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'test-collection' })
      );
    });

    it('should search by wallet', async () => {
      mockIndexerClient.getAgents.mockResolvedValueOnce([{ asset: 'mock' }]);
      const result = await sdk.searchAgents({ wallet: 'test-wallet' });
      expect(result).toHaveLength(1);
    });

    it('should return empty array for wallet not found', async () => {
      mockIndexerClient.getAgents.mockResolvedValueOnce([]);
      const result = await sdk.searchAgents({ wallet: 'missing' });
      expect(result).toHaveLength(0);
    });

    it('should fall back to getAgents for general queries', async () => {
      await sdk.searchAgents({ limit: 10 });
      expect(mockIndexerClient.getAgents).toHaveBeenCalled();
    });

    it('should forward extended pointer and parent filters', async () => {
      await sdk.searchAgents({
        creator: 'creator-pubkey',
        collectionPointer: 'c1:abc123',
        parentAsset: 'parent-asset',
        parentCreator: 'parent-creator',
        colLocked: true,
        parentLocked: false,
      });

      expect(mockIndexerClient.getAgents).toHaveBeenCalledWith(
        expect.objectContaining({
          creator: 'creator-pubkey',
          collectionPointer: 'c1:abc123',
          parentAsset: 'parent-asset',
          parentCreator: 'parent-creator',
          colLocked: true,
          parentLocked: false,
        })
      );
    });

    it('should apply minScore on indexed quality score', async () => {
      mockIndexerClient.getAgents.mockResolvedValueOnce([
        { asset: 'a', quality_score: 40, raw_avg_score: 40 },
        { asset: 'b', quality_score: 80, raw_avg_score: 80 },
      ]);

      const result = await sdk.searchAgents({ minScore: 50 });
      expect(result).toEqual([{ asset: 'b', quality_score: 80, raw_avg_score: 80 }]);
    });

    it('should throw when forceOnChain=true', async () => {
      const forcedSdk = new SolanaSDK({ forceOnChain: true });
      await expect(forcedSdk.searchAgents({})).rejects.toThrow('requires indexer');
    });
  });

  describe('collection pointer indexer helpers', () => {
    it('should delegate getCollectionPointers to indexer client', async () => {
      await sdk.getCollectionPointers({ col: 'c1:abc' });
      expect(mockIndexerClient.getCollectionPointers).toHaveBeenCalledWith({ col: 'c1:abc' });
    });

    it('should delegate getCollectionAssetCount to indexer client', async () => {
      await sdk.getCollectionAssetCount('c1:abc', 'creator');
      expect(mockIndexerClient.getCollectionAssetCount).toHaveBeenCalledWith('c1:abc', 'creator');
    });

    it('should delegate getCollectionAssets to indexer client', async () => {
      await sdk.getCollectionAssets('c1:abc', { limit: 10 });
      expect(mockIndexerClient.getCollectionAssets).toHaveBeenCalledWith('c1:abc', { limit: 10 });
    });
  });

  describe('getLeaderboard', () => {
    it('should delegate to indexerClient', async () => {
      await sdk.getLeaderboard({ limit: 10 });
      expect(mockIndexerClient.getLeaderboard).toHaveBeenCalledWith({ limit: 10 });
    });

    it('should throw when forceOnChain=true', async () => {
      const forcedSdk = new SolanaSDK({ forceOnChain: true });
      await expect(forcedSdk.getLeaderboard()).rejects.toThrow('requires indexer');
    });
  });

  describe('getGlobalStats', () => {
    it('should delegate to indexerClient', async () => {
      await sdk.getGlobalStats();
      expect(mockIndexerClient.getGlobalStats).toHaveBeenCalled();
    });

    it('should throw when forceOnChain=true', async () => {
      const forcedSdk = new SolanaSDK({ forceOnChain: true });
      await expect(forcedSdk.getGlobalStats()).rejects.toThrow('requires indexer');
    });
  });

  describe('getFeedbacksByEndpoint', () => {
    it('should delegate to indexerClient', async () => {
      await sdk.getFeedbacksByEndpoint('/api/chat');
      expect(mockIndexerClient.getFeedbacksByEndpoint).toHaveBeenCalledWith('/api/chat');
    });
  });

  describe('getFeedbacksByTag', () => {
    it('should delegate to indexerClient', async () => {
      await sdk.getFeedbacksByTag('quality');
      expect(mockIndexerClient.getFeedbacksByTag).toHaveBeenCalledWith('quality');
    });
  });

  describe('getAgentByWallet', () => {
    it('should delegate to indexerClient', async () => {
      await sdk.getAgentByWallet('wallet-pubkey');
      expect(mockIndexerClient.getAgentByWallet).toHaveBeenCalledWith('wallet-pubkey');
    });
  });

  describe('getAgentByAgentId', () => {
    it('should delegate to indexerClient', async () => {
      await sdk.getAgentByAgentId('42');
      expect(mockIndexerClient.getAgentByAgentId).toHaveBeenCalledWith('42');
    });

    it('should keep getAgentByIndexerId as alias', async () => {
      await sdk.getAgentByIndexerId(42);
      expect(mockIndexerClient.getAgentByAgentId).toHaveBeenCalledWith(42);
    });

    it('should fallback to legacy getAgentByIndexerId when primary method is unavailable', async () => {
      const originalPrimary = mockIndexerClient.getAgentByAgentId;
      const originalLegacy = (mockIndexerClient as any).getAgentByIndexerId;
      const legacyMethod = jest.fn().mockResolvedValue({ agent_id: '77', asset: 'asset77' });
      (mockIndexerClient as any).getAgentByAgentId = undefined;
      (mockIndexerClient as any).getAgentByIndexerId = legacyMethod;

      try {
        const row = await sdk.getAgentByAgentId('77');
        expect(legacyMethod).toHaveBeenCalledWith('77');
        expect(row).toEqual({ agent_id: '77', asset: 'asset77' });
      } finally {
        (mockIndexerClient as any).getAgentByAgentId = originalPrimary;
        (mockIndexerClient as any).getAgentByIndexerId = originalLegacy;
      }
    });

    it('should throw when forceOnChain=true', async () => {
      const forcedSdk = new SolanaSDK({ forceOnChain: true });
      await expect(forcedSdk.getAgentByAgentId(42)).rejects.toThrow('requires indexer');
    });
  });

  describe('getPendingValidations', () => {
    it('should throw because validation feature is archived', async () => {
      await expect(sdk.getPendingValidations('validator-pubkey')).rejects
        .toThrow('Validation feature is archived (v0.5.0+) and is not exposed by indexers.');
      expect(mockIndexerClient.getPendingValidations).not.toHaveBeenCalled();
    });
  });

  // ==================== Write Methods ====================

  describe('collection metadata flow (off-chain)', () => {
    it('createCollectionData should build schema-compliant json', () => {
      const data = signerSdk.createCollectionData({
        name: 'Caster Agents',
        description: 'Main collection',
      });

      expect(data.version).toBe('1.0.0');
      expect(data.name).toBe('Caster Agents');
      expect(data.description).toBe('Main collection');
    });

    it('createCollection(data, { uploadToIpfs:false }) should return metadata only', async () => {
      const result = await signerSdk.createCollection(
        { name: 'Caster Agents', description: 'Main collection' },
        { uploadToIpfs: false }
      );

      expect(result.metadata.name).toBe('Caster Agents');
      expect(result.cid).toBeUndefined();
      expect(mockIpfsClient.addJson).not.toHaveBeenCalled();
    });

    it('createCollection(data) should upload to IPFS and return cid/uri/pointer', async () => {
      const sdkWithIpfs = new SolanaSDK({
        signer,
        ipfsClient: mockIpfsClient as any,
        indexerUrl: 'https://example.supabase.co/rest/v1',
        indexerApiKey: 'test-key',
      });

      const result = await sdkWithIpfs.createCollection({
        name: 'Caster Agents',
        description: 'Main collection',
      });

      expect(mockIpfsClient.addJson).toHaveBeenCalled();
      expect(result.cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
      expect(result.uri).toBe('ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
      expect(result.pointer).toMatch(/^c1:b[a-z2-7]+$/);
      expect((result.pointer || '').length).toBeLessThanOrEqual(128);
    });

    it('createCollection(name, uri) legacy on-chain flow should call tx builder', async () => {
      await signerSdk.createCollection('Legacy Collection', 'ipfs://legacy-uri');
      expect(mockIdentityTxBuilder.createCollection).toHaveBeenCalledWith(
        'Legacy Collection',
        'ipfs://legacy-uri',
        undefined
      );
    });

    it('createCollection(data) should require ipfsClient for upload', async () => {
      await expect(
        signerSdk.createCollection({ name: 'No IPFS' })
      ).rejects.toThrow('ipfsClient is required');
    });
  });

  describe('write methods - read-only checks', () => {
    it('createCollection should throw without signer', async () => {
      await expect(sdk.createCollection('name', 'uri')).rejects.toThrow('read-only');
    });

    it('updateCollectionUri should throw without signer', async () => {
      await expect(sdk.updateCollectionUri(PublicKey.unique(), 'uri')).rejects.toThrow('read-only');
    });

    it('registerAgent should throw without signer', async () => {
      await expect(sdk.registerAgent('ipfs://test')).rejects.toThrow('read-only');
    });

    it('setAgentUri should throw without signer', async () => {
      await expect(sdk.setAgentUri(PublicKey.unique(), PublicKey.unique(), 'uri')).rejects.toThrow('read-only');
    });

    it('setAgentUri (base collection auto) should throw without signer', async () => {
      await expect(sdk.setAgentUri(PublicKey.unique(), 'uri')).rejects.toThrow('read-only');
    });

    it('enableAtom should throw without signer', async () => {
      await expect(sdk.enableAtom(PublicKey.unique())).rejects.toThrow('read-only');
    });

    it('setMetadata should throw without signer', async () => {
      await expect(sdk.setMetadata(PublicKey.unique(), 'key', 'val')).rejects.toThrow('read-only');
    });

    it('deleteMetadata should throw without signer', async () => {
      await expect(sdk.deleteMetadata(PublicKey.unique(), 'key')).rejects.toThrow('read-only');
    });

    it('giveFeedback should throw without signer', async () => {
      await expect(sdk.giveFeedback(PublicKey.unique(), { value: '1', feedbackUri: 'ipfs://x' })).rejects.toThrow('read-only');
    });

    it('revokeFeedback should throw without signer', async () => {
      await expect(sdk.revokeFeedback(PublicKey.unique(), 0, Buffer.alloc(32))).rejects.toThrow('read-only');
    });

    it('appendResponse should throw without signer', async () => {
      await expect(sdk.appendResponse(
        PublicKey.unique(), PublicKey.unique(), 0, Buffer.alloc(32), 'ipfs://r'
      )).rejects.toThrow('read-only');
    });
  });

  describe('write methods - with skipSend', () => {
    it('createCollection should allow skipSend without signer', async () => {
      await sdk.createCollection('name', 'uri', { skipSend: true, signer: PublicKey.unique() });
      expect(mockIdentityTxBuilder.createCollection).toHaveBeenCalled();
    });

    it('registerAgent should allow skipSend', async () => {
      await sdk.registerAgent('ipfs://test', undefined, {
        skipSend: true,
        signer: PublicKey.unique(),
        assetPubkey: PublicKey.unique(),
      });
      expect(mockIdentityTxBuilder.registerAgent).toHaveBeenCalled();
    });

    it('registerAgent should skip pointer attach in skipSend mode', async () => {
      await sdk.registerAgent('ipfs://test', undefined, {
        skipSend: true,
        signer: PublicKey.unique(),
        assetPubkey: PublicKey.unique(),
        collectionPointer: 'c1:abc123',
      });

      expect(mockIdentityTxBuilder.setCollectionPointer).not.toHaveBeenCalled();
      expect(mockIdentityTxBuilder.setCollectionPointerWithOptions).not.toHaveBeenCalled();
    });

    it('giveFeedback should allow skipSend', async () => {
      await sdk.giveFeedback(
        PublicKey.unique(),
        { value: '100', feedbackUri: 'ipfs://x' },
        { skipSend: true, signer: PublicKey.unique() }
      );
      expect(mockReputationTxBuilder.giveFeedback).toHaveBeenCalled();
    });

    it('revokeFeedback should convert number to bigint', async () => {
      await sdk.revokeFeedback(
        PublicKey.unique(), 5, Buffer.alloc(32),
        { skipSend: true, signer: PublicKey.unique(), verifyFeedbackClient: false }
      );
      expect(mockReputationTxBuilder.revokeFeedback).toHaveBeenCalledWith(
        expect.any(PublicKey), 5n, expect.any(Buffer), expect.anything()
      );
    });

    it('revokeFeedback should auto-resolve sealHash when omitted', async () => {
      const asset = PublicKey.unique();
      const signer = PublicKey.unique();
      const sealHash = Buffer.alloc(32, 0x11);
      mockFeedbackManager.readFeedback.mockResolvedValueOnce({ sealHash });

      await sdk.revokeFeedback(
        asset, 9,
        undefined,
        { skipSend: true, signer }
      );

      expect(mockFeedbackManager.readFeedback).toHaveBeenCalledWith(asset, signer, 9n);
      expect(mockReputationTxBuilder.revokeFeedback).toHaveBeenCalledWith(
        asset, 9n, sealHash, expect.anything()
      );
    });

    it('revokeFeedback should fail preflight when feedback is missing for signer', async () => {
      const asset = PublicKey.unique();
      const signer = PublicKey.unique();
      mockFeedbackManager.readFeedback.mockResolvedValueOnce(null);
      const waitSpy = jest.spyOn(sdk as any, 'waitForIndexerSync').mockResolvedValue(false);

      await expect(
        sdk.revokeFeedback(
          asset, 9,
          undefined,
          { skipSend: true, signer }
        )
      ).rejects.toThrow('Refusing revoke preflight');

      waitSpy.mockRestore();
      expect(mockReputationTxBuilder.revokeFeedback).not.toHaveBeenCalledWith(
        asset, 9n, expect.anything(), expect.anything()
      );
    });

    it('revokeFeedback should fail preflight when feedback already revoked', async () => {
      const asset = PublicKey.unique();
      const signer = PublicKey.unique();
      mockFeedbackManager.readFeedback.mockResolvedValueOnce({
        sealHash: Buffer.alloc(32, 0x55),
        isRevoked: true,
        revoked: true,
      });

      await expect(
        sdk.revokeFeedback(
          asset,
          4,
          undefined,
          { skipSend: true, signer }
        )
      ).rejects.toThrow('already revoked');
      expect(mockReputationTxBuilder.revokeFeedback).not.toHaveBeenCalled();
    });

    it('revokeFeedback should reject explicit sealHash mismatch with indexed feedback', async () => {
      const asset = PublicKey.unique();
      const signer = PublicKey.unique();
      const indexedSeal = Buffer.alloc(32, 0xaa);
      mockFeedbackManager.readFeedback.mockResolvedValueOnce({
        sealHash: indexedSeal,
        isRevoked: false,
        revoked: false,
      });

      await expect(
        sdk.revokeFeedback(
          asset,
          4,
          Buffer.alloc(32, 0xbb),
          { skipSend: true, signer }
        )
      ).rejects.toThrow('does not match indexed feedback');
      expect(mockReputationTxBuilder.revokeFeedback).not.toHaveBeenCalled();
    });

    it('appendResponse should convert number to bigint', async () => {
      await sdk.appendResponse(
        PublicKey.unique(), PublicKey.unique(), 3, Buffer.alloc(32), 'ipfs://r',
        undefined,
        { skipSend: true, signer: PublicKey.unique() }
      );
      expect(mockReputationTxBuilder.appendResponse).toHaveBeenCalledWith(
        expect.any(PublicKey), expect.any(PublicKey), 3n,
        expect.any(Buffer), 'ipfs://r', undefined, expect.anything()
      );
    });

    it('appendResponse should auto-resolve sealHash when omitted', async () => {
      const asset = PublicKey.unique();
      const client = PublicKey.unique();
      const signer = PublicKey.unique();
      const sealHash = Buffer.alloc(32, 0x22);
      mockFeedbackManager.readFeedback.mockResolvedValueOnce({ sealHash });

      await sdk.appendResponse(
        asset, client, 4, 'ipfs://r',
        undefined,
        { skipSend: true, signer }
      );

      expect(mockFeedbackManager.readFeedback).toHaveBeenCalledWith(asset, client, 4n);
      expect(mockReputationTxBuilder.appendResponse).toHaveBeenCalledWith(
        asset, client, 4n, sealHash, 'ipfs://r', undefined, expect.anything()
      );
    });

    it('appendResponse should reject explicit sealHash mismatch with indexed feedback when available', async () => {
      const asset = PublicKey.unique();
      const client = PublicKey.unique();
      const signer = PublicKey.unique();
      const indexedSeal = Buffer.alloc(32, 0xaa);
      const providedSeal = Buffer.alloc(32, 0xbb);
      mockFeedbackManager.readFeedback.mockResolvedValueOnce({ sealHash: indexedSeal });

      await expect(
        sdk.appendResponse(
          asset,
          client,
          4,
          providedSeal,
          'ipfs://r',
          undefined,
          { skipSend: true, signer }
        )
      ).rejects.toThrow('does not match indexed feedback');

      expect(mockReputationTxBuilder.appendResponse).not.toHaveBeenCalled();
    });

    it('appendResponse should fail when sealHash omitted and not yet indexed', async () => {
      const asset = PublicKey.unique();
      const client = PublicKey.unique();
      mockFeedbackManager.readFeedback.mockResolvedValue(null);
      const waitSpy = jest.spyOn(sdk as any, 'waitForIndexerSync').mockResolvedValue(false);

      await expect(
        sdk.appendResponse(
          asset, client, 4, 'ipfs://r',
          undefined,
          { skipSend: true, signer: PublicKey.unique() }
        )
      ).rejects.toThrow('not indexed yet');

      waitSpy.mockRestore();
    });

    it('appendResponseBySealHash should auto-resolve feedbackIndex from indexer', async () => {
      const asset = PublicKey.unique();
      const client = PublicKey.unique();
      const signer = PublicKey.unique();
      const sealHash = Buffer.alloc(32, 0x33);
      mockIndexerClient.getFeedbacksByClient.mockResolvedValueOnce([
        {
          asset: asset.toBase58(),
          client_address: client.toBase58(),
          feedbackIndex: 7,
          feedback_index: '7',
          feedback_hash: sealHash.toString('hex'),
        },
      ]);

      await sdk.appendResponseBySealHash(
        asset,
        client,
        sealHash,
        'ipfs://response',
        undefined,
        { skipSend: true, signer }
      );

      expect(mockReputationTxBuilder.appendResponse).toHaveBeenCalledWith(
        asset,
        client,
        7n,
        sealHash,
        'ipfs://response',
        undefined,
        expect.anything()
      );
    });

    it('appendResponseBySealHash should resolve via asset-level fallback when client query misses', async () => {
      const asset = PublicKey.unique();
      const client = PublicKey.unique();
      const signer = PublicKey.unique();
      const sealHash = Buffer.alloc(32, 0x35);
      mockIndexerClient.getFeedbacksByClient.mockResolvedValueOnce([]);
      mockIndexerClient.getFeedbacks.mockResolvedValueOnce([
        {
          asset: asset.toBase58(),
          client_address: client.toBase58(),
          feedbackIndex: 9,
          feedback_index: '9',
          feedback_hash: sealHash.toString('hex'),
        },
      ]);

      await sdk.appendResponseBySealHash(
        asset,
        client,
        sealHash,
        'ipfs://response-fallback',
        undefined,
        { skipSend: true, signer }
      );

      expect(mockReputationTxBuilder.appendResponse).toHaveBeenCalledWith(
        asset,
        client,
        9n,
        sealHash,
        'ipfs://response-fallback',
        undefined,
        expect.anything()
      );
    });

    it('appendResponseBySealHash should fail when indexer cannot resolve feedback index', async () => {
      const asset = PublicKey.unique();
      const client = PublicKey.unique();
      const signer = PublicKey.unique();
      const sealHash = Buffer.alloc(32, 0x44);
      mockIndexerClient.getFeedbacksByClient.mockResolvedValueOnce([]);
      mockIndexerClient.getFeedbacks.mockResolvedValueOnce([]);
      const waitSpy = jest.spyOn(sdk as any, 'waitForIndexerSync').mockResolvedValue(false);

      await expect(
        sdk.appendResponseBySealHash(
          asset,
          client,
          sealHash,
          'ipfs://response',
          undefined,
          { skipSend: true, signer }
        )
      ).rejects.toThrow('could not be resolved from sealHash');

      waitSpy.mockRestore();
    });
  });

  describe('write methods - with signer', () => {
    it('registerAgent should delegate to identityTxBuilder with atomEnabled=false by default', async () => {
      await signerSdk.registerAgent('ipfs://test');
      expect(mockIdentityTxBuilder.registerAgent).toHaveBeenCalledWith(
        'ipfs://test',
        undefined,
        expect.objectContaining({ atomEnabled: false })
      );
    });

    it('registerAgent should auto-initialize ATOM on success', async () => {
      mockIdentityTxBuilder.registerAgent.mockResolvedValueOnce({
        signature: 'sig1',
        success: true,
        asset: PublicKey.unique(),
      });
      mockAtomTxBuilder.initializeStats.mockResolvedValueOnce({
        signature: 'sig2',
        success: true,
      });

      const result = await signerSdk.registerAgent('ipfs://test', undefined, { atomEnabled: true });
      expect(mockAtomTxBuilder.initializeStats).toHaveBeenCalled();
      if ('signatures' in result) {
        expect(result.signatures).toHaveLength(2);
      }
    });

    it('registerAgent should attach collection pointer with default lock=true', async () => {
      const asset = PublicKey.unique();
      mockIdentityTxBuilder.registerAgent.mockResolvedValueOnce({
        signature: 'sig1',
        success: true,
        asset,
      });
      mockAtomTxBuilder.initializeStats.mockResolvedValueOnce({
        signature: 'sig2',
        success: true,
      });
      mockIdentityTxBuilder.setCollectionPointer.mockResolvedValueOnce({
        signature: 'sig3',
        success: true,
      });

      const result = await signerSdk.registerAgent('ipfs://test', undefined, {
        atomEnabled: true,
        collectionPointer: 'c1:abc123',
      });

      expect(mockIdentityTxBuilder.setCollectionPointer).toHaveBeenCalledWith(
        asset,
        'c1:abc123',
        undefined
      );
      expect(mockIdentityTxBuilder.setCollectionPointerWithOptions).not.toHaveBeenCalled();
      if ('signatures' in result) {
        expect(result.signatures).toEqual(['sig1', 'sig2', 'sig3']);
      }
    });

    it('registerAgent should attach collection pointer with lock override', async () => {
      const asset = PublicKey.unique();
      mockIdentityTxBuilder.registerAgent.mockResolvedValueOnce({
        signature: 'sig1',
        success: true,
        asset,
      });
      mockIdentityTxBuilder.setCollectionPointerWithOptions.mockResolvedValueOnce({
        signature: 'sig3',
        success: true,
      });

      await signerSdk.registerAgent('ipfs://test', undefined, {
        atomEnabled: false,
        collectionPointer: 'c1:abc123',
        collectionLock: false,
      });

      expect(mockIdentityTxBuilder.setCollectionPointerWithOptions).toHaveBeenCalledWith(
        asset,
        'c1:abc123',
        false,
        undefined
      );
    });

    it('registerAgent should validate collection pointer before register', async () => {
      await expect(
        signerSdk.registerAgent('ipfs://test', undefined, {
          collectionPointer: 'bad-pointer',
        })
      ).rejects.toThrow('c1:');
      expect(mockIdentityTxBuilder.registerAgent).not.toHaveBeenCalled();
    });

    it('registerAgent should validate collectionLock type before register', async () => {
      await expect(
        signerSdk.registerAgent('ipfs://test', undefined, {
          collectionPointer: 'c1:abc123',
          collectionLock: 'true' as any,
        })
      ).rejects.toThrow('collectionLock must be a boolean');
      expect(mockIdentityTxBuilder.registerAgent).not.toHaveBeenCalled();
    });

    it('registerAgent should not init ATOM when atomEnabled=false', async () => {
      mockIdentityTxBuilder.registerAgent.mockResolvedValueOnce({
        signature: 'sig1',
        success: true,
        asset: PublicKey.unique(),
      });

      await signerSdk.registerAgent('ipfs://test', undefined, { atomEnabled: false });
      expect(mockAtomTxBuilder.initializeStats).not.toHaveBeenCalled();
    });

    it('registerAgent should not init ATOM when atomEnabled is omitted', async () => {
      mockIdentityTxBuilder.registerAgent.mockResolvedValueOnce({
        signature: 'sig1',
        success: true,
        asset: PublicKey.unique(),
      });

      await signerSdk.registerAgent('ipfs://test');
      expect(mockAtomTxBuilder.initializeStats).not.toHaveBeenCalled();
    });

    it('registerAgent should still return success if ATOM init fails', async () => {
      mockIdentityTxBuilder.registerAgent.mockResolvedValueOnce({
        signature: 'sig1',
        success: true,
        asset: PublicKey.unique(),
      });
      mockAtomTxBuilder.initializeStats.mockResolvedValueOnce({
        signature: '',
        success: false,
        error: 'ATOM init failed',
      });

      const result = await signerSdk.registerAgent('ipfs://test', undefined, { atomEnabled: true });
      expect('success' in result && result.success).toBe(true);
    });

    it('setAgentUri should delegate to identityTxBuilder', async () => {
      await signerSdk.setAgentUri(PublicKey.unique(), PublicKey.unique(), 'ipfs://new');
      expect(mockIdentityTxBuilder.setAgentUri).toHaveBeenCalled();
    });

    it('setAgentUri should auto-resolve base collection when not provided', async () => {
      const asset = PublicKey.unique();
      await signerSdk.setAgentUri(asset, 'ipfs://auto');
      expect(mockIdentityTxBuilder.setAgentUri).toHaveBeenCalledWith(
        asset,
        mockBaseCollection,
        'ipfs://auto',
        undefined
      );
    });

    it('setAgentUri should throw when auto base collection is missing', async () => {
      const spy = jest.spyOn(signerSdk, 'getBaseCollection').mockResolvedValueOnce(null);
      await expect(
        signerSdk.setAgentUri(PublicKey.unique(), 'ipfs://auto')
      ).rejects.toThrow('Base collection not found');
      spy.mockRestore();
    });

    it('enableAtom should delegate to identityTxBuilder', async () => {
      await signerSdk.enableAtom(PublicKey.unique());
      expect(mockIdentityTxBuilder.enableAtom).toHaveBeenCalled();
    });

    it('setMetadata should delegate to identityTxBuilder', async () => {
      await signerSdk.setMetadata(PublicKey.unique(), 'key', 'value');
      expect(mockIdentityTxBuilder.setMetadata).toHaveBeenCalled();
    });

    it('deleteMetadata should delegate to identityTxBuilder', async () => {
      await signerSdk.deleteMetadata(PublicKey.unique(), 'key');
      expect(mockIdentityTxBuilder.deleteMetadata).toHaveBeenCalled();
    });

    it('giveFeedback should delegate to reputationTxBuilder', async () => {
      await signerSdk.giveFeedback(PublicKey.unique(), { value: '100', feedbackUri: 'ipfs://fb' });
      expect(mockReputationTxBuilder.giveFeedback).toHaveBeenCalled();
    });

    it('revokeFeedback should delegate to reputationTxBuilder', async () => {
      await signerSdk.revokeFeedback(PublicKey.unique(), 0n, Buffer.alloc(32), {
        verifyFeedbackClient: false,
      });
      expect(mockReputationTxBuilder.revokeFeedback).toHaveBeenCalled();
    });

    it('appendResponse should delegate to reputationTxBuilder', async () => {
      await signerSdk.appendResponse(
        PublicKey.unique(), PublicKey.unique(), 0n, Buffer.alloc(32), 'ipfs://r'
      );
      expect(mockReputationTxBuilder.appendResponse).toHaveBeenCalled();
    });

    it('updateCollectionUri should delegate to identityTxBuilder', async () => {
      await signerSdk.updateCollectionUri(PublicKey.unique(), 'ipfs://new');
      expect(mockIdentityTxBuilder.updateCollectionMetadata).toHaveBeenCalledWith(
        expect.any(PublicKey), null, 'ipfs://new', undefined
      );
    });

    it('transferAgent should delegate to identityTxBuilder', async () => {
      await signerSdk.transferAgent(PublicKey.unique(), PublicKey.unique(), PublicKey.unique());
      expect(mockIdentityTxBuilder.transferAgent).toHaveBeenCalled();
    });

    it('transferAgent should auto-resolve base collection when not provided', async () => {
      const asset = PublicKey.unique();
      const newOwner = PublicKey.unique();
      await signerSdk.transferAgent(asset, newOwner);
      expect(mockIdentityTxBuilder.transferAgent).toHaveBeenCalledWith(
        asset,
        mockBaseCollection,
        newOwner,
        undefined
      );
    });

    it('transferAgent should throw when auto base collection is missing', async () => {
      const spy = jest.spyOn(signerSdk, 'getBaseCollection').mockResolvedValueOnce(null);
      await expect(
        signerSdk.transferAgent(PublicKey.unique(), PublicKey.unique())
      ).rejects.toThrow('Base collection not found');
      spy.mockRestore();
    });

    it('syncOwner should delegate to identityTxBuilder', async () => {
      await signerSdk.syncOwner(PublicKey.unique());
      expect(mockIdentityTxBuilder.syncOwner).toHaveBeenCalled();
    });
  });

  // ==================== Static Methods ====================

  describe('computeHash', () => {
    it('should compute hash from string', async () => {
      const hash = await SolanaSDK.computeHash('test data');
      expect(hash.length).toBe(32);
    });

    it('should compute hash from Buffer', async () => {
      const hash = await SolanaSDK.computeHash(Buffer.from('test data'));
      expect(hash.length).toBe(32);
    });
  });

  // ==================== waitForIndexerSync ====================

  describe('waitForIndexerSync', () => {
    it('should return true immediately when check passes', async () => {
      const result = await sdk.waitForIndexerSync(
        async () => true,
        { timeout: 1000, initialDelay: 50 }
      );
      expect(result).toBe(true);
    });

    it('should return false on timeout', async () => {
      const result = await sdk.waitForIndexerSync(
        async () => false,
        { timeout: 100, initialDelay: 50 }
      );
      expect(result).toBe(false);
    });

    it('should retry on error', async () => {
      let callCount = 0;
      const result = await sdk.waitForIndexerSync(
        async () => {
          callCount++;
          if (callCount < 3) throw new Error('not ready');
          return true;
        },
        { timeout: 5000, initialDelay: 50 }
      );
      expect(result).toBe(true);
      expect(callCount).toBe(3);
    });
  });

  // ==================== getEnrichedSummary ====================

  describe('getEnrichedSummary', () => {
    it('should return null when agent not found', async () => {
      // loadAgent returns null, but getAtomStats and getBaseCollection also run in parallel
      // We need to mock all: getAccount (for loadAgent), getAccountInfo (for getAtomStats), and getBaseCollection
      mockSolanaClient.getAccount.mockResolvedValueOnce(null);
      const mockConn = mockSolanaClient.getConnection();
      jest.spyOn(mockConn, 'getAccountInfo').mockResolvedValueOnce(null);

      const result = await sdk.getEnrichedSummary(mockAssetKey);
      expect(result).toBeNull();
    });

    it('should return enriched summary with ATOM metrics', async () => {
      // Mock getAtomStats
      const mockConn = mockSolanaClient.getConnection();
      jest.spyOn(mockConn, 'getAccountInfo').mockResolvedValueOnce({
        data: Buffer.alloc(200),
        executable: false,
        lamports: 1000000,
        owner: PublicKey.default,
      } as any);

      const result = await sdk.getEnrichedSummary(mockAssetKey);
      if (result) {
        expect(result.asset).toEqual(mockAssetKey);
        expect(result.totalFeedbacks).toBe(10);
        expect(result.averageScore).toBe(75);
        expect(result.qualityScore).toBeDefined();
      }
    });
  });

  // ==================== Indexer Fallback Methods ====================

  describe('getAgentReputationFromIndexer', () => {
    it('should return from indexer when available', async () => {
      const mockRep = { asset: 'test', feedback_count: 5 };
      mockIndexerClient.getAgentReputation.mockResolvedValueOnce(mockRep);
      const result = await sdk.getAgentReputationFromIndexer(mockAssetKey);
      expect(result).toEqual(mockRep);
    });

    it('should fallback to on-chain when indexer fails', async () => {
      mockIndexerClient.getAgentReputation.mockRejectedValueOnce(new Error('indexer down'));
      const result = await sdk.getAgentReputationFromIndexer(mockAssetKey);
      // Falls back to on-chain: builds from loadAgent + getSummary
      expect(result).not.toBeNull();
    });

    it('should throw when noFallback and indexer fails', async () => {
      mockIndexerClient.getAgentReputation.mockRejectedValueOnce(new Error('indexer down'));
      await expect(
        sdk.getAgentReputationFromIndexer(mockAssetKey, { noFallback: true })
      ).rejects.toThrow('indexer down');
    });
  });

  describe('getFeedbacksFromIndexer', () => {
    it('should return from indexer', async () => {
      mockIndexerClient.getFeedbacks.mockResolvedValueOnce([{ score: 80 }]);
      const result = await sdk.getFeedbacksFromIndexer(mockAssetKey);
      expect(result).toHaveLength(1);
    });

    it('should fallback to on-chain', async () => {
      mockIndexerClient.getFeedbacks.mockRejectedValueOnce(new Error('indexer down'));
      await sdk.getFeedbacksFromIndexer(mockAssetKey);
      expect(mockFeedbackManager.readAllFeedback).toHaveBeenCalled();
    });

    it('should use on-chain path directly when useIndexer=false (no signer)', async () => {
      const noIndexerSdk = new SolanaSDK({
        useIndexer: false,
        indexerUrl: 'https://example.supabase.co/rest/v1',
        indexerApiKey: 'test-key',
      });

      await noIndexerSdk.getFeedbacksFromIndexer(mockAssetKey, { includeRevoked: true });

      expect(mockIndexerClient.getFeedbacks).not.toHaveBeenCalled();
      expect(mockFeedbackManager.readAllFeedback).toHaveBeenCalledWith(mockAssetKey, true);
    });

    it('should throw when useIndexer=false and noFallback=true', async () => {
      const noIndexerSdk = new SolanaSDK({
        useIndexer: false,
        indexerUrl: 'https://example.supabase.co/rest/v1',
        indexerApiKey: 'test-key',
      });

      await expect(
        noIndexerSdk.getFeedbacksFromIndexer(mockAssetKey, { noFallback: true })
      ).rejects.toThrow('Indexer not available for getFeedbacks');
      expect(mockFeedbackManager.readAllFeedback).not.toHaveBeenCalled();
    });
  });

  describe('withSmartRouting (private)', () => {
    it('should prefer on-chain for small queries', async () => {
      const onChainFn = jest.fn().mockResolvedValue('onchain');
      const indexerFn = jest.fn().mockResolvedValue('indexer');
      const result = await (sdk as any).withSmartRouting('getAgent', indexerFn, onChainFn);
      expect(result).toBe('onchain');
      expect(onChainFn).toHaveBeenCalled();
      expect(indexerFn).not.toHaveBeenCalled();
    });

    it('should fallback to indexer when small-query on-chain call fails', async () => {
      const onChainFn = jest.fn().mockRejectedValue(new Error('rpc down'));
      const indexerFn = jest.fn().mockResolvedValue('indexer');
      const result = await (sdk as any).withSmartRouting('getAgent', indexerFn, onChainFn);
      expect(result).toBe('indexer');
      expect(indexerFn).toHaveBeenCalled();
    });

    it('should route large queries through indexer path', async () => {
      const onChainFn = jest.fn().mockResolvedValue('onchain');
      const indexerFn = jest.fn().mockResolvedValue('indexer');
      const spy = jest.spyOn(sdk as any, 'isSmallQuery').mockReturnValue(false);
      const result = await (sdk as any).withSmartRouting('anyLargeOp', indexerFn, onChainFn);
      expect(result).toBe('indexer');
      expect(indexerFn).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // ==================== forceOnChain Mode ====================

  describe('forceOnChain mode', () => {
    let forcedSdk: InstanceType<typeof SolanaSDK>;

    beforeEach(() => {
      forcedSdk = new SolanaSDK({ forceOnChain: true });
    });

    it('should throw on searchAgents', async () => {
      await expect(forcedSdk.searchAgents({})).rejects.toThrow('requires indexer');
    });

    it('should throw on getLeaderboard', async () => {
      await expect(forcedSdk.getLeaderboard()).rejects.toThrow('requires indexer');
    });

    it('should throw on getGlobalStats', async () => {
      await expect(forcedSdk.getGlobalStats()).rejects.toThrow('requires indexer');
    });

    it('should throw on getFeedbacksByEndpoint', async () => {
      await expect(forcedSdk.getFeedbacksByEndpoint('/api')).rejects.toThrow('requires indexer');
    });

    it('should throw on getFeedbacksByTag', async () => {
      await expect(forcedSdk.getFeedbacksByTag('q')).rejects.toThrow('requires indexer');
    });

    it('should throw on getAgentByWallet', async () => {
      await expect(forcedSdk.getAgentByWallet('w')).rejects.toThrow('requires indexer');
    });

    it('should throw on getAgentByAgentId', async () => {
      await expect(forcedSdk.getAgentByAgentId(42)).rejects.toThrow('requires indexer');
    });

    it('should throw on getPendingValidations', async () => {
      await expect(forcedSdk.getPendingValidations('v')).rejects
        .toThrow('Validation feature is archived (v0.5.0+) and is not exposed by indexers.');
    });
  });

  // ==================== useIndexer=false Mode ====================

  describe('useIndexer=false mode', () => {
    it('should go direct to on-chain for getAgentReputationFromIndexer', async () => {
      const noIndexerSdk = new SolanaSDK({ useIndexer: false });
      const result = await noIndexerSdk.getAgentReputationFromIndexer(mockAssetKey);
      // Should NOT call indexer, should build from on-chain
      expect(result).not.toBeNull();
    });
  });
});
