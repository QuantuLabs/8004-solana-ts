/**
 * Solana feedback management system for Agent0 SDK
 * v0.4.0 - ATOM Engine + Indexer support
 * Implements the 6 ERC-8004 read functions for Solana
 *
 * BREAKING CHANGES from v0.3.0:
 * - Optional indexer support for fast queries
 * - SolanaFeedback interface extended with event-sourced fields
 */

import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import type { SolanaClient } from './client.js';
import type { IPFSClient } from './ipfs-client.js';
import type { IndexerClient, IndexedFeedback } from './indexer-client.js';
import { PDAHelpers, REPUTATION_PROGRAM_ID } from './pda-helpers.js';
import { ACCOUNT_DISCRIMINATORS } from './instruction-discriminators.js';
import {
  FeedbackAccount,
  FeedbackTagsPda,
  AgentReputationMetadata,
  ResponseIndexAccount,
  ResponseAccount,
} from './borsh-schemas.js';
import { logger } from '../utils/logger.js';

/**
 * Security: Default limits for getProgramAccounts to prevent OOM
 */
const DEFAULT_MAX_FEEDBACKS = 1000;
const DEFAULT_MAX_ALL_FEEDBACKS = 5000;

export interface FeedbackQueryOptions {
  /**
   * Maximum feedbacks to return (default: 1000)
   * Security: Prevents OOM from unbounded queries
   */
  maxResults?: number;
}

/**
 * Summary result matching ERC-8004 getSummary interface
 * v0.4.0: Extended with positive/negative counts
 */
export interface SolanaAgentSummary {
  averageScore: number;
  totalFeedbacks: number;
  nextFeedbackIndex: number;
  totalClients?: number;
  // v0.4.0: positive/negative breakdown
  positiveCount: number;    // score >= 50
  negativeCount: number;    // score < 50
}

/**
 * Feedback result matching SDK interface - v0.4.0
 * Extended with event-sourced fields available via indexer
 */
export interface SolanaFeedback {
  // Core fields (always available from on-chain)
  asset: PublicKey;
  client: PublicKey;
  feedbackIndex: bigint;
  score: number;
  tag1: string;
  tag2: string;
  revoked?: boolean;         // Kept for backward compatibility
  isRevoked?: boolean;       // v0.4.0 naming
  // Event-sourced fields (available via indexer)
  endpoint?: string;
  feedbackUri?: string;
  feedbackHash?: Buffer;
  blockSlot?: bigint;
  txSignature?: string;
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
 * Manages feedback operations for Solana - v0.4.0
 * Implements all 6 ERC-8004 read functions
 * Optional indexer support for fast queries
 */
export class SolanaFeedbackManager {
  private indexerClient?: IndexerClient;

  constructor(
    private client: SolanaClient,
    private ipfsClient?: IPFSClient,
    indexerClient?: IndexerClient
  ) {
    this.indexerClient = indexerClient;
  }

  /**
   * Set the indexer client (for late binding)
   */
  setIndexerClient(indexerClient: IndexerClient): void {
    this.indexerClient = indexerClient;
  }

  /**
   * 1. getSummary - Get agent reputation summary - v0.4.0
   * @param asset - Agent Core asset pubkey
   * @param minScore - Optional minimum score filter (client-side)
   * @param clientFilter - Optional client address filter (client-side)
   * @returns Summary with average score, total feedbacks, and positive/negative counts
   *
   * v0.4.0: Added positive/negative counts
   * Security: Fetches metadata and feedbacks in parallel to reduce state drift window
   */
  async getSummary(
    asset: PublicKey,
    minScore?: number,
    clientFilter?: PublicKey
  ): Promise<SolanaAgentSummary> {
    try {
      // Security: Fetch in parallel to minimize state drift window
      const [reputationPDA] = PDAHelpers.getAgentReputationPDA(asset);
      const [reputationData, feedbacks] = await Promise.all([
        this.client.getAccount(reputationPDA),
        this.readAllFeedback(asset, false),
      ]);

      let nextFeedbackIndex = 0;
      if (reputationData) {
        const reputation = AgentReputationMetadata.deserialize(reputationData);
        nextFeedbackIndex = Number(reputation.next_feedback_index);
      }

      // Apply filters if provided
      const filtered = feedbacks.filter(
        (f) =>
          (!minScore || f.score >= minScore) &&
          (!clientFilter || f.client.equals(clientFilter))
      );

      const sum = filtered.reduce((acc, f) => acc + f.score, 0);
      const uniqueClients = new Set(filtered.map((f) => f.client.toBase58()));

      // v0.4.0: Calculate positive/negative counts (threshold: 50)
      const positiveCount = filtered.filter((f) => f.score >= 50).length;
      const negativeCount = filtered.filter((f) => f.score < 50).length;

      return {
        averageScore: filtered.length > 0 ? sum / filtered.length : 0,
        totalFeedbacks: filtered.length,
        nextFeedbackIndex,
        totalClients: uniqueClients.size,
        positiveCount,
        negativeCount,
      };
    } catch (error) {
      logger.error(`Error getting summary for agent`, error);
      return {
        averageScore: 0,
        totalFeedbacks: 0,
        nextFeedbackIndex: 0,
        totalClients: 0,
        positiveCount: 0,
        negativeCount: 0,
      };
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
      logger.error(`Error reading feedback index ${feedbackIndex}`, error);
      return null;
    }
  }

