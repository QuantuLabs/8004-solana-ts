/**
 * Solana SDK for Agent0 - ERC-8004 implementation
 * v0.3.0 - Asset-based identification
 * Provides read and write access to Solana-based agent registries
 *
 * BREAKING CHANGES from v0.2.0:
 * - All methods now use asset (PublicKey) instead of agentId (bigint)
 * - Multi-collection support via RootConfig and RegistryConfig
 */
import { PublicKey, Keypair } from '@solana/web3.js';
import { SolanaClient, Cluster } from './client.js';
import { SolanaFeedbackManager, SolanaFeedback } from './feedback-manager-solana.js';
import type { IPFSClient } from './ipfs-client.js';
import { AgentAccount } from './borsh-schemas.js';
import { TransactionResult, WriteOptions, RegisterAgentOptions, PreparedTransaction } from './transaction-builder.js';
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
    feedbacks: SolanaFeedback[];
}
export interface GetAllAgentsOptions {
    /** Include feedbacks for each agent (2 additional RPC calls). Default: false */
    includeFeedbacks?: boolean;
    /** If includeFeedbacks=true, include revoked feedbacks? Default: false */
    includeRevoked?: boolean;
}
/**
 * Main SDK class for Solana ERC-8004 implementation
 * v0.3.0 - Asset-based identification
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
    private baseCollection?;
    constructor(config?: SolanaSDKConfig);
    /**
     * Initialize the agent mint resolver and base collection (lazy initialization)
     */
    private initializeMintResolver;
    /**
     * Get the current base collection pubkey
     */
    getBaseCollection(): Promise<PublicKey | null>;
    /**
     * Load agent by asset pubkey - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns Agent account data or null if not found
     */
    loadAgent(asset: PublicKey): Promise<AgentAccount | null>;
    /**
     * Get a specific metadata entry for an agent - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param key - Metadata key
     * @returns Metadata value as string, or null if not found
     */
    getMetadata(asset: PublicKey, key: string): Promise<string | null>;
    /**
     * Get agents by owner with on-chain metadata - v0.3.0
     * @param owner - Owner public key
     * @param options - Optional settings for additional data fetching
     * @returns Array of agents with metadata (and optionally feedbacks)
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
     */
    getAgentsByOwner(owner: PublicKey, options?: GetAllAgentsOptions): Promise<AgentWithMetadata[]>;
    /**
     * Get all registered agents with their on-chain metadata - v0.3.0
     * @param options - Optional settings for additional data fetching
     * @returns Array of agents with metadata extensions (and optionally feedbacks)
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
     */
    getAllAgents(options?: GetAllAgentsOptions): Promise<AgentWithMetadata[]>;
    /**
     * Fetch ALL feedbacks for ALL agents in 2 RPC calls - v0.3.0
     * More efficient than calling readAllFeedback() per agent
     * @param includeRevoked - Include revoked feedbacks? Default: false
     * @returns Map of asset (base58) -> SolanaFeedback[]
     * @throws UnsupportedRpcError if using default devnet RPC
     */
    getAllFeedbacks(includeRevoked?: boolean): Promise<Map<string, SolanaFeedback[]>>;
    /**
     * Check if agent exists - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns True if agent exists
     */
    agentExists(asset: PublicKey): Promise<boolean>;
    /**
     * Get agent (alias for loadAgent) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns Agent account data or null if not found
     */
    getAgent(asset: PublicKey): Promise<AgentAccount | null>;
    /**
     * Check if address is agent owner - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param address - Address to check
     * @returns True if address is the owner
     */
    isAgentOwner(asset: PublicKey, address: PublicKey): Promise<boolean>;
    /**
     * Get agent owner - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns Owner public key or null if agent not found
     */
    getAgentOwner(asset: PublicKey): Promise<PublicKey | null>;
    /**
     * Get reputation summary - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns Reputation summary with count and average score
     */
    getReputationSummary(asset: PublicKey): Promise<{
        count: number;
        averageScore: number;
    }>;
    /**
     * 1. Get agent reputation summary - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param minScore - Optional minimum score filter
     * @param clientFilter - Optional client filter
     * @returns Reputation summary with average score and total feedbacks
     */
    getSummary(asset: PublicKey, minScore?: number, clientFilter?: PublicKey): Promise<import("./feedback-manager-solana.js").SolanaAgentSummary>;
    /**
     * 2. Read single feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Feedback object or null
     */
    readFeedback(asset: PublicKey, client: PublicKey, feedbackIndex: number | bigint): Promise<SolanaFeedback | null>;
    /**
     * Get feedback (alias for readFeedback) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param clientAddress - Client public key
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Feedback object or null
     */
    getFeedback(asset: PublicKey, clientAddress: PublicKey, feedbackIndex: number | bigint): Promise<SolanaFeedback | null>;
    /**
     * 3. Read all feedbacks for an agent - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param includeRevoked - Include revoked feedbacks
     * @returns Array of feedback objects
     * @throws UnsupportedRpcError if using default devnet RPC
     */
    readAllFeedback(asset: PublicKey, includeRevoked?: boolean): Promise<SolanaFeedback[]>;
    /**
     * 4. Get last feedback index for a client - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key
     * @returns Last feedback index
     */
    getLastIndex(asset: PublicKey, client: PublicKey): Promise<bigint>;
    /**
     * 5. Get all clients who gave feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns Array of client public keys
     * @throws UnsupportedRpcError if using default devnet RPC
     */
    getClients(asset: PublicKey): Promise<PublicKey[]>;
    /**
     * 6. Get response count for a feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Number of responses
     */
    getResponseCount(asset: PublicKey, feedbackIndex: number | bigint): Promise<number>;
    /**
     * Bonus: Read all responses for a feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Array of response objects
     */
    readResponses(asset: PublicKey, feedbackIndex: number | bigint): Promise<import('./feedback-manager-solana.js').SolanaResponse[]>;
    /**
     * Check if SDK has write permissions
     */
    get canWrite(): boolean;
    /**
     * Register a new agent (write operation) - v0.3.0
     * @param tokenUri - Optional token URI
     * @param metadata - Optional metadata entries (key-value pairs)
     * @param collection - Optional collection pubkey (defaults to base registry)
     * @param options - Write options (skipSend, signer, assetPubkey)
     * @returns Transaction result with asset, or PreparedTransaction if skipSend
     */
    registerAgent(tokenUri?: string, metadata?: Array<{
        key: string;
        value: string;
    }>, collection?: PublicKey, options?: RegisterAgentOptions): Promise<(TransactionResult & {
        asset?: PublicKey;
        signatures?: string[];
    }) | (PreparedTransaction & {
        asset: PublicKey;
    })>;
    /**
     * Set agent URI (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param collection - Collection pubkey for the agent
     * @param newUri - New URI
     * @param options - Write options (skipSend, signer)
     */
    setAgentUri(asset: PublicKey, collection: PublicKey, newUri: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Set agent metadata (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param key - Metadata key
     * @param value - Metadata value
     * @param immutable - If true, metadata cannot be modified or deleted (default: false)
     * @param options - Write options (skipSend, signer)
     */
    setMetadata(asset: PublicKey, key: string, value: string, immutable?: boolean, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Delete a metadata entry for an agent (write operation) - v0.3.0
     * Only works if metadata is not immutable
     * @param asset - Agent Core asset pubkey
     * @param key - Metadata key to delete
     * @param options - Write options (skipSend, signer)
     */
    deleteMetadata(asset: PublicKey, key: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Give feedback to an agent (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackFile - Feedback data object
     * @param options - Write options (skipSend, signer)
     */
    giveFeedback(asset: PublicKey, feedbackFile: {
        score: number;
        tag1?: string;
        tag2?: string;
        endpoint?: string;
        feedbackUri: string;
        feedbackHash: Buffer;
    }, options?: WriteOptions): Promise<(TransactionResult & {
        feedbackIndex?: bigint;
    }) | (PreparedTransaction & {
        feedbackIndex: bigint;
    })>;
    /**
     * Revoke feedback (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index to revoke (number or bigint)
     * @param options - Write options (skipSend, signer)
     */
    revokeFeedback(asset: PublicKey, feedbackIndex: number | bigint, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Append response to feedback (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index (number or bigint)
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param options - Write options (skipSend, signer)
     */
    appendResponse(asset: PublicKey, feedbackIndex: number | bigint, responseUri: string, responseHash: Buffer, options?: WriteOptions): Promise<(TransactionResult & {
        responseIndex?: bigint;
    }) | (PreparedTransaction & {
        responseIndex: bigint;
    })>;
    /**
     * Request validation (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param validator - Validator public key
     * @param nonce - Request nonce (unique per agent-validator pair)
     * @param requestUri - Request URI (IPFS/Arweave)
     * @param requestHash - Request hash (32 bytes)
     * @param options - Write options (skipSend, signer)
     */
    requestValidation(asset: PublicKey, validator: PublicKey, nonce: number, requestUri: string, requestHash: Buffer, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Respond to validation request (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param nonce - Request nonce
     * @param response - Response score (0-100)
     * @param responseUri - Response URI (IPFS/Arweave)
     * @param responseHash - Response hash (32 bytes)
     * @param tag - Response tag (max 32 bytes)
     * @param options - Write options (skipSend, signer)
     */
    respondToValidation(asset: PublicKey, nonce: number, response: number, responseUri: string, responseHash: Buffer, tag?: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Transfer agent ownership (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param collection - Collection pubkey for the agent
     * @param newOwner - New owner public key
     * @param options - Write options (skipSend, signer)
     */
    transferAgent(asset: PublicKey, collection: PublicKey, newOwner: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Check if SDK is in read-only mode (no signer configured)
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