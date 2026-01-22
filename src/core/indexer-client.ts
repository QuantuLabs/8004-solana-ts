/**
 * Indexer Client for Supabase PostgREST API
 * Provides fast read access to indexed agent data
 */

import {
  IndexerError,
  IndexerErrorCode,
  IndexerUnavailableError,
  IndexerTimeoutError,
  IndexerRateLimitError,
  IndexerUnauthorizedError,
} from './indexer-errors.js';

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

// ============================================================================
// Indexed Data Types (aligned with Supabase schema)
// ============================================================================

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
  // ATOM Stats
  trust_tier: number; // 0-4 (Unrated, Bronze, Silver, Gold, Platinum)
  quality_score: number; // 0-10000
  confidence: number; // 0-10000
  risk_score: number; // 0-100
  diversity_ratio: number; // 0-255
  feedback_count: number;
  raw_avg_score: number; // 0-100 (simple arithmetic mean when ATOM not enabled)
  // Leaderboard
  sort_key: string; // BIGINT as string (for precision)
  // Global Agent ID (cosmetic, from indexer materialized view)
  global_id?: number; // Sequential ID based on registration order
  global_id_formatted?: string; // e.g., "#042"
  // Chain reference
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
  value: string; // base64 encoded
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

// ============================================================================
// IndexerClient Implementation
// ============================================================================

/**
 * Client for interacting with Supabase indexer
 */
