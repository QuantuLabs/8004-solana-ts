/**
 * Solana feedback management system for Agent0 SDK
 * Implements the 6 ERC-8004 read functions for Solana
 */

import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import type { SolanaClient } from './client.js';
import type { IPFSClient } from '../core/ipfs-client.js';
import { PDAHelpers, REPUTATION_PROGRAM_ID } from './pda-helpers.js';
import { ACCOUNT_DISCRIMINATORS } from './instruction-discriminators.js';
import {
  FeedbackAccount,
  AgentReputationAccount,
  ResponseIndexAccount,
  ResponseAccount,
} from './borsh-schemas.js';

/**
 * Summary result matching ERC-8004 getSummary interface
 */
export interface SolanaAgentSummary {
  averageScore: number;
  totalFeedbacks: number;
  nextFeedbackIndex: number;
  totalClients?: number;
}

/**
 * Feedback result matching SDK interface
 */
export interface SolanaFeedback {
  agentId: bigint;
  client: PublicKey;
  feedbackIndex: bigint;
  score: number;
  tag1: string;
  tag2: string;
  fileUri: string;
  fileHash: Uint8Array;
  revoked: boolean;
  createdAt: bigint;
}

/**
 * Response result
 */
export interface SolanaResponse {
  agentId: bigint;
  feedbackIndex: bigint;
  responseIndex: bigint;
  responder: PublicKey;
  responseUri: string;
  responseHash: Uint8Array;
  createdAt: bigint;
}

/**
 * Manages feedback operations for Solana
 * Implements all 6 ERC-8004 read functions
 */
export class SolanaFeedbackManager {
  constructor(
    private client: SolanaClient,
    private ipfsClient?: IPFSClient
  ) {}

  /**
   * 1. getSummary - Get agent reputation summary
   * @param agentId - Agent ID
   * @param minScore - Optional minimum score filter (client-side)
   * @param clientFilter - Optional client address filter (client-side)
   * @returns Summary with average score and total feedbacks
   *
   * Implementation: Uses cached AgentReputationAccount for O(1) performance
   * Falls back to client-side filtering if filters provided
   */
  async getSummary(
    agentId: bigint,
    minScore?: number,
    clientFilter?: PublicKey
  ): Promise<SolanaAgentSummary> {
    try {
      // Fetch cached aggregate from AgentReputationAccount
      const [reputationPDA] = await PDAHelpers.getAgentReputationPDA(agentId);
      const data = await this.client.getAccount(reputationPDA);

      if (!data) {
        return { averageScore: 0, totalFeedbacks: 0, nextFeedbackIndex: 0, totalClients: 0 };
      }

      const reputation = AgentReputationAccount.deserialize(data);

      // If no filters, return cached data (O(1))
      if (!minScore && !clientFilter) {
        return {
          averageScore: reputation.average_score,
          totalFeedbacks: Number(reputation.total_feedbacks),
          nextFeedbackIndex: Number(reputation.next_feedback_index),
        };
      }

      // If filters provided, fetch all feedbacks and filter client-side
      const feedbacks = await this.readAllFeedback(agentId, false);
      const filtered = feedbacks.filter(
        (f) =>
          (!minScore || f.score >= minScore) &&
          (!clientFilter || f.client.equals(clientFilter))
      );

      const sum = filtered.reduce((acc, f) => acc + f.score, 0);
      return {
        averageScore: filtered.length > 0 ? sum / filtered.length : 0,
        totalFeedbacks: filtered.length,
        nextFeedbackIndex: Number(reputation.next_feedback_index),
      };
    } catch (error) {
      console.error(`Error getting summary for agent ${agentId}:`, error);
      return { averageScore: 0, totalFeedbacks: 0, nextFeedbackIndex: 0, totalClients: 0 };
    }
  }

