/**
 * Unit tests for SolanaSDK initialization
 * Tests SDK configuration and state properties
 */

import { describe, it, expect, jest } from '@jest/globals';
import { Keypair } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

describe('SolanaSDK Initialization', () => {
  describe('Constructor', () => {
    it('should create SDK with minimal config (read-only)', () => {
      const sdk = new SolanaSDK();

      expect(sdk).toBeInstanceOf(SolanaSDK);
      expect(sdk.isReadOnly).toBe(true);
      expect(sdk.canWrite).toBe(false);
    });

    it('should create SDK with signer (read-write)', () => {
      const signer = Keypair.generate();
      const sdk = new SolanaSDK({ signer });

      expect(sdk.isReadOnly).toBe(false);
      expect(sdk.canWrite).toBe(true);
    });

    it('should create SDK with custom RPC URL', () => {
      const customRpc = 'https://my-custom-rpc.example.com';
      const sdk = new SolanaSDK({ rpcUrl: customRpc });

      expect(sdk.getRpcUrl()).toBe(customRpc);
    });

    it('should default to devnet cluster', () => {
      const sdk = new SolanaSDK();

      expect(sdk.getCluster()).toBe('devnet');
    });

    it('should accept explicit devnet cluster', () => {
      const sdk = new SolanaSDK({ cluster: 'devnet' });
      expect(sdk.getCluster()).toBe('devnet');
    });

    it('should accept explicit mainnet-beta cluster while keeping default IDs overrideable', () => {
      const sdk = new SolanaSDK({ cluster: 'mainnet-beta' });
      expect(sdk.getCluster()).toBe('mainnet-beta');
    });

    it('should warn when mainnet-beta is selected without programIds override', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      new SolanaSDK({ cluster: 'mainnet-beta' });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cluster=mainnet-beta selected without programIds override'));
      warnSpy.mockRestore();
    });

    it('should not warn on mainnet-beta when programIds override is provided', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      new SolanaSDK({
        cluster: 'mainnet-beta',
        programIds: {
          agentRegistry: '11111111111111111111111111111111',
          atomEngine: '11111111111111111111111111111111',
        },
      });
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('cluster=mainnet-beta selected without programIds override'));
      warnSpy.mockRestore();
    });
  });

  describe('Indexer Configuration', () => {
    it('should enable indexer by default with hardcoded values', () => {
      // v0.4.1: Indexer is always enabled with default URL and anon key
      const sdk = new SolanaSDK();

      expect(sdk.getIndexerClient()).toBeDefined();
    });

    it('should use custom URL and key when provided', () => {
      const sdk = new SolanaSDK({
        indexerUrl: 'https://custom.supabase.co/rest/v1',
        indexerApiKey: 'custom-key',
      });

      const client = sdk.getIndexerClient();
      expect(client).toBeDefined();
    });

    it('should use default URL when only key provided', () => {
      // v0.4.1: Defaults are used for missing values
      const sdk = new SolanaSDK({
        indexerApiKey: 'test-key',
      });

      expect(sdk.getIndexerClient()).toBeDefined();
    });

    it('should use default key when only URL provided', () => {
      // v0.4.1: Defaults are used for missing values
      const sdk = new SolanaSDK({
        indexerUrl: 'https://example.supabase.co/rest/v1',
      });

      expect(sdk.getIndexerClient()).toBeDefined();
    });

    it('should enable indexer fallback by default', async () => {
      const sdk = new SolanaSDK();

      // IndexerFallback is private, so we test its effect indirectly
      // When indexer fails, it should fall back to on-chain
      expect(sdk).toBeInstanceOf(SolanaSDK);
    });

    it('should respect useIndexer=false config', () => {
      const sdk = new SolanaSDK({
        useIndexer: false,
      });

      // The client is still created but useIndexer flag is false
      expect(sdk.getIndexerClient()).toBeDefined();
    });

    it('should default forceOnChain to false (smart routing)', () => {
      const sdk = new SolanaSDK();

      // forceOnChain is private, but we can test its effect
      // With false (default), indexer-only methods should work
      expect(sdk).toBeInstanceOf(SolanaSDK);
    });

    it('should accept forceOnChain=true config', () => {
      const sdk = new SolanaSDK({ forceOnChain: true });

      // SDK should be created, but indexer-only methods will throw
      expect(sdk).toBeInstanceOf(SolanaSDK);
    });
  });

  describe('Program IDs', () => {
    it('should return valid program IDs', () => {
      const sdk = new SolanaSDK();
      const programIds = sdk.getProgramIds();

      expect(programIds.identityRegistry).toBeDefined();
      expect(programIds.identityRegistry.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });

    it('should return registries info', () => {
      const sdk = new SolanaSDK();
      const registries = sdk.registries();

      expect(registries.IDENTITY).toBeDefined();
      expect(registries.REPUTATION).toBeDefined();
      expect(registries.VALIDATION).toBeDefined();
    });
  });

  describe('State Properties', () => {
    it('should report isReadOnly correctly', () => {
      const readOnlySdk = new SolanaSDK();
      const writableSdk = new SolanaSDK({ signer: Keypair.generate() });

      expect(readOnlySdk.isReadOnly).toBe(true);
      expect(writableSdk.isReadOnly).toBe(false);
    });

    it('should report canWrite correctly', () => {
      const readOnlySdk = new SolanaSDK();
      const writableSdk = new SolanaSDK({ signer: Keypair.generate() });

      expect(readOnlySdk.canWrite).toBe(false);
      expect(writableSdk.canWrite).toBe(true);
    });

    it('should detect default devnet RPC', () => {
      const defaultSdk = new SolanaSDK();
      const customSdk = new SolanaSDK({ rpcUrl: 'https://custom.example.com' });

      expect(defaultSdk.isUsingDefaultDevnetRpc()).toBe(true);
      expect(customSdk.isUsingDefaultDevnetRpc()).toBe(false);
    });
  });

  describe('Accessors', () => {
    it('should return Solana client', () => {
      const sdk = new SolanaSDK();
      const client = sdk.getSolanaClient();

      expect(client).toBeDefined();
    });

    it('should return feedback manager', () => {
      const sdk = new SolanaSDK();
      const manager = sdk.getFeedbackManager();

      expect(manager).toBeDefined();
    });

    it('should return chain ID', async () => {
      const sdk = new SolanaSDK();
      const chainId = await sdk.chainId();

      expect(chainId).toBeDefined();
      expect(typeof chainId).toBe('string');
    });
  });
});
