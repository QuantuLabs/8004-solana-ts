import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PublicKey, Connection } from '@solana/web3.js';

// Mock dependencies
jest.unstable_mockModule('../../src/core/borsh-schemas.js', () => ({
  RootConfig: {
    deserialize: jest.fn(),
  },
  RegistryConfig: {
    deserialize: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/core/pda-helpers.js', () => ({
  PDAHelpers: {
    getRootConfigPDA: jest.fn().mockReturnValue([new PublicKey('11111111111111111111111111111111'), 255]),
    getRegistryConfigPDA: jest.fn().mockReturnValue([new PublicKey('11111111111111111111111111111112'), 254]),
  },
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

const { fetchRootConfig, fetchRegistryConfig, fetchRegistryConfigByPda, isRegistryInitialized, getBaseCollection, getBaseRegistryPda } = await import('../../src/core/config-reader.js');
const { RootConfig, RegistryConfig } = await import('../../src/core/borsh-schemas.js');

describe('config-reader', () => {
  let mockConnection: Connection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      getAccountInfo: jest.fn(),
    } as unknown as Connection;
  });

  describe('fetchRootConfig', () => {
    it('should return null when account does not exist', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue(null);
      const result = await fetchRootConfig(mockConnection);
      expect(result).toBeNull();
    });

    it('should return null when account data is empty', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(0) });
      const result = await fetchRootConfig(mockConnection);
      expect(result).toBeNull();
    });

    it('should deserialize valid account data', async () => {
      const mockConfig = { base_collection: new Uint8Array(32), authority: new Uint8Array(32), bump: 255 };
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(73) });
      (RootConfig.deserialize as jest.Mock).mockReturnValue(mockConfig);
      const result = await fetchRootConfig(mockConnection);
      expect(result).toBe(mockConfig);
    });

    it('should return null on deserialization error', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(73) });
      (RootConfig.deserialize as jest.Mock).mockImplementation(() => { throw new Error('bad data'); });
      const result = await fetchRootConfig(mockConnection);
      expect(result).toBeNull();
    });

    it('should return null on RPC error', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockRejectedValue(new Error('network'));
      const result = await fetchRootConfig(mockConnection);
      expect(result).toBeNull();
    });
  });

  describe('fetchRegistryConfig', () => {
    const collection = new PublicKey('11111111111111111111111111111111');

    it('should return null when account does not exist', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue(null);
      const result = await fetchRegistryConfig(mockConnection, collection);
      expect(result).toBeNull();
    });

    it('should return null on empty data', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(0) });
      const result = await fetchRegistryConfig(mockConnection, collection);
      expect(result).toBeNull();
    });

    it('should deserialize valid data', async () => {
      const mockConfig = { collection: new Uint8Array(32), authority: new Uint8Array(32), bump: 254 };
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(73) });
      (RegistryConfig.deserialize as jest.Mock).mockReturnValue(mockConfig);
      const result = await fetchRegistryConfig(mockConnection, collection);
      expect(result).toBe(mockConfig);
    });

    it('should return null on error', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await fetchRegistryConfig(mockConnection, collection);
      expect(result).toBeNull();
    });
  });

  describe('fetchRegistryConfigByPda', () => {
    const pda = new PublicKey('11111111111111111111111111111111');

    it('should return null when account does not exist', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue(null);
      const result = await fetchRegistryConfigByPda(mockConnection, pda);
      expect(result).toBeNull();
    });

    it('should return null on empty data', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(0) });
      const result = await fetchRegistryConfigByPda(mockConnection, pda);
      expect(result).toBeNull();
    });

    it('should deserialize valid data', async () => {
      const mockConfig = { collection: new Uint8Array(32), authority: new Uint8Array(32), bump: 253 };
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(73) });
      (RegistryConfig.deserialize as jest.Mock).mockReturnValue(mockConfig);
      const result = await fetchRegistryConfigByPda(mockConnection, pda);
      expect(result).toBe(mockConfig);
    });

    it('should return null on error', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockRejectedValue(new Error('fail'));
      const result = await fetchRegistryConfigByPda(mockConnection, pda);
      expect(result).toBeNull();
    });
  });

  describe('isRegistryInitialized', () => {
    it('should return true when root config exists', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(73) });
      (RootConfig.deserialize as jest.Mock).mockReturnValue({ bump: 255 });
      const result = await isRegistryInitialized(mockConnection);
      expect(result).toBe(true);
    });

    it('should return false when root config does not exist', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue(null);
      const result = await isRegistryInitialized(mockConnection);
      expect(result).toBe(false);
    });
  });

  describe('getBaseCollection', () => {
    it('should return base collection pubkey', async () => {
      const expectedPubkey = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const mockConfig = {
        getBaseCollectionPublicKey: () => expectedPubkey,
      };
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(73) });
      (RootConfig.deserialize as jest.Mock).mockReturnValue(mockConfig);
      const result = await getBaseCollection(mockConnection);
      expect(result?.equals(expectedPubkey)).toBe(true);
    });

    it('should return null when not initialized', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue(null);
      const result = await getBaseCollection(mockConnection);
      expect(result).toBeNull();
    });
  });

  describe('getBaseRegistryPda (deprecated)', () => {
    it('should delegate to getBaseCollection', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue(null);
      const result = await getBaseRegistryPda(mockConnection);
      expect(result).toBeNull();
    });
  });
});
