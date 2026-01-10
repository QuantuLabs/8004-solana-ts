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
import type { SolanaClient } from './client.js';
import type { IPFSClient } from './ipfs-client.js';
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
export declare class SolanaFeedbackManager {
    private client;
    private ipfsClient?;
    constructor(client: SolanaClient, ipfsClient?: IPFSClient | undefined);
    /**
     * 1. getSummary - Get agent reputation summary - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param minScore - Optional minimum score filter (client-side)
     * @param clientFilter - Optional client address filter (client-side)
     * @returns Summary with average score and total feedbacks
     *
     * v0.3.0: Aggregates computed off-chain from all feedbacks
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
     * @returns Array of feedback objects
     *
     * v0.3.0: Uses asset (32 bytes) filter instead of agent_id (8 bytes)
     */
    readAllFeedback(asset: PublicKey, includeRevoked?: boolean): Promise<SolanaFeedback[]>;
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
     * Helper to map FeedbackAccount to SolanaFeedback interface - v0.3.0
     * @param feedback - The feedback account data
     * @param tags - Optional tags from FeedbackTagsPda (fetched separately)
     */
    private mapFeedbackAccount;
    /**
     * Helper to fetch and parse feedback file from IPFS/Arweave
     */
    fetchFeedbackFile(uri: string): Promise<any | null>;
    /**
     * Fetch ALL feedbacks for ALL agents in 2 RPC calls - v0.3.0
     * Much more efficient than calling readAllFeedback() per agent
     * @param includeRevoked - Include revoked feedbacks? default: false
     * @returns Map of asset (base58 string) -> SolanaFeedback[]
     */
    fetchAllFeedbacks(includeRevoked?: boolean): Promise<Map<string, SolanaFeedback[]>>;
}
//# sourceMappingURL=feedback-manager-solana.d.ts.map