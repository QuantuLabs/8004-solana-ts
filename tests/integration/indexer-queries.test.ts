/**
 * Integration tests for Indexer Queries
 * Tests against real Supabase indexer on devnet
 * Requires INDEXER_URL and INDEXER_API_KEY environment variables
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { SolanaSDK } from '../../src/index.js';

// Skip integration tests if no indexer config
const INDEXER_URL = process.env.INDEXER_URL || 'https://uhjytdjxvfbppgjicfly.supabase.co/rest/v1';
const INDEXER_API_KEY = process.env.INDEXER_API_KEY || 'sb_publishable_i-ycBRGiolBr8GMdiVq1rA_nwt7N2bq';

const runIntegration = INDEXER_URL && INDEXER_API_KEY;

describe('Indexer Queries (Integration)', () => {
  let sdk: SolanaSDK;

  beforeAll(() => {
    if (!runIntegration) {
      console.log('Skipping indexer integration tests - no INDEXER_URL/INDEXER_API_KEY');
      return;
    }

    sdk = new SolanaSDK({
      cluster: 'devnet',
      indexerUrl: INDEXER_URL,
      indexerApiKey: INDEXER_API_KEY,
    });
  });

  describe('Leaderboard', () => {
    it('should get global leaderboard', async () => {
      if (!runIntegration) return;

      const agents = await sdk.getLeaderboard({ limit: 5 });

      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeLessThanOrEqual(5);
    });

    it('should filter by minimum tier', async () => {
      if (!runIntegration) return;

      const agents = await sdk.getLeaderboard({ minTier: 1, limit: 10 });

      agents.forEach((agent) => {
        expect(agent.trust_tier).toBeGreaterThanOrEqual(1);
      });
    });

    it('should support keyset pagination', async () => {
      if (!runIntegration) return;

      const page1 = await sdk.getLeaderboard({ limit: 3 });

      if (page1.length === 3) {
        const lastSortKey = page1[2].sort_key;
        const page2 = await sdk.getLeaderboard({
          limit: 3,
          cursorSortKey: lastSortKey,
        });

        // Verify no overlap
        const page1Assets = new Set(page1.map((a) => a.asset));
        page2.forEach((agent) => {
          expect(page1Assets.has(agent.asset)).toBe(false);
        });
      }
    });

    it('should return agents with correct structure', async () => {
      if (!runIntegration) return;

      const agents = await sdk.getLeaderboard({ limit: 1 });

      if (agents.length > 0) {
        const agent = agents[0];
        expect(agent.asset).toBeDefined();
        expect(agent.owner).toBeDefined();
        expect(typeof agent.trust_tier).toBe('number');
        expect(typeof agent.quality_score).toBe('number');
        expect(typeof agent.confidence).toBe('number');
        expect(agent.sort_key).toBeDefined();
      }
    });
  });

  describe('Global Stats', () => {
    it('should get global statistics', async () => {
      if (!runIntegration) return;

      const stats = await sdk.getGlobalStats();

      expect(stats).toBeDefined();
      expect(typeof stats.total_agents).toBe('number');
      expect(typeof stats.total_feedbacks).toBe('number');
      expect(typeof stats.total_collections).toBe('number');
    });

    it('should include tier counts', async () => {
      if (!runIntegration) return;

      const stats = await sdk.getGlobalStats();

      expect(typeof stats.platinum_agents).toBe('number');
      expect(typeof stats.gold_agents).toBe('number');
    });
  });

  describe('Collection Stats', () => {
    it('should get collection stats when collection exists', async () => {
      if (!runIntegration) return;

      // First get a collection from leaderboard
      const agents = await sdk.getLeaderboard({ limit: 1 });
      if (agents.length > 0) {
        const collection = agents[0].collection;
        const stats = await sdk.getCollectionStats(collection);

        if (stats) {
          expect(stats.collection).toBe(collection);
          expect(typeof stats.agent_count).toBe('number');
        }
      }
    });

    it('should return null for non-existent collection', async () => {
      if (!runIntegration) return;

      const stats = await sdk.getCollectionStats('NonExistentCollection12345');

      expect(stats).toBeNull();
    });
  });

  describe('Feedback Queries', () => {
    it('should get feedbacks by tag', async () => {
      if (!runIntegration) return;

      const feedbacks = await sdk.getFeedbacksByTag('quality');

      expect(Array.isArray(feedbacks)).toBe(true);
    });

    it('should get feedbacks by endpoint', async () => {
      if (!runIntegration) return;

      const feedbacks = await sdk.getFeedbacksByEndpoint('/api/chat');

      expect(Array.isArray(feedbacks)).toBe(true);
    });
  });

  describe('Indexer Availability', () => {
    it('should check if indexer is available', async () => {
      if (!runIntegration) return;

      const available = await sdk.isIndexerAvailable();

      expect(typeof available).toBe('boolean');
    });

    it('should return indexer client', () => {
      if (!runIntegration) return;

      const client = sdk.getIndexerClient();

      expect(client).toBeDefined();
    });
  });

  describe('Fallback Behavior', () => {
    it('should handle indexer errors gracefully', async () => {
      // Create SDK with invalid indexer
      const sdkWithBadIndexer = new SolanaSDK({
        cluster: 'devnet',
        indexerUrl: 'https://invalid.example.com/rest/v1',
        indexerApiKey: 'invalid-key',
        indexerFallback: true,
      });

      // Should not crash, might fall back to on-chain or return error
      try {
        await sdkWithBadIndexer.getGlobalStats();
      } catch (error) {
        // Expected - indexer unavailable and no on-chain fallback for stats
        expect(error).toBeDefined();
      }
    });
  });
});
