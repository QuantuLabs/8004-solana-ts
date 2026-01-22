/**
 * Solana SDK Unit Tests
 * v0.3.0 - Asset-based identification
 * Tests for SDK initialization, PDA helpers, and API methods
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { Keypair, PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../src/core/sdk-solana.js';
import { PDAHelpers } from '../src/core/pda-helpers.js';

// ============================================================================
// SDK Initialization Tests
// ============================================================================

describe('SolanaSDK', () => {
  describe('Initialization', () => {
    it('should create SDK without signer (read-only)', () => {
      const sdk = new SolanaSDK({ cluster: 'devnet' });

      expect(sdk).toBeInstanceOf(SolanaSDK);
      expect(sdk.canWrite).toBe(false);
      expect(sdk.isReadOnly).toBe(true);
      expect(sdk.getCluster()).toBe('devnet');
    });

    it('should create SDK with signer (read-write)', () => {
      const signer = Keypair.generate();
      const sdk = new SolanaSDK({ signer, cluster: 'devnet' });

      expect(sdk.canWrite).toBe(true);
      expect(sdk.isReadOnly).toBe(false);
    });

    // Note: Currently only devnet is supported as Cluster type
    it('should default to devnet cluster', () => {
      const sdk = new SolanaSDK({});
      expect(sdk.getCluster()).toBe('devnet');
    });

    it('should accept custom RPC URL', () => {
      const sdk = new SolanaSDK({
        cluster: 'devnet',
        rpcUrl: 'https://custom-rpc.example.com',
      });

      expect(sdk).toBeInstanceOf(SolanaSDK);
    });
  });

  describe('Read operations (no signer required)', () => {
    let sdk: SolanaSDK;

    beforeEach(() => {
      sdk = new SolanaSDK({ cluster: 'devnet' });
    });

    it('should have getReputationSummary method', () => {
      expect(typeof sdk.getReputationSummary).toBe('function');
    });

    it('should have getFeedback method', () => {
      expect(typeof sdk.getFeedback).toBe('function');
    });

    it('should have loadAgent method', () => {
      expect(typeof sdk.loadAgent).toBe('function');
    });

    it('should have agentExists method', () => {
      expect(typeof sdk.agentExists).toBe('function');
    });

    it('should have getResponseCount method', () => {
      expect(typeof sdk.getResponseCount).toBe('function');
    });

    it('should have getAgentOwner method', () => {
      expect(typeof sdk.getAgentOwner).toBe('function');
    });

    it('should have isAgentOwner method', () => {
      expect(typeof sdk.isAgentOwner).toBe('function');
    });

    it('should have getAgent method (alias for loadAgent)', () => {
      expect(typeof sdk.getAgent).toBe('function');
    });

    it('getAgent should be an alias for loadAgent', async () => {
      // Both methods should exist and be functions
      expect(sdk.getAgent).toBeDefined();
      expect(sdk.loadAgent).toBeDefined();
      // Testing with non-existent asset (should return null for both)
      const asset = Keypair.generate().publicKey;
      const result1 = await sdk.getAgent(asset);
      const result2 = await sdk.loadAgent(asset);
      expect(result1).toEqual(result2);
    });
  });

  describe('Write operations (require signer) - v0.3.0', () => {
    let sdkReadOnly: SolanaSDK;
    let sdkWithSigner: SolanaSDK;

    beforeEach(() => {
      sdkReadOnly = new SolanaSDK({ cluster: 'devnet' });
      sdkWithSigner = new SolanaSDK({ signer: Keypair.generate(), cluster: 'devnet' });
    });

    it('registerAgent should throw without signer', async () => {
      await expect(sdkReadOnly.registerAgent()).rejects.toThrow(
        'No signer configured - SDK is read-only'
      );
    });

    it('setAgentUri should throw without signer', async () => {
      const asset = Keypair.generate().publicKey;
      const collection = Keypair.generate().publicKey;
      await expect(sdkReadOnly.setAgentUri(asset, collection, 'ipfs://QmTest')).rejects.toThrow(
        'No signer configured - SDK is read-only'
      );
    });

    it('setMetadata should throw without signer', async () => {
      const asset = Keypair.generate().publicKey;
      await expect(sdkReadOnly.setMetadata(asset, 'key', 'value')).rejects.toThrow(
        'No signer configured - SDK is read-only'
      );
    });

    it('giveFeedback should throw without signer', async () => {
      const asset = Keypair.generate().publicKey;
      await expect(
        sdkReadOnly.giveFeedback(asset, {
          score: 85,
          feedbackUri: 'ipfs://QmTest',
          feedbackHash: Buffer.alloc(32),
        })
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('revokeFeedback should throw without signer', async () => {
      const asset = Keypair.generate().publicKey;
      await expect(sdkReadOnly.revokeFeedback(asset, 0n)).rejects.toThrow(
        'No signer configured - SDK is read-only'
      );
    });

    it('appendResponse should throw without signer', async () => {
      const asset = Keypair.generate().publicKey;
      await expect(
        sdkReadOnly.appendResponse(asset, 0n, 'ipfs://QmTest', Buffer.alloc(32))
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('requestValidation should throw without signer', async () => {
      const asset = Keypair.generate().publicKey;
      const validator = new PublicKey('11111111111111111111111111111111');
      await expect(
        sdkReadOnly.requestValidation(asset, validator, 'ipfs://QmRequest', { nonce: 0, requestHash: Buffer.alloc(32) })
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('respondToValidation should throw without signer', async () => {
      const asset = Keypair.generate().publicKey;
      await expect(
        sdkReadOnly.respondToValidation(asset, 0, 1, 'ipfs://QmResponse', { responseHash: Buffer.alloc(32) })
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });
  });

  describe('Utility methods', () => {
    let sdk: SolanaSDK;

    beforeEach(() => {
      sdk = new SolanaSDK({ cluster: 'devnet' });
    });

    it('should return cluster', () => {
      expect(sdk.getCluster()).toBe('devnet');
    });

    it('should return program IDs', () => {
      const programIds = sdk.getProgramIds();
      expect(programIds).toHaveProperty('identityRegistry');
      expect(programIds).toHaveProperty('reputationRegistry');
      expect(programIds).toHaveProperty('validationRegistry');
    });
  });
});

// ============================================================================
// PDA Helpers Tests - v0.3.0 (asset-based)
// ============================================================================

describe('PDAHelpers', () => {
  describe('getRootConfigPDA', () => {
    it('should derive root config PDA deterministically', () => {
      const [pda1, bump1] = PDAHelpers.getRootConfigPDA();
      const [pda2, bump2] = PDAHelpers.getRootConfigPDA();

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getRegistryConfigPDA', () => {
    it('should derive registry config PDA from collection', () => {
      const collection = Keypair.generate().publicKey;
      const [pda1, bump1] = PDAHelpers.getRegistryConfigPDA(collection);
      const [pda2, bump2] = PDAHelpers.getRegistryConfigPDA(collection);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should generate different PDAs for different collections', () => {
      const collection1 = Keypair.generate().publicKey;
      const collection2 = Keypair.generate().publicKey;

      const [pda1] = PDAHelpers.getRegistryConfigPDA(collection1);
      const [pda2] = PDAHelpers.getRegistryConfigPDA(collection2);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('getAgentPDA', () => {
    it('should derive agent PDA from asset', () => {
      const asset = Keypair.generate().publicKey;
      const [pda1, bump1] = PDAHelpers.getAgentPDA(asset);
      const [pda2, bump2] = PDAHelpers.getAgentPDA(asset);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should generate different PDAs for different assets', () => {
      const asset1 = Keypair.generate().publicKey;
      const asset2 = Keypair.generate().publicKey;

      const [pda1] = PDAHelpers.getAgentPDA(asset1);
      const [pda2] = PDAHelpers.getAgentPDA(asset2);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('getFeedbackPDA - v0.3.0', () => {
    it('should derive feedback PDA from asset and feedbackIndex', () => {
      const asset = Keypair.generate().publicKey;
      const feedbackIndex = 0n;

      const [pda1, bump1] = PDAHelpers.getFeedbackPDA(asset, feedbackIndex);
      const [pda2, bump2] = PDAHelpers.getFeedbackPDA(asset, feedbackIndex);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should generate different PDAs for different feedback indexes', () => {
      const asset = Keypair.generate().publicKey;

      const [pda1] = PDAHelpers.getFeedbackPDA(asset, 0n);
      const [pda2] = PDAHelpers.getFeedbackPDA(asset, 1n);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('getFeedbackTagsPDA - v0.3.0', () => {
    it('should derive feedback tags PDA from asset and feedbackIndex', () => {
      const asset = Keypair.generate().publicKey;
      const feedbackIndex = 0n;

      const [pda1, bump1] = PDAHelpers.getFeedbackTagsPDA(asset, feedbackIndex);
      const [pda2, bump2] = PDAHelpers.getFeedbackTagsPDA(asset, feedbackIndex);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getAgentReputationPDA - v0.3.0', () => {
    it('should derive reputation PDA from asset', () => {
      const asset = Keypair.generate().publicKey;
      const [pda1, bump1] = PDAHelpers.getAgentReputationPDA(asset);
      const [pda2, bump2] = PDAHelpers.getAgentReputationPDA(asset);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getResponsePDA - v0.3.0', () => {
    it('should derive response PDA from asset, feedbackIndex, responseIndex', () => {
      const asset = Keypair.generate().publicKey;
      const feedbackIndex = 0n;
      const responseIndex = 0n;

      const [pda1, bump1] = PDAHelpers.getResponsePDA(asset, feedbackIndex, responseIndex);
      const [pda2, bump2] = PDAHelpers.getResponsePDA(asset, feedbackIndex, responseIndex);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should generate different PDAs for different response indexes', () => {
      const asset = Keypair.generate().publicKey;
      const feedbackIndex = 0n;

      const [pda1] = PDAHelpers.getResponsePDA(asset, feedbackIndex, 0n);
      const [pda2] = PDAHelpers.getResponsePDA(asset, feedbackIndex, 1n);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('getResponseIndexPDA - v0.3.0', () => {
    it('should derive response index PDA from asset and feedbackIndex', () => {
      const asset = Keypair.generate().publicKey;
      const feedbackIndex = 0n;

      const [pda1, bump1] = PDAHelpers.getResponseIndexPDA(asset, feedbackIndex);
      const [pda2, bump2] = PDAHelpers.getResponseIndexPDA(asset, feedbackIndex);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getValidationRequestPDA - v0.3.0', () => {
    it('should derive validation request PDA from asset, validator, nonce', () => {
      const asset = Keypair.generate().publicKey;
      const validator = Keypair.generate().publicKey;
      const nonce = 0;

      const [pda1, bump1] = PDAHelpers.getValidationRequestPDA(asset, validator, nonce);
      const [pda2, bump2] = PDAHelpers.getValidationRequestPDA(asset, validator, nonce);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getClientIndexPDA - v0.3.0', () => {
    it('should derive client index PDA from asset and client', () => {
      const asset = Keypair.generate().publicKey;
      const client = Keypair.generate().publicKey;

      const [pda1, bump1] = PDAHelpers.getClientIndexPDA(asset, client);
      const [pda2, bump2] = PDAHelpers.getClientIndexPDA(asset, client);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getMetadataEntryPDA - v0.3.0', () => {
    it('should derive metadata entry PDA from asset and keyHash', () => {
      const asset = Keypair.generate().publicKey;
      const keyHash = Buffer.alloc(8, 1);

      const [pda1, bump1] = PDAHelpers.getMetadataEntryPDA(asset, keyHash);
      const [pda2, bump2] = PDAHelpers.getMetadataEntryPDA(asset, keyHash);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should generate different PDAs for different keyHashes', () => {
      const asset = Keypair.generate().publicKey;
      const keyHash1 = Buffer.alloc(8, 1);
      const keyHash2 = Buffer.alloc(8, 2);

      const [pda1] = PDAHelpers.getMetadataEntryPDA(asset, keyHash1);
      const [pda2] = PDAHelpers.getMetadataEntryPDA(asset, keyHash2);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });
});
