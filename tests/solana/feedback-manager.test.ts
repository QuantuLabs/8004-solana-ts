/**
 * Unit tests for SolanaFeedbackManager - all 6 ERC-8004 read functions
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';
import { SolanaFeedbackManager } from '../../src/solana/feedback-manager.js';
import { SolanaClient } from '../../src/solana/client.js';
import { AgentReputationAccount, FeedbackAccount, ClientIndexAccount } from '../../src/solana/borsh-schemas.js';

// Mock SolanaClient
jest.mock('../../src/solana/client.js');

describe('SolanaFeedbackManager', () => {
  let feedbackManager: SolanaFeedbackManager;
  let mockClient: jest.Mocked<SolanaClient>;

  beforeEach(() => {
    mockClient = {
      getAccount: jest.fn(),
      getProgramAccounts: jest.fn(),
      getMultipleAccounts: jest.fn(),
      getConnection: jest.fn(),
      getCluster: jest.fn().mockReturnValue('devnet'),
    } as any;

    feedbackManager = new SolanaFeedbackManager(mockClient);
  });

  describe('1. getSummary()', () => {
    it('should return reputation summary from on-chain cache', async () => {
      // Mock reputation account data
      const mockReputationData = Buffer.alloc(100);
      mockReputationData.writeBigUInt64LE(1n, 8); // agent_id
      mockReputationData.writeUInt8(85, 16); // average_score
      mockReputationData.writeBigUInt64LE(10n, 24); // total_feedbacks

      mockClient.getAccount.mockResolvedValue(mockReputationData);

      const summary = await feedbackManager.getSummary(1n);

      expect(summary.averageScore).toBe(85);
      expect(summary.totalFeedbacks).toBe(10);
    });

    it('should return default values if reputation account does not exist', async () => {
      mockClient.getAccount.mockResolvedValue(null);

      const summary = await feedbackManager.getSummary(1n);

      expect(summary.averageScore).toBe(0);
      expect(summary.totalFeedbacks).toBe(0);
    });
  });

  describe('2. readFeedback()', () => {
    it('should return single feedback if it exists', async () => {
      const mockFeedbackData = Buffer.alloc(526);
      mockFeedbackData.writeBigUInt64LE(1n, 8); // agent_id
      mockFeedbackData.writeUInt8(90, 56); // score

      mockClient.getAccount.mockResolvedValue(mockFeedbackData);

      const client = new PublicKey('11111111111111111111111111111111');
      const feedback = await feedbackManager.readFeedback(1n, client, 0n);

      expect(feedback).not.toBeNull();
      expect(feedback?.score).toBe(90);
    });

    it('should return null if feedback does not exist', async () => {
      mockClient.getAccount.mockResolvedValue(null);

      const client = new PublicKey('11111111111111111111111111111111');
      const feedback = await feedbackManager.readFeedback(1n, client, 0n);

      expect(feedback).toBeNull();
    });
  });

  describe('3. readAllFeedback()', () => {
    it('should return all feedback for an agent', async () => {
      const mockAccounts = [
        {
          pubkey: new PublicKey('11111111111111111111111111111111'),
          data: createMockFeedbackData(1n, 85, false),
        },
        {
          pubkey: new PublicKey('22222222222222222222222222222222'),
          data: createMockFeedbackData(1n, 90, false),
        },
      ];

      mockClient.getProgramAccounts.mockResolvedValue(mockAccounts as any);

      const feedbacks = await feedbackManager.readAllFeedback(1n);

      expect(feedbacks).toHaveLength(2);
      expect(feedbacks[0].score).toBe(85);
      expect(feedbacks[1].score).toBe(90);
    });

    it('should filter out revoked feedback by default', async () => {
      const mockAccounts = [
        {
          pubkey: new PublicKey('11111111111111111111111111111111'),
          data: createMockFeedbackData(1n, 85, false),
        },
        {
          pubkey: new PublicKey('22222222222222222222222222222222'),
          data: createMockFeedbackData(1n, 90, true), // revoked
        },
      ];

      mockClient.getProgramAccounts.mockResolvedValue(mockAccounts as any);

      const feedbacks = await feedbackManager.readAllFeedback(1n, false);

      expect(feedbacks).toHaveLength(1);
      expect(feedbacks[0].score).toBe(85);
    });

    it('should include revoked feedback when requested', async () => {
      const mockAccounts = [
        {
          pubkey: new PublicKey('11111111111111111111111111111111'),
          data: createMockFeedbackData(1n, 85, false),
        },
        {
          pubkey: new PublicKey('22222222222222222222222222222222'),
          data: createMockFeedbackData(1n, 90, true),
        },
      ];

      mockClient.getProgramAccounts.mockResolvedValue(mockAccounts as any);

      const feedbacks = await feedbackManager.readAllFeedback(1n, true);

      expect(feedbacks).toHaveLength(2);
    });
  });

  describe('4. getLastIndex()', () => {
    it('should return last feedback index for client', async () => {
      const mockIndexData = Buffer.alloc(100);
      mockIndexData.writeBigUInt64LE(1n, 8); // agent_id
      mockIndexData.writeBigUInt64LE(5n, 48); // last_index

      mockClient.getAccount.mockResolvedValue(mockIndexData);

      const client = new PublicKey('11111111111111111111111111111111');
      const lastIndex = await feedbackManager.getLastIndex(1n, client);

      expect(lastIndex).toBe(5n);
    });

    it('should return 0 if client has not given feedback', async () => {
      mockClient.getAccount.mockResolvedValue(null);

      const client = new PublicKey('11111111111111111111111111111111');
      const lastIndex = await feedbackManager.getLastIndex(1n, client);

      expect(lastIndex).toBe(0n);
    });
  });

  describe('5. getClients()', () => {
    it('should return list of all clients', async () => {
      const client1 = new PublicKey('11111111111111111111111111111111');
      const client2 = new PublicKey('22222222222222222222222222222222');

      const mockAccounts = [
        {
          pubkey: new PublicKey('33333333333333333333333333333333'),
          data: createMockClientIndexData(1n, client1),
        },
        {
          pubkey: new PublicKey('44444444444444444444444444444444'),
          data: createMockClientIndexData(1n, client2),
        },
      ];

      mockClient.getProgramAccounts.mockResolvedValue(mockAccounts as any);

      const clients = await feedbackManager.getClients(1n);

      expect(clients).toHaveLength(2);
      expect(clients[0].toBase58()).toBe(client1.toBase58());
      expect(clients[1].toBase58()).toBe(client2.toBase58());
    });

    it('should return empty array if no clients', async () => {
      mockClient.getProgramAccounts.mockResolvedValue([]);

      const clients = await feedbackManager.getClients(1n);

      expect(clients).toHaveLength(0);
    });
  });

  describe('6. getResponseCount()', () => {
    it('should return number of responses', async () => {
      const mockIndexData = Buffer.alloc(100);
      mockIndexData.writeBigUInt64LE(3n, 64); // last_response_index = 3

      mockClient.getAccount.mockResolvedValue(mockIndexData);

      const client = new PublicKey('11111111111111111111111111111111');
      const count = await feedbackManager.getResponseCount(1n, client, 0n);

      expect(count).toBe(3);
    });

    it('should return 0 if no responses', async () => {
      mockClient.getAccount.mockResolvedValue(null);

      const client = new PublicKey('11111111111111111111111111111111');
      const count = await feedbackManager.getResponseCount(1n, client, 0n);

      expect(count).toBe(0);
    });
  });

  describe('Bonus: readResponses()', () => {
    it('should return all responses for a feedback', async () => {
      const mockIndexData = Buffer.alloc(100);
      mockIndexData.writeBigUInt64LE(2n, 64); // last_response_index = 2

      const mockResponseData1 = Buffer.alloc(300);
      const mockResponseData2 = Buffer.alloc(300);

      mockClient.getAccount.mockResolvedValueOnce(mockIndexData);
      mockClient.getMultipleAccounts.mockResolvedValue([
        mockResponseData1,
        mockResponseData2,
      ]);

      const client = new PublicKey('11111111111111111111111111111111');
      const responses = await feedbackManager.readResponses(1n, client, 0n);

      expect(responses).toHaveLength(2);
    });

    it('should return empty array if no responses', async () => {
      mockClient.getAccount.mockResolvedValue(null);

      const client = new PublicKey('11111111111111111111111111111111');
      const responses = await feedbackManager.readResponses(1n, client, 0n);

      expect(responses).toHaveLength(0);
    });
  });
});

// Helper functions to create mock data
function createMockFeedbackData(agentId: bigint, score: number, revoked: boolean): Buffer {
  const data = Buffer.alloc(526);
  data.writeBigUInt64LE(agentId, 8);
  data.writeUInt8(score, 56);
  data.writeUInt8(revoked ? 1 : 0, 409);
  return data;
}

function createMockClientIndexData(agentId: bigint, client: PublicKey): Buffer {
  const data = Buffer.alloc(100);
  data.writeBigUInt64LE(agentId, 8);
  client.toBuffer().copy(data, 16);
  return data;
}
