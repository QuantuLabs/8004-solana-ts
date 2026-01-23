/**
 * Indexer Client for Supabase PostgREST API
 * Provides fast read access to indexed agent data
 */
import { IndexerError, IndexerErrorCode, IndexerUnavailableError, IndexerTimeoutError, IndexerRateLimitError, IndexerUnauthorizedError, } from './indexer-errors.js';
import { decompressBase64Value } from '../utils/compression.js';
// ============================================================================
// IndexerClient Implementation
// ============================================================================
/**
 * Client for interacting with Supabase indexer
 */
export class IndexerClient {
    baseUrl;
    apiKey;
    timeout;
    retries;
    constructor(config) {
        // Remove trailing slash from baseUrl
        this.baseUrl = config.baseUrl.replace(/\/$/, '');
        this.apiKey = config.apiKey;
        this.timeout = config.timeout || 10000;
        this.retries = config.retries ?? 2;
    }
    // ============================================================================
    // HTTP Helpers
    // ============================================================================
    /**
     * Execute HTTP request with retries and error handling
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            apikey: this.apiKey,
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            ...options.headers,
        };
        let lastError = null;
        for (let attempt = 0; attempt <= this.retries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);
                const response = await fetch(url, {
                    ...options,
                    headers,
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                // Handle HTTP errors
                if (!response.ok) {
                    if (response.status === 401) {
                        throw new IndexerUnauthorizedError();
                    }
                    if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After');
                        throw new IndexerRateLimitError('Rate limited', retryAfter ? parseInt(retryAfter, 10) : undefined);
                    }
                    if (response.status >= 500) {
                        throw new IndexerError(`Server error: ${response.status}`, IndexerErrorCode.SERVER_ERROR);
                    }
                    throw new IndexerError(`HTTP ${response.status}: ${response.statusText}`, IndexerErrorCode.INVALID_RESPONSE);
                }
                return (await response.json());
            }
            catch (error) {
                lastError = error;
                if (error instanceof IndexerError) {
                    // Don't retry on client errors
                    if (error.code === IndexerErrorCode.UNAUTHORIZED ||
                        error.code === IndexerErrorCode.RATE_LIMITED) {
                        throw error;
                    }
                }
                // Check for abort (timeout)
                if (error instanceof Error && error.name === 'AbortError') {
                    lastError = new IndexerTimeoutError();
                }
                // Check for network errors
                if (error instanceof TypeError && error.message.includes('fetch')) {
                    lastError = new IndexerUnavailableError(error.message);
                }
                // Wait before retry (exponential backoff)
                if (attempt < this.retries) {
                    await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
                }
            }
        }
        throw lastError || new IndexerUnavailableError();
    }
    /**
     * Build query string from params
     */
    buildQuery(params) {
        const filtered = Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
        return filtered.length > 0 ? `?${filtered.join('&')}` : '';
    }
    // ============================================================================
    // Health Check
    // ============================================================================
    /**
     * Check if indexer is available
     */
    async isAvailable() {
        try {
            await this.request('/agents?limit=1');
            return true;
        }
        catch {
            return false;
        }
    }
    // ============================================================================
    // Agents
    // ============================================================================
    /**
     * Get agent by asset pubkey
     */
    async getAgent(asset) {
        const query = this.buildQuery({ asset: `eq.${asset}` });
        const result = await this.request(`/agents${query}`);
        return result.length > 0 ? result[0] : null;
    }
    /**
     * Get all agents with pagination
     */
    async getAgents(options) {
        const query = this.buildQuery({
            limit: options?.limit,
            offset: options?.offset,
            order: options?.order || 'created_at.desc',
        });
        return this.request(`/agents${query}`);
    }
    /**
     * Get agents by owner
     */
    async getAgentsByOwner(owner) {
        const query = this.buildQuery({ owner: `eq.${owner}` });
        return this.request(`/agents${query}`);
    }
    /**
     * Get agents by collection
     */
    async getAgentsByCollection(collection) {
        const query = this.buildQuery({ collection: `eq.${collection}` });
        return this.request(`/agents${query}`);
    }
    /**
     * Get agent by operational wallet
     */
    async getAgentByWallet(wallet) {
        const query = this.buildQuery({ agent_wallet: `eq.${wallet}` });
        const result = await this.request(`/agents${query}`);
        return result.length > 0 ? result[0] : null;
    }
    // ============================================================================
    // Reputation (agent_reputation view)
    // ============================================================================
    /**
     * Get reputation for a specific agent
     */
    async getAgentReputation(asset) {
        const query = this.buildQuery({ asset: `eq.${asset}` });
        const result = await this.request(`/agent_reputation${query}`);
        return result.length > 0 ? result[0] : null;
    }
    /**
     * Get leaderboard (top agents by sort_key)
     * Uses keyset pagination for efficient queries at scale
     * @param options.collection - Filter by collection
     * @param options.minTier - Minimum trust tier (0-4)
     * @param options.limit - Max results (default 50)
     * @param options.cursorSortKey - Cursor for keyset pagination (get next page)
     */
    async getLeaderboard(options) {
        const params = {
            order: 'sort_key.desc',
            limit: options?.limit || 50,
        };
        if (options?.collection) {
            params.collection = `eq.${options.collection}`;
        }
        if (options?.minTier !== undefined) {
            params.trust_tier = `gte.${options.minTier}`;
        }
        // Keyset pagination: get agents with sort_key < cursor
        if (options?.cursorSortKey) {
            params.sort_key = `lt.${options.cursorSortKey}`;
        }
        const query = this.buildQuery(params);
        return this.request(`/agents${query}`);
    }
    /**
     * Get leaderboard via RPC function (optimized for large datasets)
     * Uses PostgreSQL get_leaderboard() function
     */
    async getLeaderboardRPC(options) {
        const body = {
            p_collection: options?.collection || null,
            p_min_tier: options?.minTier ?? 0,
            p_limit: options?.limit || 50,
            p_cursor_sort_key: options?.cursorSortKey ? BigInt(options.cursorSortKey) : null,
        };
        return this.request('/rpc/get_leaderboard', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }
    // ============================================================================
    // Feedbacks
    // ============================================================================
    /**
     * Get feedbacks for an agent
     */
    async getFeedbacks(asset, options) {
        const params = {
            asset: `eq.${asset}`,
            order: 'created_at.desc',
            limit: options?.limit,
            offset: options?.offset,
        };
        if (!options?.includeRevoked) {
            params.is_revoked = 'eq.false';
        }
        const query = this.buildQuery(params);
        return this.request(`/feedbacks${query}`);
    }
    /**
     * Get single feedback by asset, client, and index
     * v0.4.1 - Added to fix audit finding #1 (HIGH): readFeedback must filter by client
     */
    async getFeedback(asset, client, feedbackIndex) {
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            client_address: `eq.${client}`,
            feedback_index: `eq.${feedbackIndex.toString()}`,
            limit: 1,
        });
        const results = await this.request(`/feedbacks${query}`);
        return results.length > 0 ? results[0] : null;
    }
    /**
     * Get feedbacks by client
     */
    async getFeedbacksByClient(client) {
        const query = this.buildQuery({
            client_address: `eq.${client}`,
            order: 'created_at.desc',
        });
        return this.request(`/feedbacks${query}`);
    }
    /**
     * Get feedbacks by tag
     */
    async getFeedbacksByTag(tag) {
        // Search in both tag1 and tag2
        const query = `?or=(tag1.eq.${encodeURIComponent(tag)},tag2.eq.${encodeURIComponent(tag)})&order=created_at.desc`;
        return this.request(`/feedbacks${query}`);
    }
    /**
     * Get feedbacks by endpoint
     */
    async getFeedbacksByEndpoint(endpoint) {
        const query = this.buildQuery({
            endpoint: `eq.${endpoint}`,
            order: 'created_at.desc',
        });
        return this.request(`/feedbacks${query}`);
    }
    async getLastFeedbackIndex(asset, client) {
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            client_address: `eq.${client}`,
            select: 'feedback_index',
            order: 'feedback_index.desc',
            limit: 1,
        });
        const results = await this.request(`/feedbacks${query}`);
        if (results.length === 0)
            return -1n;
        // Handle BIGINT returned as string from Supabase - use BigInt for precision
        const rawIndex = results[0].feedback_index;
        return typeof rawIndex === 'string' ? BigInt(rawIndex) : BigInt(rawIndex);
    }
    // ============================================================================
    // Metadata
    // ============================================================================
    /**
     * Get all metadata for an agent
     * Values are automatically decompressed if stored with ZSTD
     */
    async getMetadata(asset) {
        const query = this.buildQuery({ asset: `eq.${asset}` });
        const result = await this.request(`/metadata${query}`);
        return this.decompressMetadataValues(result);
    }
    /**
     * Get specific metadata entry by key
     * Value is automatically decompressed if stored with ZSTD
     */
    async getMetadataByKey(asset, key) {
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            key: `eq.${key}`,
        });
        const result = await this.request(`/metadata${query}`);
        if (result.length === 0)
            return null;
        const decompressed = await this.decompressMetadataValues(result);
        return decompressed[0];
    }
    /**
     * Decompress metadata values (handles ZSTD compression)
     * @internal
     */
    async decompressMetadataValues(metadata) {
        return Promise.all(metadata.map(async (m) => {
            try {
                // Value comes as base64 from Supabase PostgREST (BYTEA encoding)
                // or as plain string from local API
                const decompressedValue = m.value
                    ? await decompressBase64Value(m.value)
                    : '';
                return { ...m, value: decompressedValue };
            }
            catch {
                // If decompression fails, return original value
                // (might be legacy uncompressed data or already decoded)
                return m;
            }
        }));
    }
    // ============================================================================
    // Validations
    // ============================================================================
    /**
     * Get validations for an agent
     */
    async getValidations(asset) {
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            order: 'created_at.desc',
        });
        return this.request(`/validations${query}`);
    }
    /**
     * Get validations by validator
     */
    async getValidationsByValidator(validator) {
        const query = this.buildQuery({
            validator_address: `eq.${validator}`,
            order: 'created_at.desc',
        });
        return this.request(`/validations${query}`);
    }
    /**
     * Get pending validations for a validator
     */
    async getPendingValidations(validator) {
        const query = this.buildQuery({
            validator_address: `eq.${validator}`,
            status: 'eq.PENDING',
            order: 'created_at.desc',
        });
        return this.request(`/validations${query}`);
    }
    /**
     * Get a specific validation by asset, validator, and nonce
     * Returns full validation data including URIs (not available on-chain)
     */
    async getValidation(asset, validator, nonce) {
        const nonceNum = typeof nonce === 'bigint' ? Number(nonce) : nonce;
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            validator: `eq.${validator}`,
            nonce: `eq.${nonceNum}`,
        });
        const result = await this.request(`/validations${query}`);
        return result.length > 0 ? result[0] : null;
    }
    // ============================================================================
    // Stats (Views)
    // ============================================================================
    /**
     * Get stats for a specific collection
     */
    async getCollectionStats(collection) {
        const query = this.buildQuery({ collection: `eq.${collection}` });
        const result = await this.request(`/collection_stats${query}`);
        return result.length > 0 ? result[0] : null;
    }
    /**
     * Get stats for all collections
     */
    async getAllCollectionStats() {
        return this.request('/collection_stats?order=agent_count.desc');
    }
    /**
     * Get global statistics
     */
    async getGlobalStats() {
        const result = await this.request('/global_stats');
        return (result[0] || {
            total_agents: 0,
            total_collections: 0,
            total_feedbacks: 0,
            total_validations: 0,
            avg_score: null,
        });
    }
    // ============================================================================
    // RPC Functions
    // ============================================================================
    /**
     * Get paginated agents for a collection with reputation summary
     * Uses the get_collection_agents RPC function
     */
    async getCollectionAgents(collection, limit = 20, offset = 0) {
        const query = this.buildQuery({
            collection_id: collection,
            page_limit: limit,
            page_offset: offset,
        });
        return this.request(`/rpc/get_collection_agents${query}`);
    }
    // ============================================================================
    // Feedback Responses
    // ============================================================================
    /**
     * Get responses for an agent's feedbacks
     */
    async getFeedbackResponses(asset) {
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            order: 'created_at.desc',
        });
        return this.request(`/feedback_responses${query}`);
    }
    /**
     * Get responses for a specific feedback (asset + client + index)
     */
    async getFeedbackResponsesFor(asset, client, feedbackIndex) {
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            client_address: `eq.${client}`,
            feedback_index: `eq.${feedbackIndex.toString()}`,
            order: 'created_at.asc',
        });
        return this.request(`/feedback_responses${query}`);
    }
}
// Modified:
// - IndexedFeedbackResponse: Added client_address field
// - Added getFeedback method to query by asset, client, and feedbackIndex
// - Added getFeedbackResponsesFor method to query responses for specific feedback
//# sourceMappingURL=indexer-client.js.map