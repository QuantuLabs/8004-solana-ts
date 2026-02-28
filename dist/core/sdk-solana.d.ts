/**
 * Solana SDK for Agent0 - 8004 implementation
 * v0.4.0 - ATOM Engine integration + Indexer support
 * Provides read and write access to Solana-based agent registries
 *
 * BREAKING CHANGES from v0.3.0:
 * - GiveFeedback/RevokeFeedback now use ATOM Engine for reputation tracking
 * - New ATOM methods: getAtomStats, getTrustTier, getEnrichedSummary
 * - Optional indexer integration for fast queries
 */
import { PublicKey, Keypair } from '@solana/web3.js';
import { SolanaClient, Cluster } from './client.js';
import { SolanaFeedbackManager, SolanaFeedback } from './feedback-manager-solana.js';
import type { IPFSClient } from './ipfs-client.js';
import { type ProgramIdOverrides } from './programs.js';
import { AgentAccount } from './borsh-schemas.js';
import { TransactionResult, WriteOptions, GiveFeedbackOptions, RegisterAgentOptions, PreparedTransaction, UpdateAtomConfigParams } from './transaction-builder.js';
import type { LivenessOptions, LivenessReport } from '../models/liveness.js';
import type { SignOptions, SignedPayloadV1 } from '../models/signatures.js';
import type { CollectionMetadataInput, CollectionMetadataJson } from '../models/collection-metadata.js';
import { AtomStats, AtomConfig, TrustTier } from './atom-schemas.js';
import { IndexerReadClient, IndexedAgent, IndexedFeedback, IndexedAgentReputation, IndexedValidation, GlobalStats, CollectionPointerRecord } from './indexer-client.js';
import type { ReplayResult } from './hash-chain-replay.js';
import type { AgentSearchParams } from './indexer-types.js';
export interface SolanaSDKConfig {
    cluster?: Cluster;
    rpcUrl?: string;
    signer?: Keypair;
    ipfsClient?: IPFSClient;
    /** GraphQL v2 endpoint (default: env INDEXER_GRAPHQL_URL or hardcoded Railway deployment) */
    indexerGraphqlUrl?: string;
    /**
     * @deprecated Legacy Supabase REST API URL (override via INDEXER_URL env)
     * Prefer `indexerGraphqlUrl` (GraphQL v2).
     */
    indexerUrl?: string;
    /**
     * @deprecated Legacy REST auth token (override via INDEXER_API_KEY env)
     * Prefer `indexerGraphqlUrl` (GraphQL v2).
     */
    indexerApiKey?: string;
    /** Use indexer for read operations (default: true) */
    useIndexer?: boolean;
    /** Fallback to on-chain if indexer unavailable (default: true) */
    indexerFallback?: boolean;
    /** Program IDs override (defaults target devnet IDs) */
    programIds?: ProgramIdOverrides;
    /**
     * Force all queries on-chain, bypass indexer (default: false, or FORCE_ON_CHAIN=true env)
     * When true, indexer-only methods (getLeaderboard, etc.) will throw
     */
    forceOnChain?: boolean;
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
 * Enriched summary combining on-chain agent data with ATOM metrics (v0.4.0)
 */
export interface EnrichedSummary {
    asset: PublicKey;
    owner: PublicKey;
    collection: PublicKey;
    totalFeedbacks: number;
    averageScore: number;
    positiveCount: number;
    negativeCount: number;
    trustTier: TrustTier;
    qualityScore: number;
    confidence: number;
    riskScore: number;
    diversityRatio: number;
    uniqueCallers: number;
    emaScoreFast: number;
    emaScoreSlow: number;
    volatility: number;
}
/**
 * Collection information returned by getCollection()
 * Represents on-chain RegistryConfig data in a user-friendly format
 * v0.6.0: Single-collection architecture - registryType removed
 */
export interface CollectionInfo {
    collection: PublicKey;
    authority: PublicKey;
}
export interface SetCollectionPointerOptions extends WriteOptions {
    /**
     * Lock pointer after set (default: true).
     * If false, creator can update later via set_collection_pointer_with_options.
     */
    lock?: boolean;
}
export interface SetParentAssetOptions extends WriteOptions {
    /**
     * Lock parent after set (default: true).
     * If false, owner can update later via set_parent_asset_with_options.
     */
    lock?: boolean;
}
export interface CreateCollectionUploadOptions {
    /** Upload JSON to IPFS using configured ipfsClient (default: true) */
    uploadToIpfs?: boolean;
}
export interface CreateCollectionUploadResult {
    /** JSON document generated from collection input */
    metadata: CollectionMetadataJson;
    /** Raw CID returned by IPFS provider (when uploaded) */
    cid?: string;
    /** Convenience URI form: ipfs://<cid> (when uploaded) */
    uri?: string;
    /** Canonical collection pointer: c1:<normalized_cid_v1_base32> (when uploaded) */
    pointer?: string;
}
/**
 * Normalized validation data for user-friendly access
 * Combines on-chain data with computed properties
 * Note: URIs are only available in events/indexer, not on-chain
 */
export interface NormalizedValidation {
    /** Agent asset pubkey (base58) */
    asset: string;
    /** Validator pubkey (base58) */
    validator: string;
    /** Request nonce */
    nonce: number;
    /** Response score (0-100) - alias for 'response' field */
    score: number;
    /** Raw response value from on-chain (0-100) */
    response: number;
    /** Whether validator has responded (computed from responded_at > 0) */
    responded: boolean;
    /** Timestamp of response (0 if pending) */
    responded_at: bigint;
    /** Request hash (hex string) */
    request_hash: string;
}
/**
 * Hash-chain integrity verification result
 */
/**
 * Status of hash-chain integrity verification
 * - 'valid': All digests match - indexer is fully synced and trustworthy
 * - 'syncing': Indexer is behind on-chain (count mismatch) - not corruption, just lag
 * - 'corrupted': Digest mismatch with matching counts - data integrity issue
 * - 'error': Verification failed (network, missing agent, etc.)
 */
export type IntegrityStatus = 'valid' | 'syncing' | 'corrupted' | 'error';
export interface IntegrityChainResult {
    onChain: string;
    indexer: string | null;
    countOnChain: bigint;
    countIndexer: bigint;
    match: boolean;
    /** How many items indexer is behind (positive = behind, negative = ahead which shouldn't happen) */
    lag: bigint;
}
export interface IntegrityResult {
    /** Overall validity - true only if status is 'valid' */
    valid: boolean;
    /** Detailed status distinguishing sync lag from corruption */
    status: IntegrityStatus;
    asset: string;
    indexerUrl: string;
    chains: {
        feedback: IntegrityChainResult;
        response: IntegrityChainResult;
        revoke: IntegrityChainResult;
    };
    /** Total lag across all chains */
    totalLag: bigint;
    /** Whether indexer can be trusted for reads (valid or syncing with small lag) */
    trustworthy: boolean;
    error?: {
        message: string;
        recommendation: string;
    };
}
/**
 * Options for deep integrity verification
 */
export interface DeepIntegrityOptions {
    /** Number of random spot checks per chain (default: 5) */
    spotChecks?: number;
    /** Verify existence of first and last items (default: true) */
    checkBoundaries?: boolean;
    /**
     * Verify content hashes for spot-checked items (default: false)
     * This detects data modification attacks where indexer returns
     * valid digests but serves modified content (wrong scores, tags, etc.)
     * Requires on-chain comparison so it's slower.
     */
    verifyContent?: boolean;
}
/**
 * Result of a spot check - verifying a specific item exists and is unmodified
 */
export interface SpotCheckResult {
    index: number;
    /** Item exists in indexer */
    exists: boolean;
    /** Running digest is present */
    digestMatch?: boolean;
    /**
     * Content hash verification result (only if verifyContent=true)
     * - true: content hash matches (data unmodified)
     * - false: content hash mismatch (data was modified!)
     * - undefined: verification not performed or not possible
     */
    contentValid?: boolean;
    /** Error during content verification */
    contentError?: string;
}
/**
 * Extended integrity result with spot check details
 */
export interface DeepIntegrityResult extends IntegrityResult {
    /** Spot check results for each chain */
    spotChecks: {
        feedback: SpotCheckResult[];
        response: SpotCheckResult[];
        revoke: SpotCheckResult[];
    };
    /** True if all spot checks passed */
    spotChecksPassed: boolean;
    /** Number of missing items detected via spot checks */
    missingItems: number;
    /** Number of items with modified content (content hash mismatch) */
    modifiedItems: number;
}
/**
 * Options for full hash-chain replay verification
 */
export interface FullVerificationOptions {
    useCheckpoints?: boolean;
    batchSize?: number;
    onProgress?: (chain: string, count: number, total: number) => void;
}
/**
 * Full verification result with replay details
 */
export interface FullVerificationResult extends IntegrityResult {
    replay: {
        feedback: ReplayResult;
        response: ReplayResult;
        revoke: ReplayResult;
    };
    checkpointsUsed: boolean;
    duration: number;
}
/**
 * Options for waitForValidation
 */
export interface WaitForValidationOptions {
    /** Max wait time in milliseconds (default: 30000) */
    timeout?: number;
    /** Wait for response (responded_at > 0) instead of just account creation (default: false) */
    waitForResponse?: boolean;
}
export interface RevokeFeedbackOptions extends WriteOptions {
    /**
     * Verify signer owns the feedback before sending tx (default: true).
     * Set false only when you intentionally skip indexer preflight checks.
     */
    verifyFeedbackClient?: boolean;
    /**
     * Wait briefly for indexer sync when feedback is not visible yet (default: true).
     */
    waitForIndexerSync?: boolean;
}
/**
 * Main SDK class for Solana 8004 implementation
 * v0.4.0 - ATOM Engine + Indexer support
 * Provides read and write access to agent registries on Solana
 */
export declare class SolanaSDK {
    private readonly client;
    private readonly feedbackManager;
    private readonly cluster;
    private readonly programIds;
    private readonly signer?;
    private readonly ipfsClient?;
    private readonly identityTxBuilder;
    private readonly reputationTxBuilder;
    private readonly validationTxBuilder;
    private readonly atomTxBuilder;
    private mintResolver?;
    private baseCollection?;
    private _initPromise?;
    private readonly indexerClient;
    private readonly useIndexer;
    private readonly indexerFallback;
    private readonly forceOnChain;
    constructor(config?: SolanaSDKConfig);
    /**
     * Check if operation is a "small query" that prefers RPC in 'auto' mode
     */
    private isSmallQuery;
    /**
     * Initialize the agent mint resolver and base collection (lazy initialization)
     * Uses promise lock to prevent redundant concurrent network calls
     */
    private initializeMintResolver;
    /**
     * Get the current base registry collection pubkey
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
     * Fetch ALL feedbacks for ALL agents (indexer) - v0.4.0
     * More efficient than calling readAllFeedback() per agent
     * @param includeRevoked - Include revoked feedbacks? Default: false
     * @returns Map of asset (base58) -> SolanaFeedback[]
     *
     * v0.4.0: FeedbackAccount PDAs removed, uses indexer for data access.
     * Requires indexer to be configured.
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
     * Get collection details by base-registry collection pubkey - v0.6.0
     * @param collection - Base registry Metaplex Core collection public key
     * @returns Collection info or null if not registered
     */
    getCollection(collection: PublicKey): Promise<CollectionInfo | null>;
    /**
     * Get all registered collections - v0.6.0
     * Single-collection architecture: typically returns only the base collection
     * @returns Array of all collection infos
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
     */
    getCollections(): Promise<CollectionInfo[]>;
    /**
     * Get all agents in a base-registry collection (on-chain) - v0.4.0
     * Returns full AgentAccount data with metadata extensions.
     *
     * For faster queries, use `getLeaderboard({ collection: 'xxx' })` which uses the indexer.
     *
     * @param collection - Base registry collection public key
     * @param options - Optional settings for additional data fetching
     * @returns Array of agents with metadata (and optionally feedbacks)
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
     */
    getCollectionAgents(collection: PublicKey, options?: GetAllAgentsOptions): Promise<AgentWithMetadata[]>;
    /**
     * Wait for indexer to sync with on-chain events (event-driven architecture)
     *
     * The 8004 protocol uses an event-driven architecture where writes happen instantly on-chain
     * via transaction logs, and the indexer asynchronously processes these events for efficient queries.
     * This helper waits for the indexer to catch up with recent on-chain activity.
     *
     * @param checkFn - Function that returns true when data is synced
     * @param options - Configuration options
     * @returns True if synced within timeout, false otherwise
     *
     * @example
     * // Wait for feedback to appear in indexer after giveFeedback()
     * await sdk.waitForIndexerSync(async () => {
     *   const feedback = await sdk.readFeedback(asset, client, index);
     *   return feedback !== null;
     * });
     */
    waitForIndexerSync(checkFn: () => Promise<boolean>, options?: {
        /** Maximum time to wait in milliseconds (default: 30000) */
        timeout?: number;
        /** Initial retry delay in milliseconds (default: 1000) */
        initialDelay?: number;
        /** Maximum retry delay in milliseconds (default: 5000) */
        maxDelay?: number;
        /** Backoff multiplier (default: 1.5) */
        backoffMultiplier?: number;
    }): Promise<boolean>;
    /**
     * Resolve a specific feedback via indexer-backed reads.
     * Returns null when feedback is not yet indexed.
     */
    private resolveFeedbackFromIndexer;
    /**
     * Resolve SEAL hash for a specific feedback via indexer-backed reads.
     * Returns undefined when feedback/sealHash is not yet indexed.
     */
    private resolveSealHashFromIndexer;
    /**
     * Resolve feedback by SEAL hash when caller does not know feedbackIndex.
     */
    private resolveFeedbackBySealHashFromIndexer;
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
     * Build canonical feedback ID used by indexers.
     * Format: "<asset>:<client>:<feedbackIndex>" (no chain prefix).
     */
    encodeFeedbackId(asset: PublicKey | string, client: PublicKey | string, feedbackIndex: number | bigint): string;
    /**
     * Build canonical response ID used by indexers.
     * Format: "<asset>:<client>:<feedbackIndex>:<responder>:<responseCount|txSig>".
     */
    encodeResponseId(asset: PublicKey | string, client: PublicKey | string, feedbackIndex: number | bigint, responder: PublicKey | string, responseCountOrTxSig: number | bigint | string): string;
    /**
     * Read feedback by indexer feedback id.
     * Accepts sequential numeric backend feedback ids.
     */
    getFeedbackById(feedbackId: string): Promise<IndexedFeedback | null>;
    /**
     * Read responses by indexer feedback id.
     * Accepts sequential numeric backend feedback ids.
     */
    getFeedbackResponsesByFeedbackId(feedbackId: string, limit?: number): Promise<import('./indexer-client.js').IndexedFeedbackResponse[]>;
    /**
     * 3. Read all feedbacks for an agent (indexer) - v0.4.0
     * @param asset - Agent Core asset pubkey
     * @param includeRevoked - Include revoked feedbacks
     * @returns Array of feedback objects
     *
     * v0.4.0: FeedbackAccount PDAs removed, uses indexer for data access.
     * Requires indexer to be configured.
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
     * 5. Get all clients who gave feedback (indexer) - v0.4.0
     * @param asset - Agent Core asset pubkey
     * @returns Array of client public keys
     *
     * v0.4.0: FeedbackAccount PDAs removed, uses indexer for data access.
     * Requires indexer to be configured.
     */
    getClients(asset: PublicKey): Promise<PublicKey[]>;
    /**
     * 6. Get response count for a feedback
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key (who gave the feedback)
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Number of responses
     */
    getResponseCount(asset: PublicKey, client: PublicKey, feedbackIndex: number | bigint): Promise<number>;
    /**
     * Bonus: Read all responses for a feedback
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key (who gave the feedback)
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Array of response objects
     */
    readResponses(asset: PublicKey, client: PublicKey, feedbackIndex: number | bigint): Promise<import('./feedback-manager-solana.js').SolanaResponse[]>;
    /**
     * Get ATOM stats for an agent
     * @param asset - Agent Core asset pubkey
     * @returns AtomStats account data or null if not found
     */
    getAtomStats(asset: PublicKey): Promise<AtomStats | null>;
    /**
     * Initialize ATOM stats for an agent (write operation) - v0.4.0
     * Must be called by the agent owner before any feedback can be given
     * @param asset - Agent Core asset pubkey
     * @param options - Write options (skipSend, signer)
     */
    initializeAtomStats(asset: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Get global ATOM config - v0.4.x
     * @returns AtomConfig or null if not initialized
     */
    getAtomConfig(): Promise<AtomConfig | null>;
    /**
     * Initialize global ATOM config (authority only) - v0.4.x
     * One-time setup by program authority
     * @param agentRegistryProgram - Optional agent registry program ID override
     * @param options - Write options (skipSend, signer)
     */
    initializeAtomConfig(agentRegistryProgram?: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Update global ATOM config parameters (authority only) - v0.4.x
     * @param params - Config parameters to update (only provided fields are changed)
     * @param options - Write options (skipSend, signer)
     */
    updateAtomConfig(params: UpdateAtomConfigParams, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Get trust tier for an agent
     * @param asset - Agent Core asset pubkey
     * @returns TrustTier enum value (0-4)
     */
    getTrustTier(asset: PublicKey): Promise<TrustTier>;
    /**
     * Get enriched summary combining agent data with ATOM metrics
     * @param asset - Agent Core asset pubkey
     * @returns EnrichedSummary with full reputation data
     */
    getEnrichedSummary(asset: PublicKey): Promise<EnrichedSummary | null>;
    /**
     * Helper: Execute with indexer fallback to on-chain
     * Used internally when forceRpc='false' (force indexer mode)
     * @param noFallback - If true, throws instead of falling back to on-chain
     */
    private withIndexerFallback;
    /**
     * Smart routing helper: Chooses between indexer and RPC
     * - forceOnChain=true: All on-chain
     * - forceOnChain=false: Smart routing (RPC for small queries, indexer for large)
     */
    private withSmartRouting;
    /**
     * Check if indexer is available
     */
    isIndexerAvailable(): Promise<boolean>;
    /**
     * Get the indexer client for direct access
     */
    getIndexerClient(): IndexerReadClient;
    /**
     * Helper: Throws if forceOnChain=true for indexer-only methods
     */
    private requireIndexer;
    /**
     * Search agents with filters (indexer only)
     * @param params - Search parameters
     * @returns Array of indexed agents
     */
    searchAgents(params: AgentSearchParams): Promise<IndexedAgent[]>;
    /**
     * Get canonical collection pointer rows from indexer.
     */
    getCollectionPointers(options?: {
        col?: string;
        creator?: string;
        firstSeenAsset?: string;
        limit?: number;
        offset?: number;
    }): Promise<CollectionPointerRecord[]>;
    /**
     * Count assets associated with a collection pointer (and optional creator scope).
     */
    getCollectionAssetCount(col: string, creator?: string): Promise<number>;
    /**
     * Get assets associated with a collection pointer.
     */
    getCollectionAssets(col: string, options?: {
        creator?: string;
        limit?: number;
        offset?: number;
        order?: string;
    }): Promise<IndexedAgent[]>;
    /**
     * Get leaderboard (top agents by sort_key) - indexer only
     * Uses keyset pagination for scale (millions of agents)
     * @param options.collection - Optional collection filter
     * @param options.minTier - Minimum trust tier (0-4)
     * @param options.limit - Number of results (default: 50)
     * @param options.cursorSortKey - Cursor for keyset pagination
     * @returns Array of agents sorted by sort_key DESC
     */
    getLeaderboard(options?: {
        collection?: string;
        minTier?: number;
        limit?: number;
        cursorSortKey?: string;
    }): Promise<IndexedAgent[]>;
    /**
     * Get global statistics - indexer only
     * @returns Global stats (total agents, feedbacks, etc.)
     */
    getGlobalStats(): Promise<GlobalStats>;
    /**
     * Get feedbacks by endpoint - indexer only
     * @param endpoint - Endpoint string (e.g., '/api/chat')
     * @returns Array of feedbacks for this endpoint
     */
    getFeedbacksByEndpoint(endpoint: string): Promise<IndexedFeedback[]>;
    /**
     * Get feedbacks by tag - indexer only
     * @param tag - Tag to search for (in tag1 or tag2)
     * @returns Array of feedbacks with this tag
     */
    getFeedbacksByTag(tag: string): Promise<IndexedFeedback[]>;
    /**
     * Get agent by operational wallet - indexer only
     * @param wallet - Agent wallet pubkey string
     * @returns Indexed agent or null
     */
    getAgentByWallet(wallet: string): Promise<IndexedAgent | null>;
    /**
     * Get agent by backend sequence id (indexer only)
     * @param agentId - REST: sequential `agent_id`; GraphQL: sequential `agentId` / `agentid`
     * @returns Indexed agent or null
     */
    getAgentByAgentId(agentId: string | number | bigint): Promise<IndexedAgent | null>;
    /** @deprecated Use getAgentByAgentId(agentId) */
    getAgentByIndexerId(agentId: string | number | bigint): Promise<IndexedAgent | null>;
    /**
     * Get pending validations for a validator - indexer only
     * @param validator - Validator pubkey string
     * @returns Array of pending validation requests
     */
    getPendingValidations(_validator: string): Promise<IndexedValidation[]>;
    /**
     * Get agent reputation from indexer (with on-chain fallback)
     * @param asset - Agent asset pubkey
     * @param options - Query options
     * @param options.noFallback - If true, throws instead of falling back to on-chain (useful for waitForIndexerSync)
     * @returns Indexed reputation data
     */
    getAgentReputationFromIndexer(asset: PublicKey, options?: {
        noFallback?: boolean;
    }): Promise<IndexedAgentReputation | null>;
    /**
     * Get feedbacks from indexer (with on-chain fallback)
     * @param asset - Agent asset pubkey
     * @param options - Query options
     * @param options.noFallback - If true, throws instead of falling back to on-chain
     * @returns Array of feedbacks (SolanaFeedback format)
     */
    getFeedbacksFromIndexer(asset: PublicKey, options?: {
        includeRevoked?: boolean;
        limit?: number;
        offset?: number;
        noFallback?: boolean;
    }): Promise<SolanaFeedback[]>;
    /**
     * Check if SDK has write permissions
     */
    get canWrite(): boolean;
    /**
     * Build a collection metadata document that conforms to SDK collection schema.
     * Useful when you want to inspect/edit JSON before upload.
     */
    createCollectionData(input: CollectionMetadataInput): CollectionMetadataJson;
    /**
     * Build + upload collection metadata JSON to IPFS and return CID/URI/pointer.
     * This is the standard off-chain flow before asset creation.
     *
     * @example
     * ```typescript
     * const { cid, uri } = await sdk.createCollection({
     *   name: 'Caster Agents',
     *   description: 'Main collection'
     * });
     * // use `uri`/`cid` during asset creation flow
     * ```
     */
    createCollection(data: CollectionMetadataInput, options?: CreateCollectionUploadOptions): Promise<CreateCollectionUploadResult>;
    /**
     * Legacy on-chain user collection API (removed in protocol v0.6.0).
     * Kept for backward compatibility only.
     */
    createCollection(name: string, uri: string, options?: WriteOptions & {
        collectionPubkey?: PublicKey;
    }): Promise<TransactionResult & {
        collection?: PublicKey;
    }>;
    /**
     * Update collection URI (write operation) - v0.4.2
     * Update metadata URI for a user-owned collection.
     * Only the collection owner can update. Collection name is immutable.
     *
     * @param collection - Base registry collection pubkey to update
     * @param newUri - New collection URI (max 250 bytes)
     * @param options - Write options (skipSend, signer)
     * @returns Transaction result, or PreparedTransaction if skipSend
     *
     * @example
     * ```typescript
     * // Update collection URI
     * await sdk.updateCollectionUri(
     *   collectionPubkey,
     *   'ipfs://QmNewMetadata...'
     * );
     * ```
     */
    updateCollectionUri(collection: PublicKey, newUri: string, options?: WriteOptions): Promise<TransactionResult>;
    /**
     * Register a new agent (write operation) - v0.3.0
     *
     * @param tokenUri - Token URI pointing to agent metadata JSON (IPFS, Arweave, or HTTP)
     * @param collection - Optional base registry collection pubkey override (defaults to root-config base collection)
     * @param options - Optional settings for server mode:
     *   - `skipSend`: Return unsigned transaction instead of sending (for frontend signing)
     *   - `signer`: PublicKey of the signer (required with skipSend)
     *   - `assetPubkey`: Asset keypair pubkey (required with skipSend, client generates locally)
     *   - `atomEnabled`: Set to true to enable ATOM at creation (default false)
     *     (use enableAtom() to turn it on later, one-way/irreversible)
     *   - `collectionPointer`: Optional pointer (c1:<payload>) to attach after successful register
     *   - `collectionLock`: Optional lock flag for collectionPointer attach (default: true)
     *     Note: when `skipSend=true`, only the register tx is prepared, so pointer attach is skipped.
     * @returns Transaction result with asset, or PreparedTransaction if skipSend
     *
     * @example
     * // Simple usage
     * const result = await sdk.registerAgent('ipfs://QmMetadata...');
     *
     * @example
     * // With explicit base registry override (legacy)
     * const result = await sdk.registerAgent('ipfs://QmMetadata...', myBaseRegistryCollection);
     */
    registerAgent(tokenUri?: string, collection?: PublicKey, options?: RegisterAgentOptions): Promise<(TransactionResult & {
        asset?: PublicKey;
        signatures?: string[];
    }) | (PreparedTransaction & {
        asset: PublicKey;
    })>;
    /**
     * Set agent URI (write operation) - v0.3.0
     * Overload 1 (recommended): base collection is resolved automatically.
     */
    setAgentUri(asset: PublicKey, newUri: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Set agent URI (write operation) - v0.3.0
     * Overload 2 (legacy): pass base registry collection pubkey explicitly.
     */
    setAgentUri(asset: PublicKey, collection: PublicKey, newUri: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Set collection pointer (write operation)
     * @param asset - Agent Core asset pubkey
     * @param col - Canonical collection pointer (c1:<payload>)
     * @param options - Write options (skipSend, signer, lock)
     */
    setCollectionPointer(asset: PublicKey, col: string, options?: SetCollectionPointerOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Set parent asset (write operation)
     * @param asset - Child agent Core asset pubkey
     * @param parentAsset - Parent Core asset pubkey
     * @param options - Write options (skipSend, signer, lock)
     */
    setParentAsset(asset: PublicKey, parentAsset: PublicKey, options?: SetParentAssetOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Enable ATOM for an agent (one-way) - v0.4.4
     * @param asset - Agent Core asset pubkey
     * @param options - Write options (skipSend, signer)
     */
    enableAtom(asset: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Prepare message for setAgentWallet (for web3 wallets like Phantom, Solflare)
     * @example
     * const prepared = await sdk.prepareSetAgentWallet(asset, walletPubkey);
     * const signature = await wallet.signMessage(prepared.message);
     * await prepared.complete(signature);
     */
    prepareSetAgentWallet(asset: PublicKey, newWallet: PublicKey, options?: WriteOptions): Promise<{
        message: Uint8Array;
        complete: (signature: Uint8Array) => Promise<TransactionResult | PreparedTransaction>;
    }>;
    /** Set agent wallet - simple version with Keypair (auto-signs) */
    setAgentWallet(asset: PublicKey, keypair: Keypair, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /** Set agent wallet - advanced version with pre-signed signature */
    setAgentWallet(asset: PublicKey, wallet: PublicKey, signature: Uint8Array, deadline: bigint, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Set agent metadata (write operation)
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
     * Give feedback to an agent (write operation) - v0.5.0
     * @param asset - Agent Core asset pubkey
     * @param params - Feedback parameters (value, valueDecimals, score, tags, etc.)
     * @param options - Write options (skipSend, signer)
     */
    giveFeedback(asset: PublicKey, params: import('../models/interfaces.js').GiveFeedbackParams, options?: GiveFeedbackOptions): Promise<(TransactionResult & {
        feedbackIndex?: bigint;
    }) | (PreparedTransaction & {
        feedbackIndex: bigint;
    })>;
    /**
     * Revoke feedback (write operation)
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index to revoke (number or bigint)
     * @param sealHash - Optional SEAL hash from original feedback.
     * If omitted, SDK attempts to auto-resolve from indexed feedback by using signer as feedback client.
     * Legacy fallback remains supported (all-zero hash) when auto-resolution is unavailable.
     * @param options - Write options (skipSend, signer)
     */
    revokeFeedback(asset: PublicKey, feedbackIndex: number | bigint, sealHash?: Buffer, options?: RevokeFeedbackOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Append response to feedback (write operation)
     * @param asset - Agent Core asset pubkey
     * @param client - Client address who gave the feedback
     * @param feedbackIndex - Feedback index (number or bigint)
     * @param sealHash - Optional SEAL hash from the original feedback.
     * If omitted, SDK attempts auto-resolution from indexer.
     * @param responseUri - Response URI
     * @param responseHash - Response hash (optional for ipfs://)
     * @param options - Write options (skipSend, signer)
     */
    appendResponse(asset: PublicKey, client: PublicKey, feedbackIndex: number | bigint, sealHash: Buffer, responseUri: string, responseHash?: Buffer, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    appendResponse(asset: PublicKey, client: PublicKey, feedbackIndex: number | bigint, responseUri: string, responseHash?: Buffer, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Append response using sealHash only (feedbackIndex auto-resolved from indexer).
     * Useful when caller stores sealHash but not feedbackIndex.
     */
    appendResponseBySealHash(asset: PublicKey, client: PublicKey, sealHash: Buffer, responseUri: string, responseHash?: Buffer, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Request validation (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param validator - Validator public key
     * @param requestUri - Request URI (IPFS/Arweave)
     * @param options - Write options (skipSend, signer, nonce, requestHash)
     *   - nonce: Auto-generated if not provided (timestamp-based)
     *   - requestHash: Optional, defaults to zeros (acceptable for IPFS URIs)
     */
    requestValidation(asset: PublicKey, validator: PublicKey, requestUri: string, options?: WriteOptions & {
        nonce?: number;
        requestHash?: Buffer;
    }): Promise<(TransactionResult & {
        nonce?: bigint;
    }) | PreparedTransaction>;
    /**
     * Respond to validation request (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param nonce - Request nonce (from requestValidation result)
     * @param score - Response score (0-100)
     * @param responseUri - Response URI (IPFS/Arweave)
     * @param options - Write options (skipSend, signer, responseHash, tag)
     *   - responseHash: Optional, defaults to zeros (acceptable for IPFS URIs)
     *   - tag: Optional response tag (max 32 bytes)
     */
    respondToValidation(asset: PublicKey, nonce: number | bigint, score: number, responseUri: string, options?: WriteOptions & {
        responseHash?: Buffer;
        tag?: string;
    }): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Read validation request (read operation) - v0.4.2
     * Reads ValidationRequest directly from on-chain (no indexer required)
     * Returns normalized data with user-friendly properties
     * @param asset - Agent Core asset pubkey
     * @param validator - Validator public key
     * @param nonce - Request nonce (number or bigint)
     * @returns NormalizedValidation or null if not found
     */
    readValidation(asset: PublicKey, validator: PublicKey, nonce: number | bigint): Promise<NormalizedValidation | null>;
    /**
     * Wait for validation request to be available on-chain (with retry)
     * Useful for handling blockchain finalization delays
     * @param asset - Agent Core asset pubkey
     * @param validator - Validator public key
     * @param nonce - Request nonce (number or bigint)
     * @param options - Wait options (timeout, waitForResponse)
     * @returns NormalizedValidation or null if timeout
     */
    waitForValidation(asset: PublicKey, validator: PublicKey, nonce: number | bigint, options?: WaitForValidationOptions): Promise<NormalizedValidation | null>;
    /**
     * Transfer agent ownership (write operation) - v0.3.0
     * Overload 1 (recommended): base collection is resolved automatically.
     */
    transferAgent(asset: PublicKey, newOwner: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Transfer agent ownership (write operation) - v0.3.0
     * Overload 2 (legacy): pass base registry collection pubkey explicitly.
     */
    transferAgent(asset: PublicKey, collection: PublicKey, newOwner: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Sync agent owner after external NFT transfer (write operation)
     * Call this after the Core NFT was transferred outside of the SDK
     * to update the AgentAccount's owner field
     * @param asset - Agent Core asset pubkey
     * @param options - Write options (skipSend, signer)
     */
    syncOwner(asset: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Check endpoint liveness for an agent
     */
    isItAlive(asset: PublicKey, options?: LivenessOptions): Promise<LivenessReport>;
    /**
     * Sign arbitrary structured data using canonical JSON (RFC 8785)
     */
    sign(asset: PublicKey, data: unknown, options?: SignOptions): string;
    /**
     * Verify a signed payload against an agent wallet or provided public key
     *
     * NOTE: If publicKey is not provided, this method makes a network call to
     * fetch the agent's wallet from on-chain data. For offline verification,
     * always provide the publicKey parameter.
     *
     * @param payloadOrUri - Signed payload or URI to fetch it from
     * @param asset - Agent Core asset pubkey
     * @param publicKey - Optional: verifier public key (avoids network call if provided)
     * @param options - Optional settings (allowFileRead: enable loading from file paths, disabled by default)
     * @returns True if signature is valid
     * @throws RpcNetworkError if publicKey not provided and network call fails
     */
    verify(payloadOrUri: string | SignedPayloadV1, asset: PublicKey, publicKey?: PublicKey, options?: {
        allowFileRead?: boolean;
    }): Promise<boolean>;
    private resolveSignedPayloadInput;
    private fetchJsonFromUri;
    private normalizeRegistrationServices;
    private pingEndpoint;
    private pingHttpEndpoint;
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
    getProgramIds(): import("./programs.js").ProgramIdSet;
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
    /**
     * Compute SHA-256 hash from data (string or Buffer)
     * Use this for feedback, validation, and response hashes
     * Browser-compatible (async for WebCrypto support)
     * @param data - String or Buffer to hash
     * @returns 32-byte SHA-256 hash as Buffer
     *
     * @example
     * const feedbackHash = await SolanaSDK.computeHash('My feedback content');
     * const dataHash = await SolanaSDK.computeHash(Buffer.from(jsonData));
     */
    static computeHash(data: string | Buffer): Promise<Buffer>;
    /**
     * Verify indexer integrity against on-chain hash-chain digests (O(1) verification)
     * Distinguishes between sync lag (indexer behind) and corruption (digest mismatch)
     *
     * @param asset - Agent Core asset pubkey
     * @returns IntegrityResult with detailed status and recommendations
     *
     * Status meanings:
     * - 'valid': All digests match, indexer fully synced
     * - 'syncing': Indexer is behind (count < on-chain) - safe to use with caution
     * - 'corrupted': Digest mismatch with same counts - do not trust
     * - 'error': Verification failed
     */
    verifyIntegrity(asset: PublicKey): Promise<IntegrityResult>;
    /**
     * Deep integrity verification with random spot checks
     * Detects if indexer has correct digest but deleted data from DB
     *
     * @param asset - Agent Core asset pubkey
     * @param options - Verification options (spot check count, boundary checks)
     * @returns DeepIntegrityResult with spot check details
     *
     * Use cases:
     * - Detect malicious indexer that stores digests but deletes data
     * - Verify data completeness beyond digest matching
     * - Multi-tier verification for high-value operations
     */
    verifyIntegrityDeep(asset: PublicKey, options?: DeepIntegrityOptions): Promise<DeepIntegrityResult>;
    /**
     * Full hash-chain replay verification
     * Replays all events and recomputes digests from scratch (or from checkpoint).
     * Detects any event censorship, reordering, or modification by the indexer.
     *
     * @param asset - Agent Core asset pubkey
     * @param options - Verification options
     * @returns FullVerificationResult with per-chain replay details
     */
    verifyIntegrityFull(asset: PublicKey, options?: FullVerificationOptions): Promise<FullVerificationResult>;
    /**
     * Compute hash for a URI
     * - IPFS/Arweave URIs: zeros (CID already contains content hash)
     * - Other URIs: SHA-256 of the URI string
     * Browser-compatible (async for WebCrypto support)
     * @param uri - URI to hash
     * @returns 32-byte hash as Buffer
     *
     * @example
     * const hash = await SolanaSDK.computeUriHash('https://example.com/data.json');
     * // For IPFS, returns zeros since CID is already a hash
     * const ipfsHash = await SolanaSDK.computeUriHash('ipfs://Qm...');
     */
    static computeUriHash(uri: string): Promise<Buffer>;
    private computeUriHash;
}
//# sourceMappingURL=sdk-solana.d.ts.map