export class IndexerClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(config: IndexerClientConfig) {
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
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    let lastError: Error | null = null;

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
            throw new IndexerRateLimitError(
              'Rate limited',
              retryAfter ? parseInt(retryAfter, 10) : undefined
            );
          }
          if (response.status >= 500) {
            throw new IndexerError(
              `Server error: ${response.status}`,
              IndexerErrorCode.SERVER_ERROR
            );
          }
          throw new IndexerError(
            `HTTP ${response.status}: ${response.statusText}`,
            IndexerErrorCode.INVALID_RESPONSE
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error as Error;

        if (error instanceof IndexerError) {
          // Don't retry on client errors
          if (
            error.code === IndexerErrorCode.UNAUTHORIZED ||
            error.code === IndexerErrorCode.RATE_LIMITED
          ) {
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
  private buildQuery(params: Record<string, string | number | boolean | undefined>): string {
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
  async isAvailable(): Promise<boolean> {
    try {
      await this.request<IndexedAgent[]>('/agents?limit=1');
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Agents
  // ============================================================================

  /**
   * Get agent by asset pubkey
   */
  async getAgent(asset: string): Promise<IndexedAgent | null> {
    const query = this.buildQuery({ asset: `eq.${asset}` });
    const result = await this.request<IndexedAgent[]>(`/agents${query}`);
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Get all agents with pagination
   */
  async getAgents(options?: {
    limit?: number;
    offset?: number;
    order?: string;
  }): Promise<IndexedAgent[]> {
    const query = this.buildQuery({
      limit: options?.limit,
      offset: options?.offset,
      order: options?.order || 'created_at.desc',
    });
    return this.request<IndexedAgent[]>(`/agents${query}`);
  }

  /**
   * Get agents by owner
   */
  async getAgentsByOwner(owner: string): Promise<IndexedAgent[]> {
    const query = this.buildQuery({ owner: `eq.${owner}` });
    return this.request<IndexedAgent[]>(`/agents${query}`);
  }

  /**
   * Get agents by collection
   */
  async getAgentsByCollection(collection: string): Promise<IndexedAgent[]> {
    const query = this.buildQuery({ collection: `eq.${collection}` });
    return this.request<IndexedAgent[]>(`/agents${query}`);
  }

  /**
   * Get agent by operational wallet
   */
  async getAgentByWallet(wallet: string): Promise<IndexedAgent | null> {
    const query = this.buildQuery({ agent_wallet: `eq.${wallet}` });
    const result = await this.request<IndexedAgent[]>(`/agents${query}`);
    return result.length > 0 ? result[0] : null;
  }

  // ============================================================================
  // Reputation (agent_reputation view)
  // ============================================================================

  /**
   * Get reputation for a specific agent
   */
  async getAgentReputation(asset: string): Promise<IndexedAgentReputation | null> {
    const query = this.buildQuery({ asset: `eq.${asset}` });
    const result = await this.request<IndexedAgentReputation[]>(`/agent_reputation${query}`);
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
  async getLeaderboard(options?: {
    collection?: string;
    minTier?: number;
    limit?: number;
    cursorSortKey?: string;
  }): Promise<IndexedAgent[]> {
    const params: Record<string, string | number | undefined> = {
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
    return this.request<IndexedAgent[]>(`/agents${query}`);
  }

  /**
   * Get leaderboard via RPC function (optimized for large datasets)
   * Uses PostgreSQL get_leaderboard() function
   */
  async getLeaderboardRPC(options?: {
    collection?: string;
    minTier?: number;
    limit?: number;
    cursorSortKey?: string;
  }): Promise<IndexedAgent[]> {
    const body = {
      p_collection: options?.collection || null,
      p_min_tier: options?.minTier ?? 0,
      p_limit: options?.limit || 50,
      p_cursor_sort_key: options?.cursorSortKey ? BigInt(options.cursorSortKey) : null,
    };

    return this.request<IndexedAgent[]>('/rpc/get_leaderboard', {
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
  async getFeedbacks(
    asset: string,
    options?: { includeRevoked?: boolean; limit?: number; offset?: number }
  ): Promise<IndexedFeedback[]> {
    const params: Record<string, string | number | undefined> = {
      asset: `eq.${asset}`,
      order: 'created_at.desc',
      limit: options?.limit,
      offset: options?.offset,
    };

    if (!options?.includeRevoked) {
      params.is_revoked = 'eq.false';
    }

    const query = this.buildQuery(params);
    return this.request<IndexedFeedback[]>(`/feedbacks${query}`);
  }

  /**
   * Get single feedback by asset, client, and index
   * v0.4.1 - Added to fix audit finding #1 (HIGH): readFeedback must filter by client
   */
  async getFeedback(
    asset: string,
    client: string,
    feedbackIndex: number | bigint
  ): Promise<IndexedFeedback | null> {
    const query = this.buildQuery({
      asset: `eq.${asset}`,
      client_address: `eq.${client}`,
      feedback_index: `eq.${feedbackIndex.toString()}`,
      limit: 1,
    });
    const results = await this.request<IndexedFeedback[]>(`/feedbacks${query}`);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get feedbacks by client
   */
  async getFeedbacksByClient(client: string): Promise<IndexedFeedback[]> {
    const query = this.buildQuery({
      client_address: `eq.${client}`,
      order: 'created_at.desc',
    });
    return this.request<IndexedFeedback[]>(`/feedbacks${query}`);
  }

  /**
   * Get feedbacks by tag
   */
  async getFeedbacksByTag(tag: string): Promise<IndexedFeedback[]> {
    // Search in both tag1 and tag2
    const query = `?or=(tag1.eq.${encodeURIComponent(tag)},tag2.eq.${encodeURIComponent(tag)})&order=created_at.desc`;
    return this.request<IndexedFeedback[]>(`/feedbacks${query}`);
  }

  /**
   * Get feedbacks by endpoint
   */
  async getFeedbacksByEndpoint(endpoint: string): Promise<IndexedFeedback[]> {
    const query = this.buildQuery({
      endpoint: `eq.${endpoint}`,
      order: 'created_at.desc',
    });
    return this.request<IndexedFeedback[]>(`/feedbacks${query}`);
  }

  async getLastFeedbackIndex(asset: string, client: string): Promise<number> {
    const query = this.buildQuery({
      asset: `eq.${asset}`,
      client_address: `eq.${client}`,
      select: 'feedback_index',
      order: 'feedback_index.desc',
      limit: 1,
    });

    const results = await this.request<Array<{ feedback_index: number | string }>>(`/feedbacks${query}`);
    if (results.length === 0) return -1;
    // Handle BIGINT returned as string from Supabase to avoid string concatenation bugs
    const rawIndex = results[0].feedback_index;
    return typeof rawIndex === 'string' ? parseInt(rawIndex, 10) : rawIndex;
  }

  // ============================================================================
  // Metadata
  // ============================================================================

  /**
   * Get all metadata for an agent
   */
  async getMetadata(asset: string): Promise<IndexedMetadata[]> {
    const query = this.buildQuery({ asset: `eq.${asset}` });
    return this.request<IndexedMetadata[]>(`/metadata${query}`);
  }

  /**
   * Get specific metadata entry by key
   */
  async getMetadataByKey(asset: string, key: string): Promise<IndexedMetadata | null> {
    const query = this.buildQuery({
      asset: `eq.${asset}`,
      key: `eq.${key}`,
    });
    const result = await this.request<IndexedMetadata[]>(`/metadata${query}`);
    return result.length > 0 ? result[0] : null;
  }

  // ============================================================================
  // Validations
  // ============================================================================

  /**
   * Get validations for an agent
   */
  async getValidations(asset: string): Promise<IndexedValidation[]> {
    const query = this.buildQuery({
      asset: `eq.${asset}`,
      order: 'created_at.desc',
    });
    return this.request<IndexedValidation[]>(`/validations${query}`);
  }

  /**
   * Get validations by validator
   */
  async getValidationsByValidator(validator: string): Promise<IndexedValidation[]> {
    const query = this.buildQuery({
      validator_address: `eq.${validator}`,
      order: 'created_at.desc',
    });
    return this.request<IndexedValidation[]>(`/validations${query}`);
  }

  /**
   * Get pending validations for a validator
   */
  async getPendingValidations(validator: string): Promise<IndexedValidation[]> {
    const query = this.buildQuery({
      validator_address: `eq.${validator}`,
      status: 'eq.PENDING',
      order: 'created_at.desc',
    });
    return this.request<IndexedValidation[]>(`/validations${query}`);
  }

  /**
   * Get a specific validation by asset, validator, and nonce
   * Returns full validation data including URIs (not available on-chain)
   */
  async getValidation(
    asset: string,
    validator: string,
    nonce: number | bigint
  ): Promise<IndexedValidation | null> {
    const nonceNum = typeof nonce === 'bigint' ? Number(nonce) : nonce;
    const query = this.buildQuery({
      asset: `eq.${asset}`,
      validator: `eq.${validator}`,
      nonce: `eq.${nonceNum}`,
    });
    const result = await this.request<IndexedValidation[]>(`/validations${query}`);
    return result.length > 0 ? result[0] : null;
  }

  // ============================================================================
  // Stats (Views)
  // ============================================================================

  /**
   * Get stats for a specific collection
   */
  async getCollectionStats(collection: string): Promise<CollectionStats | null> {
    const query = this.buildQuery({ collection: `eq.${collection}` });
    const result = await this.request<CollectionStats[]>(`/collection_stats${query}`);
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Get stats for all collections
   */
  async getAllCollectionStats(): Promise<CollectionStats[]> {
    return this.request<CollectionStats[]>('/collection_stats?order=agent_count.desc');
  }

  /**
   * Get global statistics
   */
  async getGlobalStats(): Promise<GlobalStats> {
    const result = await this.request<GlobalStats[]>('/global_stats');
    return (
      result[0] || {
        total_agents: 0,
        total_collections: 0,
        total_feedbacks: 0,
        total_validations: 0,
        avg_score: null,
      }
    );
  }

  // ============================================================================
  // RPC Functions
  // ============================================================================

  /**
   * Get paginated agents for a collection with reputation summary
   * Uses the get_collection_agents RPC function
   */
  async getCollectionAgents(
    collection: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<IndexedAgentReputation[]> {
    const query = this.buildQuery({
      collection_id: collection,
      page_limit: limit,
      page_offset: offset,
    });
    return this.request<IndexedAgentReputation[]>(`/rpc/get_collection_agents${query}`);
  }

  // ============================================================================
  // Feedback Responses
  // ============================================================================

  /**
   * Get responses for an agent's feedbacks
   */
  async getFeedbackResponses(asset: string): Promise<IndexedFeedbackResponse[]> {
    const query = this.buildQuery({
      asset: `eq.${asset}`,
      order: 'created_at.desc',
    });
    return this.request<IndexedFeedbackResponse[]>(`/feedback_responses${query}`);
  }

  /**
   * Get responses for a specific feedback (asset + client + index)
   */
  async getFeedbackResponsesFor(
    asset: string,
    client: string,
    feedbackIndex: number | bigint
  ): Promise<IndexedFeedbackResponse[]> {
    const query = this.buildQuery({
      asset: `eq.${asset}`,
      client_address: `eq.${client}`,
      feedback_index: `eq.${feedbackIndex.toString()}`,
      order: 'created_at.asc',
    });
    return this.request<IndexedFeedbackResponse[]>(`/feedback_responses${query}`);
  }
}

// Modified:
// - IndexedFeedbackResponse: Added client_address field
// - Added getFeedback method to query by asset, client, and feedbackIndex
// - Added getFeedbackResponsesFor method to query responses for specific feedback
