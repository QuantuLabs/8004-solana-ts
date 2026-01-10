/**
 * Solana feedback management system for Agent0 SDK
 * v0.3.0 - Asset-based identification
 * Implements the 6 ERC-8004 read functions for Solana
 *
 * BREAKING CHANGES from v0.2.0:
 * - All methods now use asset (PublicKey) instead of agentId (bigint)
 * - Aggregates (average_score, total_feedbacks) computed off-chain
 */

import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import type { SolanaClient } from './client.js';
import type { IPFSClient } from './ipfs-client.js';
import { PDAHelpers, REPUTATION_PROGRAM_ID } from './pda-helpers.js';
import { ACCOUNT_DISCRIMINATORS } from './instruction-discriminators.js';
import {
  FeedbackAccount,
  FeedbackTagsPda,
  AgentReputationMetadata,
  ResponseIndexAccount,
  ResponseAccount,
} from './borsh-schemas.js';

/**
 * Summary result matching ERC-8004 getSummary interface
 * v0.3.0: Aggregates computed off-chain from feedbacks
 */
export interface SolanaAgentSummary {
  averageScore: number;
  totalFeedbacks: number;
  nextFeedbackIndex: number;
  totalClients?: number;
}

/**
 * Feedback result matching SDK interface - v0.3.0
 * Note: file_uri, file_hash, created_at are now in events only
 */
export interface SolanaFeedback {
  asset: PublicKey;
  client: PublicKey;
  feedbackIndex: bigint;
  score: number;
  tag1: string;
  tag2: string;
  revoked: boolean;
}

/**
 * Response result - v0.3.0
 * Note: response_uri, response_hash, created_at are now in events only
 */
export interface SolanaResponse {
  asset: PublicKey;
  feedbackIndex: bigint;
  responseIndex: bigint;
  responder: PublicKey;
}

/**
 * Manages feedback operations for Solana - v0.3.0
 * Implements all 6 ERC-8004 read functions
 */
export class SolanaFeedbackManager {
  constructor(
    private client: SolanaClient,
    private ipfsClient?: IPFSClient
  ) {}

  /**
   * 1. getSummary - Get agent reputation summary - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param minScore - Optional minimum score filter (client-side)
   * @param clientFilter - Optional client address filter (client-side)
   * @returns Summary with average score and total feedbacks
   *
   * v0.3.0: Aggregates computed off-chain from all feedbacks
   */
  async getSummary(
    asset: PublicKey,
    minScore?: number,
    clientFilter?: PublicKey
  ): Promise<SolanaAgentSummary> {
    try {
      // Get next_feedback_index from AgentReputationMetadata
      const [reputationPDA] = PDAHelpers.getAgentReputationPDA(asset);
      const reputationData = await this.client.getAccount(reputationPDA);

      let nextFeedbackIndex = 0;
      if (reputationData) {
        const reputation = AgentReputationMetadata.deserialize(reputationData);
        nextFeedbackIndex = Number(reputation.next_feedback_index);
      }

      // v0.3.0: Aggregates computed off-chain - fetch all feedbacks
      const feedbacks = await this.readAllFeedback(asset, false);

      // Apply filters if provided
      const filtered = feedbacks.filter(
        (f) =>
          (!minScore || f.score >= minScore) &&
          (!clientFilter || f.client.equals(clientFilter))
      );

      const sum = filtered.reduce((acc, f) => acc + f.score, 0);
      const uniqueClients = new Set(filtered.map((f) => f.client.toBase58()));

      return {
        averageScore: filtered.length > 0 ? sum / filtered.length : 0,
        totalFeedbacks: filtered.length,
        nextFeedbackIndex,
        totalClients: uniqueClients.size,
      };
    } catch (error) {
      console.error(`Error getting summary for agent ${asset.toBase58()}:`, error);
      return { averageScore: 0, totalFeedbacks: 0, nextFeedbackIndex: 0, totalClients: 0 };
    }
  }

  /**
   * 2. readFeedback - Read single feedback - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param _client - Client public key (kept for API compatibility, not used in PDA)
   * @param feedbackIndex - Feedback index
   * @returns Feedback object or null if not found
   */
  async readFeedback(
    asset: PublicKey,
    _client: PublicKey,
    feedbackIndex: bigint
  ): Promise<SolanaFeedback | null> {
    try {
      // v0.3.0: PDA uses asset, not agentId
      const [feedbackPDA] = PDAHelpers.getFeedbackPDA(asset, feedbackIndex);
      const data = await this.client.getAccount(feedbackPDA);

      if (!data) {
        return null;
      }

      const feedback = FeedbackAccount.deserialize(data);
      const tags = await this.fetchFeedbackTags(asset, feedbackIndex);
      return this.mapFeedbackAccount(feedback, tags);
    } catch (error) {
      console.error(
        `Error reading feedback for agent ${asset.toBase58()}, index ${feedbackIndex}:`,
        error
      );
      return null;
    }
  }

