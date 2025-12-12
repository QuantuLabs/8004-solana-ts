/**
 * Solana SDK for Agent0 - ERC-8004 implementation
 * Provides read and write access to Solana-based agent registries
 */
import { PublicKey, Keypair } from '@solana/web3.js';
import { SolanaClient, Cluster } from './client.js';
import { SolanaFeedbackManager, SolanaFeedback } from './feedback-manager-solana.js';
import type { IPFSClient } from './ipfs-client.js';
import { AgentAccount } from './borsh-schemas.js';
import { TransactionResult, WriteOptions, RegisterAgentOptions, PreparedTransaction } from './transaction-builder.js';
import type { FeedbackAuth } from '../models/interfaces.js';
export interface SolanaSDKConfig {
    cluster?: Cluster;
    rpcUrl?: string;
    signer?: Keypair;
    ipfsClient?: IPFSClient;
}
/**
 * Agent with on-chain metadata extensions
 * Returned by getAllAgents() for efficient bulk fetching
 */
export interface AgentWithMetadata {
    account: AgentAccount;
    metadata: Array<{
        key: string;
        value: string;
    }>;
    feedbacks?: SolanaFeedback[];
}
export interface GetAllAgentsOptions {
    /** Include feedbacks for each agent (2 additional RPC calls). Default: false */
    includeFeedbacks?: boolean;
    /** If includeFeedbacks=true, include revoked feedbacks? Default: false */
    includeRevoked?: boolean;
}
/**
 * Main SDK class for Solana ERC-8004 implementation
 * Provides read and write access to agent registries on Solana
 */
