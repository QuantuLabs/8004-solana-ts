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
 * Indexed agent record from `agents` table
 * v2.0 - Includes ATOM stats and sort_key for leaderboard
 */
export interface IndexedAgent {
    asset: string;
    owner: string;
    agent_uri: string | null;
    agent_wallet: string | null;
    collection: string;
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
    global_id?: number;
    global_id_formatted?: string;
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
    feedback_index: number;
    score: number;
    tag1: string | null;
    tag2: string | null;
    endpoint: string | null;
    feedback_uri: string | null;
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
 */
export interface CollectionStats {
    collection: string;
    registry_type: 'BASE' | 'USER';
    authority: string | null;
    agent_count: number;
    total_feedbacks: number;
    avg_score: number | null;
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
/**
 * Feedback response from `feedback_responses` table
 * v0.4.1 - Added client_address (audit fix #2)
 */
export interface IndexedFeedbackResponse {
    id: string;
    asset: string;
    client_address: string;
    feedback_index: number;
    responder: string;
    response_uri: string | null;
    response_hash: string | null;
    block_slot: number;
    tx_signature: string;
    created_at: string;
}
/**
 * Client for interacting with Supabase indexer
 */
export declare class IndexerClient {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly timeout;
    private readonly retries;
    constructor(config: IndexerClientConfig);
    /**
     * Execute HTTP request with retries and error handling
     */
    private request;
    /**
     * Build query string from params
     */
    private buildQuery;
    /**
     * Check if indexer is available
     */
    isAvailable(): Promise<boolean>;
    /**
     * Get agent by asset pubkey
     */
    getAgent(asset: string): Promise<IndexedAgent | null>;
    /**
     * Get all agents with pagination
     */
    getAgents(options?: {
        limit?: number;
        offset?: number;
        order?: string;
    }): Promise<IndexedAgent[]>;
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
     */
    getFeedbackResponsesFor(asset: string, client: string, feedbackIndex: number | bigint): Promise<IndexedFeedbackResponse[]>;
}
//# sourceMappingURL=indexer-client.d.ts.map