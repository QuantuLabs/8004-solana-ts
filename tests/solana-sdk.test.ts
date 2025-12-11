/**
 * Solana SDK Unit Tests
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
      // They should be the same method or return same results
      // Testing with non-existent agent (should return null for both)
      const result1 = await sdk.getAgent(999999n);
      const result2 = await sdk.loadAgent(999999n);
      expect(result1).toEqual(result2);
    });
  });

  describe('Write operations (require signer)', () => {
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
      await expect(sdkReadOnly.setAgentUri(1n, 'ipfs://QmTest')).rejects.toThrow(
        'No signer configured - SDK is read-only'
      );
    });

    it('setMetadata should throw without signer', async () => {
      await expect(sdkReadOnly.setMetadata(1n, 'key', 'value')).rejects.toThrow(
        'No signer configured - SDK is read-only'
      );
    });

    it('giveFeedback should throw without signer', async () => {
      await expect(
        sdkReadOnly.giveFeedback(1n, {
          score: 85,
          fileUri: 'ipfs://QmTest',
          fileHash: Buffer.alloc(32),
        })
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('revokeFeedback should throw without signer', async () => {
      await expect(sdkReadOnly.revokeFeedback(1n, 0n)).rejects.toThrow(
        'No signer configured - SDK is read-only'
      );
    });

    it('appendResponse should throw without signer', async () => {
      const client = new PublicKey('11111111111111111111111111111111');
      await expect(
        sdkReadOnly.appendResponse(1n, client, 0n, 'ipfs://QmTest', Buffer.alloc(32))
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('requestValidation should throw without signer', async () => {
      const validator = new PublicKey('11111111111111111111111111111111');
      await expect(
        sdkReadOnly.requestValidation(1n, validator, 0, 'ipfs://QmRequest', Buffer.alloc(32))
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('respondToValidation should throw without signer', async () => {
      await expect(
        sdkReadOnly.respondToValidation(1n, 0, 1, 'ipfs://QmResponse', Buffer.alloc(32))
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
// PDA Helpers Tests
// ============================================================================

describe('PDAHelpers', () => {
  describe('getConfigPDA', () => {
    it('should derive config PDA deterministically', () => {
      const [pda1, bump1] = PDAHelpers.getConfigPDA();
      const [pda2, bump2] = PDAHelpers.getConfigPDA();

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
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

  describe('getFeedbackPDA', () => {
    it('should derive feedback PDA from agentId and feedbackIndex', () => {
      const agentId = 1n;
      const feedbackIndex = 0n;

      const [pda1, bump1] = PDAHelpers.getFeedbackPDA(agentId, feedbackIndex);
      const [pda2, bump2] = PDAHelpers.getFeedbackPDA(agentId, feedbackIndex);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should generate different PDAs for different feedback indexes', () => {
      const agentId = 1n;

      const [pda1] = PDAHelpers.getFeedbackPDA(agentId, 0n);
      const [pda2] = PDAHelpers.getFeedbackPDA(agentId, 1n);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('getFeedbackTagsPDA', () => {
    it('should derive feedback tags PDA', () => {
      const agentId = 1n;
      const feedbackIndex = 0n;

      const [pda1, bump1] = PDAHelpers.getFeedbackTagsPDA(agentId, feedbackIndex);
      const [pda2, bump2] = PDAHelpers.getFeedbackTagsPDA(agentId, feedbackIndex);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getAgentReputationPDA', () => {
    it('should derive reputation PDA', () => {
      const agentId = 1n;
      const [pda1, bump1] = PDAHelpers.getAgentReputationPDA(agentId);
      const [pda2, bump2] = PDAHelpers.getAgentReputationPDA(agentId);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getResponsePDA', () => {
    it('should derive response PDA', () => {
      const agentId = 1n;
      const feedbackIndex = 0n;
      const responseIndex = 0n;

      const [pda1, bump1] = PDAHelpers.getResponsePDA(agentId, feedbackIndex, responseIndex);
      const [pda2, bump2] = PDAHelpers.getResponsePDA(agentId, feedbackIndex, responseIndex);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should generate different PDAs for different response indexes', () => {
      const agentId = 1n;
      const feedbackIndex = 0n;

      const [pda1] = PDAHelpers.getResponsePDA(agentId, feedbackIndex, 0n);
      const [pda2] = PDAHelpers.getResponsePDA(agentId, feedbackIndex, 1n);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('getResponseIndexPDA', () => {
    it('should derive response index PDA', () => {
      const agentId = 1n;
      const feedbackIndex = 0n;

      const [pda1, bump1] = PDAHelpers.getResponseIndexPDA(agentId, feedbackIndex);
      const [pda2, bump2] = PDAHelpers.getResponseIndexPDA(agentId, feedbackIndex);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getValidationRequestPDA', () => {
    it('should derive validation request PDA', () => {
      const agentId = 1n;
      const validator = Keypair.generate().publicKey;
      const nonce = 0;

      const [pda1, bump1] = PDAHelpers.getValidationRequestPDA(agentId, validator, nonce);
      const [pda2, bump2] = PDAHelpers.getValidationRequestPDA(agentId, validator, nonce);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getClientIndexPDA', () => {
    it('should derive client index PDA', () => {
      const agentId = 1n;
      const client = Keypair.generate().publicKey;

      const [pda1, bump1] = PDAHelpers.getClientIndexPDA(agentId, client);
      const [pda2, bump2] = PDAHelpers.getClientIndexPDA(agentId, client);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });
});
