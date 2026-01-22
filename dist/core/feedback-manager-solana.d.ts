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
import type { SolanaClient } from './client.js';
import type { IPFSClient } from './ipfs-client.js';
import type { IndexerClient } from './indexer-client.js';
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
    positiveCount: number;
    negativeCount: number;
}
/**
 * Feedback result matching SDK interface - v0.4.0
 * Extended with event-sourced fields available via indexer
 */
export interface SolanaFeedback {
    asset: PublicKey;
    client: PublicKey;
    feedbackIndex: bigint;
    score: number;
    tag1: string;
    tag2: string;
    revoked?: boolean;
    isRevoked?: boolean;
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
export declare class SolanaFeedbackManager {
    private client;
    private ipfsClient?;
    private indexerClient?;
    constructor(client: SolanaClient, ipfsClient?: IPFSClient | undefined, indexerClient?: IndexerClient);
    /**
     * Set the indexer client (for late binding)
     */
    setIndexerClient(indexerClient: IndexerClient): void;
    /**
     * 1. getSummary - Get agent reputation summary - v0.4.0
     * @param asset - Agent Core asset pubkey
     * @param minScore - Optional minimum score filter (requires indexer for filtering)
     * @param clientFilter - Optional client address filter (requires indexer for filtering)
     * @returns Summary with average score, total feedbacks, and positive/negative counts
     *
     * v0.4.0: Uses AtomStats on-chain (primary) with indexer fallback
     * Note: minScore and clientFilter require indexer for accurate filtering
     */
    getSummary(asset: PublicKey, minScore?: number, clientFilter?: PublicKey): Promise<SolanaAgentSummary>;
    /**
     * Get AtomStats for summary calculation
     * @internal
     */
    private getAtomStatsForSummary;
    /**
     * Get summary from indexer (fallback or when filters are needed)
     * @internal
     */
    private getSummaryFromIndexer;
    /**
     * 2. readFeedback - Read single feedback - v0.4.1
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key (who gave the feedback)
     * @param feedbackIndex - Feedback index (per client per agent)
     * @returns Feedback object or null if not found
     *
     * v0.4.0: FeedbackAccount PDAs no longer exist - uses indexer
     * v0.4.1: Fixed to filter by client (audit finding #1 HIGH)
     * REQUIRES indexer to be configured
     */
    readFeedback(asset: PublicKey, client: PublicKey, feedbackIndex: bigint): Promise<SolanaFeedback | null>;
    /**
     * 3. readAllFeedback - Read all feedbacks for an agent - v0.4.0
     * @param asset - Agent Core asset pubkey
     * @param includeRevoked - Include revoked feedbacks (default: false)
     * @param options - Query options including maxResults limit
     * @returns Array of feedback objects
     *
     * v0.4.0: FeedbackAccount PDAs no longer exist - uses indexer
     * REQUIRES indexer to be configured
     */
    readAllFeedback(asset: PublicKey, includeRevoked?: boolean, options?: FeedbackQueryOptions): Promise<SolanaFeedback[]>;
    /**
     * 4. getLastIndex - Get the last feedback index for a client - v0.4.0
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key
     * @returns Last feedback index (-1 if no feedbacks, so next index = lastIndex + 1)
     *
     * v0.4.0: Uses indexer for efficient client-scoped query
     * REQUIRES indexer to be configured
     *
     * Semantics: Returns MAX index, not COUNT. Consistent with IndexerClient.getLastFeedbackIndex()
     * - No feedbacks → returns -1n (next index = 0)
     * - 3 feedbacks (0,1,2) → returns 2n (next index = 3)
     */
    getLastIndex(asset: PublicKey, client: PublicKey): Promise<bigint>;
    /**
     * 5. getClients - Get all clients who gave feedback to an agent - v0.4.0
     * @param asset - Agent Core asset pubkey
     * @returns Array of unique client public keys
     *
     * v0.4.0: Uses indexer for efficient query
     * REQUIRES indexer to be configured
     */
    getClients(asset: PublicKey): Promise<PublicKey[]>;
    /**
     * 6. getResponseCount - Get number of responses for a feedback - v0.4.1
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key (who gave the feedback)
     * @param feedbackIndex - Feedback index
     * @returns Number of responses
     *
     * v0.4.1: Migrated to indexer (audit finding #3 HIGH)
     * Response PDAs no longer exist - data is event-only and indexed off-chain
     * REQUIRES indexer to be configured
     */
    getResponseCount(asset: PublicKey, client: PublicKey, feedbackIndex: bigint): Promise<number>;
    /**
     * Bonus: Read all responses for a feedback - v0.4.1
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key (who gave the feedback)
     * @param feedbackIndex - Feedback index
     * @returns Array of response objects
     *
     * v0.4.1: Migrated to indexer (audit finding #3 HIGH)
     * Response PDAs no longer exist - data is event-only and indexed off-chain
     * REQUIRES indexer to be configured
     */
    readResponses(asset: PublicKey, client: PublicKey, feedbackIndex: bigint): Promise<SolanaResponse[]>;
    /**
     * Read feedbacks from indexer (v0.4.0)
     * Falls back to on-chain if indexer unavailable
     * @param asset - Agent Core asset pubkey
     * @param options - Query options
     * @returns Array of feedbacks with full event-sourced data
     */
    readFeedbackListFromIndexer(asset: PublicKey, options?: {
        includeRevoked?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<SolanaFeedback[]>;
    /**
     * Helper to map IndexedFeedback to SolanaFeedback - v0.4.0
     */
    private mapIndexedFeedback;
    /**
     * Helper to fetch and parse feedback file from IPFS/Arweave
     */
    fetchFeedbackFile(_uri: string): Promise<unknown | null>;
    /**
     * Fetch ALL feedbacks for ALL agents - v0.4.0
     * @param includeRevoked - Include revoked feedbacks? default: false
     * @param options - Query options including maxResults limit
     * @returns Map of asset (base58 string) -> SolanaFeedback[]
     *
     * v0.4.0: FeedbackAccount PDAs no longer exist - uses indexer
     * REQUIRES indexer to be configured
     * Note: For large datasets, consider using indexer APIs directly
     */
    fetchAllFeedbacks(includeRevoked?: boolean, options?: FeedbackQueryOptions): Promise<Map<string, SolanaFeedback[]>>;
}
//# sourceMappingURL=feedback-manager-solana.d.ts.map