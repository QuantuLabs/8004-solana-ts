/**
 * Solana feedback management system for Agent0 SDK
 * Implements the 6 ERC-8004 read functions for Solana
 */
import { PublicKey } from '@solana/web3.js';
import type { SolanaClient } from './client.js';
import type { IPFSClient } from '../core/ipfs-client.js';
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
export declare class SolanaFeedbackManager {
    private client;
    private ipfsClient?;
    constructor(client: SolanaClient, ipfsClient?: IPFSClient | undefined);
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
    getSummary(agentId: bigint, minScore?: number, clientFilter?: PublicKey): Promise<SolanaAgentSummary>;
    /**
     * 2. readFeedback - Read single feedback
     * @param agentId - Agent ID
     * @param client - Client public key
     * @param feedbackIndex - Feedback index
     * @returns Feedback object or null if not found
     */
    readFeedback(agentId: bigint, client: PublicKey, feedbackIndex: bigint): Promise<SolanaFeedback | null>;
    /**
     * 3. readAllFeedback - Read all feedbacks for an agent
     * @param agentId - Agent ID
     * @param includeRevoked - Include revoked feedbacks (default: false)
     * @returns Array of feedback objects
     *
     * Implementation: Uses getProgramAccounts with memcmp filter on agent_id
     * Also fetches FeedbackTagsPda for each feedback to get tag1/tag2
     */
    readAllFeedback(agentId: bigint, includeRevoked?: boolean): Promise<SolanaFeedback[]>;
    /**
     * 4. getLastIndex - Get feedback count for a client
     * v0.2.0: ClientIndexAccount removed - counts feedbacks by scanning
     * @param agentId - Agent ID
     * @param client - Client public key
     * @returns Count of feedbacks given by this client
     */
    getLastIndex(agentId: bigint, client: PublicKey): Promise<bigint>;
    /**
     * 5. getClients - Get all clients who gave feedback to an agent
     * v0.2.0: ClientIndexAccount removed - extracts unique clients from FeedbackAccounts
     * @param agentId - Agent ID
     * @returns Array of unique client public keys
     */
    getClients(agentId: bigint): Promise<PublicKey[]>;
    /**
     * 6. getResponseCount - Get number of responses for a feedback
     * @param agentId - Agent ID
     * @param feedbackIndex - Feedback index
     * @returns Number of responses
     * @deprecated The client parameter is no longer used in v0.2.0 (global feedback index)
     */
    getResponseCount(agentId: bigint, feedbackIndex: bigint): Promise<number>;
    /**
     * Bonus: Read all responses for a feedback
     * Not required by ERC-8004 but useful for SDK completeness
     * @deprecated The client parameter is no longer used in v0.2.0 (global feedback index)
     */
    readResponses(agentId: bigint, feedbackIndex: bigint): Promise<SolanaResponse[]>;
    /**
     * Helper to fetch FeedbackTagsPda for a feedback
     * Returns tag1 and tag2, or empty strings if no tags PDA exists
     * Handles BN objects from borsh deserialization
     */
    private fetchFeedbackTags;
    /**
     * Helper to map FeedbackAccount to SolanaFeedback interface
     * Converts BN values from borsh to native BigInt
     * @param feedback - The feedback account data
     * @param tags - Optional tags from FeedbackTagsPda (fetched separately)
     */
    private mapFeedbackAccount;
    /**
     * Helper to fetch and parse feedback file from IPFS/Arweave
     */
    fetchFeedbackFile(uri: string): Promise<any | null>;
}
//# sourceMappingURL=feedback-manager-solana.d.ts.map