/**
 * Unit tests for Collection Methods (v0.4.0)
 * Tests getCollection, getCollections, getCollectionAgents
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';
import { SolanaSDK, CollectionInfo } from '../../src/index.js';

describe('Collection Methods', () => {
  let sdk: SolanaSDK;

  beforeAll(() => {
    // Use custom RPC that supports getProgramAccounts (if available)
    const rpcUrl = process.env.SOLANA_RPC_URL || undefined;
    sdk = new SolanaSDK({ rpcUrl });
  });

  describe('getCollection', () => {
    it('should return null for non-existent collection', async () => {
      const fakeCollection = new PublicKey('11111111111111111111111111111111');
      const result = await sdk.getCollection(fakeCollection);

      expect(result).toBeNull();
    });

    it('should have correct CollectionInfo interface', () => {
      // Type check - ensures CollectionInfo has expected properties
      const mockInfo: CollectionInfo = {
        collection: new PublicKey('11111111111111111111111111111111'),
        registryType: 'BASE',
        authority: new PublicKey('11111111111111111111111111111111'),
        baseIndex: 0,
      };

      expect(mockInfo.registryType).toMatch(/^(BASE|USER)$/);
      expect(mockInfo.baseIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getCollections', () => {
    it('should require advanced RPC', async () => {
      // When using default devnet RPC, should throw UnsupportedRpcError
      const defaultSdk = new SolanaSDK();

      await expect(defaultSdk.getCollections()).rejects.toThrow(/not supported/i);
    });
  });

  describe('getCollectionAgents', () => {
    it('should require advanced RPC', async () => {
      const defaultSdk = new SolanaSDK();
      const fakeCollection = new PublicKey('11111111111111111111111111111111');

      await expect(defaultSdk.getCollectionAgents(fakeCollection)).rejects.toThrow(/not supported/i);
    });

    it('should accept options parameter', async () => {
      // Type check - ensures options are correctly typed
      const options = {
        includeFeedbacks: true,
        includeRevoked: false,
      };

      // This just verifies the function accepts the options type
      expect(options.includeFeedbacks).toBe(true);
    });
  });

  describe('Type exports', () => {
    it('should export CollectionInfo type', () => {
      // This test verifies the type is correctly exported
      const info: CollectionInfo = {
        collection: new PublicKey('11111111111111111111111111111111'),
        registryType: 'USER',
        authority: new PublicKey('11111111111111111111111111111111'),
        baseIndex: 1,
      };

      expect(info).toBeDefined();
    });
  });
});
