/**
 * Indexer Client for Supabase PostgREST API
 * Provides fast read access to indexed agent data
 */
import { IndexerError, IndexerErrorCode, IndexerUnavailableError, IndexerTimeoutError, IndexerRateLimitError, IndexerUnauthorizedError, } from './indexer-errors.js';
import { decompressBase64Value } from '../utils/compression.js';
import { validateNonce } from '../utils/validation.js';
export function encodeCanonicalFeedbackId(asset, client, index) {
    return `${asset}:${client}:${index.toString()}`;
}
export function decodeCanonicalFeedbackId(id) {
    const parts = id.split(':');
    if (parts.length === 3) {
        const [asset, client, index] = parts;
        if (asset === 'sol')
            return null;
        if (!asset || !client || !index)
            return null;
        return { asset, client, index };
    }
    if (parts.length === 4 && parts[0] === 'sol') {
        const [, asset, client, index] = parts;
        if (!asset || !client || !index)
            return null;
        return { asset, client, index };
    }
    return null;
}
export function encodeCanonicalResponseId(asset, client, index, responder, sequenceOrSig) {
    return `${asset}:${client}:${index.toString()}:${responder}:${sequenceOrSig.toString()}`;
}
export function decodeCanonicalResponseId(id) {
    const parts = id.split(':');
    if (parts.length === 5) {
        const [asset, client, index, responder, sequenceOrSig] = parts;
        if (asset === 'sol')
            return null;
        if (!asset || !client || !index || !responder)
            return null;
        return { asset, client, index, responder, sequenceOrSig: sequenceOrSig ?? '' };
    }
    if (parts.length === 6 && parts[0] === 'sol') {
        const [, asset, client, index, responder, sequenceOrSig] = parts;
        if (!asset || !client || !index || !responder)
            return null;
        return { asset, client, index, responder, sequenceOrSig: sequenceOrSig ?? '' };
    }
    return null;
}
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
    getBaseUrl() {
        return this.baseUrl;
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
                    redirect: 'error',
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
                    // Don't retry on client errors (4xx)
                    if (error.code === IndexerErrorCode.UNAUTHORIZED ||
                        error.code === IndexerErrorCode.RATE_LIMITED ||
                        error.code === IndexerErrorCode.INVALID_RESPONSE) {
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
     * Build query string from params using URLSearchParams for safety
     */
    buildQuery(params) {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) {
                searchParams.append(key, String(value));
            }
        }
        const queryString = searchParams.toString();
        return queryString ? `?${queryString}` : '';
    }
    parseCountValue(value, fallback) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Math.max(0, Math.trunc(value));
        }
        if (typeof value === 'string' && /^-?\d+$/.test(value)) {
            try {
                const n = BigInt(value);
                if (n < 0n)
                    return 0;
                if (n > BigInt(Number.MAX_SAFE_INTEGER))
                    return Number.MAX_SAFE_INTEGER;
                return Number(n);
            }
            catch {
                return fallback;
            }
        }
        return fallback;
    }
    shouldUseLegacyCollectionRead(error) {
        return (error instanceof IndexerError
            && error.code === IndexerErrorCode.INVALID_RESPONSE
            && /HTTP 400|HTTP 404/.test(error.message));
    }
    normalizeCollectionRecord(row) {
        const collection = typeof row?.collection === 'string' ? row.collection : row?.col;
        const col = typeof row?.col === 'string' ? row.col : collection;
        return {
            collection: collection ?? col ?? '',
            col: col ?? collection ?? '',
            creator: row?.creator ?? '',
            first_seen_asset: row?.first_seen_asset ?? row?.firstSeenAsset ?? '',
            first_seen_at: row?.first_seen_at ?? row?.firstSeenAt ?? new Date(0).toISOString(),
            first_seen_slot: String(row?.first_seen_slot ?? row?.firstSeenSlot ?? '0'),
            first_seen_tx_signature: row?.first_seen_tx_signature ?? row?.firstSeenTxSignature ?? null,
            last_seen_at: row?.last_seen_at ?? row?.lastSeenAt ?? new Date(0).toISOString(),
            last_seen_slot: String(row?.last_seen_slot ?? row?.lastSeenSlot ?? '0'),
            last_seen_tx_signature: row?.last_seen_tx_signature ?? row?.lastSeenTxSignature ?? null,
            asset_count: String(row?.asset_count ?? row?.assetCount ?? '0'),
            version: row?.version ?? null,
            name: row?.name ?? null,
            symbol: row?.symbol ?? null,
            description: row?.description ?? null,
            image: row?.image ?? null,
            banner_image: row?.banner_image ?? row?.bannerImage ?? null,
            social_website: row?.social_website ?? row?.socialWebsite ?? null,
            social_x: row?.social_x ?? row?.socialX ?? null,
            social_discord: row?.social_discord ?? row?.socialDiscord ?? null,
            metadata_status: row?.metadata_status ?? row?.metadataStatus ?? null,
            metadata_hash: row?.metadata_hash ?? row?.metadataHash ?? null,
            metadata_bytes: row?.metadata_bytes ?? row?.metadataBytes ?? null,
            metadata_updated_at: row?.metadata_updated_at ?? row?.metadataUpdatedAt ?? null,
        };
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
    /**
     * Get count for a resource using Prefer: count=exact header (PostgREST standard)
     * Parses Content-Range header: "0-99/1234" -> 1234
     */
    async getCount(resource, filters) {
        const query = this.buildQuery({ ...filters, limit: 1 });
        const url = `${this.baseUrl}/${resource}${query}`;
        for (let attempt = 0; attempt <= this.retries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);
                const response = await fetch(url, {
                    headers: {
                        'apikey': this.apiKey,
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Prefer': 'count=exact',
                    },
                    signal: controller.signal,
                    redirect: 'error',
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    if (attempt < this.retries) {
                        await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                        continue;
                    }
                    throw new IndexerError(`getCount failed: HTTP ${response.status}`, IndexerErrorCode.SERVER_ERROR);
                }
                // Parse Content-Range header: "0-0/1234" or "items 0-0/1234" -> 1234
                const contentRange = response.headers.get('Content-Range');
                if (contentRange) {
                    const match = contentRange.match(/\/(\d+)$/);
                    if (match) {
                        return parseInt(match[1], 10);
                    }
                }
                // Fallback: count items in response (won't be accurate if paginated)
                const data = await response.json();
                return Array.isArray(data) ? data.length : 0;
            }
            catch (error) {
                if (attempt < this.retries) {
                    await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                }
                else {
                    throw error instanceof IndexerError
                        ? error
                        : new IndexerUnavailableError(error instanceof Error ? error.message : 'getCount failed after retries');
                }
            }
        }
        throw new IndexerUnavailableError('getCount failed after retries');
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
     * Get agent by indexer agent_id
     */
    async getAgentByAgentId(agentId) {
        const id = typeof agentId === 'bigint' ? agentId.toString() : String(agentId);
        const query = this.buildQuery({ agent_id: `eq.${id}` });
        const result = await this.request(`/agents${query}`);
        return result.length > 0 ? result[0] : null;
    }
    /** @deprecated Use getAgentByAgentId(agentId) */
    async getAgentByIndexerId(agentId) {
        return this.getAgentByAgentId(agentId);
    }
    /**
     * Get all agents with pagination
     */
    async getAgents(options) {
        const updatedAt = options?.updatedAt !== undefined ? String(options.updatedAt) : undefined;
        const updatedAtGt = options?.updatedAtGt !== undefined ? String(options.updatedAtGt) : undefined;
        const updatedAtLt = options?.updatedAtLt !== undefined ? String(options.updatedAtLt) : undefined;
        const query = this.buildQuery({
            limit: options?.limit,
            offset: options?.offset,
            order: options?.order || 'created_at.desc',
            owner: options?.owner ? `eq.${options.owner}` : undefined,
            creator: options?.creator ? `eq.${options.creator}` : undefined,
            collection: options?.collection ? `eq.${options.collection}` : undefined,
            collection_pointer: options?.collectionPointer ? `eq.${options.collectionPointer}` : undefined,
            agent_wallet: options?.wallet ? `eq.${options.wallet}` : undefined,
            parent_asset: options?.parentAsset ? `eq.${options.parentAsset}` : undefined,
            parent_creator: options?.parentCreator ? `eq.${options.parentCreator}` : undefined,
            col_locked: options?.colLocked !== undefined ? `eq.${options.colLocked}` : undefined,
            parent_locked: options?.parentLocked !== undefined ? `eq.${options.parentLocked}` : undefined,
            updated_at: updatedAt ? `eq.${updatedAt}` : undefined,
            updated_at_gt: updatedAtGt,
            updated_at_lt: updatedAtLt,
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
        // Note: p_cursor_sort_key is passed as string to avoid BigInt JSON.stringify crash
        // PostgreSQL will cast it to BIGINT on the server side
        const body = {
            p_collection: options?.collection || null,
            p_min_tier: options?.minTier ?? 0,
            p_limit: options?.limit || 50,
            p_cursor_sort_key: options?.cursorSortKey || null,
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
            order: 'feedback_id.desc',
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
     * Get a single feedback by feedback identifier.
     * Accepts sequential numeric backend feedback ids.
     */
    async getFeedbackById(feedbackId) {
        const normalizedId = feedbackId.trim();
        if (!/^\d+$/.test(normalizedId))
            return null;
        const byIdQuery = this.buildQuery({
            feedback_id: `eq.${normalizedId}`,
            limit: 2,
        });
        const byId = await this.request(`/feedbacks${byIdQuery}`);
        if (byId.length > 1) {
            throw new Error('Ambiguous feedback id.');
        }
        return byId.length === 1 ? byId[0] : null;
    }
    /**
     * Get feedbacks by client
     */
    async getFeedbacksByClient(client) {
        const query = this.buildQuery({
            client_address: `eq.${client}`,
            order: 'feedback_id.desc',
        });
        return this.request(`/feedbacks${query}`);
    }
    /**
     * Get feedbacks by tag
     */
    async getFeedbacksByTag(tag) {
        // Search in both tag1 and tag2
        const query = `?or=(tag1.eq.${encodeURIComponent(tag)},tag2.eq.${encodeURIComponent(tag)})&order=feedback_id.desc`;
        return this.request(`/feedbacks${query}`);
    }
    /**
     * Get feedbacks by endpoint
     */
    async getFeedbacksByEndpoint(endpoint) {
        const query = this.buildQuery({
            endpoint: `eq.${endpoint}`,
            order: 'feedback_id.desc',
        });
        return this.request(`/feedbacks${query}`);
    }
    /**
     * Get ALL feedbacks across all agents (bulk query)
     * Optimized for fetchAllFeedbacks - single query instead of N+1
     * @param options - Query options
     * @returns Array of all feedbacks (grouped by caller)
     */
    async getAllFeedbacks(options) {
        const params = {
            order: 'asset,feedback_index.asc',
            limit: options?.limit || 5000,
        };
        if (!options?.includeRevoked) {
            params.is_revoked = 'eq.false';
        }
        const query = this.buildQuery(params);
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
        return BigInt(results[0].feedback_index);
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
        validateNonce(nonceNum);
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            validator_address: `eq.${validator}`,
            nonce: `eq.${nonceNum}`,
        });
        const result = await this.request(`/validations${query}`);
        return result.length > 0 ? result[0] : null;
    }
    // ============================================================================
    // Stats (Views)
    // ============================================================================
    /**
     * Get canonical collection pointer rows.
     */
    async getCollectionPointers(options) {
        const collection = options?.collection ?? options?.col;
        const primaryQuery = this.buildQuery({
            collection: collection ? `eq.${collection}` : undefined,
            creator: options?.creator ? `eq.${options.creator}` : undefined,
            first_seen_asset: options?.firstSeenAsset ? `eq.${options.firstSeenAsset}` : undefined,
            limit: options?.limit,
            offset: options?.offset,
        });
        try {
            const rows = await this.request(`/collections${primaryQuery}`);
            return rows.map((row) => this.normalizeCollectionRecord(row));
        }
        catch (error) {
            if (!this.shouldUseLegacyCollectionRead(error)) {
                throw error;
            }
            const legacyQuery = this.buildQuery({
                col: collection ? `eq.${collection}` : undefined,
                creator: options?.creator ? `eq.${options.creator}` : undefined,
                first_seen_asset: options?.firstSeenAsset ? `eq.${options.firstSeenAsset}` : undefined,
                limit: options?.limit,
                offset: options?.offset,
            });
            const rows = await this.request(`/collection_pointers${legacyQuery}`);
            return rows.map((row) => this.normalizeCollectionRecord(row));
        }
    }
    /**
     * Count assets attached to a collection pointer (optionally scoped by creator).
     */
    async getCollectionAssetCount(col, creator) {
        const primaryQuery = this.buildQuery({
            collection: `eq.${col}`,
            creator: creator ? `eq.${creator}` : undefined,
        });
        try {
            const row = await this.request(`/collection_asset_count${primaryQuery}`);
            return this.parseCountValue(row?.asset_count, 0);
        }
        catch (error) {
            if (!this.shouldUseLegacyCollectionRead(error)) {
                throw error;
            }
            const legacyQuery = this.buildQuery({
                col: `eq.${col}`,
                creator: creator ? `eq.${creator}` : undefined,
            });
            const row = await this.request(`/collection_asset_count${legacyQuery}`);
            return this.parseCountValue(row?.asset_count, 0);
        }
    }
    /**
     * Get assets by collection pointer (optionally scoped by creator).
     */
    async getCollectionAssets(col, options) {
        const primaryQuery = this.buildQuery({
            collection: `eq.${col}`,
            creator: options?.creator ? `eq.${options.creator}` : undefined,
            limit: options?.limit,
            offset: options?.offset,
            order: options?.order,
        });
        try {
            return await this.request(`/collection_assets${primaryQuery}`);
        }
        catch (error) {
            if (!this.shouldUseLegacyCollectionRead(error)) {
                throw error;
            }
            const legacyQuery = this.buildQuery({
                col: `eq.${col}`,
                creator: options?.creator ? `eq.${options.creator}` : undefined,
                limit: options?.limit,
                offset: options?.offset,
                order: options?.order,
            });
            return this.request(`/collection_assets${legacyQuery}`);
        }
    }
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
            platinum_agents: 0,
            gold_agents: 0,
            avg_quality: null,
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
            order: 'response_id.desc',
        });
        return this.request(`/feedback_responses${query}`);
    }
    /**
     * Get responses for a specific feedback (asset + client + index)
     * @param asset - Agent asset pubkey (base58)
     * @param client - Client pubkey (base58)
     * @param feedbackIndex - Feedback index
     * @param limit - Max responses to return (default: 100, prevents large payloads)
     */
    async getFeedbackResponsesFor(asset, client, feedbackIndex, limit = 100) {
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            client_address: `eq.${client}`,
            feedback_index: `eq.${feedbackIndex.toString()}`,
            order: 'response_id.asc',
            limit,
        });
        return this.request(`/feedback_responses${query}`);
    }
    /**
     * Get responses by feedback identifier.
     * Accepts sequential numeric backend feedback ids.
     * Uses a two-step lookup for REST compatibility:
     * 1) resolve feedback asset from `feedbacks` by `feedback_id`
     * 2) query `feedback_responses` by `asset + feedback_id`
     * Fails closed when a single `feedback_id` resolves to multiple assets.
     */
    async getFeedbackResponsesByFeedbackId(feedbackId, limit = 100) {
        const normalizedId = feedbackId.trim();
        if (!/^\d+$/.test(normalizedId))
            return [];
        const feedbackLookupQuery = this.buildQuery({
            feedback_id: `eq.${normalizedId}`,
            select: 'asset',
            limit: 2,
        });
        const feedbackLookup = await this.request(`/feedbacks${feedbackLookupQuery}`);
        const assets = [
            ...new Set(feedbackLookup
                .map((row) => row.asset)
                .filter((asset) => typeof asset === 'string' && asset.length > 0)),
        ];
        if (assets.length === 0)
            return [];
        if (assets.length > 1) {
            throw new IndexerError(`Ambiguous feedback_id "${normalizedId}": multiple assets found (${assets.join(', ')}).`, IndexerErrorCode.INVALID_RESPONSE);
        }
        const [asset] = assets;
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            feedback_id: `eq.${normalizedId}`,
            order: 'response_id.asc',
            limit,
        });
        return this.request(`/feedback_responses${query}`);
    }
    async getRevocations(asset) {
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            order: 'revocation_id.asc',
        });
        return this.request(`/revocations${query}`);
    }
    async getLastFeedbackDigest(asset) {
        // Get the truly last feedback by block_slot (hash-chain is ordered by slot, not index)
        const lastQuery = this.buildQuery({
            asset: `eq.${asset}`,
            order: 'block_slot.desc',
            limit: 1,
        });
        const lastFeedback = await this.request(`/feedbacks${lastQuery}`);
        if (lastFeedback.length === 0) {
            return { digest: null, count: 0 };
        }
        // feedback_index is zero-based, so chain count is lastIndex + 1.
        const lastIndex = this.parseCountValue(lastFeedback[0].feedback_index, 0);
        const count = lastIndex + 1;
        return { digest: lastFeedback[0].running_digest, count };
    }
    async getLastResponseDigest(asset) {
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            order: 'block_slot.desc',
            limit: 1,
        });
        const responses = await this.request(`/feedback_responses${query}`);
        if (responses.length === 0) {
            return { digest: null, count: 0 };
        }
        const count = this.parseCountValue(responses[0].response_count, 1);
        return { digest: responses[0].running_digest, count };
    }
    async getLastRevokeDigest(asset) {
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            order: 'revoke_count.desc',
            limit: 1,
        });
        const revocations = await this.request(`/revocations${query}`);
        if (revocations.length === 0) {
            return { digest: null, count: 0 };
        }
        const count = this.parseCountValue(revocations[0].revoke_count, 1);
        return { digest: revocations[0].running_digest, count };
    }
    // ============================================================================
    // Spot Check Methods (for integrity verification)
    // ============================================================================
    /**
     * Get feedbacks at specific indices for spot checking
     * @param asset - Agent asset pubkey
     * @param indices - Array of feedback indices to check
     * @returns Map of index -> feedback (null if missing)
     */
    async getFeedbacksAtIndices(asset, indices) {
        if (indices.length === 0)
            return new Map();
        // PostgREST IN query: feedback_index=in.(0,5,10,15)
        const inClause = `in.(${indices.join(',')})`;
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            feedback_index: inClause,
            order: 'feedback_index.asc',
        });
        const feedbacks = await this.request(`/feedbacks${query}`);
        // Build result map
        const result = new Map();
        for (const idx of indices) {
            result.set(idx, null);
        }
        for (const fb of feedbacks) {
            result.set(Number(fb.feedback_index), fb);
        }
        return result;
    }
    /**
     * Get responses count for an asset
     */
    async getResponseCount(asset) {
        return this.getCount('feedback_responses', { asset: `eq.${asset}` });
    }
    /**
     * Get responses at specific offsets for spot checking
     * @param asset - Agent asset pubkey
     * @param offsets - Array of offsets (0-based) to check
     * @returns Map of offset -> response (null if missing)
     */
    async getResponsesAtOffsets(asset, offsets) {
        if (offsets.length === 0)
            return new Map();
        const result = new Map();
        for (const offset of offsets) {
            result.set(offset, null);
        }
        // Fetch each offset individually (PostgREST doesn't support IN on offsets)
        await Promise.all(offsets.map(async (offset) => {
            const query = this.buildQuery({
                asset: `eq.${asset}`,
                order: 'response_id.asc',
                offset,
                limit: 1,
            });
            const responses = await this.request(`/feedback_responses${query}`);
            if (responses.length > 0) {
                result.set(offset, responses[0]);
            }
        }));
        return result;
    }
    /**
     * Get revocations at specific revoke counts for spot checking
     * @param asset - Agent asset pubkey
     * @param revokeCounts - Array of revoke counts (1-based) to check
     * @returns Map of revokeCount -> revocation (null if missing)
     */
    async getRevocationsAtCounts(asset, revokeCounts) {
        if (revokeCounts.length === 0)
            return new Map();
        // PostgREST IN query: revoke_count=in.(1,5,10)
        const inClause = `in.(${revokeCounts.join(',')})`;
        const query = this.buildQuery({
            asset: `eq.${asset}`,
            revoke_count: inClause,
            order: 'revoke_count.asc',
        });
        const revocations = await this.request(`/revocations${query}`);
        // Build result map
        const result = new Map();
        for (const rc of revokeCounts) {
            result.set(rc, null);
        }
        for (const rev of revocations) {
            result.set(Number(rev.revoke_count), rev);
        }
        return result;
    }
    // ============================================================================
    // Replay Data Methods (for hash-chain full replay verification)
    // ============================================================================
    async getReplayData(asset, chainType, fromCount = 0, toCount = 1000, limit = 1000) {
        const query = this.buildQuery({
            chainType,
            fromCount,
            toCount,
            limit,
        });
        const events = await this.request(`/events/${asset}/replay-data${query}`);
        return {
            events,
            hasMore: events.length === limit,
            nextFromCount: events.length > 0 ? fromCount + events.length : fromCount,
        };
    }
    async getLatestCheckpoints(asset) {
        return this.request(`/checkpoints/${asset}/latest`);
    }
    async triggerReplay(asset) {
        return this.request(`/verify/replay/${asset}`);
    }
}
//# sourceMappingURL=indexer-client.js.map