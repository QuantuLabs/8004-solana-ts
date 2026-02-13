import { describe, it, expect } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';
import {
  indexedAgentToSimplified,
  indexedFeedbackToSolanaFeedback,
  indexedReputationToSummary,
  indexedReputationToExtendedSummary,
} from '../../src/core/indexer-types.js';

describe('indexer-types', () => {
  const mockAsset = PublicKey.unique().toBase58();
  const mockOwner = PublicKey.unique().toBase58();
  const mockCollection = PublicKey.unique().toBase58();
  const mockClient = PublicKey.unique().toBase58();

  describe('indexedAgentToSimplified', () => {
    it('should convert indexed agent to simplified format', () => {
      const indexed = {
        asset: mockAsset,
        owner: mockOwner,
        collection: mockCollection,
        agent_uri: 'ipfs://test',
        agent_wallet: PublicKey.unique().toBase58(),
        nft_name: 'TestAgent',
        block_slot: 12345,
        tx_signature: 'sig123',
        created_at: '2024-01-01T00:00:00Z',
      };

      const result = indexedAgentToSimplified(indexed as any);
      expect(result.asset).toBeInstanceOf(PublicKey);
      expect(result.owner).toBeInstanceOf(PublicKey);
      expect(result.collection).toBeInstanceOf(PublicKey);
      expect(result.agentUri).toBe('ipfs://test');
      expect(result.agentWallet).toBeInstanceOf(PublicKey);
      expect(result.nftName).toBe('TestAgent');
      expect(result.blockSlot).toBe(12345);
      expect(result.txSignature).toBe('sig123');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should handle null agent_wallet', () => {
      const indexed = {
        asset: mockAsset,
        owner: mockOwner,
        collection: mockCollection,
        agent_uri: null,
        agent_wallet: null,
        nft_name: null,
        block_slot: 100,
        tx_signature: 'sig',
        created_at: '2024-01-01T00:00:00Z',
      };

      const result = indexedAgentToSimplified(indexed as any);
      expect(result.agentWallet).toBeNull();
      expect(result.agentUri).toBeNull();
      expect(result.nftName).toBeNull();
    });
  });

  describe('indexedFeedbackToSolanaFeedback', () => {
    it('should convert indexed feedback to SolanaFeedback', () => {
      const indexed = {
        asset: mockAsset,
        client_address: mockClient,
        feedback_index: '5',
        value: '1000',
        value_decimals: 2,
        score: 85,
        tag1: 'quality',
        tag2: 'speed',
        is_revoked: false,
        endpoint: '/api/chat',
        feedback_uri: 'ipfs://fb',
        feedback_hash: 'aa'.repeat(32),
        block_slot: '200',
        tx_signature: 'sig456',
      };

      const result = indexedFeedbackToSolanaFeedback(indexed as any);
      expect(result.asset).toBeInstanceOf(PublicKey);
      expect(result.client).toBeInstanceOf(PublicKey);
      expect(result.feedbackIndex).toBe(5n);
      expect(result.value).toBe(1000n);
      expect(result.valueDecimals).toBe(2);
      expect(result.score).toBe(85);
      expect(result.tag1).toBe('quality');
      expect(result.tag2).toBe('speed');
      expect(result.revoked).toBe(false);
      expect(result.isRevoked).toBe(false);
      expect(result.endpoint).toBe('/api/chat');
      expect(result.feedbackUri).toBe('ipfs://fb');
      expect(result.sealHash).toBeDefined();
      expect(result.sealHash!.length).toBe(32);
      expect(result.blockSlot).toBe(200n);
    });

    it('should handle string value from Supabase', () => {
      const indexed = {
        asset: mockAsset,
        client_address: mockClient,
        feedback_index: '0',
        value: '999',
        value_decimals: 0,
        score: 50,
        tag1: '',
        tag2: '',
        is_revoked: false,
        endpoint: '',
        feedback_uri: '',
        feedback_hash: null,
        block_slot: '1',
        tx_signature: 'sig',
      };

      const result = indexedFeedbackToSolanaFeedback(indexed as any);
      expect(result.value).toBe(999n);
      expect(result.sealHash).toBeUndefined();
    });

    it('should handle null/undefined value', () => {
      const indexed = {
        asset: mockAsset,
        client_address: mockClient,
        feedback_index: '0',
        value: null,
        value_decimals: null,
        score: 50,
        tag1: null,
        tag2: null,
        is_revoked: true,
        endpoint: null,
        feedback_uri: null,
        feedback_hash: null,
        block_slot: '1',
        tx_signature: 'sig',
      };

      const result = indexedFeedbackToSolanaFeedback(indexed as any);
      expect(result.value).toBe(0n);
      expect(result.valueDecimals).toBe(0);
      expect(result.tag1).toBe('');
      expect(result.tag2).toBe('');
      expect(result.endpoint).toBe('');
      expect(result.feedbackUri).toBe('');
    });
  });

  describe('indexedReputationToSummary', () => {
    it('should convert indexed reputation to SolanaAgentSummary', () => {
      const indexed = {
        asset: mockAsset,
        owner: mockOwner,
        collection: mockCollection,
        nft_name: 'Test',
        feedback_count: 10,
        avg_score: 75,
        positive_count: 8,
        negative_count: 2,
        validation_count: 3,
      };

      const result = indexedReputationToSummary(indexed as any);
      expect(result.totalFeedbacks).toBe(10);
      expect(result.averageScore).toBe(75);
      expect(result.positiveCount).toBe(8);
      expect(result.negativeCount).toBe(2);
      expect(result.nextFeedbackIndex).toBe(10);
      expect(result.totalClients).toBeUndefined();
    });

    it('should handle null avg_score', () => {
      const indexed = {
        asset: mockAsset,
        owner: mockOwner,
        collection: mockCollection,
        nft_name: 'Test',
        feedback_count: 0,
        avg_score: null,
        positive_count: 0,
        negative_count: 0,
        validation_count: 0,
      };

      const result = indexedReputationToSummary(indexed as any);
      expect(result.averageScore).toBe(0);
    });
  });

  describe('indexedReputationToExtendedSummary', () => {
    it('should include extended fields', () => {
      const indexed = {
        asset: mockAsset,
        owner: mockOwner,
        collection: mockCollection,
        nft_name: 'TestAgent',
        feedback_count: 5,
        avg_score: 60,
        positive_count: 3,
        negative_count: 2,
        validation_count: 1,
      };

      const result = indexedReputationToExtendedSummary(indexed as any);
      expect(result.asset).toBeInstanceOf(PublicKey);
      expect(result.owner).toBeInstanceOf(PublicKey);
      expect(result.collection).toBeInstanceOf(PublicKey);
      expect(result.nftName).toBe('TestAgent');
      expect(result.validationCount).toBe(1);
      expect(result.totalFeedbacks).toBe(5);
    });

    it('should handle empty nft_name', () => {
      const indexed = {
        asset: mockAsset,
        owner: mockOwner,
        collection: mockCollection,
        nft_name: null,
        feedback_count: 0,
        avg_score: 0,
        positive_count: 0,
        negative_count: 0,
        validation_count: 0,
      };

      const result = indexedReputationToExtendedSummary(indexed as any);
      expect(result.nftName).toBe('');
    });
  });
});
