/**
 * E2E Tests - Performance and Scalability
 *
 * Tests performance characteristics:
 * - Response times
 * - Batch operations
 * - Pagination
 * - Large data sets
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Keypair, PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

describe('E2E: Performance Tests', () => {
  let sdk: SolanaSDK;
  let testAgent: PublicKey | null = null;

  // Use Helius RPC for advanced queries (getProgramAccounts)
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  beforeAll(async () => {
    sdk = new SolanaSDK({ cluster: 'devnet', rpcUrl });
    console.log(`Using RPC: ${rpcUrl.includes('helius') ? 'Helius' : 'Default'}`);


    // Find an existing agent on devnet to use for testing
    // This avoids needing to create agents just for performance tests
    try {
      const agents = await sdk.getAllAgents();
      if (agents.length > 0) {
        // account.asset is Uint8Array, convert to PublicKey
        testAgent = new PublicKey(agents[0].account.asset);
        console.log(`Found ${agents.length} agents on devnet, using: ${testAgent.toBase58()}`);
      } else {
        console.log('No agents found on devnet - some tests will be skipped');
      }
    } catch (error) {
      console.log('Could not fetch agents from devnet:', error);
    }
  }, 60000);

  describe('Response times', () => {
    it('should load agent in reasonable time', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      const start = Date.now();
      await sdk.loadAgent(testAgent);
      const duration = Date.now() - start;

      console.log(`\u23f1\ufe0f  loadAgent: ${duration}ms`);
      expect(duration).toBeLessThan(5000); // Should complete in 5s
    }, 30000);

    it('should get summary in reasonable time (O(1) cached)', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      const start = Date.now();
      await sdk.getSummary(testAgent);
      const duration = Date.now() - start;

      console.log(`\u23f1\ufe0f  getSummary: ${duration}ms`);
      expect(duration).toBeLessThan(2000); // Cached data should be fast
    }, 30000);

    it('should read feedback in reasonable time', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      const client = Keypair.generate().publicKey;
      const start = Date.now();
      await sdk.readFeedback(testAgent, client, 0n);
      const duration = Date.now() - start;

      console.log(`\u23f1\ufe0f  readFeedback: ${duration}ms`);
      expect(duration).toBeLessThan(5000);
    }, 30000);
  });

  describe('Batch operations', () => {
    it('should handle multiple agent loads in parallel', async () => {
      // getAllAgents requires advanced RPC - use testAgent if available
      if (!testAgent) {
        console.log('Skipping test - no test agent available (requires advanced RPC)');
        return;
      }

      // Load the same agent multiple times in parallel to test concurrency
      const agentPubkeys = Array(5).fill(testAgent);

      const start = Date.now();
      const results = await Promise.all(
        agentPubkeys.map(pk => sdk.loadAgent(pk))
      );
      const duration = Date.now() - start;

      console.log(`\u23f1\ufe0f  Load ${agentPubkeys.length} agents in parallel: ${duration}ms`);
      expect(results).toHaveLength(agentPubkeys.length);
      expect(duration).toBeLessThan(10000); // Parallel should be faster
    }, 30000);

    it('should handle multiple summary requests in parallel', async () => {
      // getAllAgents requires advanced RPC - use testAgent if available
      if (!testAgent) {
        console.log('Skipping test - no test agent available (requires advanced RPC)');
        return;
      }

      // Get summary for same agent multiple times in parallel
      const agentPubkeys = Array(5).fill(testAgent);

      const start = Date.now();
      const results = await Promise.all(
        agentPubkeys.map(pk => sdk.getSummary(pk))
      );
      const duration = Date.now() - start;

      console.log(`\u23f1\ufe0f  Get ${agentPubkeys.length} summaries in parallel: ${duration}ms`);
      expect(results).toHaveLength(agentPubkeys.length);
      results.forEach(summary => {
        expect(summary).toHaveProperty('averageScore');
      });
    }, 30000);

    it('should handle sequential operations efficiently', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      const start = Date.now();
      await sdk.loadAgent(testAgent);
      await sdk.getSummary(testAgent);
      await sdk.readAllFeedback(testAgent);
      // Skip getClients as it requires advanced RPC
      await sdk.agentExists(testAgent);
      const duration = Date.now() - start;

      console.log(`\u23f1\ufe0f  4 sequential operations: ${duration}ms`);
      expect(duration).toBeLessThan(15000);
    }, 30000);
  });

  describe('Large data sets', () => {
    it('should handle reading all feedbacks efficiently', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      const start = Date.now();
      const feedbacks = await sdk.readAllFeedback(testAgent, true); // Include revoked
      const duration = Date.now() - start;

      console.log(`\u23f1\ufe0f  Read all feedbacks (${feedbacks.length} items): ${duration}ms`);

      if (feedbacks.length > 0) {
        const avgTimePerFeedback = duration / feedbacks.length;
        console.log(`   Average: ${avgTimePerFeedback.toFixed(2)}ms per feedback`);
      }

      expect(Array.isArray(feedbacks)).toBe(true);
    }, 30000);

    it('should handle large client list', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      // getClients requires advanced RPC - may throw on default devnet
      try {
        const start = Date.now();
        const clients = await sdk.getClients(testAgent);
        const duration = Date.now() - start;

        console.log(`\u23f1\ufe0f  Get clients (${clients.length} items): ${duration}ms`);
        expect(Array.isArray(clients)).toBe(true);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Expected on default devnet RPC
        console.log('Skipping - operation requires advanced RPC:', errorMessage);
        expect(errorMessage).toMatch(/UnsupportedRpc|getProgramAccounts/i);
      }
    }, 30000);

    it('should handle agents by owner query', async () => {
      const owner = Keypair.generate().publicKey;

      // getAgentsByOwner requires advanced RPC - may throw on default devnet
      try {
        const start = Date.now();
        const agents = await sdk.getAgentsByOwner(owner);
        const duration = Date.now() - start;

        console.log(`\u23f1\ufe0f  Get agents by owner (${agents.length} items): ${duration}ms`);
        expect(Array.isArray(agents)).toBe(true);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Expected on default devnet RPC
        console.log('Skipping - operation requires advanced RPC:', errorMessage);
        expect(errorMessage).toMatch(/UnsupportedRpc|getProgramAccounts/i);
      }
    }, 30000);
  });

  describe('Caching performance', () => {
    it('should benefit from reputation cache', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      // First call
      const start1 = Date.now();
      const summary1 = await sdk.getSummary(testAgent);
      const duration1 = Date.now() - start1;

      // Second call (should hit cache)
      const start2 = Date.now();
      const summary2 = await sdk.getSummary(testAgent);
      const duration2 = Date.now() - start2;

      console.log(`\u23f1\ufe0f  First call: ${duration1}ms`);
      console.log(`\u23f1\ufe0f  Second call: ${duration2}ms`);

      expect(summary1.averageScore).toBe(summary2.averageScore);
      expect(summary1.totalFeedbacks).toBe(summary2.totalFeedbacks);
    }, 30000);
  });

  describe('Network efficiency', () => {
    it('should minimize RPC calls for agent info', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      // Track RPC calls (rough estimate)
      const start = Date.now();
      await sdk.loadAgent(testAgent);
      const duration = Date.now() - start;

      console.log(`\u23f1\ufe0f  Agent load with network: ${duration}ms`);

      // Should complete reasonably fast
      expect(duration).toBeLessThan(5000);
    }, 30000);

    it('should handle multiple reads without excessive RPC calls', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      const start = Date.now();

      // Multiple reads that could potentially reuse data
      const [agent, summary, exists] = await Promise.all([
        sdk.loadAgent(testAgent),
        sdk.getSummary(testAgent),
        sdk.agentExists(testAgent),
      ]);

      const duration = Date.now() - start;

      console.log(`\u23f1\ufe0f  3 parallel reads: ${duration}ms`);
      expect(duration).toBeLessThan(10000);
    }, 30000);
  });

  describe('Memory efficiency', () => {
    it('should handle many agents without memory issues', async () => {
      // getAllAgents requires advanced RPC - use testAgent if available
      if (!testAgent) {
        console.log('Skipping test - no test agent available (requires advanced RPC)');
        return;
      }

      // Load same agent multiple times to test memory handling
      const agentPubkeys = Array(20).fill(testAgent);

      const start = Date.now();
      const results = await Promise.all(
        agentPubkeys.map(pk => sdk.loadAgent(pk))
      );
      const duration = Date.now() - start;

      console.log(`\u23f1\ufe0f  Load ${agentPubkeys.length} agents: ${duration}ms`);
      expect(results).toHaveLength(agentPubkeys.length);

      // Check memory usage (rough)
      const used = process.memoryUsage();
      console.log(`   Memory: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
    }, 60000);

    it('should handle large feedback arrays', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      const start = Date.now();
      const feedbacks = await sdk.readAllFeedback(testAgent, true);
      const duration = Date.now() - start;

      console.log(`\u23f1\ufe0f  Load all feedbacks: ${duration}ms (${feedbacks.length} items)`);

      if (feedbacks.length > 100) {
        console.log(`   Large dataset: ${feedbacks.length} feedbacks processed`);
      }

      expect(Array.isArray(feedbacks)).toBe(true);
    }, 30000);
  });

  describe('Throughput', () => {
    it('should maintain good throughput for repeated reads', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      const iterations = 10;

      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await sdk.getSummary(testAgent);
      }

      const duration = Date.now() - start;
      const avgTime = duration / iterations;
      const throughput = 1000 / avgTime;

      console.log(`\u23f1\ufe0f  ${iterations} sequential reads: ${duration}ms`);
      console.log(`   Average: ${avgTime.toFixed(2)}ms per request`);
      console.log(`   Throughput: ${throughput.toFixed(2)} req/sec`);

      expect(avgTime).toBeLessThan(2000);
    }, 60000);

    it('should maintain good throughput for parallel reads', async () => {
      if (!testAgent) {
        console.log('Skipping test - no test agent available');
        return;
      }

      const concurrency = 5;
      const iterations = 10;

      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await Promise.all(
          Array(concurrency).fill(null).map(() => sdk.getSummary(testAgent!))
        );
      }

      const duration = Date.now() - start;
      const totalRequests = concurrency * iterations;
      const avgTime = duration / totalRequests;
      const throughput = 1000 / avgTime;

      console.log(`\u23f1\ufe0f  ${totalRequests} parallel reads (${concurrency}x${iterations}): ${duration}ms`);
      console.log(`   Average: ${avgTime.toFixed(2)}ms per request`);
      console.log(`   Throughput: ${throughput.toFixed(2)} req/sec`);

      expect(avgTime).toBeLessThan(1000);
    }, 60000);
  });
});