export declare class SolanaSDK {
    private readonly client;
    private readonly feedbackManager;
    private readonly cluster;
    private readonly programIds;
    private readonly signer?;
    private readonly identityTxBuilder;
    private readonly reputationTxBuilder;
    private readonly validationTxBuilder;
    private mintResolver?;
    private collectionMint?;
    constructor(config?: SolanaSDKConfig);
    /**
     * Initialize the agent mint resolver (lazy initialization)
     * Fetches registry config and creates resolver
     */
    private initializeMintResolver;
    /**
     * Load agent by ID
     * @param agentId - Agent ID (number or bigint)
     * @returns Agent account data or null if not found
     */
    loadAgent(agentId: number | bigint): Promise<AgentAccount | null>;
    /**
     * Get a specific metadata entry for an agent
     * @param agentId - Agent ID (number or bigint)
     * @param key - Metadata key
     * @returns Metadata value as string, or null if not found
     */
    getMetadata(agentId: number | bigint, key: string): Promise<string | null>;
    /**
     * Get agent by owner
     * @param owner - Owner public key
     * @returns Array of agent accounts owned by this address
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
     */
    getAgentsByOwner(owner: PublicKey): Promise<AgentAccount[]>;
    /**
     * Get all registered agents with their on-chain metadata
     * @param options - Optional settings for additional data fetching
     * @returns Array of agents with metadata extensions (and optionally feedbacks)
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
     */
    getAllAgents(options?: GetAllAgentsOptions): Promise<AgentWithMetadata[]>;
    /**
     * Fetch ALL feedbacks for ALL agents in 2 RPC calls
     * More efficient than calling readAllFeedback() per agent
     * @param includeRevoked - Include revoked feedbacks? Default: false
     * @returns Map of agentId -> SolanaFeedback[]
     * @throws UnsupportedRpcError if using default devnet RPC
     */
    getAllFeedbacks(includeRevoked?: boolean): Promise<Map<bigint, SolanaFeedback[]>>;
    /**
     * Check if agent exists
     * @param agentId - Agent ID (number or bigint)
     * @returns True if agent exists
     */
    agentExists(agentId: number | bigint): Promise<boolean>;
    /**
     * Get agent (alias for loadAgent, for parity with agent0-ts)
     * @param agentId - Agent ID (number or bigint)
     * @returns Agent account data or null if not found
     */
    getAgent(agentId: number | bigint): Promise<AgentAccount | null>;
    /**
     * Check if address is agent owner
     * @param agentId - Agent ID (number or bigint)
     * @param address - Address to check
     * @returns True if address is the owner
     */
    isAgentOwner(agentId: number | bigint, address: PublicKey): Promise<boolean>;
    /**
     * Get agent owner
     * @param agentId - Agent ID (number or bigint)
     * @returns Owner public key or null if agent not found
     */
    getAgentOwner(agentId: number | bigint): Promise<PublicKey | null>;
    /**
     * Get reputation summary (alias for getSummary, for parity with agent0-ts)
     * @param agentId - Agent ID (number or bigint)
     * @returns Reputation summary with count and average score
     */
    getReputationSummary(agentId: number | bigint): Promise<{
        count: number;
        averageScore: number;
    }>;
    /**
     * 1. Get agent reputation summary
     * @param agentId - Agent ID (number or bigint)
     * @param minScore - Optional minimum score filter
     * @param clientFilter - Optional client filter
     * @returns Reputation summary with average score and total feedbacks
     */
    getSummary(agentId: number | bigint, minScore?: number, clientFilter?: PublicKey): Promise<import("./feedback-manager-solana.js").SolanaAgentSummary>;
    /**
     * 2. Read single feedback
     * @param agentId - Agent ID (number or bigint)
     * @param client - Client public key
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Feedback object or null
     */
    readFeedback(agentId: number | bigint, client: PublicKey, feedbackIndex: number | bigint): Promise<SolanaFeedback | null>;
    /**
     * Get feedback (alias for readFeedback, for parity with agent0-ts)
     * @param agentId - Agent ID (number or bigint)
     * @param clientAddress - Client public key
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Feedback object or null
     */
    getFeedback(agentId: number | bigint, clientAddress: PublicKey, feedbackIndex: number | bigint): Promise<SolanaFeedback | null>;
    /**
     * 3. Read all feedbacks for an agent
     * @param agentId - Agent ID (number or bigint)
     * @param includeRevoked - Include revoked feedbacks
     * @returns Array of feedback objects
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts with memcmp)
     */
    readAllFeedback(agentId: number | bigint, includeRevoked?: boolean): Promise<SolanaFeedback[]>;
    /**
     * 4. Get last feedback index for a client
     * @param agentId - Agent ID (number or bigint)
     * @param client - Client public key
     * @returns Last feedback index
     */
    getLastIndex(agentId: number | bigint, client: PublicKey): Promise<bigint>;
    /**
     * 5. Get all clients who gave feedback
     * @param agentId - Agent ID (number or bigint)
     * @returns Array of client public keys
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts with memcmp)
     */
    getClients(agentId: number | bigint): Promise<PublicKey[]>;
    /**
     * 6. Get response count for a feedback
     * @param agentId - Agent ID (number or bigint)
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Number of responses
     * @deprecated The client parameter is no longer used in v0.2.0 (global feedback index)
     */
    getResponseCount(agentId: number | bigint, feedbackIndex: number | bigint): Promise<number>;
    /**
     * Bonus: Read all responses for a feedback
     * @param agentId - Agent ID (number or bigint)
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Array of response objects
     * @deprecated The client parameter is no longer used in v0.2.0 (global feedback index)
     */
    readResponses(agentId: number | bigint, feedbackIndex: number | bigint): Promise<import('./feedback-manager-solana.js').SolanaResponse[]>;
    /**
     * Check if SDK has write permissions
     */
    get canWrite(): boolean;
    /**
     * Register a new agent (write operation)
     * @param tokenUri - Optional token URI
     * @param metadata - Optional metadata entries (key-value pairs)
     * @param options - Write options (skipSend, signer, mintPubkey)
     * @returns Transaction result with agent ID, or PreparedTransaction if skipSend
     */
    registerAgent(tokenUri?: string, metadata?: Array<{
        key: string;
        value: string;
    }>, options?: RegisterAgentOptions): Promise<(TransactionResult & {
        agentId?: bigint;
        asset?: PublicKey;
        signatures?: string[];
    }) | (PreparedTransaction & {
        agentId: bigint;
        asset: PublicKey;
    })>;
    /**
     * Set agent URI (write operation)
     * @param agentId - Agent ID (number or bigint)
     * @param newUri - New URI
     * @param options - Write options (skipSend, signer)
     */
    setAgentUri(agentId: number | bigint, newUri: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Set agent metadata (write operation)
     * @param agentId - Agent ID (number or bigint)
     * @param key - Metadata key
     * @param value - Metadata value
     * @param immutable - If true, metadata cannot be modified or deleted (default: false)
     * @param options - Write options (skipSend, signer)
     */
    setMetadata(agentId: number | bigint, key: string, value: string, immutable?: boolean, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Delete a metadata entry for an agent (write operation)
     * Only works if metadata is not immutable
     * @param agentId - Agent ID (number or bigint)
     * @param key - Metadata key to delete
     * @param options - Write options (skipSend, signer)
     */
    deleteMetadata(agentId: number | bigint, key: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Give feedback to an agent (write operation)
     * Aligned with agent0-ts SDK interface
     * @param agentId - Agent ID (number or bigint)
     * @param feedbackFile - Feedback data object
     * @param feedbackAuth - Optional feedback authorization (not yet implemented)
     * @param options - Write options (skipSend, signer)
     */
    giveFeedback(agentId: number | bigint, feedbackFile: {
        score: number;
        tag1?: string;
        tag2?: string;
        fileUri: string;
        fileHash: Buffer;
    }, feedbackAuth?: FeedbackAuth, options?: WriteOptions): Promise<(TransactionResult & {
        feedbackIndex?: bigint;
    }) | (PreparedTransaction & {
        feedbackIndex: bigint;
    })>;
    /**
     * Revoke feedback (write operation)
     * @param agentId - Agent ID (number or bigint)
     * @param feedbackIndex - Feedback index to revoke (number or bigint)
     * @param options - Write options (skipSend, signer)
     */
    revokeFeedback(agentId: number | bigint, feedbackIndex: number | bigint, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Append response to feedback (write operation)
     * v0.2.0: client parameter removed (not needed for global feedback index)
     * @param agentId - Agent ID (number or bigint)
     * @param client - Client who gave feedback (kept for API compatibility, not used)
     * @param feedbackIndex - Feedback index (number or bigint)
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param options - Write options (skipSend, signer)
     */
    appendResponse(agentId: number | bigint, _client: PublicKey, feedbackIndex: number | bigint, responseUri: string, responseHash: Buffer, options?: WriteOptions): Promise<(TransactionResult & {
        responseIndex?: bigint;
    }) | (PreparedTransaction & {
        responseIndex: bigint;
    })>;
    /**
     * Request validation (write operation)
     * @param agentId - Agent ID (number or bigint)
     * @param validator - Validator public key
     * @param nonce - Request nonce (unique per agent-validator pair)
     * @param requestUri - Request URI (IPFS/Arweave)
     * @param requestHash - Request hash (32 bytes)
     * @param options - Write options (skipSend, signer)
     */
    requestValidation(agentId: number | bigint, validator: PublicKey, nonce: number, requestUri: string, requestHash: Buffer, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Respond to validation request (write operation)
     * @param agentId - Agent ID (number or bigint)
     * @param nonce - Request nonce
     * @param response - Response score (0-100)
     * @param responseUri - Response URI (IPFS/Arweave)
     * @param responseHash - Response hash (32 bytes)
     * @param tag - Response tag (max 32 bytes)
     * @param options - Write options (skipSend, signer)
     */
    respondToValidation(agentId: number | bigint, nonce: number, response: number, responseUri: string, responseHash: Buffer, tag?: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Transfer agent ownership (write operation)
     * Aligned with agent0-ts SDK interface
     * @param agentId - Agent ID (number or bigint)
     * @param newOwner - New owner public key
     * @param options - Write options (skipSend, signer)
     */
    transferAgent(agentId: number | bigint, newOwner: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Check if SDK is in read-only mode (no signer configured)
     * Aligned with agent0-ts SDK interface
     */
    get isReadOnly(): boolean;
    /**
     * Get chain ID (for parity with agent0-ts)
     * Returns a string identifier for Solana cluster
     */
    chainId(): Promise<string>;
    /**
     * Get current cluster
     */
    getCluster(): Cluster;
    /**
     * Get program IDs for current cluster
     */
    getProgramIds(): {
        readonly identityRegistry: PublicKey;
        readonly reputationRegistry: PublicKey;
        readonly validationRegistry: PublicKey;
        readonly agentRegistry: PublicKey;
    };
    /**
     * Get registry addresses (for parity with agent0-ts)
     */
    registries(): Record<string, string>;
    /**
     * Get Solana client for advanced usage
     */
    getSolanaClient(): SolanaClient;
    /**
     * Get feedback manager for advanced usage
     */
    getFeedbackManager(): SolanaFeedbackManager;
    /**
     * Check if SDK is using the default public Solana devnet RPC
     * Some operations are not supported on the public RPC
     */
    isUsingDefaultDevnetRpc(): boolean;
    /**
     * Check if SDK supports advanced queries (getProgramAccounts with memcmp)
     * Returns false when using default Solana devnet RPC
     */
    supportsAdvancedQueries(): boolean;
    /**
     * Get the current RPC URL being used
     */
    getRpcUrl(): string;
}
//# sourceMappingURL=sdk-solana.d.ts.map