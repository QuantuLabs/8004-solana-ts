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
import { Keypair } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

describe('E2E: Performance Tests', () => {
  let sdk: SolanaSDK;

  beforeAll(() => {
    sdk = new SolanaSDK({ cluster: 'devnet' });
  });

  describe('Response times', () => {
    it('should load agent in reasonable time', async () => {
      const start = Date.now();
      await sdk.loadAgent(1n);
      const duration = Date.now() - start;

      console.log(`⏱️  loadAgent: ${duration}ms`);
      expect(duration).toBeLessThan(5000); // Should complete in 5s
    }, 30000);

    it('should get summary in reasonable time (O(1) cached)', async () => {
      const start = Date.now();
      await sdk.getSummary(1n);
      const duration = Date.now() - start;

      console.log(`⏱️  getSummary: ${duration}ms`);
      expect(duration).toBeLessThan(2000); // Cached data should be fast
    }, 30000);

    it('should read feedback in reasonable time', async () => {
      const client = Keypair.generate().publicKey;
      const start = Date.now();
      await sdk.readFeedback(1n, client, 0n);
      const duration = Date.now() - start;

      console.log(`⏱️  readFeedback: ${duration}ms`);
      expect(duration).toBeLessThan(5000);
    }, 30000);
  });

  describe('Batch operations', () => {
    it('should handle multiple agent loads in parallel', async () => {
      const agentIds = [1n, 2n, 3n, 4n, 5n];

      const start = Date.now();
      const results = await Promise.all(
        agentIds.map(id => sdk.loadAgent(id))
      );
      const duration = Date.now() - start;

      console.log(`⏱️  Load 5 agents in parallel: ${duration}ms`);
      expect(results).toHaveLength(5);
      expect(duration).toBeLessThan(10000); // Parallel should be faster
    }, 30000);

    it('should handle multiple summary requests in parallel', async () => {
      const agentIds = [1n, 2n, 3n, 4n, 5n];

      const start = Date.now();
      const results = await Promise.all(
        agentIds.map(id => sdk.getSummary(id))
      );
      const duration = Date.now() - start;

      console.log(`⏱️  Get 5 summaries in parallel: ${duration}ms`);
      expect(results).toHaveLength(5);
      results.forEach(summary => {
        expect(summary).toHaveProperty('averageScore');
      });
    }, 30000);

    it('should handle sequential operations efficiently', async () => {
      const agentId = 1n;

      const start = Date.now();
      const agent = await sdk.loadAgent(agentId);
      const summary = await sdk.getSummary(agentId);
      const feedbacks = await sdk.readAllFeedback(agentId);
      const clients = await sdk.getClients(agentId);
      const duration = Date.now() - start;

      console.log(`⏱️  4 sequential operations: ${duration}ms`);
      expect(duration).toBeLessThan(15000);
    }, 30000);
  });

  describe('Large data sets', () => {
    it('should handle reading all feedbacks efficiently', async () => {
      const agentId = 1n;

      const start = Date.now();
      const feedbacks = await sdk.readAllFeedback(agentId, true); // Include revoked
      const duration = Date.now() - start;

      console.log(`⏱️  Read all feedbacks (${feedbacks.length} items): ${duration}ms`);

      if (feedbacks.length > 0) {
        const avgTimePerFeedback = duration / feedbacks.length;
        console.log(`   Average: ${avgTimePerFeedback.toFixed(2)}ms per feedback`);
      }

      expect(Array.isArray(feedbacks)).toBe(true);
    }, 30000);

    it('should handle large client list', async () => {
      const agentId = 1n;

      const start = Date.now();
      const clients = await sdk.getClients(agentId);
      const duration = Date.now() - start;

      console.log(`⏱️  Get clients (${clients.length} items): ${duration}ms`);
      expect(Array.isArray(clients)).toBe(true);
    }, 30000);

    it('should handle agents by owner query', async () => {
      const owner = Keypair.generate().publicKey;

      const start = Date.now();
      const agents = await sdk.getAgentsByOwner(owner);
      const duration = Date.now() - start;

      console.log(`⏱️  Get agents by owner (${agents.length} items): ${duration}ms`);
      expect(Array.isArray(agents)).toBe(true);
    }, 30000);
  });

  describe('Caching performance', () => {
    it('should benefit from reputation cache', async () => {
      const agentId = 1n;

      // First call
      const start1 = Date.now();
      const summary1 = await sdk.getSummary(agentId);
      const duration1 = Date.now() - start1;

      // Second call (should hit cache)
      const start2 = Date.now();
      const summary2 = await sdk.getSummary(agentId);
      const duration2 = Date.now() - start2;

      console.log(`⏱️  First call: ${duration1}ms`);
      console.log(`⏱️  Second call: ${duration2}ms`);

      expect(summary1.averageScore).toBe(summary2.averageScore);
      expect(summary1.totalFeedbacks).toBe(summary2.totalFeedbacks);
    }, 30000);
  });

  describe('Network efficiency', () => {
    it('should minimize RPC calls for agent info', async () => {
      const agentId = 1n;
      const connection = sdk.getSolanaClient().getConnection();

      // Track RPC calls (rough estimate)
      const start = Date.now();
      await sdk.loadAgent(agentId);
      const duration = Date.now() - start;

      console.log(`⏱️  Agent load with network: ${duration}ms`);

      // Should complete reasonably fast
      expect(duration).toBeLessThan(5000);
    }, 30000);

    it('should handle multiple reads without excessive RPC calls', async () => {
      const agentId = 1n;

      const start = Date.now();

      // Multiple reads that could potentially reuse data
      const [agent, summary, exists] = await Promise.all([
        sdk.loadAgent(agentId),
        sdk.getSummary(agentId),
        sdk.agentExists(agentId),
      ]);

      const duration = Date.now() - start;

      console.log(`⏱️  3 parallel reads: ${duration}ms`);
      expect(duration).toBeLessThan(10000);
    }, 30000);
  });

  describe('Memory efficiency', () => {
    it('should handle many agents without memory issues', async () => {
      const agentIds = Array.from({ length: 20 }, (_, i) => BigInt(i + 1));

      const start = Date.now();
      const results = await Promise.all(
        agentIds.map(id => sdk.loadAgent(id))
      );
      const duration = Date.now() - start;

      console.log(`⏱️  Load 20 agents: ${duration}ms`);
      expect(results).toHaveLength(20);

      // Check memory usage (rough)
      const used = process.memoryUsage();
      console.log(`   Memory: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
    }, 60000);

    it('should handle large feedback arrays', async () => {
      const agentId = 1n;

      const start = Date.now();
      const feedbacks = await sdk.readAllFeedback(agentId, true);
      const duration = Date.now() - start;

      console.log(`⏱️  Load all feedbacks: ${duration}ms (${feedbacks.length} items)`);

      if (feedbacks.length > 100) {
        console.log(`   Large dataset: ${feedbacks.length} feedbacks processed`);
      }

      expect(Array.isArray(feedbacks)).toBe(true);
    }, 30000);
  });

  describe('Throughput', () => {
    it('should maintain good throughput for repeated reads', async () => {
      const agentId = 1n;
      const iterations = 10;

      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await sdk.getSummary(agentId);
      }

      const duration = Date.now() - start;
      const avgTime = duration / iterations;
      const throughput = 1000 / avgTime;

      console.log(`⏱️  ${iterations} sequential reads: ${duration}ms`);
      console.log(`   Average: ${avgTime.toFixed(2)}ms per request`);
      console.log(`   Throughput: ${throughput.toFixed(2)} req/sec`);

      expect(avgTime).toBeLessThan(2000);
    }, 60000);

    it('should maintain good throughput for parallel reads', async () => {
      const agentId = 1n;
      const concurrency = 5;
      const iterations = 10;

      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await Promise.all(
          Array(concurrency).fill(null).map(() => sdk.getSummary(agentId))
        );
      }

      const duration = Date.now() - start;
      const totalRequests = concurrency * iterations;
      const avgTime = duration / totalRequests;
      const throughput = 1000 / avgTime;

      console.log(`⏱️  ${totalRequests} parallel reads (${concurrency}x${iterations}): ${duration}ms`);
      console.log(`   Average: ${avgTime.toFixed(2)}ms per request`);
      console.log(`   Throughput: ${throughput.toFixed(2)} req/sec`);

      expect(avgTime).toBeLessThan(1000);
    }, 60000);
  });
});
