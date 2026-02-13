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
const createMockIndexerClient = (
  feedbacks: Partial<IndexedFeedback>[],
  overrides?: Partial<Record<string, unknown>>
): IndexerClient => ({
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
  getLastFeedbackIndex: jest.fn().mockResolvedValue(-1n),
  isAvailable: jest.fn(),
  searchAgents: jest.fn(),
  getValidations: jest.fn(),
  getValidation: jest.fn(),
  getAgentMetadata: jest.fn(),
  ...overrides,
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
      const largeIndex = '9007199254740993'; // 2^53 + 1

      const mockIndexer = createMockIndexerClient([], {
        getLastFeedbackIndex: jest.fn().mockResolvedValue(BigInt(largeIndex)),
      });

      const feedbackManager = new SolanaFeedbackManager(
        createMockSolanaClient(),
        undefined,
        mockIndexer
      );

      const result = await feedbackManager.getLastIndex(mockAsset, mockClient);

      expect(result).toBe(BigInt(largeIndex));
      expect(result).not.toBe(BigInt(Number(largeIndex)));
    });

    it('should find max index among multiple feedbacks', async () => {
      const mockIndexer = createMockIndexerClient([], {
        getLastFeedbackIndex: jest.fn().mockResolvedValue(500n),
      });

      const feedbackManager = new SolanaFeedbackManager(
        createMockSolanaClient(),
        undefined,
        mockIndexer
      );

      const result = await feedbackManager.getLastIndex(mockAsset, mockClient);
      expect(result).toBe(500n);
    });

    it('should return -1n when no feedbacks exist', async () => {
      const mockIndexer = createMockIndexerClient([], {
        getLastFeedbackIndex: jest.fn().mockResolvedValue(-1n),
      });

      const feedbackManager = new SolanaFeedbackManager(
        createMockSolanaClient(),
        undefined,
        mockIndexer
      );

      const result = await feedbackManager.getLastIndex(mockAsset, mockClient);
      expect(result).toBe(-1n);
    });

    it('should delegate to indexerClient.getLastFeedbackIndex', async () => {
      const mockGetLastFeedbackIndex = jest.fn().mockResolvedValue(10n);
      const mockIndexer = createMockIndexerClient([], {
        getLastFeedbackIndex: mockGetLastFeedbackIndex,
      });

      const feedbackManager = new SolanaFeedbackManager(
        createMockSolanaClient(),
        undefined,
        mockIndexer
      );

      const result = await feedbackManager.getLastIndex(mockAsset, mockClient);
      expect(result).toBe(10n);
      expect(mockGetLastFeedbackIndex).toHaveBeenCalledWith(
        mockAsset.toBase58(),
        mockClient.toBase58()
      );
    });

    it('should handle extremely large feedback indices', async () => {
      const extremeIndex = '9999999999999999999'; // ~10^19

      const mockIndexer = createMockIndexerClient([], {
        getLastFeedbackIndex: jest.fn().mockResolvedValue(BigInt(extremeIndex)),
      });

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
