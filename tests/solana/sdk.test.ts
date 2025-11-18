/**
 * Unit tests for SolanaSDK
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Keypair, PublicKey } from '@solana/web3.js';
import { SolanaSDK, createDevnetSDK, createMainnetSDK, createLocalnetSDK } from '../../src/solana/sdk.js';

describe('SolanaSDK', () => {
  describe('Initialization', () => {
    it('should create SDK without signer (read-only)', () => {
      const sdk = createDevnetSDK();

      expect(sdk).toBeInstanceOf(SolanaSDK);
      expect(sdk.canWrite).toBe(false);
      expect(sdk.getCluster()).toBe('devnet');
    });

    it('should create SDK with signer (read-write)', () => {
      const signer = Keypair.generate();
      const sdk = createDevnetSDK({ signer });

      expect(sdk.canWrite).toBe(true);
    });

    it('should create mainnet SDK', () => {
      const sdk = createMainnetSDK();

      expect(sdk.getCluster()).toBe('mainnet-beta');
    });

    it('should create localnet SDK', () => {
      const sdk = createLocalnetSDK();

      expect(sdk.getCluster()).toBe('localnet');
    });

    it('should accept custom RPC URL', () => {
      const sdk = createDevnetSDK({
        rpcUrl: 'https://custom-rpc.example.com',
      });

      expect(sdk).toBeInstanceOf(SolanaSDK);
    });
  });

  describe('Read operations (no signer required)', () => {
    let sdk: SolanaSDK;

    beforeEach(() => {
      sdk = createDevnetSDK();
    });

    it('should have getSummary method', () => {
      expect(typeof sdk.getSummary).toBe('function');
    });

    it('should have readFeedback method', () => {
      expect(typeof sdk.readFeedback).toBe('function');
    });

    it('should have readAllFeedback method', () => {
      expect(typeof sdk.readAllFeedback).toBe('function');
    });

    it('should have getLastIndex method', () => {
      expect(typeof sdk.getLastIndex).toBe('function');
    });

    it('should have getClients method', () => {
      expect(typeof sdk.getClients).toBe('function');
    });

    it('should have getResponseCount method', () => {
      expect(typeof sdk.getResponseCount).toBe('function');
    });

    it('should have readResponses method', () => {
      expect(typeof sdk.readResponses).toBe('function');
    });

    it('should have loadAgent method', () => {
      expect(typeof sdk.loadAgent).toBe('function');
    });

    it('should have getAgentsByOwner method', () => {
      expect(typeof sdk.getAgentsByOwner).toBe('function');
    });

    it('should have agentExists method', () => {
      expect(typeof sdk.agentExists).toBe('function');
    });
  });

  describe('Write operations (require signer)', () => {
    let sdkWithoutSigner: SolanaSDK;
    let sdkWithSigner: SolanaSDK;

    beforeEach(() => {
      sdkWithoutSigner = createDevnetSDK();
      sdkWithSigner = createDevnetSDK({ signer: Keypair.generate() });
    });

    describe('registerAgent', () => {
      it('should throw error without signer', async () => {
        await expect(sdkWithoutSigner.registerAgent()).rejects.toThrow(
          'No signer configured - SDK is read-only'
        );
      });

      it('should not throw for SDK with signer', () => {
        expect(typeof sdkWithSigner.registerAgent).toBe('function');
      });
    });

    describe('setAgentUri', () => {
      it('should throw error without signer', async () => {
        await expect(sdkWithoutSigner.setAgentUri(1n, 'ipfs://QmTest')).rejects.toThrow(
          'No signer configured - SDK is read-only'
        );
      });
    });

    describe('setMetadata', () => {
      it('should throw error without signer', async () => {
        await expect(
          sdkWithoutSigner.setMetadata(1n, 'key', 'value')
        ).rejects.toThrow('No signer configured - SDK is read-only');
      });
    });

    describe('giveFeedback', () => {
      it('should throw error without signer', async () => {
        await expect(
          sdkWithoutSigner.giveFeedback(1n, 85, 'ipfs://QmTest', Buffer.alloc(32))
        ).rejects.toThrow('No signer configured - SDK is read-only');
      });
    });

    describe('revokeFeedback', () => {
      it('should throw error without signer', async () => {
        await expect(sdkWithoutSigner.revokeFeedback(1n, 0n)).rejects.toThrow(
          'No signer configured - SDK is read-only'
        );
      });
    });

    describe('appendResponse', () => {
      it('should throw error without signer', async () => {
        const client = new PublicKey('11111111111111111111111111111111');
        await expect(
          sdkWithoutSigner.appendResponse(
            1n,
            client,
            0n,
            'ipfs://QmTest',
            Buffer.alloc(32)
          )
        ).rejects.toThrow('No signer configured - SDK is read-only');
      });
    });

    describe('requestValidation', () => {
      it('should throw error without signer', async () => {
        const validator = new PublicKey('11111111111111111111111111111111');
        await expect(
          sdkWithoutSigner.requestValidation(1n, validator, Buffer.alloc(32))
        ).rejects.toThrow('No signer configured - SDK is read-only');
      });
    });

    describe('respondToValidation', () => {
      it('should throw error without signer', async () => {
        const requester = new PublicKey('11111111111111111111111111111111');
        await expect(
          sdkWithoutSigner.respondToValidation(
            1n,
            requester,
            0,
            1,
            Buffer.alloc(32)
          )
        ).rejects.toThrow('No signer configured - SDK is read-only');
      });
    });
  });

  describe('Utility methods', () => {
    let sdk: SolanaSDK;

    beforeEach(() => {
      sdk = createDevnetSDK();
    });

    it('should return cluster', () => {
      expect(sdk.getCluster()).toBe('devnet');
    });

    it('should return program IDs', () => {
      const programIds = sdk.getProgramIds();

      expect(programIds).toHaveProperty('identityRegistry');
      expect(programIds).toHaveProperty('reputationSystem');
      expect(programIds).toHaveProperty('validationService');
    });

    it('should return Solana client', () => {
      const client = sdk.getSolanaClient();

      expect(client).toBeDefined();
      expect(typeof client.getConnection).toBe('function');
    });

    it('should return feedback manager', () => {
      const feedbackManager = sdk.getFeedbackManager();

      expect(feedbackManager).toBeDefined();
      expect(typeof feedbackManager.getSummary).toBe('function');
    });
  });

  describe('canWrite property', () => {
    it('should return false without signer', () => {
      const sdk = createDevnetSDK();
      expect(sdk.canWrite).toBe(false);
    });

    it('should return true with signer', () => {
      const signer = Keypair.generate();
      const sdk = createDevnetSDK({ signer });
      expect(sdk.canWrite).toBe(true);
    });
  });
});
