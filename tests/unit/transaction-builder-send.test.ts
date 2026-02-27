/**
 * Tests for transaction-builder.ts send-mode (non-skipSend) paths.
 * Covers: sendWithRetry, normal-mode branches for all builders.
 *
 * Strategy: We can't mock sendAndConfirmTransaction (ESM + huge module OOM).
 * Instead, we mock Connection.sendRawTransaction & Connection.confirmTransaction
 * which are what sendAndConfirmTransaction calls internally.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PublicKey, Connection, Keypair, TransactionExpiredBlockheightExceededError } from '@solana/web3.js';

const MOCK_BLOCKHASH = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi';
const MOCK_SIG = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU';

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
jest.unstable_mockModule('../../src/core/borsh-schemas.js', () => ({
  AgentAccount: {
    deserialize: jest.fn().mockReturnValue({
      getCollectionPublicKey: () => mockCollection,
      getOwnerPublicKey: () => PublicKey.unique(),
      getAssetPublicKey: () => PublicKey.unique(),
      isAtomEnabled: () => true,
      feedback_count: 5n,
    }),
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

const {
  IdentityTransactionBuilder,
  ReputationTransactionBuilder,
  ValidationTransactionBuilder,
  AtomTransactionBuilder,
} = await import('../../src/core/transaction-builder.js');

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
  // Mock what sendAndConfirmTransaction calls internally
  jest.spyOn(conn, 'sendRawTransaction').mockResolvedValue(MOCK_SIG);
  jest.spyOn(conn, 'confirmTransaction').mockResolvedValue({
    context: { slot: 0 },
    value: { err: null },
  } as any);
  return conn;
}

describe('IdentityTransactionBuilder - send mode', () => {
  let builder: InstanceType<typeof IdentityTransactionBuilder>;
  let conn: Connection;
  let payer: Keypair;

  beforeEach(() => {
    conn = createMockConnection();
    payer = Keypair.generate();
    builder = new IdentityTransactionBuilder(conn, payer);
  });

  it('registerAgent - normal mode sends transaction', async () => {
    const result = await builder.registerAgent('ipfs://test');
    expect('success' in result && result.success).toBe(true);
    if ('signature' in result) {
      expect(result.signature).toBeTruthy();
    }
    if ('asset' in result) {
      expect(result.asset).toBeDefined();
    }
  });

  it('registerAgent - normal mode no-payer after root config check returns error', async () => {
    const readOnly = new IdentityTransactionBuilder(conn);
    // This reaches the signer check early (line ~179)
    const result = await readOnly.registerAgent('ipfs://test');
    expect('success' in result && !result.success).toBe(true);
  });

  it('setAgentUri - normal mode sends transaction', async () => {
    const result = await builder.setAgentUri(
      PublicKey.unique(), PublicKey.unique(), 'ipfs://new-uri'
    );
    if ('success' in result) {
      expect(result.success).toBe(true);
      expect(result.signature).toBeTruthy();
    }
  });

  it('setAgentUri - no payer in send mode returns error', async () => {
    const readOnly = new IdentityTransactionBuilder(conn);
    const result = await readOnly.setAgentUri(
      PublicKey.unique(), PublicKey.unique(), 'uri',
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });

  it('setMetadata - normal mode sends transaction', async () => {
    const result = await builder.setMetadata(
      PublicKey.unique(), 'key', 'value', false
    );
    if ('success' in result) {
      expect(result.success).toBe(true);
    }
  });

  it('setMetadata - no signer returns error', async () => {
    const readOnly = new IdentityTransactionBuilder(conn);
    const result = await readOnly.setMetadata(
      PublicKey.unique(), 'key', 'value'
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('signer');
    }
  });

  it('setMetadata - no payer in send mode returns error', async () => {
    const readOnly = new IdentityTransactionBuilder(conn);
    const result = await readOnly.setMetadata(
      PublicKey.unique(), 'key', 'value', false,
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });

  it('deleteMetadata - normal mode sends transaction', async () => {
    const result = await builder.deleteMetadata(PublicKey.unique(), 'myKey');
    if ('success' in result) {
      expect(result.success).toBe(true);
    }
  });

  it('deleteMetadata - no payer in send mode returns error', async () => {
    const readOnly = new IdentityTransactionBuilder(conn);
    const result = await readOnly.deleteMetadata(
      PublicKey.unique(), 'key',
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });

  it('transferAgent - normal mode sends transaction', async () => {
    const result = await builder.transferAgent(
      PublicKey.unique(), PublicKey.unique(), PublicKey.unique()
    );
    if ('success' in result) {
      expect(result.success).toBe(true);
    }
  });

  it('transferAgent - no payer in send mode returns error', async () => {
    const readOnly = new IdentityTransactionBuilder(conn);
    const result = await readOnly.transferAgent(
      PublicKey.unique(), PublicKey.unique(), PublicKey.unique(),
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });

  it('syncOwner - normal mode sends transaction', async () => {
    const result = await builder.syncOwner(PublicKey.unique());
    if ('success' in result) {
      expect(result.success).toBe(true);
    }
  });

  it('syncOwner - no signer returns error', async () => {
    const readOnly = new IdentityTransactionBuilder(conn);
    const result = await readOnly.syncOwner(PublicKey.unique());
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('signer');
    }
  });

  it('syncOwner - no payer in send mode returns error', async () => {
    const readOnly = new IdentityTransactionBuilder(conn);
    const result = await readOnly.syncOwner(
      PublicKey.unique(),
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });

  it('enableAtom - normal mode sends transaction', async () => {
    const result = await builder.enableAtom(PublicKey.unique());
    if ('success' in result) {
      expect(result.success).toBe(true);
    }
  });

  it('enableAtom - no payer in send mode returns error', async () => {
    const readOnly = new IdentityTransactionBuilder(conn);
    const result = await readOnly.enableAtom(
      PublicKey.unique(),
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });

  it('setAgentWallet - normal mode sends transaction', async () => {
    const result = await builder.setAgentWallet(
      PublicKey.unique(), PublicKey.unique(),
      new Uint8Array(64), 1700000000n
    );
    if ('success' in result) {
      expect(result.success).toBe(true);
      expect(result.signature).toBeTruthy();
    }
  });

  it('setAgentWallet - no payer in send mode returns error', async () => {
    const readOnly = new IdentityTransactionBuilder(conn);
    const result = await readOnly.setAgentWallet(
      PublicKey.unique(), PublicKey.unique(),
      new Uint8Array(64), 1700000000n,
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });
});

describe('IdentityTransactionBuilder - sendWithRetry', () => {
  let conn: Connection;
  let payer: Keypair;

  beforeEach(() => {
    conn = createMockConnection();
    payer = Keypair.generate();
  });

  it('should NOT retry on InstructionError', async () => {
    const sendSpy = jest.spyOn(conn, 'sendRawTransaction');
    sendSpy.mockRejectedValue(new Error('InstructionError: custom program error'));

    const builder = new IdentityTransactionBuilder(conn, payer);
    const result = await builder.registerAgent('ipfs://test');
    expect('success' in result && !result.success).toBe(true);
    expect(sendSpy.mock.calls.length).toBe(1);
  });

  it('should NOT retry on insufficient funds', async () => {
    const sendSpy = jest.spyOn(conn, 'sendRawTransaction');
    sendSpy.mockRejectedValue(new Error('insufficient funds'));

    const builder = new IdentityTransactionBuilder(conn, payer);
    const result = await builder.registerAgent('ipfs://test');
    expect('success' in result && !result.success).toBe(true);
    expect(sendSpy.mock.calls.length).toBe(1);
  });

  it('should NOT retry on account not found', async () => {
    const sendSpy = jest.spyOn(conn, 'sendRawTransaction');
    sendSpy.mockRejectedValue(new Error('account not found'));

    const builder = new IdentityTransactionBuilder(conn, payer);
    const result = await builder.registerAgent('ipfs://test');
    expect('success' in result && !result.success).toBe(true);
    expect(sendSpy.mock.calls.length).toBe(1);
  });

  it('should NOT retry on ConstraintViolation', async () => {
    const sendSpy = jest.spyOn(conn, 'sendRawTransaction');
    sendSpy.mockRejectedValue(new Error('ConstraintViolation'));

    const builder = new IdentityTransactionBuilder(conn, payer);
    const result = await builder.registerAgent('ipfs://test');
    expect('success' in result && !result.success).toBe(true);
    expect(sendSpy.mock.calls.length).toBe(1);
  });

  it('should NOT retry on AccountNotInitialized', async () => {
    const sendSpy = jest.spyOn(conn, 'sendRawTransaction');
    sendSpy.mockRejectedValue(new Error('AccountNotInitialized'));

    const builder = new IdentityTransactionBuilder(conn, payer);
    const result = await builder.registerAgent('ipfs://test');
    expect('success' in result && !result.success).toBe(true);
    expect(sendSpy.mock.calls.length).toBe(1);
  });

  it('should NOT retry on InvalidProgramId', async () => {
    const sendSpy = jest.spyOn(conn, 'sendRawTransaction');
    sendSpy.mockRejectedValue(new Error('InvalidProgramId'));

    const builder = new IdentityTransactionBuilder(conn, payer);
    const result = await builder.registerAgent('ipfs://test');
    expect('success' in result && !result.success).toBe(true);
    expect(sendSpy.mock.calls.length).toBe(1);
  });

  it('should NOT retry on invalid account data', async () => {
    const sendSpy = jest.spyOn(conn, 'sendRawTransaction');
    sendSpy.mockRejectedValue(new Error('invalid account data'));

    const builder = new IdentityTransactionBuilder(conn, payer);
    const result = await builder.registerAgent('ipfs://test');
    expect('success' in result && !result.success).toBe(true);
    expect(sendSpy.mock.calls.length).toBe(1);
  });

  it('should NOT retry on custom program error', async () => {
    const sendSpy = jest.spyOn(conn, 'sendRawTransaction');
    sendSpy.mockRejectedValue(new Error('custom program error: 0x100'));

    const builder = new IdentityTransactionBuilder(conn, payer);
    const result = await builder.registerAgent('ipfs://test');
    expect('success' in result && !result.success).toBe(true);
    expect(sendSpy.mock.calls.length).toBe(1);
  });

  it('should NOT retry on already in use when register is not found on-chain', async () => {
    const sendSpy = jest.spyOn(conn, 'sendRawTransaction');
    sendSpy.mockRejectedValue(new Error('already in use'));
    jest.spyOn(conn, 'getAccountInfo').mockResolvedValue(null);

    const builder = new IdentityTransactionBuilder(conn, payer);
    const result = await builder.registerAgent('ipfs://test');
    expect('success' in result && !result.success).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('already in use');
    }
    expect(sendSpy.mock.calls.length).toBe(1);
  });

  it('should recover register success when first attempt expires then retry gets already in use', async () => {
    const latestBlockhashSpy = jest.spyOn(conn, 'getLatestBlockhash');
    latestBlockhashSpy
      .mockResolvedValueOnce({
        blockhash: Keypair.generate().publicKey.toBase58(),
        lastValidBlockHeight: 999,
      } as any)
      .mockResolvedValueOnce({
        blockhash: Keypair.generate().publicKey.toBase58(),
        lastValidBlockHeight: 1000,
      } as any);

    const sendSpy = jest.spyOn(conn, 'sendRawTransaction');
    sendSpy.mockResolvedValueOnce('sig-expired');
    sendSpy.mockRejectedValueOnce(new Error('already in use'));

    const confirmSpy = jest.spyOn(conn, 'confirmTransaction');
    confirmSpy.mockRejectedValueOnce(
      new TransactionExpiredBlockheightExceededError('sig-expired')
    );

    jest.spyOn(conn, 'getAccountInfo').mockResolvedValue({
      data: Buffer.alloc(300),
      executable: false,
      lamports: 1000000,
      owner: PublicKey.default,
      rentEpoch: 0,
    } as any);

    const builder = new IdentityTransactionBuilder(conn, payer);
    const result = await builder.registerAgent('ipfs://test');

    expect('success' in result && result.success).toBe(true);
    expect(sendSpy.mock.calls.length).toBe(2);
  });

  it('should fail register when first attempt expires, retry gets already in use, and agent account is absent', async () => {
    const latestBlockhashSpy = jest.spyOn(conn, 'getLatestBlockhash');
    latestBlockhashSpy
      .mockResolvedValueOnce({
        blockhash: Keypair.generate().publicKey.toBase58(),
        lastValidBlockHeight: 999,
      } as any)
      .mockResolvedValueOnce({
        blockhash: Keypair.generate().publicKey.toBase58(),
        lastValidBlockHeight: 1000,
      } as any);

    const sendSpy = jest.spyOn(conn, 'sendRawTransaction');
    sendSpy.mockResolvedValueOnce('sig-expired');
    sendSpy.mockRejectedValueOnce(new Error('already in use'));

    const confirmSpy = jest.spyOn(conn, 'confirmTransaction');
    confirmSpy.mockRejectedValueOnce(
      new TransactionExpiredBlockheightExceededError('sig-expired')
    );

    jest.spyOn(conn, 'getAccountInfo').mockResolvedValue(null);

    const builder = new IdentityTransactionBuilder(conn, payer);
    const result = await builder.registerAgent('ipfs://test');

    expect('success' in result && !result.success).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('already in use');
    }
    expect(sendSpy.mock.calls.length).toBe(2);
  });
});

describe('ReputationTransactionBuilder - send mode', () => {
  let builder: InstanceType<typeof ReputationTransactionBuilder>;
  let conn: Connection;
  let payer: Keypair;

  beforeEach(() => {
    conn = createMockConnection();
    payer = Keypair.generate();
    builder = new ReputationTransactionBuilder(conn, payer);
  });

  it('giveFeedback - normal mode sends transaction', async () => {
    const result = await builder.giveFeedback(
      PublicKey.unique(),
      { value: '100', feedbackUri: 'ipfs://fb' }
    );
    if ('success' in result) {
      expect(result.success).toBe(true);
      expect(result.feedbackIndex).toBe(5n);
    }
  });

  it('giveFeedback - no payer in send mode returns error', async () => {
    const readOnly = new ReputationTransactionBuilder(conn);
    jest.spyOn(conn, 'getAccountInfo').mockResolvedValue({
      data: Buffer.alloc(300),
      executable: false,
      lamports: 1000000,
      owner: PublicKey.default,
      rentEpoch: 0,
    } as any);
    const result = await readOnly.giveFeedback(
      PublicKey.unique(),
      { value: '100', feedbackUri: 'ipfs://fb' },
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });

  it('revokeFeedback - normal mode sends transaction', async () => {
    const result = await builder.revokeFeedback(
      PublicKey.unique(), 0n, Buffer.alloc(32)
    );
    if ('success' in result) {
      expect(result.success).toBe(true);
    }
  });

  it('revokeFeedback - no payer in send mode returns error', async () => {
    const readOnly = new ReputationTransactionBuilder(conn);
    jest.spyOn(conn, 'getAccountInfo').mockResolvedValue({
      data: Buffer.alloc(300),
      executable: false,
      lamports: 1000000,
      owner: PublicKey.default,
      rentEpoch: 0,
    } as any);
    const result = await readOnly.revokeFeedback(
      PublicKey.unique(), 0n, Buffer.alloc(32),
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });

  it('appendResponse - normal mode sends transaction', async () => {
    const result = await builder.appendResponse(
      PublicKey.unique(), PublicKey.unique(), 0n,
      Buffer.alloc(32, 0xab), 'ipfs://response'
    );
    if ('success' in result) {
      expect(result.success).toBe(true);
    }
  });

  it('appendResponse - no payer in send mode returns error', async () => {
    const readOnly = new ReputationTransactionBuilder(conn);
    const result = await readOnly.appendResponse(
      PublicKey.unique(), PublicKey.unique(), 0n,
      Buffer.alloc(32, 0xab), 'ipfs://response',
      undefined, { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });
});

describe('ValidationTransactionBuilder - send mode', () => {
  let builder: InstanceType<typeof ValidationTransactionBuilder>;
  let conn: Connection;
  let payer: Keypair;

  beforeEach(() => {
    conn = createMockConnection();
    payer = Keypair.generate();
    builder = new ValidationTransactionBuilder(conn, payer);
  });

  it('requestValidation - normal mode sends transaction', async () => {
    const result = await builder.requestValidation(
      PublicKey.unique(), PublicKey.unique(),
      42, 'ipfs://request', Buffer.alloc(32)
    );
    if ('success' in result) {
      expect(result.success).toBe(true);
      expect(result.signature).toBeTruthy();
    }
  });

  it('requestValidation - no payer in send mode returns error', async () => {
    const readOnly = new ValidationTransactionBuilder(conn);
    const result = await readOnly.requestValidation(
      PublicKey.unique(), PublicKey.unique(),
      42, 'ipfs://request', Buffer.alloc(32),
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });

  it('respondToValidation - normal mode sends transaction', async () => {
    const result = await builder.respondToValidation(
      PublicKey.unique(), 42, 85,
      'ipfs://response', Buffer.alloc(32), 'quality'
    );
    if ('success' in result) {
      expect(result.success).toBe(true);
    }
  });

  it('respondToValidation - no signer returns error', async () => {
    const readOnly = new ValidationTransactionBuilder(conn);
    const result = await readOnly.respondToValidation(
      PublicKey.unique(), 42, 85,
      'ipfs://response', Buffer.alloc(32), 'quality'
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('signer');
    }
  });

  it('respondToValidation - no payer in send mode returns error', async () => {
    const readOnly = new ValidationTransactionBuilder(conn);
    const result = await readOnly.respondToValidation(
      PublicKey.unique(), 42, 85,
      'ipfs://response', Buffer.alloc(32), 'quality',
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });

  it('respondToValidation - validates responseHash length', async () => {
    const result = await builder.respondToValidation(
      PublicKey.unique(), 42, 85,
      'ipfs://response', Buffer.alloc(16), 'quality'
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('32 bytes');
    }
  });
});

describe('AtomTransactionBuilder - send mode', () => {
  let builder: InstanceType<typeof AtomTransactionBuilder>;
  let conn: Connection;
  let payer: Keypair;

  beforeEach(() => {
    conn = createMockConnection();
    payer = Keypair.generate();
    builder = new AtomTransactionBuilder(conn, payer);
  });

  it('initializeStats - normal mode sends transaction', async () => {
    const result = await builder.initializeStats(PublicKey.unique());
    if ('success' in result) {
      expect(result.success).toBe(true);
    }
  });

  it('initializeStats - no payer returns error', async () => {
    const readOnly = new AtomTransactionBuilder(conn);
    jest.spyOn(conn, 'getAccountInfo').mockResolvedValue({
      data: Buffer.alloc(300),
      executable: false,
      lamports: 1000000,
      owner: PublicKey.default,
      rentEpoch: 0,
    } as any);
    const result = await readOnly.initializeStats(
      PublicKey.unique(),
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });

  it('initializeConfig - normal mode sends transaction', async () => {
    const result = await builder.initializeConfig();
    if ('success' in result) {
      expect(result.success).toBe(true);
    }
  });

  it('initializeConfig - no payer returns error', async () => {
    const readOnly = new AtomTransactionBuilder(conn);
    const result = await readOnly.initializeConfig(
      undefined,
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });

  it('updateConfig - normal mode sends transaction', async () => {
    const result = await builder.updateConfig({});
    if ('success' in result) {
      expect(result.success).toBe(true);
    }
  });

  it('updateConfig - no payer returns error', async () => {
    const readOnly = new AtomTransactionBuilder(conn);
    const result = await readOnly.updateConfig(
      {},
      { signer: payer.publicKey }
    );
    if ('success' in result) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    }
  });
});