  /**
   * 3. readAllFeedback - Read all feedbacks for an agent - v0.3.0
   * @param asset - Agent Core asset pubkey
   * @param includeRevoked - Include revoked feedbacks (default: false)
   * @param options - Query options including maxResults limit
   * @returns Array of feedback objects
   *
   * v0.3.0: Uses asset (32 bytes) filter instead of agent_id (8 bytes)
   * Security: Limited to maxResults (default 1000) to prevent OOM
   */
  async readAllFeedback(
    asset: PublicKey,
    includeRevoked: boolean = false,
    options: FeedbackQueryOptions = {}
  ): Promise<SolanaFeedback[]> {
    const maxResults = options.maxResults ?? DEFAULT_MAX_FEEDBACKS;

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

      // Security: Warn if limit reached
      if (accounts.length > maxResults) {
        logger.warn(
          `readAllFeedback returned ${accounts.length} accounts, limiting to ${maxResults}. ` +
          `Use options.maxResults to adjust limit.`
        );
      }

      // Deserialize accounts (with limit)
      const feedbackAccounts: FeedbackAccount[] = [];
      let skipped = 0;
      const accountsToProcess = accounts.slice(0, maxResults);

      for (const acc of accountsToProcess) {
        try {
          const feedback = FeedbackAccount.deserialize(acc.data);
          if (includeRevoked || !feedback.is_revoked) {
            feedbackAccounts.push(feedback);
          }
        } catch {
          skipped++;
        }
      }

      if (skipped > 0) {
        logger.warn(`Skipped ${skipped} malformed feedback account(s)`);
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
      logger.error(`Error reading all feedback for agent`, error);
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
      logger.error(`Error getting last index for client`, error);
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
      logger.error(`Error getting clients for agent`, error);
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
      logger.error(`Error getting response count for feedback index ${feedbackIndex}`, error);
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
      let skipped = 0;
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
            skipped++;
          }
        }
      }

      if (skipped > 0) {
        logger.warn(`Skipped ${skipped} malformed response account(s)`);
      }