  /**
   * 2. readFeedback - Read single feedback
   * @param agentId - Agent ID
   * @param client - Client public key
   * @param feedbackIndex - Feedback index
   * @returns Feedback object or null if not found
   */
  async readFeedback(
    agentId: bigint,
    client: PublicKey,
    feedbackIndex: bigint
  ): Promise<SolanaFeedback | null> {
    try {
      // v0.2.0: client no longer in PDA seeds (global feedback index)
      const [feedbackPDA] = PDAHelpers.getFeedbackPDA(agentId, feedbackIndex);
      const data = await this.client.getAccount(feedbackPDA);

      if (!data) {
        return null;
      }

      const feedback = FeedbackAccount.deserialize(data);
      return this.mapFeedbackAccount(feedback);
    } catch (error) {
      console.error(
        `Error reading feedback for agent ${agentId}, client ${client.toBase58()}, index ${feedbackIndex}:`,
        error
      );
      return null;
    }
  }

  /**
   * 3. readAllFeedback - Read all feedbacks for an agent
   * @param agentId - Agent ID
   * @param includeRevoked - Include revoked feedbacks (default: false)
   * @returns Array of feedback objects
   *
   * Implementation: Uses getProgramAccounts with memcmp filter on agent_id
   */
  async readAllFeedback(agentId: bigint, includeRevoked: boolean = false): Promise<SolanaFeedback[]> {
    try {
      const programId = REPUTATION_PROGRAM_ID;

      // Create memcmp filter for agent_id (offset 8 to skip discriminator)
      const agentIdBuffer = Buffer.alloc(8);
      agentIdBuffer.writeBigUInt64LE(agentId);

      const accounts = await this.client.getProgramAccounts(programId, [
        {
          // Filter by FeedbackAccount discriminator at offset 0
          memcmp: {
            offset: 0,
            bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.FeedbackAccount),
          },
        },
        {
          // Filter by agent_id at offset 8 (after discriminator)
          memcmp: {
            offset: 8,
            bytes: bs58.encode(agentIdBuffer),
          },
        },
      ]);

      const feedbacks = accounts
        .map((acc) => FeedbackAccount.deserialize(acc.data))
        .filter((f) => includeRevoked || !f.revoked)
        .map((f) => this.mapFeedbackAccount(f));

      return feedbacks;
    } catch (error) {
      console.error(`Error reading all feedback for agent ${agentId}:`, error);
      return [];
    }
  }

  /**
   * 4. getLastIndex - Get feedback count for a client
   * v0.2.0: ClientIndexAccount removed - counts feedbacks by scanning
   * @param agentId - Agent ID
   * @param client - Client public key
   * @returns Count of feedbacks given by this client
   */
  async getLastIndex(agentId: bigint, client: PublicKey): Promise<bigint> {
    try {
      // v0.2.0: Count feedbacks from this client by scanning
      const allFeedbacks = await this.readAllFeedback(agentId, true);
      const clientFeedbacks = allFeedbacks.filter((f) =>
        f.client.equals(client)
      );
      return BigInt(clientFeedbacks.length);
    } catch (error) {
      console.error(
        `Error getting last index for agent ${agentId}, client ${client.toBase58()}:`,
        error
      );
      return BigInt(0);
    }
  }

  /**
   * 5. getClients - Get all clients who gave feedback to an agent
   * v0.2.0: ClientIndexAccount removed - extracts unique clients from FeedbackAccounts
   * @param agentId - Agent ID
   * @returns Array of unique client public keys
   */
  async getClients(agentId: bigint): Promise<PublicKey[]> {
    try {
      // v0.2.0: Extract unique clients from feedbacks
      const allFeedbacks = await this.readAllFeedback(agentId, true);

      // Extract unique client pubkeys
      const uniqueClients = Array.from(
        new Set(allFeedbacks.map((f) => f.client.toBase58()))
      ).map((base58) => new PublicKey(base58));

      return uniqueClients;
    } catch (error) {
      console.error(`Error getting clients for agent ${agentId}:`, error);
      return [];
    }
  }

  /**
   * 6. getResponseCount - Get number of responses for a feedback
   * @param agentId - Agent ID
   * @param feedbackIndex - Feedback index
   * @returns Number of responses
   * @deprecated The client parameter is no longer used in v0.2.0 (global feedback index)
   */
  async getResponseCount(
    agentId: bigint,
    feedbackIndex: bigint
  ): Promise<number>;
  async getResponseCount(
    agentId: bigint,
    clientOrFeedbackIndex: PublicKey | bigint,
    feedbackIndex?: bigint
  ): Promise<number> {
    // Handle both old (agentId, client, feedbackIndex) and new (agentId, feedbackIndex) signatures
    const actualFeedbackIndex =
      feedbackIndex !== undefined
        ? feedbackIndex
        : (clientOrFeedbackIndex as bigint);

    try {
      // v0.2.0: client no longer in PDA seeds
      const [responseIndexPDA] = PDAHelpers.getResponseIndexPDA(
        agentId,
        actualFeedbackIndex
      );
      const data = await this.client.getAccount(responseIndexPDA);

      if (!data) {
        return 0;
      }

      const responseIndex = ResponseIndexAccount.deserialize(data);
      return Number(responseIndex.response_count);
    } catch (error) {
      console.error(
        `Error getting response count for agent ${agentId}, index ${actualFeedbackIndex}:`,
        error
      );
      return 0;
    }
  }

  /**
   * Bonus: Read all responses for a feedback
   * Not required by ERC-8004 but useful for SDK completeness
   * @deprecated The client parameter is no longer used in v0.2.0 (global feedback index)
   */
  async readResponses(
    agentId: bigint,
    feedbackIndex: bigint
  ): Promise<SolanaResponse[]>;
  async readResponses(
    agentId: bigint,
    clientOrFeedbackIndex: PublicKey | bigint,
    feedbackIndex?: bigint
  ): Promise<SolanaResponse[]> {
    // Handle both old (agentId, client, feedbackIndex) and new (agentId, feedbackIndex) signatures
    const actualFeedbackIndex =
      feedbackIndex !== undefined
        ? feedbackIndex
        : (clientOrFeedbackIndex as bigint);

    try {
      // Get response count first
      const responseCount = await this.getResponseCount(agentId, actualFeedbackIndex);

      if (responseCount === 0) {
        return [];
      }

      // Fetch all responses by deriving PDAs
      // v0.2.0: client no longer in PDA seeds
      const responsePDAs: PublicKey[] = [];
      for (let i = 0; i < responseCount; i++) {
        const [responsePDA] = PDAHelpers.getResponsePDA(
          agentId,
          actualFeedbackIndex,
          BigInt(i)
        );
        responsePDAs.push(responsePDA);
      }

      // Batch fetch all response accounts
      const accountsData = await this.client.getMultipleAccounts(responsePDAs);

      const responses = accountsData
        .filter((data) => data !== null)
        .map((data) => {
          const response = ResponseAccount.deserialize(data!);
          return {
            agentId: response.agent_id,
            feedbackIndex: response.feedback_index,
            responseIndex: response.response_index,
            responder: response.getResponderPublicKey(),
            responseUri: response.response_uri,
            responseHash: response.response_hash,
            createdAt: response.created_at,
          };
        });

      return responses;
    } catch (error) {
      console.error(
        `Error reading responses for agent ${agentId}, index ${actualFeedbackIndex}:`,
        error
      );
      return [];
    }
  }

  /**
   * Helper to map FeedbackAccount to SolanaFeedback interface
   */
  private mapFeedbackAccount(feedback: FeedbackAccount): SolanaFeedback {
    return {
      agentId: feedback.agent_id,
      client: feedback.getClientPublicKey(),
      feedbackIndex: feedback.feedback_index,
      score: feedback.score,
      tag1: feedback.tag1,
      tag2: feedback.tag2,
      fileUri: feedback.file_uri,
      fileHash: feedback.file_hash,
      revoked: feedback.is_revoked,
      createdAt: feedback.created_at,
    };
  }

  /**
   * Helper to fetch and parse feedback file from IPFS/Arweave
   */
  async fetchFeedbackFile(uri: string): Promise<any | null> {
    if (!this.ipfsClient) {
      console.warn('IPFS client not configured, cannot fetch feedback file');
      return null;
    }

    try {
      // This would use the ipfsClient to fetch
      // For now, return null as IPFS client needs to be adapted
      return null;
    } catch (error) {
      console.error(`Error fetching feedback file from ${uri}:`, error);
      return null;
    }
  }
}
