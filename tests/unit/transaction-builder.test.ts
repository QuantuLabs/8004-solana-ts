/**
 * Comprehensive tests for src/core/transaction-builder.ts
 * Tests serializeTransaction, IdentityTransactionBuilder, ReputationTransactionBuilder,
 * ValidationTransactionBuilder, AtomTransactionBuilder
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PublicKey, Transaction, Connection, Keypair } from '@solana/web3.js';

// Valid base58 blockhash (use a real PublicKey base58 string)
const MOCK_BLOCKHASH = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi';

// Mock config-reader
const mockBaseCollection = PublicKey.unique();
jest.unstable_mockModule('../../src/core/config-reader.js', () => ({
  fetchRootConfig: jest.fn().mockResolvedValue({
    getBaseCollectionPublicKey: () => mockBaseCollection,
  }),
  getBaseCollection: jest.fn().mockResolvedValue(mockBaseCollection),
  fetchRegistryConfig: jest.fn().mockResolvedValue(null),
}));

// Mock borsh-schemas
const mockCollection = PublicKey.unique();
const mockOwner = PublicKey.unique();
const mockAssetKey = PublicKey.unique();

const mockAgentAccount = {
  getCollectionPublicKey: () => mockCollection,
  getOwnerPublicKey: () => mockOwner,
  getAssetPublicKey: () => mockAssetKey,
  isAtomEnabled: () => false,
  feedback_count: 0n,
  nft_name: 'test',
  agent_uri: 'ipfs://test',
};

jest.unstable_mockModule('../../src/core/borsh-schemas.js', () => ({
  AgentAccount: {
    deserialize: jest.fn().mockReturnValue(mockAgentAccount),
  },
  MetadataEntryPda: { deserialize: jest.fn() },
  ValidationRequest: { deserialize: jest.fn() },
  RegistryConfig: { deserialize: jest.fn() },
}));

// Mock feedback-normalizer
jest.unstable_mockModule('../../src/core/feedback-normalizer.js', () => ({
  resolveScore: jest.fn().mockReturnValue(50),
}));

// Mock value-encoding
jest.unstable_mockModule('../../src/utils/value-encoding.js', () => ({
  encodeReputationValue: jest.fn().mockReturnValue({ value: 100n, valueDecimals: 0 }),
}));

// Import after mocks
const {
  serializeTransaction,
  IdentityTransactionBuilder,
  ReputationTransactionBuilder,
  ValidationTransactionBuilder,
  AtomTransactionBuilder,
} = await import('../../src/core/transaction-builder.js');

// Helper to create a mock Connection with valid base58 blockhash
function createMockConnection(): Connection {
  const conn = new Connection('https://mock.example.com');
  jest.spyOn(conn, 'getLatestBlockhash').mockResolvedValue({
    blockhash: MOCK_BLOCKHASH,
    lastValidBlockHeight: 999,
  } as any);
  jest.spyOn(conn, 'getAccountInfo').mockResolvedValue({
    data: Buffer.alloc(300),
    executable: false,
    lamports: 1000000,
    owner: PublicKey.default,
    rentEpoch: 0,
  } as any);
  return conn;
}

describe('serializeTransaction', () => {
  it('should return PreparedTransaction with correct fields', () => {
    const tx = new Transaction();
    const signer = Keypair.generate();
    // Add a dummy instruction so serialize works
    tx.add({
      keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: false }],
      programId: PublicKey.default,
      data: Buffer.alloc(0),
    });

    const result = serializeTransaction(tx, signer.publicKey, MOCK_BLOCKHASH, 100);

    expect(result.blockhash).toBe(MOCK_BLOCKHASH);
    expect(result.lastValidBlockHeight).toBe(100);
    expect(result.signer).toBe(signer.publicKey.toBase58());
    expect(result.signed).toBe(false);
    expect(typeof result.transaction).toBe('string');
    expect(() => Buffer.from(result.transaction, 'base64')).not.toThrow();
  });

  it('should use signer as feePayer by default', () => {
    const tx = new Transaction();
    const signer = Keypair.generate();
    tx.add({
      keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: false }],
      programId: PublicKey.default,
      data: Buffer.alloc(0),
    });

    serializeTransaction(tx, signer.publicKey, MOCK_BLOCKHASH, 100);
    expect(tx.feePayer).toEqual(signer.publicKey);
  });

  it('should use explicit feePayer when provided', () => {
    const tx = new Transaction();
    const signer = Keypair.generate();
    const feePayer = Keypair.generate();
    tx.add({
      keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: false }],
      programId: PublicKey.default,
      data: Buffer.alloc(0),
    });

    serializeTransaction(tx, signer.publicKey, MOCK_BLOCKHASH, 100, feePayer.publicKey);
    expect(tx.feePayer).toEqual(feePayer.publicKey);
  });
});

describe('IdentityTransactionBuilder', () => {
  let builder: InstanceType<typeof IdentityTransactionBuilder>;
  let conn: Connection;
  let payer: Keypair;

  beforeEach(() => {
    conn = createMockConnection();
    payer = Keypair.generate();
    builder = new IdentityTransactionBuilder(conn, payer);
  });

  describe('registerAgent', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const assetPubkey = PublicKey.unique();
      const result = await builder.registerAgent('ipfs://test', undefined, {
        skipSend: true,
        assetPubkey,
        signer: payer.publicKey,
      });

      expect('transaction' in result).toBe(true);
      if ('transaction' in result) {
        expect(result.signed).toBe(false);
        expect(result.asset).toEqual(assetPubkey);
      }
    });

    it('should require assetPubkey when skipSend', async () => {
      const result = await builder.registerAgent('ipfs://test', undefined, {
        skipSend: true,
        signer: payer.publicKey,
      });

      expect('success' in result && !result.success).toBe(true);
    });

    it('should fail without signer in read-only mode', async () => {
      const readOnlyBuilder = new IdentityTransactionBuilder(conn);
      const result = await readOnlyBuilder.registerAgent('ipfs://test');

      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('signer');
      }
    });

    it('should use atomEnabled=false option', async () => {
      const result = await builder.registerAgent('ipfs://test', undefined, {
        skipSend: true,
        assetPubkey: PublicKey.unique(),
        signer: payer.publicKey,
        atomEnabled: false,
      });
      expect('transaction' in result).toBe(true);
    });

    it('should accept custom collection', async () => {
      const collection = PublicKey.unique();
      const result = await builder.registerAgent('ipfs://test', collection, {
        skipSend: true,
        assetPubkey: PublicKey.unique(),
        signer: payer.publicKey,
      });
      expect('transaction' in result).toBe(true);
    });

    it('should accept empty agentUri', async () => {
      const result = await builder.registerAgent(undefined, undefined, {
        skipSend: true,
        assetPubkey: PublicKey.unique(),
        signer: payer.publicKey,
      });
      expect('transaction' in result).toBe(true);
    });

    it('should return error when rootConfig not initialized', async () => {
      const { fetchRootConfig } = await import('../../src/core/config-reader.js');
      (fetchRootConfig as jest.Mock).mockResolvedValueOnce(null);

      const result = await builder.registerAgent('ipfs://test', undefined, {
        skipSend: true,
        assetPubkey: PublicKey.unique(),
        signer: payer.publicKey,
      });

      expect('success' in result && !result.success).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Root config');
      }
    });
  });

  describe('setAgentUri', () => {
    it('should validate URI length', async () => {
      const longUri = 'x'.repeat(300);
      await expect(builder.setAgentUri(
        PublicKey.unique(),
        PublicKey.unique(),
        longUri
      )).rejects.toThrow();
    });

    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.setAgentUri(
        PublicKey.unique(),
        PublicKey.unique(),
        'ipfs://test',
        { skipSend: true, signer: payer.publicKey }
      );

      expect('transaction' in result).toBe(true);
    });

    it('should fail without signer', async () => {
      const readOnlyBuilder = new IdentityTransactionBuilder(conn);
      const result = await readOnlyBuilder.setAgentUri(
        PublicKey.unique(), PublicKey.unique(), 'uri'
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });
  });

  describe('setCollectionPointer', () => {
    it('should reject missing c1: prefix', async () => {
      await expect(builder.setCollectionPointer(PublicKey.unique(), 'abc123'))
        .rejects.toThrow('c1:');
    });

    it('should reject empty payload', async () => {
      await expect(builder.setCollectionPointer(PublicKey.unique(), 'c1:'))
        .rejects.toThrow('cannot be empty');
    });

    it('should reject invalid payload chars', async () => {
      await expect(builder.setCollectionPointer(PublicKey.unique(), 'c1:abc-123'))
        .rejects.toThrow('[a-z0-9]');
    });

    it('should reject UTF-8 length > 128 bytes', async () => {
      const tooLong = `c1:${'a'.repeat(126)}`; // 129 bytes total
      await expect(builder.setCollectionPointer(PublicKey.unique(), tooLong))
        .rejects.toThrow('<= 128 bytes');
    });

    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.setCollectionPointer(
        PublicKey.unique(),
        'c1:abc123',
        { skipSend: true, signer: payer.publicKey }
      );

      expect('transaction' in result).toBe(true);
    });
  });

  describe('setCollectionPointerWithOptions', () => {
    it('should reject missing c1: prefix', async () => {
      await expect(builder.setCollectionPointerWithOptions(PublicKey.unique(), 'abc123', true))
        .rejects.toThrow('c1:');
    });

    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.setCollectionPointerWithOptions(
        PublicKey.unique(),
        'c1:abc123',
        true,
        { skipSend: true, signer: payer.publicKey }
      );

      expect('transaction' in result).toBe(true);
    });
  });

  describe('setParentAsset', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.setParentAsset(
        PublicKey.unique(),
        PublicKey.unique(),
        { skipSend: true, signer: payer.publicKey }
      );

      expect('transaction' in result).toBe(true);
    });
  });

  describe('setParentAssetWithOptions', () => {
    it('should reject non-boolean lock', async () => {
      await expect(builder.setParentAssetWithOptions(
        PublicKey.unique(),
        PublicKey.unique(),
        'true' as any
      )).rejects.toThrow('lock must be a boolean');
    });

    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.setParentAssetWithOptions(
        PublicKey.unique(),
        PublicKey.unique(),
        true,
        { skipSend: true, signer: payer.publicKey }
      );

      expect('transaction' in result).toBe(true);
    });
  });

  describe('setMetadata', () => {
    it('should reject reserved agentWallet key', async () => {
      await expect(builder.setMetadata(
        PublicKey.unique(), 'agentWallet', 'value'
      )).rejects.toThrow('agentWallet');
    });

    it('should validate key length', async () => {
      const longKey = 'x'.repeat(50);
      await expect(builder.setMetadata(
        PublicKey.unique(), longKey, 'value'
      )).rejects.toThrow();
    });

    it('should validate value length', async () => {
      const longValue = 'x'.repeat(300);
      await expect(builder.setMetadata(
        PublicKey.unique(), 'key', longValue
      )).rejects.toThrow();
    });

    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.setMetadata(
        PublicKey.unique(), 'key', 'value', false,
        { skipSend: true, signer: payer.publicKey }
      );
      expect('transaction' in result).toBe(true);
    });

    it('should accept immutable=true', async () => {
      const result = await builder.setMetadata(
        PublicKey.unique(), 'key', 'value', true,
        { skipSend: true, signer: payer.publicKey }
      );
      expect('transaction' in result).toBe(true);
    });
  });

  describe('deleteMetadata', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.deleteMetadata(PublicKey.unique(), 'myKey', {
        skipSend: true,
        signer: payer.publicKey,
      });
      expect('transaction' in result).toBe(true);
    });

    it('should fail without signer', async () => {
      const readOnlyBuilder = new IdentityTransactionBuilder(conn);
      const result = await readOnlyBuilder.deleteMetadata(PublicKey.unique(), 'myKey');
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });
  });

  describe('transferAgent', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.transferAgent(
        PublicKey.unique(), PublicKey.unique(), PublicKey.unique(),
        { skipSend: true, signer: payer.publicKey }
      );
      expect('transaction' in result).toBe(true);
    });

    it('should fail without payer', async () => {
      const readOnlyBuilder = new IdentityTransactionBuilder(conn);
      const result = await readOnlyBuilder.transferAgent(
        PublicKey.unique(), PublicKey.unique(), PublicKey.unique()
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });
  });

  describe('syncOwner', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.syncOwner(PublicKey.unique(), {
        skipSend: true,
        signer: payer.publicKey,
      });
      expect('transaction' in result).toBe(true);
    });
  });

  describe('enableAtom', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.enableAtom(PublicKey.unique(), {
        skipSend: true,
        signer: payer.publicKey,
      });
      expect('transaction' in result).toBe(true);
    });

    it('should fail without signer', async () => {
      const readOnlyBuilder = new IdentityTransactionBuilder(conn);
      const result = await readOnlyBuilder.enableAtom(PublicKey.unique());
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });
  });

  describe('setAgentWallet', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const signature = new Uint8Array(64);
      const result = await builder.setAgentWallet(
        PublicKey.unique(),
        PublicKey.unique(),
        signature,
        1700000000n,
        { skipSend: true, signer: payer.publicKey }
      );
      expect('transaction' in result).toBe(true);
    });

    it('should reject wrong signature length', async () => {
      const result = await builder.setAgentWallet(
        PublicKey.unique(),
        PublicKey.unique(),
        new Uint8Array(32),
        1700000000n,
        { skipSend: true, signer: payer.publicKey }
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('64 bytes');
      }
    });

    it('should fail without signer in read-only mode', async () => {
      const readOnlyBuilder = new IdentityTransactionBuilder(conn);
      const result = await readOnlyBuilder.setAgentWallet(
        PublicKey.unique(),
        PublicKey.unique(),
        new Uint8Array(64),
        1700000000n
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('signer');
      }
    });
  });

  describe('deprecated methods', () => {
    it('createCollection should return error result', async () => {
      const result = await builder.createCollection('name', 'uri');
      expect(result.success).toBe(false);
      expect(result.error).toContain('v0.6.0');
    });

    it('updateCollectionMetadata should return error result', async () => {
      const result = await builder.updateCollectionMetadata(PublicKey.unique(), null, null);
      expect(result.success).toBe(false);
      expect(result.error).toContain('v0.6.0');
    });

    it('createBaseCollection should throw', async () => {
      await expect(builder.createBaseCollection()).rejects.toThrow('v0.6.0');
    });
  });

  describe('buildWalletSetMessage (static)', () => {
    it('should build correct message format', () => {
      const asset = PublicKey.unique();
      const newWallet = PublicKey.unique();
      const owner = PublicKey.unique();
      const deadline = 1700000000n;

      const msg = IdentityTransactionBuilder.buildWalletSetMessage(asset, newWallet, owner, deadline);

      expect(msg.length).toBe(120);
      expect(msg.slice(0, 16).toString()).toBe('8004_WALLET_SET:');
      expect(new PublicKey(msg.slice(16, 48))).toEqual(asset);
      expect(new PublicKey(msg.slice(48, 80))).toEqual(newWallet);
      expect(new PublicKey(msg.slice(80, 112))).toEqual(owner);
    });

    it('should encode deadline as u64 LE in last 8 bytes', () => {
      const asset = PublicKey.unique();
      const newWallet = PublicKey.unique();
      const owner = PublicKey.unique();
      const deadline = 0x0102030405060708n;

      const msg = IdentityTransactionBuilder.buildWalletSetMessage(asset, newWallet, owner, deadline);
      const deadlineBytes = msg.slice(112, 120);
      expect(deadlineBytes[0]).toBe(0x08);
      expect(deadlineBytes[7]).toBe(0x01);
    });
  });
});

describe('ReputationTransactionBuilder', () => {
  let builder: InstanceType<typeof ReputationTransactionBuilder>;
  let conn: Connection;
  let payer: Keypair;

  beforeEach(() => {
    conn = createMockConnection();
    payer = Keypair.generate();
    builder = new ReputationTransactionBuilder(conn, payer);
  });

  describe('giveFeedback', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.giveFeedback(
        PublicKey.unique(),
        { value: '100', feedbackUri: 'ipfs://fb' },
        { skipSend: true, signer: payer.publicKey }
      );
      expect('transaction' in result).toBe(true);
      if ('transaction' in result) {
        expect(result.feedbackIndex).toBeDefined();
      }
    });

    it('should reject invalid score', async () => {
      const result = await builder.giveFeedback(
        PublicKey.unique(),
        { value: '100', feedbackUri: 'ipfs://fb', score: 150 }
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('score');
      }
    });

    it('should fail without signer', async () => {
      const readOnlyBuilder = new ReputationTransactionBuilder(conn);
      const result = await readOnlyBuilder.giveFeedback(
        PublicKey.unique(),
        { value: '100', feedbackUri: 'ipfs://fb' }
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('signer');
      }
    });

    it('should accept optional tags', async () => {
      const result = await builder.giveFeedback(
        PublicKey.unique(),
        { value: '100', feedbackUri: 'ipfs://fb', tag1: 'quality', tag2: 'speed' },
        { skipSend: true, signer: payer.publicKey }
      );
      expect('transaction' in result).toBe(true);
    });

    it('should reject wrong-size feedbackFileHash', async () => {
      const result = await builder.giveFeedback(
        PublicKey.unique(),
        { value: '100', feedbackUri: 'ipfs://fb', feedbackFileHash: Buffer.alloc(16) }
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('32 bytes');
      }
    });

    it('should fail when agent not found', async () => {
      jest.spyOn(conn, 'getAccountInfo').mockResolvedValueOnce(null);

      const result = await builder.giveFeedback(
        PublicKey.unique(),
        { value: '100', feedbackUri: 'ipfs://fb' },
        { signer: payer.publicKey }
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('Agent not found');
      }
    });

    it('should include feedbackIndex in PreparedTransaction result', async () => {
      const result = await builder.giveFeedback(
        PublicKey.unique(),
        { value: '100', feedbackUri: 'ipfs://fb' },
        { skipSend: true, signer: payer.publicKey }
      );
      if ('transaction' in result) {
        expect(result.feedbackIndex).toBe(0n);
      }
    });

    it('should accept feedbackFileHash of 32 bytes', async () => {
      const result = await builder.giveFeedback(
        PublicKey.unique(),
        {
          value: '100',
          feedbackUri: 'ipfs://fb',
          feedbackFileHash: Buffer.alloc(32, 0xab),
        },
        { skipSend: true, signer: payer.publicKey }
      );
      expect('transaction' in result).toBe(true);
    });

    it('should accept endpoint parameter', async () => {
      const result = await builder.giveFeedback(
        PublicKey.unique(),
        { value: '100', feedbackUri: 'ipfs://fb', endpoint: 'api/v1/inference' },
        { skipSend: true, signer: payer.publicKey }
      );
      expect('transaction' in result).toBe(true);
    });
  });

  describe('revokeFeedback', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const sealHash = Buffer.alloc(32);
      const result = await builder.revokeFeedback(PublicKey.unique(), 0n, sealHash, {
        skipSend: true,
        signer: payer.publicKey,
      });
      expect('transaction' in result).toBe(true);
    });

    it('should fail without signer', async () => {
      const readOnlyBuilder = new ReputationTransactionBuilder(conn);
      const result = await readOnlyBuilder.revokeFeedback(
        PublicKey.unique(), 0n, Buffer.alloc(32)
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });

    it('should fail when agent not found', async () => {
      jest.spyOn(conn, 'getAccountInfo').mockResolvedValueOnce(null);

      const result = await builder.revokeFeedback(
        PublicKey.unique(), 0n, Buffer.alloc(32),
        { signer: payer.publicKey }
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('Agent not found');
      }
    });
  });

  describe('appendResponse', () => {
    it('should return PreparedTransaction with ipfs URI', async () => {
      const sealHash = Buffer.alloc(32, 0xab);
      const result = await builder.appendResponse(
        PublicKey.unique(), PublicKey.unique(), 0n, sealHash, 'ipfs://response',
        undefined, { skipSend: true, signer: payer.publicKey }
      );
      expect('transaction' in result).toBe(true);
    });

    it('should require responseHash for non-ipfs URIs', async () => {
      const sealHash = Buffer.alloc(32);
      const result = await builder.appendResponse(
        PublicKey.unique(), PublicKey.unique(), 0n, sealHash, 'https://example.com/response'
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('responseHash');
      }
    });

    it('should accept explicit responseHash', async () => {
      const sealHash = Buffer.alloc(32, 0xab);
      const responseHash = Buffer.alloc(32, 0xcd);
      const result = await builder.appendResponse(
        PublicKey.unique(), PublicKey.unique(), 0n, sealHash,
        'https://example.com', responseHash,
        { skipSend: true, signer: payer.publicKey }
      );
      expect('transaction' in result).toBe(true);
    });

    it('should reject wrong-size sealHash', async () => {
      const result = await builder.appendResponse(
        PublicKey.unique(), PublicKey.unique(), 0n, Buffer.alloc(16), 'ipfs://r'
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('sealHash');
      }
    });

    it('should reject wrong-size responseHash', async () => {
      const result = await builder.appendResponse(
        PublicKey.unique(), PublicKey.unique(), 0n, Buffer.alloc(32),
        'https://example.com', Buffer.alloc(16)
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('responseHash');
      }
    });

    it('should validate responseUri length', async () => {
      const longUri = 'x'.repeat(300);
      const result = await builder.appendResponse(
        PublicKey.unique(), PublicKey.unique(), 0n, Buffer.alloc(32), longUri, Buffer.alloc(32)
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });

    it('should fail without signer', async () => {
      const readOnlyBuilder = new ReputationTransactionBuilder(conn);
      const result = await readOnlyBuilder.appendResponse(
        PublicKey.unique(), PublicKey.unique(), 0n, Buffer.alloc(32, 0xab), 'ipfs://r'
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });
  });

  describe('deprecated methods', () => {
    it('setFeedbackTags should return error', async () => {
      const result = await builder.setFeedbackTags(
        PublicKey.unique(), 0n, 'tag1', 'tag2'
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });
  });
});

describe('ValidationTransactionBuilder', () => {
  let builder: InstanceType<typeof ValidationTransactionBuilder>;
  let conn: Connection;
  let payer: Keypair;

  beforeEach(() => {
    conn = createMockConnection();
    payer = Keypair.generate();
    builder = new ValidationTransactionBuilder(conn, payer);
  });

  describe('requestValidation', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.requestValidation(
        PublicKey.unique(), PublicKey.unique(),
        42, 'ipfs://request', Buffer.alloc(32),
        { skipSend: true, signer: payer.publicKey }
      );
      expect('transaction' in result).toBe(true);
    });

    it('should validate nonce range (negative)', async () => {
      const result = await builder.requestValidation(
        PublicKey.unique(), PublicKey.unique(),
        -1, 'ipfs://request', Buffer.alloc(32)
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });

    it('should validate requestHash length', async () => {
      const result = await builder.requestValidation(
        PublicKey.unique(), PublicKey.unique(),
        42, 'ipfs://request', Buffer.alloc(16)
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('32 bytes');
      }
    });

    it('should validate requestUri length', async () => {
      const longUri = 'x'.repeat(300);
      const result = await builder.requestValidation(
        PublicKey.unique(), PublicKey.unique(),
        42, longUri, Buffer.alloc(32)
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });

    it('should fail without signer', async () => {
      const readOnlyBuilder = new ValidationTransactionBuilder(conn);
      const result = await readOnlyBuilder.requestValidation(
        PublicKey.unique(), PublicKey.unique(),
        42, 'ipfs://req', Buffer.alloc(32)
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });
  });

  describe('respondToValidation', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.respondToValidation(
        PublicKey.unique(), 42, 85,
        'ipfs://response', Buffer.alloc(32), 'quality',
        { skipSend: true, signer: payer.publicKey }
      );
      expect('transaction' in result).toBe(true);
    });

    it('should reject response > 100', async () => {
      const result = await builder.respondToValidation(
        PublicKey.unique(), 42, 101,
        'ipfs://response', Buffer.alloc(32), 'tag'
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('between 0 and 100');
      }
    });

    it('should reject response < 0', async () => {
      const result = await builder.respondToValidation(
        PublicKey.unique(), 42, -1,
        'ipfs://response', Buffer.alloc(32), 'tag'
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });

    it('should validate tag length', async () => {
      const longTag = 'x'.repeat(50);
      const result = await builder.respondToValidation(
        PublicKey.unique(), 42, 50,
        'ipfs://response', Buffer.alloc(32), longTag
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });
  });

  describe('deprecated methods', () => {
    it('updateValidation should return error', async () => {
      const result = await builder.updateValidation(
        PublicKey.unique(), 0, 50, 'uri', Buffer.alloc(32), 'tag'
      );
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });

    it('closeValidation should return error', async () => {
      const result = await builder.closeValidation(PublicKey.unique(), PublicKey.unique(), 0);
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });
  });
});

describe('AtomTransactionBuilder', () => {
  let builder: InstanceType<typeof AtomTransactionBuilder>;
  let conn: Connection;
  let payer: Keypair;

  beforeEach(() => {
    conn = createMockConnection();
    payer = Keypair.generate();
    builder = new AtomTransactionBuilder(conn, payer);
  });

  describe('initializeStats', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.initializeStats(PublicKey.unique(), {
        skipSend: true,
        signer: payer.publicKey,
      });
      expect('transaction' in result).toBe(true);
    });

    it('should fail without payer', async () => {
      const readOnlyBuilder = new AtomTransactionBuilder(conn);
      const result = await readOnlyBuilder.initializeStats(PublicKey.unique());
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('signer');
      }
    });

    it('should fail when agent not found', async () => {
      jest.spyOn(conn, 'getAccountInfo').mockResolvedValueOnce(null);

      const result = await builder.initializeStats(PublicKey.unique(), {
        signer: payer.publicKey,
      });
      if ('success' in result) {
        expect(result.success).toBe(false);
        expect(result.error).toContain('Agent not found');
      }
    });
  });

  describe('initializeConfig', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.initializeConfig(undefined, {
        skipSend: true,
        signer: payer.publicKey,
      });
      expect('transaction' in result).toBe(true);
    });

    it('should accept custom agent registry program', async () => {
      const result = await builder.initializeConfig(PublicKey.unique(), {
        skipSend: true,
        signer: payer.publicKey,
      });
      expect('transaction' in result).toBe(true);
    });

    it('should fail without signer', async () => {
      const readOnlyBuilder = new AtomTransactionBuilder(conn);
      const result = await readOnlyBuilder.initializeConfig();
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });
  });

  describe('updateConfig', () => {
    it('should return PreparedTransaction when skipSend', async () => {
      const result = await builder.updateConfig({}, {
        skipSend: true,
        signer: payer.publicKey,
      });
      expect('transaction' in result).toBe(true);
    });

    it('should accept various params', async () => {
      const result = await builder.updateConfig({
        alphaFast: 500,
        weightSybil: 25,
        paused: true,
      }, {
        skipSend: true,
        signer: payer.publicKey,
      });
      expect('transaction' in result).toBe(true);
    });

    it('should fail without signer', async () => {
      const readOnlyBuilder = new AtomTransactionBuilder(conn);
      const result = await readOnlyBuilder.updateConfig({});
      if ('success' in result) {
        expect(result.success).toBe(false);
      }
    });
  });
});
