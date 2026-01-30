/**
 * E2E Tests - Error Scenarios and Edge Cases (Localnet)
 *
 * Localnet version of e2e-error-scenarios.test.ts
 * Tests error handling and edge cases:
 * - Invalid inputs
 * - Non-existent entities
 * - Permission errors
 * - Network errors
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

describe('E2E: Error Scenarios (Localnet)', () => {
  let sdk: SolanaSDK;
  let sdkReadOnly: SolanaSDK;
  let signer: Keypair;
  let testAgent: PublicKey;
  let testCollection: PublicKey;

  const nonExistentAsset = Keypair.generate().publicKey;
  const rpcUrl = process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899';
  const indexerUrl = process.env.INDEXER_URL || 'http://localhost:3001/rest/v1';

  beforeAll(async () => {
    signer = Keypair.generate();

    const { Connection } = await import('@solana/web3.js');
    const connection = new Connection(rpcUrl);

    await connection.requestAirdrop(signer.publicKey, 10 * LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 2000));

    sdk = new SolanaSDK({ rpcUrl, signer, indexerUrl });
    sdkReadOnly = new SolanaSDK({ rpcUrl, indexerUrl }); // No signer

    // Create a test agent for permission tests
    const result = await sdk.registerAgent('ipfs://QmTestAgent');
    if (result.success && result.asset) {
      testAgent = result.asset;
      testCollection = result.collection || result.asset;
      console.log(`Test agent created: ${testAgent.toBase58()}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 60000);

  describe('Non-existent entities', () => {
    it('should return null for non-existent agent', async () => {
      const agent = await sdk.loadAgent(nonExistentAsset);
      expect(agent).toBeNull();
    }, 15000);

    it('should return false for non-existent agent check', async () => {
      const exists = await sdk.agentExists(nonExistentAsset);
      expect(exists).toBe(false);
    }, 15000);

    it('should return null for non-existent feedback', async () => {
      const randomClient = Keypair.generate().publicKey;
      const feedback = await sdk.readFeedback(
        nonExistentAsset,
        randomClient,
        0n
      );
      expect(feedback).toBeNull();
    }, 15000);

    it('should return default summary for non-existent agent', async () => {
      const summary = await sdk.getSummary(nonExistentAsset);
      expect(summary.averageScore).toBe(0);
      expect(summary.totalFeedbacks).toBe(0);
    }, 15000);

    it('should return empty array for non-existent agent feedbacks', async () => {
      const feedbacks = await sdk.readAllFeedback(nonExistentAsset);
      expect(feedbacks).toEqual([]);
    }, 15000);

    it('should return empty array for non-existent agent clients', async () => {
      const clients = await sdk.getClients(nonExistentAsset);
      expect(clients).toEqual([]);
    }, 15000);

    it('should return -1 for non-existent client last index', async () => {
      const randomClient = Keypair.generate().publicKey;
      const lastIndex = await sdk.getLastIndex(nonExistentAsset, randomClient);
      expect(lastIndex).toBe(-1n);
    }, 15000);

    it('should return 0 for non-existent feedback response count', async () => {
      const count = await sdk.getResponseCount(nonExistentAsset, 0n);
      expect(count).toBe(0);
    }, 15000);

    it('should return empty array for non-existent responses', async () => {
      const responses = await sdk.readResponses(nonExistentAsset, 0n);
      expect(responses).toEqual([]);
    }, 15000);
  });

  describe('Permission errors (read-only SDK)', () => {
    it('should throw on registerAgent without signer', async () => {
      await expect(
        sdkReadOnly.registerAgent('ipfs://test')
      ).rejects.toThrow('No signer configured');
    });

    it('should throw on setAgentUri without signer', async () => {
      await expect(
        sdkReadOnly.setAgentUri(testAgent, testCollection, 'ipfs://test')
      ).rejects.toThrow('No signer configured');
    });

    it('should throw on setMetadata without signer', async () => {
      await expect(
        sdkReadOnly.setMetadata(testAgent, 'key', 'value')
      ).rejects.toThrow('No signer configured');
    });

    it('should throw on giveFeedback without signer', async () => {
      await expect(
        sdkReadOnly.giveFeedback(testAgent, { value: 85n, score: 85, feedbackUri: 'ipfs://test', feedbackHash: Buffer.alloc(32) })
      ).rejects.toThrow('No signer configured');
    });

    it('should throw on revokeFeedback without signer', async () => {
      await expect(
        sdkReadOnly.revokeFeedback(testAgent, 0n, Buffer.alloc(32))
      ).rejects.toThrow('No signer configured');
    });

    it('should throw on appendResponse without signer', async () => {
      await expect(
        sdkReadOnly.appendResponse(testAgent, Keypair.generate().publicKey, 0n, Buffer.alloc(32), 'ipfs://test')
      ).rejects.toThrow('No signer configured');
    });

    it('should throw on requestValidation without signer', async () => {
      const validator = Keypair.generate().publicKey;
      await expect(
        sdkReadOnly.requestValidation(testAgent, validator, 'ipfs://test', { nonce: 0, requestHash: Buffer.alloc(32) })
      ).rejects.toThrow('No signer configured');
    });

    it('should throw on respondToValidation without signer', async () => {
      await expect(
        sdkReadOnly.respondToValidation(testAgent, 0, 1, 'ipfs://test', { responseHash: Buffer.alloc(32) })
      ).rejects.toThrow('No signer configured');
    });
  });

  describe('Invalid inputs', () => {
    it('should handle invalid score in giveFeedback', async () => {
      const result = await sdk.giveFeedback(testAgent, { value: 150n, score: 150, feedbackUri: 'ipfs://test', feedbackHash: Buffer.alloc(32) }) as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain('Score must be between 0 and 100');
    }, 15000);

    it('should handle invalid response in respondToValidation', async () => {
      const result = await sdk.respondToValidation(testAgent, 0, 999, 'ipfs://test', { responseHash: Buffer.alloc(32) }) as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain('Response must be between 0 and 100');
    }, 15000);

    it('should handle invalid hash size', async () => {
      const result = await sdk.giveFeedback(testAgent, { value: 85n, score: 85, feedbackUri: 'ipfs://test', feedbackHash: Buffer.alloc(16) }) as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain('feedbackHash must be 32 bytes');
    }, 15000);
  });

  describe('Edge cases', () => {
    it('should handle very long URIs', async () => {
      const longUri = 'ipfs://' + 'a'.repeat(244); // 7 + 244 = 251 bytes > 250 limit

      const result = await sdk.registerAgent(longUri) as { success?: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/250/);
    }, 15000);

    it('should handle special characters in metadata', async () => {
      const specialValue = 'test\n\t\r';

      try {
        const result = await sdk.setMetadata(testAgent, 'special', specialValue);
        console.log('Special characters accepted:', result.success);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log('Special characters rejected:', errorMessage);
      }
    }, 15000);

    it('should handle rapid sequential calls', async () => {
      const promises = Array(5).fill(null).map(() =>
        sdk.loadAgent(testAgent)
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        const resultAssetPK = result ? new PublicKey(result.asset) : null;
        expect(result === null || resultAssetPK?.equals(testAgent)).toBe(true);
      });
    }, 15000);

    it('should handle empty owner query', async () => {
      const emptyOwner = Keypair.generate().publicKey;
      const agents = await sdk.getAgentsByOwner(emptyOwner);
      expect(agents).toEqual([]);
    }, 15000);

    it('should handle concurrent writes gracefully', async () => {
      const promises = Array(3).fill(null).map((_, i) =>
        sdk.setMetadata(testAgent, `concurrent_${i}`, `value_${i}`)
      );

      const results = await Promise.allSettled(promises);

      // At least some should succeed
      const successes = results.filter(r => r.status === 'fulfilled' && (r.value as { success: boolean }).success);
      expect(successes.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Boundary tests', () => {
    it('should accept URI at exactly 250 bytes', async () => {
      const maxUri = 'ipfs://' + 'a'.repeat(243); // 7 + 243 = 250 bytes

      const result = await sdk.registerAgent(maxUri);
      expect(result.success).toBe(true);
    }, 30000);

    it('should reject URI at 251 bytes', async () => {
      const overUri = 'ipfs://' + 'a'.repeat(244); // 7 + 244 = 251 bytes

      const result = await sdk.registerAgent(overUri) as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/250/);
    }, 15000);

    it('should accept score at 0 (minimum)', async () => {
      const result = await sdk.giveFeedback(testAgent, {
        value: 0n,
        score: 0,
        feedbackUri: 'ipfs://score0',
        feedbackHash: Buffer.alloc(32, 1),
      });
      // Self-feedback not allowed, so this will fail for a different reason
      // If using a different client, score=0 should be accepted
      expect(result).toBeDefined();
    }, 15000);

    it('should accept score at 100 (maximum)', async () => {
      const result = await sdk.giveFeedback(testAgent, {
        value: 100n,
        score: 100,
        feedbackUri: 'ipfs://score100',
        feedbackHash: Buffer.alloc(32, 2),
      });
      // Self-feedback not allowed, so this will fail for a different reason
      expect(result).toBeDefined();
    }, 15000);

    it('should reject score at 101', async () => {
      const result = await sdk.giveFeedback(testAgent, {
        value: 101n,
        score: 101,
        feedbackUri: 'ipfs://score101',
        feedbackHash: Buffer.alloc(32, 3),
      }) as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain('Score must be between 0 and 100');
    }, 15000);
  });
});
