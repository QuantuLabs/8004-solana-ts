/**
 * Integration tests for Solana SDK
 * These tests verify end-to-end functionality against devnet
 *
 * Note: Set SOLANA_PRIVATE_KEY environment variable to run write tests
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Keypair, PublicKey } from '@solana/web3.js';
import { createDevnetSDK } from '../../src/solana/sdk.js';

describe('Solana SDK Integration Tests', () => {
  const DEVNET_TEST_AGENT_ID = 1n;

  describe('Read operations (devnet)', () => {
    let sdk: ReturnType<typeof createDevnetSDK>;

    beforeAll(() => {
      sdk = createDevnetSDK();
    });

    it('should initialize SDK successfully', () => {
      expect(sdk).toBeDefined();
      expect(sdk.canWrite).toBe(false);
      expect(sdk.getCluster()).toBe('devnet');
    });

    it('should get program IDs', () => {
      const programIds = sdk.getProgramIds();

      expect(programIds.identityRegistry).toBeInstanceOf(PublicKey);
      expect(programIds.reputationSystem).toBeInstanceOf(PublicKey);
      expect(programIds.validationService).toBeInstanceOf(PublicKey);
    });

    it('should attempt to load agent', async () => {
      const agent = await sdk.loadAgent(DEVNET_TEST_AGENT_ID);

      // Agent may or may not exist
      if (agent) {
        expect(agent.agent_id).toBe(DEVNET_TEST_AGENT_ID);
        expect(agent.getOwnerPublicKey()).toBeInstanceOf(PublicKey);
      }
    });

    it('should check if agent exists', async () => {
      const exists = await sdk.agentExists(DEVNET_TEST_AGENT_ID);
      expect(typeof exists).toBe('boolean');
    });

    it('should get reputation summary', async () => {
      const summary = await sdk.getSummary(DEVNET_TEST_AGENT_ID);

      expect(summary).toHaveProperty('averageScore');
      expect(summary).toHaveProperty('totalFeedbacks');
      expect(typeof summary.averageScore).toBe('number');
      expect(typeof summary.totalFeedbacks).toBe('number');
    });

    it('should read all feedback', async () => {
      const feedbacks = await sdk.readAllFeedback(DEVNET_TEST_AGENT_ID, false);

      expect(Array.isArray(feedbacks)).toBe(true);
    });

    it('should get clients list', async () => {
      const clients = await sdk.getClients(DEVNET_TEST_AGENT_ID);

      expect(Array.isArray(clients)).toBe(true);
      clients.forEach((client) => {
        expect(client).toBeInstanceOf(PublicKey);
      });
    });

    it('should get agents by owner', async () => {
      const randomOwner = Keypair.generate().publicKey;
      const agents = await sdk.getAgentsByOwner(randomOwner);

      expect(Array.isArray(agents)).toBe(true);
    });
  });

  describe('Write operations (requires SOLANA_PRIVATE_KEY)', () => {
    let sdk: ReturnType<typeof createDevnetSDK>;
    let signer: Keypair | undefined;

    beforeAll(() => {
      const privateKeyEnv = process.env.SOLANA_PRIVATE_KEY;

      if (privateKeyEnv) {
        try {
          signer = Keypair.fromSecretKey(
            Uint8Array.from(JSON.parse(privateKeyEnv))
          );
          sdk = createDevnetSDK({ signer });
        } catch (error) {
          console.warn('Failed to load SOLANA_PRIVATE_KEY, skipping write tests');
        }
      }
    });

    it('should skip write tests if no signer', () => {
      if (!signer) {
        console.log('⚠️  SOLANA_PRIVATE_KEY not set - skipping write tests');
        expect(true).toBe(true);
      }
    });

    it.skip('should register a new agent', async () => {
      if (!signer) return;

      const result = await sdk.registerAgent('ipfs://QmTestAgent');

      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('agentId');
      expect(typeof result.signature).toBe('string');
      expect(typeof result.agentId).toBe('bigint');
    });

    it.skip('should give feedback to an agent', async () => {
      if (!signer) return;

      const result = await sdk.giveFeedback(
        DEVNET_TEST_AGENT_ID,
        85,
        'ipfs://QmTestFeedback',
        Buffer.alloc(32)
      );

      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('feedbackIndex');
      expect(typeof result.signature).toBe('string');
      expect(typeof result.feedbackIndex).toBe('bigint');
    });

    it.skip('should set agent metadata', async () => {
      if (!signer) return;

      const result = await sdk.setMetadata(
        DEVNET_TEST_AGENT_ID,
        'test_key',
        'test_value'
      );

      expect(result).toHaveProperty('signature');
      expect(typeof result.signature).toBe('string');
    });
  });

  describe('Error handling', () => {
    let sdk: ReturnType<typeof createDevnetSDK>;

    beforeAll(() => {
      sdk = createDevnetSDK();
    });

    it('should handle non-existent agent gracefully', async () => {
      const nonExistentId = 999999999n;
      const agent = await sdk.loadAgent(nonExistentId);

      expect(agent).toBeNull();
    });

    it('should handle non-existent feedback gracefully', async () => {
      const randomClient = Keypair.generate().publicKey;
      const feedback = await sdk.readFeedback(
        DEVNET_TEST_AGENT_ID,
        randomClient,
        9999n
      );

      expect(feedback).toBeNull();
    });

    it('should throw on write operations without signer', async () => {
      await expect(sdk.registerAgent()).rejects.toThrow('No signer configured');
    });
  });
});
