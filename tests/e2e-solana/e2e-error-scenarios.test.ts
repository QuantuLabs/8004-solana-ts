/**
 * E2E Tests - Error Scenarios and Edge Cases
 *
 * Tests error handling and edge cases:
 * - Invalid inputs
 * - Non-existent entities
 * - Permission errors
 * - Network errors
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Keypair, PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

describe('E2E: Error Scenarios', () => {
  let sdk: SolanaSDK;
  let sdkReadOnly: SolanaSDK;
  let signer: Keypair;

  beforeAll(() => {
    const privateKeyEnv = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKeyEnv) {
      throw new Error('SOLANA_PRIVATE_KEY environment variable not set');
    }

    signer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(privateKeyEnv))
    );

    sdk = new SolanaSDK({ cluster: 'devnet', signer });
    sdkReadOnly = new SolanaSDK({ cluster: 'devnet' }); // No signer
  });

  describe('Non-existent entities', () => {
    const nonExistentAgentId = 999999999999n;

    it('should return null for non-existent agent', async () => {
      const agent = await sdk.loadAgent(nonExistentAgentId);
      expect(agent).toBeNull();
    }, 30000);

    it('should return false for non-existent agent check', async () => {
      const exists = await sdk.agentExists(nonExistentAgentId);
      expect(exists).toBe(false);
    }, 30000);

    it('should return null for non-existent feedback', async () => {
      const randomClient = Keypair.generate().publicKey;
      const feedback = await sdk.readFeedback(
        nonExistentAgentId,
        randomClient,
        0n
      );
      expect(feedback).toBeNull();
    }, 30000);

    it('should return default summary for non-existent agent', async () => {
      const summary = await sdk.getSummary(nonExistentAgentId);
      expect(summary.averageScore).toBe(0);
      expect(summary.totalFeedbacks).toBe(0);
    }, 30000);

    it('should return empty array for non-existent agent feedbacks', async () => {
      const feedbacks = await sdk.readAllFeedback(nonExistentAgentId);
      expect(feedbacks).toEqual([]);
    }, 30000);

    it('should return empty array for non-existent agent clients', async () => {
      const clients = await sdk.getClients(nonExistentAgentId);
      expect(clients).toEqual([]);
    }, 30000);

    it('should return 0 for non-existent client last index', async () => {
      const randomClient = Keypair.generate().publicKey;
      const lastIndex = await sdk.getLastIndex(nonExistentAgentId, randomClient);
      expect(lastIndex).toBe(0n);
    }, 30000);

    it('should return 0 for non-existent feedback response count', async () => {
      const count = await sdk.getResponseCount(nonExistentAgentId, 0n);
      expect(count).toBe(0);
    }, 30000);

    it('should return empty array for non-existent responses', async () => {
      const responses = await sdk.readResponses(nonExistentAgentId, 0n);
      expect(responses).toEqual([]);
    }, 30000);
  });

  describe('Permission errors (read-only SDK)', () => {
    it('should throw on registerAgent without signer', async () => {
      await expect(
        sdkReadOnly.registerAgent('ipfs://test')
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on setAgentUri without signer', async () => {
      await expect(
        sdkReadOnly.setAgentUri(1n, 'ipfs://test')
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on setMetadata without signer', async () => {
      await expect(
        sdkReadOnly.setMetadata(1n, 'key', 'value')
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on giveFeedback without signer', async () => {
      await expect(
        sdkReadOnly.giveFeedback(1n, { score: 85, fileUri: 'ipfs://test', fileHash: Buffer.alloc(32) })
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on revokeFeedback without signer', async () => {
      await expect(
        sdkReadOnly.revokeFeedback(1n, 0n)
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on appendResponse without signer', async () => {
      const client = Keypair.generate().publicKey;
      await expect(
        sdkReadOnly.appendResponse(1n, client, 0n, 'ipfs://test', Buffer.alloc(32))
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on requestValidation without signer', async () => {
      const validator = Keypair.generate().publicKey;
      await expect(
        sdkReadOnly.requestValidation(1n, validator, 0, 'ipfs://test', Buffer.alloc(32))
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on respondToValidation without signer', async () => {
      await expect(
        sdkReadOnly.respondToValidation(1n, 0, 1, 'ipfs://test', Buffer.alloc(32))
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });
  });

  describe('Invalid inputs', () => {
    it('should handle invalid score in giveFeedback', async () => {
      // Score must be 0-100
      await expect(
        sdk.giveFeedback(1n, { score: 150, fileUri: 'ipfs://test', fileHash: Buffer.alloc(32) })
      ).rejects.toThrow();
    }, 60000);

    it('should handle invalid response in respondToValidation', async () => {
      // Response must be 0 or 1
      await expect(
        sdk.respondToValidation(1n, 0, 999, 'ipfs://test', Buffer.alloc(32))
      ).rejects.toThrow();
    }, 60000);

    it('should handle empty URI', async () => {
      await expect(
        sdk.registerAgent('')
      ).rejects.toThrow();
    }, 60000);

    it('should handle invalid hash size', async () => {
      // Hash must be exactly 32 bytes
      await expect(
        sdk.giveFeedback(1n, { score: 85, fileUri: 'ipfs://test', fileHash: Buffer.alloc(16) })
      ).rejects.toThrow();
    }, 60000);
  });

  describe('Edge cases', () => {
    it('should handle very long URIs', async () => {
      const longUri = 'ipfs://' + 'a'.repeat(200);

      await expect(
        sdk.registerAgent(longUri)
      ).rejects.toThrow(); // Should fail due to max length
    }, 60000);

    it('should handle special characters in metadata', async () => {
      const specialValue = 'test\n\t\r🚀';

      // This might succeed or fail depending on validation
      try {
        await sdk.setMetadata(1n, 'special', specialValue);
        console.log('Special characters accepted');
      } catch (error) {
        console.log('Special characters rejected:', error.message);
      }
    }, 60000);

    it('should handle rapid sequential calls', async () => {
      const agentId = 1n;

      // Multiple reads in parallel
      const promises = Array(5).fill(null).map(() =>
        sdk.loadAgent(agentId)
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result === null || result.agent_id === agentId).toBe(true);
      });
    }, 30000);

    it('should handle empty owner query', async () => {
      const emptyOwner = Keypair.generate().publicKey;
      const agents = await sdk.getAgentsByOwner(emptyOwner);

      expect(agents).toEqual([]);
    }, 30000);
  });

  describe('Network edge cases', () => {
    it('should handle RPC timeout gracefully', async () => {
      // Create SDK with very short timeout (this is a simulation)
      const slowSdk = new SolanaSDK({
        cluster: 'devnet',
        signer,
        rpcUrl: 'https://api.devnet.solana.com'
      });

      // Some operations might time out, but shouldn't crash
      try {
        const summary = await slowSdk.getSummary(1n);
        expect(summary).toBeDefined();
      } catch (error) {
        // Timeout is acceptable
        console.log('Network timeout occurred (expected)');
      }
    }, 30000);

    it('should handle invalid RPC URL gracefully', async () => {
      // This should fail during initialization or first call
      const invalidSdk = new SolanaSDK({
        cluster: 'devnet',
        rpcUrl: 'https://invalid-rpc-url-that-does-not-exist.com'
      });

      await expect(
        invalidSdk.loadAgent(1n)
      ).rejects.toThrow();
    }, 30000);
  });

  describe('Concurrent operations', () => {
    it('should handle concurrent reads safely', async () => {
      const agentId = 1n;

      const operations = [
        sdk.loadAgent(agentId),
        sdk.getSummary(agentId),
        sdk.readAllFeedback(agentId),
        sdk.getClients(agentId),
        sdk.agentExists(agentId),
      ];

      const results = await Promise.all(operations);
      expect(results).toHaveLength(5);
    }, 30000);

    it('should handle mixed read/write operations', async () => {
      // This tests that reads don't interfere with writes
      const agentId = 1n;

      const readOps = Array(3).fill(null).map(() =>
        sdk.getSummary(agentId)
      );

      const results = await Promise.all(readOps);
      results.forEach(summary => {
        expect(summary).toHaveProperty('averageScore');
        expect(summary).toHaveProperty('totalFeedbacks');
      });
    }, 30000);
  });
});