  /**
   * 3. readAllFeedback - Read all feedbacks for an agent - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param includeRevoked - Include revoked feedbacks (default: false)
   * @returns Array of feedback objects
   *
   * v0.3.0: Uses asset (32 bytes) filter instead of agent_id (8 bytes)
   */
  async readAllFeedback(asset: PublicKey, includeRevoked: boolean = false): Promise<SolanaFeedback[]> {
    try {
      const programId = REPUTATION_PROGRAM_ID;

      // v0.3.0: Filter by asset at offset 8 (after discriminator)
      const accounts = await this.client.getProgramAccounts(programId, [
        {
          // Filter by FeedbackAccount discriminator at offset 0
          memcmp: {
            offset: 0,
            bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.FeedbackAccount),
          },
        },
        {
          // Filter by asset at offset 8 (after discriminator)
          memcmp: {
            offset: 8,
            bytes: asset.toBase58(),
          },
        },
      ]);

      // Deserialize accounts
      const feedbackAccounts: FeedbackAccount[] = [];
      for (const acc of accounts) {
        try {
          const feedback = FeedbackAccount.deserialize(acc.data);
          if (includeRevoked || !feedback.is_revoked) {
            feedbackAccounts.push(feedback);
          }
        } catch {
          // Skip accounts that fail to deserialize
        }
      }

      // Fetch tags for all feedbacks in parallel
      const feedbacksWithTags = await Promise.all(
        feedbackAccounts.map(async (f) => {
          const tags = await this.fetchFeedbackTags(asset, f.feedback_index);
          return this.mapFeedbackAccount(f, tags);
        })
      );

      return feedbacksWithTags;
    } catch (error) {
      console.error(`Error reading all feedback for agent ${asset.toBase58()}:`, error);
      return [];
    }
  }

  /**
   * 4. getLastIndex - Get feedback count for a client - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param client - Client public key
   * @returns Count of feedbacks given by this client
   */
  async getLastIndex(asset: PublicKey, client: PublicKey): Promise<bigint> {
    try {
      // Count feedbacks from this client by scanning
      const allFeedbacks = await this.readAllFeedback(asset, true);
      const clientFeedbacks = allFeedbacks.filter((f) => f.client.equals(client));
      return BigInt(clientFeedbacks.length);
    } catch (error) {
      console.error(
        `Error getting last index for agent ${asset.toBase58()}, client ${client.toBase58()}:`,
        error
      );
      return BigInt(0);
    }
  }

  /**
   * 5. getClients - Get all clients who gave feedback to an agent - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @returns Array of unique client public keys
   */
  async getClients(asset: PublicKey): Promise<PublicKey[]> {
    try {
      const allFeedbacks = await this.readAllFeedback(asset, true);

      // Extract unique client pubkeys
      const uniqueClients = Array.from(
        new Set(allFeedbacks.map((f) => f.client.toBase58()))
      ).map((base58) => new PublicKey(base58));

      return uniqueClients;
    } catch (error) {
      console.error(`Error getting clients for agent ${asset.toBase58()}:`, error);
      return [];
    }
  }

  /**
   * 6. getResponseCount - Get number of responses for a feedback - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param feedbackIndex - Feedback index
   * @returns Number of responses
   */
  async getResponseCount(asset: PublicKey, feedbackIndex: bigint): Promise<number> {
    try {
      const [responseIndexPDA] = PDAHelpers.getResponseIndexPDA(asset, feedbackIndex);
      const data = await this.client.getAccount(responseIndexPDA);

      if (!data) {
        return 0;
      }

      const responseIndex = ResponseIndexAccount.deserialize(data);
      return Number(responseIndex.next_index);
    } catch (error) {
      console.error(
        `Error getting response count for agent ${asset.toBase58()}, index ${feedbackIndex}:`,
        error
      );
      return 0;
    }
  }

  /**
   * Bonus: Read all responses for a feedback - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param feedbackIndex - Feedback index
   * @returns Array of response objects
   */
  async readResponses(asset: PublicKey, feedbackIndex: bigint): Promise<SolanaResponse[]> {
    try {
      // Get response count first
      const responseCount = await this.getResponseCount(asset, feedbackIndex);

      if (responseCount === 0) {
        return [];
      }

      // Fetch all responses by deriving PDAs
      const responsePDAs: PublicKey[] = [];
      for (let i = 0; i < responseCount; i++) {
        const [responsePDA] = PDAHelpers.getResponsePDA(asset, feedbackIndex, BigInt(i));
        responsePDAs.push(responsePDA);
      }

      // Batch fetch all response accounts
      const accountsData = await this.client.getMultipleAccounts(responsePDAs);

      const responses: SolanaResponse[] = [];
      for (let i = 0; i < accountsData.length; i++) {
        const data = accountsData[i];
        if (data) {
          try {
            const response = ResponseAccount.deserialize(data);
            responses.push({
              asset,
              feedbackIndex,
              responseIndex: BigInt(i),
              responder: response.getResponderPublicKey(),
            });
          } catch {
            // Skip malformed accounts
          }
        }
      }

      return responses;
    } catch (error) {
      console.error(
        `Error reading responses for agent ${asset.toBase58()}, index ${feedbackIndex}:`,
        error
      );
      return [];
    }
  }

  /**
   * Helper to fetch FeedbackTagsPda for a feedback - v0.3.0
   * Returns tag1 and tag2, or empty strings if no tags PDA exists
   */
  private async fetchFeedbackTags(
    asset: PublicKey,
    feedbackIndex: bigint | { toString(): string }
  ): Promise<{ tag1: string; tag2: string }> {
    try {
      // Convert BN to bigint if needed (borsh returns BN objects)
      const fbIndex = typeof feedbackIndex === 'bigint'
        ? feedbackIndex
        : BigInt(feedbackIndex.toString());

      const [tagsPda] = PDAHelpers.getFeedbackTagsPDA(asset, fbIndex);
      const data = await this.client.getAccount(tagsPda);

      if (!data) {
        return { tag1: '', tag2: '' };
      }

      const tags = FeedbackTagsPda.deserialize(data);
      return { tag1: tags.tag1 || '', tag2: tags.tag2 || '' };
    } catch {
      return { tag1: '', tag2: '' };
    }
  }

  /**
   * Helper to map FeedbackAccount to SolanaFeedback interface - v0.3.0
   * @param feedback - The feedback account data
   * @param tags - Optional tags from FeedbackTagsPda (fetched separately)
   */
  private mapFeedbackAccount(
    feedback: FeedbackAccount,
    tags?: { tag1: string; tag2: string }
  ): SolanaFeedback {
    // Borsh returns BN objects for u64, convert to native BigInt
    const toBigInt = (val: bigint | { toString(): string }): bigint =>
      typeof val === 'bigint' ? val : BigInt(val.toString());

    return {
      asset: feedback.getAssetPublicKey(),
      client: feedback.getClientPublicKey(),
      feedbackIndex: toBigInt(feedback.feedback_index),
      score: feedback.score,
      tag1: tags?.tag1 || '',
      tag2: tags?.tag2 || '',
      revoked: feedback.is_revoked,
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

  /**
   * Fetch ALL feedbacks for ALL agents in 2 RPC calls - v0.3.0
   * Much more efficient than calling readAllFeedback() per agent
   * @param includeRevoked - Include revoked feedbacks? default: false
   * @returns Map of asset (base58 string) -> SolanaFeedback[]
   */
  async fetchAllFeedbacks(includeRevoked: boolean = false): Promise<Map<string, SolanaFeedback[]>> {
    const programId = REPUTATION_PROGRAM_ID;

    // 1. Fetch ALL FeedbackAccounts (discriminator only, no agent filter)
    const [feedbackAccounts, tagAccounts] = await Promise.all([
      this.client.getProgramAccounts(programId, [
        { memcmp: { offset: 0, bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.FeedbackAccount) } },
      ]),
      // 2. Fetch ALL FeedbackTagsPda
      this.client.getProgramAccounts(programId, [
        { memcmp: { offset: 0, bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.FeedbackTagsPda) } },
      ]),
    ]);

    // 3. Build tags map: "asset-feedbackIndex" -> { tag1, tag2 }
    // Note: In v0.3.0, FeedbackTagsPda doesn't store asset/feedbackIndex in account data,
    // only in PDA seeds. We need to extract from feedback accounts instead.
    const tagsMap = new Map<string, { tag1: string; tag2: string }>();
    for (const acc of tagAccounts) {
      try {
        const tags = FeedbackTagsPda.deserialize(acc.data);
        // For v0.3.0, we'll need to match tags to feedbacks by PDA address
        // Store by account address for now
        tagsMap.set(acc.pubkey.toBase58(), { tag1: tags.tag1 || '', tag2: tags.tag2 || '' });
      } catch {
        // Skip malformed FeedbackTagsPda accounts
      }
    }

    // 4. Deserialize feedbacks and group by asset
    const grouped = new Map<string, SolanaFeedback[]>();
    for (const acc of feedbackAccounts) {
      try {
        const fb = FeedbackAccount.deserialize(acc.data);

        if (!includeRevoked && fb.is_revoked) continue;

        const assetPubkey = fb.getAssetPublicKey();
        const assetStr = assetPubkey.toBase58();

        // Try to get tags by deriving the FeedbackTagsPda
        const [tagsPda] = PDAHelpers.getFeedbackTagsPDA(assetPubkey, fb.feedback_index);
        const tags = tagsMap.get(tagsPda.toBase58()) || { tag1: '', tag2: '' };

        const mapped = this.mapFeedbackAccount(fb, tags);

        if (!grouped.has(assetStr)) grouped.set(assetStr, []);
        grouped.get(assetStr)!.push(mapped);
      } catch {
        // Skip malformed FeedbackAccount
      }
    }

    return grouped;
  }
}
