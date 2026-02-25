/**
 * Indexer Client for Supabase PostgREST API
 * Provides fast read access to indexed agent data
 */
/**
 * Configuration for IndexerClient
 */
export interface IndexerClientConfig {
    /** Base URL for Supabase REST API (e.g., https://xxx.supabase.co/rest/v1) */
    baseUrl: string;
    /** Supabase anon key for authentication */
    apiKey: string;
    /** Request timeout in milliseconds (default: 10000) */
    timeout?: number;
    /** Number of retries on failure (default: 2) */
    retries?: number;
}
/**
 * Query options for /agents indexer reads.
 * Supports base registry collection filters and collection pointer filters.
 */
export interface AgentQueryOptions {
    limit?: number;
    offset?: number;
    order?: string;
    owner?: string;
    creator?: string;
    collection?: string;
    collectionPointer?: string;
    wallet?: string;
    parentAsset?: string;
    parentCreator?: string;
    colLocked?: boolean;
    parentLocked?: boolean;
}
/**
 * Query options for canonical collection pointer reads.
 */
export interface CollectionPointerQueryOptions {
    col?: string;
    creator?: string;
    firstSeenAsset?: string;
    limit?: number;
    offset?: number;
}
/**
 * Query options for assets scoped to a collection pointer.
 */
export interface CollectionAssetsQueryOptions {
    creator?: string;
    limit?: number;
    offset?: number;
    order?: string;
}
/**
 * Read-only indexer client contract used by the SDK.
 *
 * The SDK supports multiple backends (REST v1 / GraphQL v2). This interface
 * allows switching implementations without leaking transport details.
 */
