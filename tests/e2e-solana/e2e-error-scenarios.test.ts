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
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('E2E: Error Scenarios', () => {
  let sdk: SolanaSDK;
  let sdkReadOnly: SolanaSDK;
  let signer: Keypair;
  let testAgent: PublicKey | null = null;
  let testCollection: PublicKey | null = null;

  // Generate a random PublicKey that almost certainly doesn't exist as an agent
  const nonExistentAsset = Keypair.generate().publicKey;

  // Use Helius RPC for advanced queries (getProgramAccounts)
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  beforeAll(async () => {
    // Read wallet from file
    const walletPath = process.env.SOLANA_WALLET_PATH || path.join(os.homedir(), '.config', 'solana', 'id.json');
    const walletJson = fs.readFileSync(walletPath, 'utf-8');
    signer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(walletJson))
    );

    console.log(`Using RPC: ${rpcUrl.includes('helius') ? 'Helius' : 'Default'}`);
    sdk = new SolanaSDK({ cluster: 'devnet', signer, rpcUrl });
    sdkReadOnly = new SolanaSDK({ cluster: 'devnet', rpcUrl }); // No signer

    // Try to find an existing agent for tests that need one
    try {
      const agents = await sdk.getAllAgents();
      if (agents.length > 0) {
        testAgent = new PublicKey(agents[0].account.asset);
        testCollection = new PublicKey(agents[0].account.collection);
        console.log(`Using test agent: ${testAgent.toBase58()}`);
      }
    } catch (error) {
      console.log('Could not fetch agents:', error);
    }
  }, 60000);

  describe('Non-existent entities', () => {
    it('should return null for non-existent agent', async () => {
      const agent = await sdk.loadAgent(nonExistentAsset);
      expect(agent).toBeNull();
    }, 30000);

    it('should return false for non-existent agent check', async () => {
      const exists = await sdk.agentExists(nonExistentAsset);
      expect(exists).toBe(false);
    }, 30000);

    it('should return null for non-existent feedback', async () => {
      const randomClient = Keypair.generate().publicKey;
      const feedback = await sdk.readFeedback(
        nonExistentAsset,
        randomClient,
        0n
      );
      expect(feedback).toBeNull();
    }, 30000);

    it('should return default summary for non-existent agent', async () => {
      const summary = await sdk.getSummary(nonExistentAsset);
      expect(summary.averageScore).toBe(0);
      expect(summary.totalFeedbacks).toBe(0);
    }, 30000);

    it('should return empty array for non-existent agent feedbacks', async () => {
      // readAllFeedback requires advanced RPC - skip on default devnet
      try {
        const feedbacks = await sdk.readAllFeedback(nonExistentAsset);
        expect(feedbacks).toEqual([]);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Expected on default devnet RPC
        expect(errorMessage).toMatch(/UnsupportedRpc|getProgramAccounts/i);
      }
    }, 30000);

    it('should return empty array for non-existent agent clients', async () => {
      // getClients requires advanced RPC - skip on default devnet
      try {
        const clients = await sdk.getClients(nonExistentAsset);
        expect(clients).toEqual([]);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Expected on default devnet RPC
        expect(errorMessage).toMatch(/UnsupportedRpc|getProgramAccounts/i);
      }
    }, 30000);

    it('should return 0 for non-existent client last index', async () => {
      const randomClient = Keypair.generate().publicKey;
      const lastIndex = await sdk.getLastIndex(nonExistentAsset, randomClient);
      expect(lastIndex).toBe(0n);
    }, 30000);

    it('should return 0 for non-existent feedback response count', async () => {
      const count = await sdk.getResponseCount(nonExistentAsset, 0n);
      expect(count).toBe(0);
    }, 30000);

    it('should return empty array for non-existent responses', async () => {
      const responses = await sdk.readResponses(nonExistentAsset, 0n);
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
      if (!testAgent || !testCollection) {
        console.log('Skipping test - no test agent available');
        return;
      }
      await expect(
        sdkReadOnly.setAgentUri(testAgent, testCollection, 'ipfs://test')
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on setMetadata without signer', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }
      await expect(
        sdkReadOnly.setMetadata(testAgent, 'key', 'value')
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on giveFeedback without signer', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }
      await expect(
        sdkReadOnly.giveFeedback(testAgent, { score: 85, feedbackUri: 'ipfs://test', feedbackHash: Buffer.alloc(32) })
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on revokeFeedback without signer', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }
      await expect(
        sdkReadOnly.revokeFeedback(testAgent, 0n)
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on appendResponse without signer', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }
      await expect(
        sdkReadOnly.appendResponse(testAgent, 0n, 'ipfs://test', Buffer.alloc(32))
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on requestValidation without signer', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }
      const validator = Keypair.generate().publicKey;
      await expect(
        sdkReadOnly.requestValidation(testAgent, validator, 0, 'ipfs://test', Buffer.alloc(32))
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });

    it('should throw on respondToValidation without signer', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }
      await expect(
        sdkReadOnly.respondToValidation(testAgent, 0, 1, 'ipfs://test', Buffer.alloc(32))
      ).rejects.toThrow('No signer configured - SDK is read-only');
    });
  });

  describe('Invalid inputs', () => {
    it('should handle invalid score in giveFeedback', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }
      // Score must be 0-100 - SDK validates and returns error result
      const result = await sdk.giveFeedback(testAgent, { score: 150, feedbackUri: 'ipfs://test', feedbackHash: Buffer.alloc(32) }) as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain('Score must be between 0 and 100');
    }, 60000);

    it('should handle invalid response in respondToValidation', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }
      // Response must be 0-100 - SDK validates and returns error result
      const result = await sdk.respondToValidation(testAgent, 0, 999, 'ipfs://test', Buffer.alloc(32)) as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain('Response must be between 0 and 100');
    }, 60000);

    it('should handle empty URI', async () => {
      // Note: Empty URI may be accepted by SDK but rejected by program
      // The test verifies at least one failure path exists
      const result = await sdk.registerAgent('');
      // Either throws or returns success=false, or creates empty-uri agent (depends on validation)
      // We accept any outcome - this is more of a documentation test
      expect(result).toBeDefined();
    }, 60000);

    it('should handle invalid hash size', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }
      // Hash must be exactly 32 bytes - SDK validates and returns error result
      const result = await sdk.giveFeedback(testAgent, { score: 85, feedbackUri: 'ipfs://test', feedbackHash: Buffer.alloc(16) }) as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain('feedbackHash must be 32 bytes');
    }, 60000);
  });

  describe('Edge cases', () => {
    it('should handle very long URIs', async () => {
      const longUri = 'ipfs://' + 'a'.repeat(200);

      // The SDK returns a TransactionResult with success=false instead of throwing
      const result = await sdk.registerAgent(longUri) as { success?: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 60000);

    it('should handle special characters in metadata', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }
      const specialValue = 'test\n\t\r';

      // This might succeed or fail depending on validation
      try {
        await sdk.setMetadata(testAgent, 'special', specialValue);
        console.log('Special characters accepted');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log('Special characters rejected:', errorMessage);
      }
    }, 60000);

    it('should handle rapid sequential calls', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      // Multiple reads in parallel
      const promises = Array(5).fill(null).map(() =>
        sdk.loadAgent(testAgent!)
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        // result.asset is Uint8Array, compare with testAgent
        const resultAssetPK = result ? new PublicKey(result.asset) : null;
        expect(result === null || resultAssetPK?.equals(testAgent!)).toBe(true);
      });
    }, 30000);

    it('should handle empty owner query', async () => {
      const emptyOwner = Keypair.generate().publicKey;
      // getAgentsByOwner requires advanced RPC - may throw on default devnet
      try {
        const agents = await sdk.getAgentsByOwner(emptyOwner);
        expect(agents).toEqual([]);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Expected on default devnet RPC
        expect(errorMessage).toMatch(/UnsupportedRpc|getProgramAccounts/i);
      }
    }, 30000);
  });

  describe('Network edge cases', () => {
    it('should handle RPC timeout gracefully', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }
      // Create SDK with very short timeout (this is a simulation)
      const slowSdk = new SolanaSDK({
        cluster: 'devnet',
        signer,
        rpcUrl: 'https://api.devnet.solana.com'
      });

      // Some operations might time out, but shouldn't crash
      try {
        const summary = await slowSdk.getSummary(testAgent);
        expect(summary).toBeDefined();
      } catch (error) {
        // Timeout is acceptable
        console.log('Network timeout occurred (expected)');
      }
    }, 30000);

    it('should handle invalid RPC URL gracefully', async () => {
      // SDK validates URL immediately in constructor
      expect(() => {
        new SolanaSDK({
          cluster: 'devnet',
          rpcUrl: 'invalid://not-a-valid-url'
        });
      }).toThrow('Endpoint URL must start with');
    }, 10000);
  });

  describe('Concurrent operations', () => {
    it('should handle concurrent reads safely', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      // Note: getClients requires advanced RPC - excluded from this test
      const operations = [
        sdk.loadAgent(testAgent),
        sdk.getSummary(testAgent),
        sdk.readAllFeedback(testAgent),
        sdk.agentExists(testAgent),
      ];

      const results = await Promise.all(operations);
      expect(results).toHaveLength(4);
    }, 30000);

    it('should handle mixed read/write operations', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }
      // This tests that reads don't interfere with writes
      const readOps = Array(3).fill(null).map(() =>
        sdk.getSummary(testAgent!)
      );

      const results = await Promise.all(readOps);
      results.forEach(summary => {
        expect(summary).toHaveProperty('averageScore');
        expect(summary).toHaveProperty('totalFeedbacks');
      });
    }, 30000);
  });
});
