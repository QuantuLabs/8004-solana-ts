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
     * @param minScore - Optional minimum score filter (client-side)
     * @param clientFilter - Optional client address filter (client-side)
     * @returns Summary with average score, total feedbacks, and positive/negative counts
     *
     * v0.4.0: Added positive/negative counts
     * Security: Fetches metadata and feedbacks in parallel to reduce state drift window
     */
    getSummary(asset: PublicKey, minScore?: number, clientFilter?: PublicKey): Promise<SolanaAgentSummary>;
    /**
     * 2. readFeedback - Read single feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param _client - Client public key (kept for API compatibility, not used in PDA)
     * @param feedbackIndex - Feedback index
     * @returns Feedback object or null if not found
     */
    readFeedback(asset: PublicKey, _client: PublicKey, feedbackIndex: bigint): Promise<SolanaFeedback | null>;
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
    readAllFeedback(asset: PublicKey, includeRevoked?: boolean, options?: FeedbackQueryOptions): Promise<SolanaFeedback[]>;
    /**
     * 4. getLastIndex - Get feedback count for a client - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key
     * @returns Count of feedbacks given by this client
     */
    getLastIndex(asset: PublicKey, client: PublicKey): Promise<bigint>;
    /**
     * 5. getClients - Get all clients who gave feedback to an agent - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns Array of unique client public keys
     */
    getClients(asset: PublicKey): Promise<PublicKey[]>;
    /**
     * 6. getResponseCount - Get number of responses for a feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index
     * @returns Number of responses
     */
    getResponseCount(asset: PublicKey, feedbackIndex: bigint): Promise<number>;
    /**
     * Bonus: Read all responses for a feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index
     * @returns Array of response objects
     */
    readResponses(asset: PublicKey, feedbackIndex: bigint): Promise<SolanaResponse[]>;
    /**
     * Helper to fetch FeedbackTagsPda for a feedback - v0.3.0
     * Returns tag1 and tag2, or empty strings if no tags PDA exists
     */
    private fetchFeedbackTags;
    /**
     * Helper to map FeedbackAccount to SolanaFeedback interface - v0.4.0
     * @param feedback - The feedback account data
     * @param tags - Optional tags from FeedbackTagsPda (fetched separately)
     */
    private mapFeedbackAccount;
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
    fetchFeedbackFile(_uri: string): Promise<any | null>;
    /**
     * Fetch ALL feedbacks for ALL agents in 2 RPC calls - v0.3.0
     * Much more efficient than calling readAllFeedback() per agent
     * @param includeRevoked - Include revoked feedbacks? default: false
     * @param options - Query options including maxResults limit
     * @returns Map of asset (base58 string) -> SolanaFeedback[]
     *
     * Security: Limited to maxResults (default 5000) to prevent OOM
     */
    fetchAllFeedbacks(includeRevoked?: boolean, options?: FeedbackQueryOptions): Promise<Map<string, SolanaFeedback[]>>;
}
//# sourceMappingURL=feedback-manager-solana.d.ts.map