/**
 * Unit tests for SolanaFeedbackManager
 * Tests BigInt handling, precision, and edge cases
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';
import { SolanaFeedbackManager, SolanaFeedback } from '../../src/core/feedback-manager-solana.js';
import type { SolanaClient } from '../../src/core/client.js';
import type { IndexerClient, IndexedFeedback } from '../../src/core/indexer-client.js';

// Mock IndexerClient
const createMockIndexerClient = (feedbacks: Partial<IndexedFeedback>[]): IndexerClient => ({
  getFeedbacks: jest.fn().mockResolvedValue(
    feedbacks.map(f => ({
      asset: f.asset || 'mockAsset',
      client_address: f.client_address || 'mockClient',
      feedback_index: f.feedback_index || '0',
      score: f.score || 50,
      tag1: f.tag1 || '',
      tag2: f.tag2 || '',
      is_revoked: f.is_revoked || false,
      endpoint: f.endpoint || '',
      feedback_uri: f.feedback_uri || '',
      feedback_hash: f.feedback_hash || '',
      block_slot: f.block_slot || 0,
      tx_signature: f.tx_signature || '',
    }))
  ),
  getAgent: jest.fn(),
  getAgents: jest.fn(),
  getAgentsByOwner: jest.fn(),
  getAgentsByCollection: jest.fn(),
  getLeaderboard: jest.fn(),
  getGlobalStats: jest.fn(),
  getFeedback: jest.fn(),
  getFeedbackResponsesFor: jest.fn().mockResolvedValue([]),
  getLastFeedbackIndex: jest.fn(),
  isAvailable: jest.fn(),
  searchAgents: jest.fn(),
  getValidations: jest.fn(),
  getValidation: jest.fn(),
  getAgentMetadata: jest.fn(),
} as unknown as IndexerClient);

// Mock SolanaClient
const createMockSolanaClient = (): SolanaClient => ({
  getAccount: jest.fn(),
} as unknown as SolanaClient);

describe('SolanaFeedbackManager', () => {
  describe('getLastIndex BigInt Safety', () => {
    // Use valid Solana pubkeys for testing
    const mockAsset = new PublicKey('So11111111111111111111111111111111111111112');
    const mockClient = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    it('should handle feedback_index > 2^53 without precision loss', async () => {
      // Create a feedback_index that exceeds Number.MAX_SAFE_INTEGER
      // Number.MAX_SAFE_INTEGER = 9007199254740991 (2^53 - 1)
      const largeIndex = '9007199254740993'; // 2^53 + 1, loses precision as Number

      const mockIndexer = createMockIndexerClient([
        { client_address: mockClient.toBase58(), feedback_index: largeIndex },
        { client_address: mockClient.toBase58(), feedback_index: '1' },
      ]);

      const feedbackManager = new SolanaFeedbackManager(
        createMockSolanaClient(),
        undefined,
        mockIndexer
      );

      const result = await feedbackManager.getLastIndex(mockAsset, mockClient);

      // Must match exactly as BigInt, no precision loss
      expect(result).toBe(BigInt(largeIndex));
      // Verify it's NOT the truncated Number value
      expect(result).not.toBe(BigInt(Number(largeIndex)));
    });

    it('should find max index among multiple feedbacks', async () => {
      const mockIndexer = createMockIndexerClient([
        { client_address: mockClient.toBase58(), feedback_index: '100' },
        { client_address: mockClient.toBase58(), feedback_index: '500' },
        { client_address: mockClient.toBase58(), feedback_index: '250' },
      ]);

      const feedbackManager = new SolanaFeedbackManager(
        createMockSolanaClient(),
        undefined,
        mockIndexer
      );

      const result = await feedbackManager.getLastIndex(mockAsset, mockClient);
      expect(result).toBe(BigInt(500));
    });

    it('should return -1n when no feedbacks exist', async () => {
      const mockIndexer = createMockIndexerClient([]);

      const feedbackManager = new SolanaFeedbackManager(
        createMockSolanaClient(),
        undefined,
        mockIndexer
      );

      const result = await feedbackManager.getLastIndex(mockAsset, mockClient);
      expect(result).toBe(BigInt(-1));
    });

    it('should filter by client address', async () => {
      const otherClient = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

      const mockIndexer = createMockIndexerClient([
        { client_address: mockClient.toBase58(), feedback_index: '10' },
        { client_address: otherClient.toBase58(), feedback_index: '999' },
        { client_address: mockClient.toBase58(), feedback_index: '5' },
      ]);

      const feedbackManager = new SolanaFeedbackManager(
        createMockSolanaClient(),
        undefined,
        mockIndexer
      );

      const result = await feedbackManager.getLastIndex(mockAsset, mockClient);
      // Should only consider feedbacks from mockClient, not otherClient
      expect(result).toBe(BigInt(10));
    });

    it('should handle extremely large feedback indices', async () => {
      // Test with a very large number that's well beyond Number precision
      const extremeIndex = '9999999999999999999'; // ~10^19

      const mockIndexer = createMockIndexerClient([
        { client_address: mockClient.toBase58(), feedback_index: extremeIndex },
      ]);

      const feedbackManager = new SolanaFeedbackManager(
        createMockSolanaClient(),
        undefined,
        mockIndexer
      );

      const result = await feedbackManager.getLastIndex(mockAsset, mockClient);
      expect(result).toBe(BigInt(extremeIndex));
    });
  });
});