      return responses;
    } catch (error) {
      logger.error(`Error reading responses for feedback index ${feedbackIndex}`, error);
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
   * Helper to map FeedbackAccount to SolanaFeedback interface - v0.4.0
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
      isRevoked: feedback.is_revoked,  // v0.4.0 naming
    };
  }

  /**
   * Read feedbacks from indexer (v0.4.0)
   * Falls back to on-chain if indexer unavailable
   * @param asset - Agent Core asset pubkey
   * @param options - Query options
   * @returns Array of feedbacks with full event-sourced data
   */
  async readFeedbackListFromIndexer(
    asset: PublicKey,
    options?: { includeRevoked?: boolean; limit?: number; offset?: number }
  ): Promise<SolanaFeedback[]> {
    if (!this.indexerClient) {
      logger.warn('No indexer client configured, falling back to on-chain');
      return this.readAllFeedback(asset, options?.includeRevoked ?? false);
    }

    try {
      const indexed = await this.indexerClient.getFeedbacks(asset.toBase58(), options);
      return indexed.map((f) => this.mapIndexedFeedback(f));
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Indexer failed, falling back to on-chain: ${errMsg}`);
      return this.readAllFeedback(asset, options?.includeRevoked ?? false);
    }
  }

  /**
   * Helper to map IndexedFeedback to SolanaFeedback - v0.4.0
   */
  private mapIndexedFeedback(indexed: IndexedFeedback): SolanaFeedback {
    return {
      asset: new PublicKey(indexed.asset),
      client: new PublicKey(indexed.client_address),
      feedbackIndex: BigInt(indexed.feedback_index),
      score: indexed.score,
      tag1: indexed.tag1 || '',
      tag2: indexed.tag2 || '',
      revoked: indexed.is_revoked,
      isRevoked: indexed.is_revoked,
      endpoint: indexed.endpoint || '',
      feedbackUri: indexed.feedback_uri || '',
      feedbackHash: indexed.feedback_hash
        ? Buffer.from(indexed.feedback_hash, 'hex')
        : undefined,
      blockSlot: BigInt(indexed.block_slot),
      txSignature: indexed.tx_signature,
    };
  }

  /**
   * Helper to fetch and parse feedback file from IPFS/Arweave
   */
  async fetchFeedbackFile(_uri: string): Promise<any | null> {
    if (!this.ipfsClient) {
      logger.warn('IPFS client not configured, cannot fetch feedback file');
      return null;
    }

    try {
      // This would use the ipfsClient to fetch
      // For now, return null as IPFS client needs to be adapted
      return null;
    } catch (error) {
      logger.error(`Error fetching feedback file`, error);
      return null;
    }
  }

  /**
   * Fetch ALL feedbacks for ALL agents in 2 RPC calls - v0.3.0
   * Much more efficient than calling readAllFeedback() per agent
   * @param includeRevoked - Include revoked feedbacks? default: false
   * @param options - Query options including maxResults limit
   * @returns Map of asset (base58 string) -> SolanaFeedback[]
   *
   * Security: Limited to maxResults (default 5000) to prevent OOM
   */
  async fetchAllFeedbacks(
    includeRevoked: boolean = false,
    options: FeedbackQueryOptions = {}
  ): Promise<Map<string, SolanaFeedback[]>> {
    const maxResults = options.maxResults ?? DEFAULT_MAX_ALL_FEEDBACKS;
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

    // Security: Warn if limit reached
    if (feedbackAccounts.length > maxResults) {
      logger.warn(
        `fetchAllFeedbacks returned ${feedbackAccounts.length} accounts, limiting to ${maxResults}. ` +
        `Use options.maxResults to adjust limit or use an indexer for production.`
      );
    }

    // 3. Build tags map: "asset-feedbackIndex" -> { tag1, tag2 }
    // Note: In v0.3.0, FeedbackTagsPda doesn't store asset/feedbackIndex in account data,
    // only in PDA seeds. We need to extract from feedback accounts instead.
    const tagsMap = new Map<string, { tag1: string; tag2: string }>();
    let skippedTags = 0;
    for (const acc of tagAccounts) {
      try {
        const tags = FeedbackTagsPda.deserialize(acc.data);
        // For v0.3.0, we'll need to match tags to feedbacks by PDA address
        // Store by account address for now
        tagsMap.set(acc.pubkey.toBase58(), { tag1: tags.tag1 || '', tag2: tags.tag2 || '' });
      } catch {
        skippedTags++;
      }
    }

    if (skippedTags > 0) {
      logger.warn(`Skipped ${skippedTags} malformed FeedbackTagsPda account(s)`);
    }

    // 4. Deserialize feedbacks and group by asset (with limit)
    const grouped = new Map<string, SolanaFeedback[]>();
    let skippedFeedbacks = 0;
    let processedCount = 0;
    const accountsToProcess = feedbackAccounts.slice(0, maxResults);

    for (const acc of accountsToProcess) {
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
        processedCount++;
      } catch {
        skippedFeedbacks++;
      }
    }

    if (skippedFeedbacks > 0) {
      logger.warn(`Skipped ${skippedFeedbacks} malformed FeedbackAccount(s)`);
    }

    logger.debug(`fetchAllFeedbacks processed ${processedCount} feedbacks across ${grouped.size} agents`);

    return grouped;
  }
}