export interface IndexerReadClient {
    getBaseUrl(): string;
    isAvailable(): Promise<boolean>;
    getAgent(asset: string): Promise<IndexedAgent | null>;
    getAgents(options?: AgentQueryOptions): Promise<IndexedAgent[]>;
    getAgentsByOwner(owner: string): Promise<IndexedAgent[]>;
    getAgentsByCollection(collection: string): Promise<IndexedAgent[]>;
    getAgentByWallet(wallet: string): Promise<IndexedAgent | null>;
    getLeaderboard(options?: {
        collection?: string;
        minTier?: number;
        limit?: number;
        cursorSortKey?: string;
    }): Promise<IndexedAgent[]>;
    getCollectionPointers?(options?: CollectionPointerQueryOptions): Promise<CollectionPointerRecord[]>;
    getCollectionAssetCount?(col: string, creator?: string): Promise<number>;
    getCollectionAssets?(col: string, options?: CollectionAssetsQueryOptions): Promise<IndexedAgent[]>;
    getCollectionStats?(collection: string): Promise<CollectionStats | null>;
    getAllCollectionStats?(): Promise<CollectionStats[]>;
    getGlobalStats(): Promise<GlobalStats>;
    getFeedbacks(asset: string, options?: {
        includeRevoked?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<IndexedFeedback[]>;
    getFeedback(asset: string, client: string, feedbackIndex: number | bigint): Promise<IndexedFeedback | null>;
    getFeedbacksByClient(client: string): Promise<IndexedFeedback[]>;
    getFeedbacksByTag(tag: string): Promise<IndexedFeedback[]>;
    getFeedbacksByEndpoint(endpoint: string): Promise<IndexedFeedback[]>;
    getAllFeedbacks(options?: {
        includeRevoked?: boolean;
        limit?: number;
    }): Promise<IndexedFeedback[]>;
    getLastFeedbackIndex(asset: string, client: string): Promise<bigint>;
    getFeedbackResponsesFor(asset: string, client: string, feedbackIndex: number | bigint, limit?: number): Promise<IndexedFeedbackResponse[]>;
    getPendingValidations(validator: string): Promise<IndexedValidation[]>;
    getAgentReputation(asset: string): Promise<IndexedAgentReputation | null>;
    getLastFeedbackDigest?(asset: string): Promise<{
        digest: string | null;
        count: number;
    }>;
    getLastResponseDigest?(asset: string): Promise<{
        digest: string | null;
        count: number;
    }>;
    getLastRevokeDigest?(asset: string): Promise<{
        digest: string | null;
        count: number;
    }>;
    getFeedbacksAtIndices?(asset: string, indices: number[]): Promise<Map<number, IndexedFeedback | null>>;
    getResponsesAtOffsets?(asset: string, offsets: number[]): Promise<Map<number, IndexedFeedbackResponse | null>>;
    getRevocationsAtCounts?(asset: string, revokeCounts: number[]): Promise<Map<number, IndexedRevocation | null>>;
    getReplayData?(asset: string, chainType: 'feedback' | 'response' | 'revoke', fromCount?: number, toCount?: number, limit?: number): Promise<ReplayDataPage>;
    getLatestCheckpoints?(asset: string): Promise<CheckpointSet>;
    triggerReplay?(asset: string): Promise<ServerReplayResult>;
}
/**
 * Indexed agent record from `agents` table
 * v2.0 - Includes ATOM stats and sort_key for leaderboard
 */
export interface IndexedAgent {
    asset: string;
    owner: string;
    creator?: string | null;
    agent_uri: string | null;
    agent_wallet: string | null;
    collection: string;
    collection_pointer?: string | null;
    col_locked?: boolean;
    parent_asset?: string | null;
    parent_creator?: string | null;
    parent_locked?: boolean;
    nft_name: string | null;
    atom_enabled?: boolean;
    trust_tier: number;
    quality_score: number;
    confidence: number;
    risk_score: number;
    diversity_ratio: number;
    feedback_count: number;
    raw_avg_score: number;
    sort_key: string;
    block_slot: number;
    tx_signature: string;
    created_at: string;
    updated_at: string;
}
/**
 * Indexed feedback record from `feedbacks` table
 */
export interface IndexedFeedback {
    id: string;
    asset: string;
    client_address: string;
    feedback_index: number | string;
    value: number | string;
    value_decimals: number;
    score: number | null;
    tag1: string | null;
    tag2: string | null;
    endpoint: string | null;
    feedback_uri: string | null;
    running_digest: string | null;
    feedback_hash: string | null;
    is_revoked: boolean;
    revoked_at: string | null;
    block_slot: number;
    tx_signature: string;
    created_at: string;
}
/**
 * Agent reputation from `agent_reputation` view
 */
export interface IndexedAgentReputation {
    asset: string;
    owner: string;
    collection: string;
    nft_name: string | null;
    agent_uri: string | null;
    feedback_count: number;
    avg_score: number | null;
    positive_count: number;
    negative_count: number;
    validation_count: number;
}
/**
 * Indexed metadata from `metadata` table
 */
export interface IndexedMetadata {
    id: string;
    asset: string;
    key: string;
    key_hash: string;
    value: string;
    immutable: boolean;
    block_slot: number;
    tx_signature: string;
    created_at: string;
    updated_at: string;
}
/**
 * Indexed validation from `validations` table
 */
export interface IndexedValidation {
    id: string;
    asset: string;
    validator_address: string;
    nonce: number;
    requester: string | null;
    request_uri: string | null;
    request_hash: string | null;
    response: number | null;
    response_uri: string | null;
    response_hash: string | null;
    tag: string | null;
    status: 'PENDING' | 'RESPONDED';
    block_slot: number;
    tx_signature: string;
    created_at: string;
    updated_at: string;
}
/**
 * Collection statistics from `collection_stats` view
 * v0.6.0: Single-collection architecture - registry_type removed
 */
export interface CollectionStats {
    collection: string;
    registry_type?: string | null;
    authority: string | null;
    agent_count: number;
    total_feedbacks: number;
    avg_score: number | null;
}
/**
 * Canonical collection pointer record from `/collection_pointers`.
 */
export interface CollectionPointerRecord {
    col: string;
    creator: string;
    first_seen_asset: string;
    first_seen_at: string;
    first_seen_slot: string;
    first_seen_tx_signature: string | null;
    last_seen_at: string;
    last_seen_slot: string;
    last_seen_tx_signature: string | null;
    asset_count: string;
}
/**
 * Global statistics from `global_stats` view
 * v2.0 - Includes tier counts
 */
export interface GlobalStats {
    total_agents: number;
    total_collections: number;
    total_feedbacks: number;
    total_validations: number;
    platinum_agents: number;
    gold_agents: number;
    avg_quality: number | null;
}
export interface IndexedFeedbackResponse {
    id: string;
    asset: string;
    client_address: string;
    feedback_index: number | string;
    responder: string;
    response_uri: string | null;
    response_hash: string | null;
    running_digest: string | null;
    response_count?: number | string | null;
    block_slot: number;
    tx_signature: string;
    created_at: string;
}
export interface IndexedRevocation {
    id: string;
    asset: string;
    client_address: string;
    feedback_index: number | string;
    feedback_hash: string | null;
    slot: number;
    original_score: number | null;
    atom_enabled: boolean;
    had_impact: boolean;
    running_digest: string | null;
    revoke_count: number | string;
    tx_signature: string;
    created_at: string;
}
export interface ReplayEventData {
    asset: string;
    client: string;
    feedback_index: string;
    slot: number;
    running_digest: string | null;
    feedback_hash?: string | null;
    responder?: string;
    response_hash?: string | null;
    response_count?: number | null;
    revoke_count?: number | null;
}
export interface ReplayDataPage {
    events: ReplayEventData[];
    hasMore: boolean;
    nextFromCount: number;
}
export interface CheckpointData {
    event_count: number;
    digest: string;
    created_at: string;
}
export interface CheckpointSet {
    feedback: CheckpointData | null;
    response: CheckpointData | null;
    revoke: CheckpointData | null;
}
export interface ServerChainReplayResult {
    chainType: string;
    finalDigest: string;
    count: number;
    valid: boolean;
    mismatchAt?: number;
    checkpointsStored: number;
}
export interface ServerReplayResult {
    agentId: string;
    feedback: ServerChainReplayResult;
    response: ServerChainReplayResult;
    revoke: ServerChainReplayResult;
    valid: boolean;
    duration: number;
}
/**
 * Client for interacting with Supabase indexer
 */
export declare class IndexerClient implements IndexerReadClient {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly timeout;
    private readonly retries;
    constructor(config: IndexerClientConfig);
    getBaseUrl(): string;
    /**
     * Execute HTTP request with retries and error handling
     */
    private request;
    /**
     * Build query string from params using URLSearchParams for safety
     */
    private buildQuery;
    private parseCountValue;
    /**
     * Check if indexer is available
     */
    isAvailable(): Promise<boolean>;
    /**
     * Get count for a resource using Prefer: count=exact header (PostgREST standard)
     * Parses Content-Range header: "0-99/1234" -> 1234
     */
    getCount(resource: string, filters: Record<string, string>): Promise<number>;
    /**
     * Get agent by asset pubkey
     */
    getAgent(asset: string): Promise<IndexedAgent | null>;
    /**
     * Get all agents with pagination
     */
    getAgents(options?: AgentQueryOptions): Promise<IndexedAgent[]>;
    /**
     * Get agents by owner
     */
    getAgentsByOwner(owner: string): Promise<IndexedAgent[]>;
    /**
     * Get agents by collection
     */
    getAgentsByCollection(collection: string): Promise<IndexedAgent[]>;
    /**
     * Get agent by operational wallet
     */
    getAgentByWallet(wallet: string): Promise<IndexedAgent | null>;
    /**
     * Get reputation for a specific agent
     */
    getAgentReputation(asset: string): Promise<IndexedAgentReputation | null>;
    /**
     * Get leaderboard (top agents by sort_key)
     * Uses keyset pagination for efficient queries at scale
     * @param options.collection - Filter by collection
     * @param options.minTier - Minimum trust tier (0-4)
     * @param options.limit - Max results (default 50)
     * @param options.cursorSortKey - Cursor for keyset pagination (get next page)
     */
    getLeaderboard(options?: {
        collection?: string;
        minTier?: number;
        limit?: number;
        cursorSortKey?: string;
    }): Promise<IndexedAgent[]>;
    /**
     * Get leaderboard via RPC function (optimized for large datasets)
     * Uses PostgreSQL get_leaderboard() function
     */
    getLeaderboardRPC(options?: {
        collection?: string;
        minTier?: number;
        limit?: number;
        cursorSortKey?: string;
    }): Promise<IndexedAgent[]>;
    /**
     * Get feedbacks for an agent
     */
    getFeedbacks(asset: string, options?: {
        includeRevoked?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<IndexedFeedback[]>;
    /**
     * Get single feedback by asset, client, and index
     * v0.4.1 - Added to fix audit finding #1 (HIGH): readFeedback must filter by client
     */
    getFeedback(asset: string, client: string, feedbackIndex: number | bigint): Promise<IndexedFeedback | null>;
    /**
     * Get feedbacks by client
     */
    getFeedbacksByClient(client: string): Promise<IndexedFeedback[]>;
    /**
     * Get feedbacks by tag
     */
    getFeedbacksByTag(tag: string): Promise<IndexedFeedback[]>;
    /**
     * Get feedbacks by endpoint
     */
    getFeedbacksByEndpoint(endpoint: string): Promise<IndexedFeedback[]>;
    /**
     * Get ALL feedbacks across all agents (bulk query)
     * Optimized for fetchAllFeedbacks - single query instead of N+1
     * @param options - Query options
     * @returns Array of all feedbacks (grouped by caller)
     */
    getAllFeedbacks(options?: {
        includeRevoked?: boolean;
        limit?: number;
    }): Promise<IndexedFeedback[]>;
    getLastFeedbackIndex(asset: string, client: string): Promise<bigint>;
    /**
     * Get all metadata for an agent
     * Values are automatically decompressed if stored with ZSTD
     */
    getMetadata(asset: string): Promise<IndexedMetadata[]>;
    /**
     * Get specific metadata entry by key
     * Value is automatically decompressed if stored with ZSTD
     */
    getMetadataByKey(asset: string, key: string): Promise<IndexedMetadata | null>;
    /**
     * Decompress metadata values (handles ZSTD compression)
     * @internal
     */
    private decompressMetadataValues;
    /**
     * Get validations for an agent
     */
    getValidations(asset: string): Promise<IndexedValidation[]>;
    /**
     * Get validations by validator
     */
    getValidationsByValidator(validator: string): Promise<IndexedValidation[]>;
    /**
     * Get pending validations for a validator
     */
    getPendingValidations(validator: string): Promise<IndexedValidation[]>;
    /**
     * Get a specific validation by asset, validator, and nonce
     * Returns full validation data including URIs (not available on-chain)
     */
    getValidation(asset: string, validator: string, nonce: number | bigint): Promise<IndexedValidation | null>;
    /**
     * Get canonical collection pointer rows.
     */
    getCollectionPointers(options?: CollectionPointerQueryOptions): Promise<CollectionPointerRecord[]>;
    /**
     * Count assets attached to a collection pointer (optionally scoped by creator).
     */
    getCollectionAssetCount(col: string, creator?: string): Promise<number>;
    /**
     * Get assets by collection pointer (optionally scoped by creator).
     */
    getCollectionAssets(col: string, options?: CollectionAssetsQueryOptions): Promise<IndexedAgent[]>;
    /**
     * Get stats for a specific collection
     */
    getCollectionStats(collection: string): Promise<CollectionStats | null>;
    /**
     * Get stats for all collections
     */
    getAllCollectionStats(): Promise<CollectionStats[]>;
    /**
     * Get global statistics
     */
    getGlobalStats(): Promise<GlobalStats>;
    /**
     * Get paginated agents for a collection with reputation summary
     * Uses the get_collection_agents RPC function
     */
    getCollectionAgents(collection: string, limit?: number, offset?: number): Promise<IndexedAgentReputation[]>;
    /**
     * Get responses for an agent's feedbacks
     */
    getFeedbackResponses(asset: string): Promise<IndexedFeedbackResponse[]>;
    /**
     * Get responses for a specific feedback (asset + client + index)
     * @param asset - Agent asset pubkey (base58)
     * @param client - Client pubkey (base58)
     * @param feedbackIndex - Feedback index
     * @param limit - Max responses to return (default: 100, prevents large payloads)
     */
    getFeedbackResponsesFor(asset: string, client: string, feedbackIndex: number | bigint, limit?: number): Promise<IndexedFeedbackResponse[]>;
    getRevocations(asset: string): Promise<IndexedRevocation[]>;
    getLastFeedbackDigest(asset: string): Promise<{
        digest: string | null;
        count: number;
    }>;
    getLastResponseDigest(asset: string): Promise<{
        digest: string | null;
        count: number;
    }>;
    getLastRevokeDigest(asset: string): Promise<{
        digest: string | null;
        count: number;
    }>;
    /**
     * Get feedbacks at specific indices for spot checking
     * @param asset - Agent asset pubkey
     * @param indices - Array of feedback indices to check
     * @returns Map of index -> feedback (null if missing)
     */
    getFeedbacksAtIndices(asset: string, indices: number[]): Promise<Map<number, IndexedFeedback | null>>;
    /**
     * Get responses count for an asset
     */
    getResponseCount(asset: string): Promise<number>;
    /**
     * Get responses at specific offsets for spot checking
     * @param asset - Agent asset pubkey
     * @param offsets - Array of offsets (0-based) to check
     * @returns Map of offset -> response (null if missing)
     */
    getResponsesAtOffsets(asset: string, offsets: number[]): Promise<Map<number, IndexedFeedbackResponse | null>>;
    /**
     * Get revocations at specific revoke counts for spot checking
     * @param asset - Agent asset pubkey
     * @param revokeCounts - Array of revoke counts (1-based) to check
     * @returns Map of revokeCount -> revocation (null if missing)
     */
    getRevocationsAtCounts(asset: string, revokeCounts: number[]): Promise<Map<number, IndexedRevocation | null>>;
    getReplayData(asset: string, chainType: 'feedback' | 'response' | 'revoke', fromCount?: number, toCount?: number, limit?: number): Promise<ReplayDataPage>;
    getLatestCheckpoints(asset: string): Promise<CheckpointSet>;
    triggerReplay(asset: string): Promise<ServerReplayResult>;
}
//# sourceMappingURL=indexer-client.d.ts.map