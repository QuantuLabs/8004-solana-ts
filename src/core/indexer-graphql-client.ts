/**
 * Indexer Client for GraphQL v2 API
 * Implements the IndexerReadClient contract used by the SDK.
 */

import {
  IndexerError,
  IndexerErrorCode,
  IndexerRateLimitError,
  IndexerTimeoutError,
  IndexerUnauthorizedError,
  IndexerUnavailableError,
} from './indexer-errors.js';

import type {
  GlobalStats,
  IndexedAgent,
  IndexedAgentReputation,
  IndexedFeedback,
  IndexedFeedbackResponse,
  IndexedValidation,
  IndexerReadClient,
} from './indexer-client.js';

export interface IndexerGraphQLClientConfig {
  /** GraphQL endpoint (e.g., https://host/v2/graphql) */
  graphqlUrl: string;
  /** Optional headers (for self-hosted auth gateways, etc.) */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Number of retries on failure (default: 2) */
  retries?: number;
}

type GraphQLErrorShape = { message?: string; extensions?: Record<string, unknown> };

function toIsoFromUnixSeconds(unix: unknown): string {
  const n = typeof unix === 'string' ? Number(unix) : (typeof unix === 'number' ? unix : NaN);
  if (!Number.isFinite(n) || n <= 0) return new Date(0).toISOString();
  return new Date(n * 1000).toISOString();
}

function toNumberSafe(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : (typeof v === 'number' ? v : NaN);
  return Number.isFinite(n) ? n : fallback;
}

function toIntSafe(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number.parseInt(v, 10) : (typeof v === 'number' ? v : NaN);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function agentId(asset: string): string {
  return `sol:${asset}`;
}

function feedbackId(asset: string, client: string, index: number | bigint): string {
  return `sol:${asset}:${client}:${index.toString()}`;
}

function decodeFeedbackId(id: string): { asset: string; client: string; index: string } | null {
  const parts = id.split(':');
  if (parts.length !== 4 || parts[0] !== 'sol') return null;
  const [, asset, client, index] = parts;
  if (!asset || !client || !index) return null;
  return { asset, client, index };
}

function decodeValidationId(id: string): { asset: string; validator: string; nonce: string } | null {
  const parts = id.split(':');
  if (parts.length !== 4 || parts[0] !== 'sol') return null;
  const [, asset, validator, nonce] = parts;
  if (!asset || !validator || !nonce) return null;
  return { asset, validator, nonce };
}

function mapValidationStatus(status: unknown): 'PENDING' | 'RESPONDED' {
  if (status === 'PENDING') return 'PENDING';
  // GraphQL uses COMPLETED; legacy SDK uses RESPONDED.
  return 'RESPONDED';
}

export class IndexerGraphQLClient implements IndexerReadClient {
  private readonly graphqlUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(config: IndexerGraphQLClientConfig) {
    this.graphqlUrl = config.graphqlUrl.replace(/\/$/, '');
    this.headers = config.headers ?? {};
    this.timeout = config.timeout ?? 10000;
    this.retries = config.retries ?? 2;
  }

  getBaseUrl(): string {
    return this.graphqlUrl;
  }

  private async request<TData>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<TData> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(this.graphqlUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...this.headers,
          },
          body: JSON.stringify({ query, variables }),
          signal: controller.signal,
          redirect: 'error',
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          // Many GraphQL servers (including ours) can return JSON error bodies with HTTP 400.
          // Surface those messages to help diagnose query complexity/validation issues.
          let details = '';
          try {
            const contentType = response.headers.get('content-type') ?? '';
            const text = await response.text();
            if (contentType.includes('application/json')) {
              const parsed = JSON.parse(text) as { errors?: GraphQLErrorShape[] };
              const msg = parsed?.errors?.map(e => e?.message).filter(Boolean).join('; ');
              if (msg) details = msg;
            } else if (text) {
              details = text.slice(0, 200).replace(/\s+/g, ' ').trim();
            }
          } catch {
            // Ignore body parsing issues for non-OK responses.
          }

          if (response.status === 401 || response.status === 403) {
            throw new IndexerUnauthorizedError();
          }
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            throw new IndexerRateLimitError(
              'Rate limited',
              retryAfter ? parseInt(retryAfter, 10) : undefined
            );
          }

          if (attempt < this.retries) {
            await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
            continue;
          }
          throw new IndexerError(
            `GraphQL request failed: HTTP ${response.status}${details ? ` (${details})` : ''}`,
            IndexerErrorCode.SERVER_ERROR
          );
        }

        const json = (await response.json()) as { data?: TData; errors?: GraphQLErrorShape[] };

        if (json.errors && json.errors.length > 0) {
          const msg = json.errors.map(e => e?.message).filter(Boolean).join('; ') || 'GraphQL error';
          throw new IndexerError(msg, IndexerErrorCode.INVALID_RESPONSE);
        }

        if (!json.data) {
          throw new IndexerError('GraphQL response missing data', IndexerErrorCode.INVALID_RESPONSE);
        }

        return json.data;
      } catch (err) {
        const e = err as any;
        lastError = err instanceof Error ? err : new Error(String(err));

        if (e?.name === 'AbortError') {
          lastError = new IndexerTimeoutError();
        } else if (!(err instanceof IndexerError)) {
          // Network / fetch errors
          if (err instanceof TypeError) {
            lastError = new IndexerUnavailableError(err.message);
          }
        }

        if (attempt < this.retries) {
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
          continue;
        }

        throw lastError instanceof IndexerError ? lastError : new IndexerUnavailableError(lastError.message);
      }
    }

    throw lastError ?? new IndexerUnavailableError();
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.request<{ __typename: string }>('query { __typename }');
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Agents
  // ============================================================================

  async getAgent(asset: string): Promise<IndexedAgent | null> {
    const data = await this.request<{
      agent: any | null;
    }>(
      `query($id: ID!) {
        agent(id: $id) {
          id
          owner
          agentURI
          agentWallet
          createdAt
          updatedAt
          totalFeedback
          solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
        }
      }`,
      { id: agentId(asset) }
    );

    if (!data.agent) return null;
    const a = data.agent;

    return {
      asset: a?.solana?.assetPubkey ?? asset,
      owner: a.owner,
      agent_uri: a.agentURI ?? null,
      agent_wallet: a.agentWallet ?? null,
      collection: a?.solana?.collection ?? '',
      nft_name: null,
      atom_enabled: Boolean(a?.solana?.atomEnabled),
      trust_tier: toNumberSafe(a?.solana?.trustTier, 0),
      quality_score: toNumberSafe(a?.solana?.qualityScore, 0),
      confidence: toNumberSafe(a?.solana?.confidence, 0),
      risk_score: toNumberSafe(a?.solana?.riskScore, 0),
      diversity_ratio: toNumberSafe(a?.solana?.diversityRatio, 0),
      feedback_count: toNumberSafe(a?.totalFeedback, 0),
      raw_avg_score: 0,
      sort_key: '0',
      block_slot: 0,
      tx_signature: '',
      created_at: toIsoFromUnixSeconds(a?.createdAt),
      updated_at: toIsoFromUnixSeconds(a?.updatedAt),
    };
  }

  async getAgents(options?: { limit?: number; offset?: number; order?: string }): Promise<IndexedAgent[]> {
    const limit = clampInt(options?.limit ?? 100, 0, 500);
    const offset = clampInt(options?.offset ?? 0, 0, 1_000_000);

    // Legacy order string (PostgREST-style) mapping
    const order = options?.order ?? 'created_at.desc';
    const orderDirection = order.includes('.asc') ? 'asc' : 'desc';

    const data = await this.request<{
      agents: any[];
    }>(
      `query($dir: OrderDirection!) {
        agents(first: ${limit}, skip: ${offset}, orderBy: createdAt, orderDirection: $dir) {
          id
          owner
          agentURI
          agentWallet
          createdAt
          updatedAt
          totalFeedback
          solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
        }
      }`,
      { dir: orderDirection }
    );

    return data.agents.map((a) => ({
      asset: a?.solana?.assetPubkey ?? '',
      owner: a.owner,
      agent_uri: a.agentURI ?? null,
      agent_wallet: a.agentWallet ?? null,
      collection: a?.solana?.collection ?? '',
      nft_name: null,
      atom_enabled: Boolean(a?.solana?.atomEnabled),
      trust_tier: toNumberSafe(a?.solana?.trustTier, 0),
      quality_score: toNumberSafe(a?.solana?.qualityScore, 0),
      confidence: toNumberSafe(a?.solana?.confidence, 0),
      risk_score: toNumberSafe(a?.solana?.riskScore, 0),
      diversity_ratio: toNumberSafe(a?.solana?.diversityRatio, 0),
      feedback_count: toNumberSafe(a?.totalFeedback, 0),
      raw_avg_score: 0,
      sort_key: '0',
      block_slot: 0,
      tx_signature: '',
      created_at: toIsoFromUnixSeconds(a?.createdAt),
      updated_at: toIsoFromUnixSeconds(a?.updatedAt),
    }));
  }

  async getAgentsByOwner(owner: string): Promise<IndexedAgent[]> {
    const data = await this.request<{ agents: any[] }>(
      `query($owner: String!) {
        agents(first: 250, where: { owner: $owner }, orderBy: createdAt, orderDirection: desc) {
          owner agentURI agentWallet createdAt updatedAt totalFeedback
          solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
        }
      }`,
      { owner }
    );

    return data.agents.map((a) => ({
      asset: a?.solana?.assetPubkey ?? '',
      owner: a.owner,
      agent_uri: a.agentURI ?? null,
      agent_wallet: a.agentWallet ?? null,
      collection: a?.solana?.collection ?? '',
      nft_name: null,
      atom_enabled: Boolean(a?.solana?.atomEnabled),
      trust_tier: toNumberSafe(a?.solana?.trustTier, 0),
      quality_score: toNumberSafe(a?.solana?.qualityScore, 0),
      confidence: toNumberSafe(a?.solana?.confidence, 0),
      risk_score: toNumberSafe(a?.solana?.riskScore, 0),
      diversity_ratio: toNumberSafe(a?.solana?.diversityRatio, 0),
      feedback_count: toNumberSafe(a?.totalFeedback, 0),
      raw_avg_score: 0,
      sort_key: '0',
      block_slot: 0,
      tx_signature: '',
      created_at: toIsoFromUnixSeconds(a?.createdAt),
      updated_at: toIsoFromUnixSeconds(a?.updatedAt),
    }));
  }

  async getAgentsByCollection(collection: string): Promise<IndexedAgent[]> {
    const data = await this.request<{ agents: any[] }>(
      `query($collection: String!) {
        agents(first: 250, where: { collection: $collection }, orderBy: createdAt, orderDirection: desc) {
          owner agentURI agentWallet createdAt updatedAt totalFeedback
          solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
        }
      }`,
      { collection }
    );

    return data.agents.map((a) => ({
      asset: a?.solana?.assetPubkey ?? '',
      owner: a.owner,
      agent_uri: a.agentURI ?? null,
      agent_wallet: a.agentWallet ?? null,
      collection: a?.solana?.collection ?? '',
      nft_name: null,
      atom_enabled: Boolean(a?.solana?.atomEnabled),
      trust_tier: toNumberSafe(a?.solana?.trustTier, 0),
      quality_score: toNumberSafe(a?.solana?.qualityScore, 0),
      confidence: toNumberSafe(a?.solana?.confidence, 0),
      risk_score: toNumberSafe(a?.solana?.riskScore, 0),
      diversity_ratio: toNumberSafe(a?.solana?.diversityRatio, 0),
      feedback_count: toNumberSafe(a?.totalFeedback, 0),
      raw_avg_score: 0,
      sort_key: '0',
      block_slot: 0,
      tx_signature: '',
      created_at: toIsoFromUnixSeconds(a?.createdAt),
      updated_at: toIsoFromUnixSeconds(a?.updatedAt),
    }));
  }

  async getAgentByWallet(wallet: string): Promise<IndexedAgent | null> {
    const data = await this.request<{ agents: any[] }>(
      `query($wallet: String!) {
        agents(first: 1, where: { agentWallet: $wallet }, orderBy: createdAt, orderDirection: desc) {
          owner agentURI agentWallet createdAt updatedAt totalFeedback
          solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
        }
      }`,
      { wallet }
    );
    if (!data.agents || data.agents.length === 0) return null;
    const a = data.agents[0];
    return {
      asset: a?.solana?.assetPubkey ?? '',
      owner: a.owner,
      agent_uri: a.agentURI ?? null,
      agent_wallet: a.agentWallet ?? null,
      collection: a?.solana?.collection ?? '',
      nft_name: null,
      atom_enabled: Boolean(a?.solana?.atomEnabled),
      trust_tier: toNumberSafe(a?.solana?.trustTier, 0),
      quality_score: toNumberSafe(a?.solana?.qualityScore, 0),
      confidence: toNumberSafe(a?.solana?.confidence, 0),
      risk_score: toNumberSafe(a?.solana?.riskScore, 0),
      diversity_ratio: toNumberSafe(a?.solana?.diversityRatio, 0),
      feedback_count: toNumberSafe(a?.totalFeedback, 0),
      raw_avg_score: 0,
      sort_key: '0',
      block_slot: 0,
      tx_signature: '',
      created_at: toIsoFromUnixSeconds(a?.createdAt),
      updated_at: toIsoFromUnixSeconds(a?.updatedAt),
    };
  }

  async getLeaderboard(options?: {
    collection?: string;
    minTier?: number;
    limit?: number;
    cursorSortKey?: string;
  }): Promise<IndexedAgent[]> {
    const limit = clampInt(options?.limit ?? 50, 0, 200);
    const where: Record<string, unknown> = {};
    if (options?.collection) where.collection = options.collection;
    if (options?.minTier !== undefined) where.trustTier_gte = options.minTier;

    const data = await this.request<{ agents: any[] }>(
      `query($where: AgentFilter) {
        agents(first: ${limit}, where: $where, orderBy: qualityScore, orderDirection: desc) {
          owner agentURI agentWallet createdAt updatedAt totalFeedback
          solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
        }
      }`,
      { where: Object.keys(where).length ? where : null }
    );

    return data.agents.map((a) => ({
      asset: a?.solana?.assetPubkey ?? '',
      owner: a.owner,
      agent_uri: a.agentURI ?? null,
      agent_wallet: a.agentWallet ?? null,
      collection: a?.solana?.collection ?? '',
      nft_name: null,
      atom_enabled: Boolean(a?.solana?.atomEnabled),
      trust_tier: toNumberSafe(a?.solana?.trustTier, 0),
      quality_score: toNumberSafe(a?.solana?.qualityScore, 0),
      confidence: toNumberSafe(a?.solana?.confidence, 0),
      risk_score: toNumberSafe(a?.solana?.riskScore, 0),
      diversity_ratio: toNumberSafe(a?.solana?.diversityRatio, 0),
      feedback_count: toNumberSafe(a?.totalFeedback, 0),
      raw_avg_score: 0,
      sort_key: '0',
      block_slot: 0,
      tx_signature: '',
      created_at: toIsoFromUnixSeconds(a?.createdAt),
      updated_at: toIsoFromUnixSeconds(a?.updatedAt),
    }));
  }

  async getGlobalStats(): Promise<GlobalStats> {
    const data = await this.request<{ protocols: Array<{ totalAgents: string; totalFeedback: string; totalValidations: string }> }>(
      `query {
        protocols { totalAgents totalFeedback totalValidations }
      }`
    );
    const p = data.protocols?.[0];
    return {
      total_agents: toNumberSafe(p?.totalAgents, 0),
      total_collections: 1,
      total_feedbacks: toNumberSafe(p?.totalFeedback, 0),
      total_validations: toNumberSafe(p?.totalValidations, 0),
      platinum_agents: 0,
      gold_agents: 0,
      avg_quality: null,
    };
  }

  // ============================================================================
  // Feedbacks
  // ============================================================================

  async getFeedbacks(
    asset: string,
    options?: { includeRevoked?: boolean; limit?: number; offset?: number }
  ): Promise<IndexedFeedback[]> {
    const first = clampInt(options?.limit ?? 100, 0, 1000);
    const skip = clampInt(options?.offset ?? 0, 0, 1_000_000);

    const where: Record<string, unknown> = { agent: agentId(asset) };
    if (!options?.includeRevoked) {
      where.isRevoked = false;
    }

    const data = await this.request<{ feedbacks: any[] }>(
      `query($where: FeedbackFilter) {
        feedbacks(first: ${first}, skip: ${skip}, where: $where, orderBy: createdAt, orderDirection: desc) {
          id
          clientAddress
          feedbackIndex
          tag1
          tag2
          endpoint
          feedbackURI
          feedbackHash
          isRevoked
          createdAt
          revokedAt
          solana { valueRaw valueDecimals score txSignature blockSlot }
        }
      }`,
      { where }
    );

    return data.feedbacks.map((f) => ({
      id: f.id,
      asset,
      client_address: f.clientAddress,
      feedback_index: toNumberSafe(f.feedbackIndex, 0),
      value: f?.solana?.valueRaw ?? '0',
      value_decimals: toNumberSafe(f?.solana?.valueDecimals, 0),
      score: f?.solana?.score ?? null,
      tag1: f.tag1 ?? '',
      tag2: f.tag2 ?? '',
      endpoint: f.endpoint ?? null,
      feedback_uri: f.feedbackURI ?? null,
      running_digest: null,
      feedback_hash: f.feedbackHash ?? null,
      is_revoked: Boolean(f.isRevoked),
      revoked_at: f.revokedAt ? toIsoFromUnixSeconds(f.revokedAt) : null,
      block_slot: toNumberSafe(f?.solana?.blockSlot, 0),
      tx_signature: f?.solana?.txSignature ?? '',
      created_at: toIsoFromUnixSeconds(f.createdAt),
    }));
  }

  async getFeedback(
    asset: string,
    client: string,
    feedbackIndex: number | bigint
  ): Promise<IndexedFeedback | null> {
    const data = await this.request<{ feedback: any | null }>(
      `query($id: ID!) {
        feedback(id: $id) {
          id
          clientAddress
          feedbackIndex
          tag1
          tag2
          endpoint
          feedbackURI
      feedbackHash
      isRevoked
      createdAt
      revokedAt
      solana { valueRaw valueDecimals score txSignature blockSlot }
    }
  }`,
  { id: feedbackId(asset, client, feedbackIndex) }
);

    if (!data.feedback) return null;
    const f = data.feedback;
    return {
      id: f.id,
      asset,
      client_address: f.clientAddress,
      feedback_index: toNumberSafe(f.feedbackIndex, 0),
      value: f?.solana?.valueRaw ?? '0',
      value_decimals: toNumberSafe(f?.solana?.valueDecimals, 0),
      score: f?.solana?.score ?? null,
      tag1: f.tag1 ?? '',
      tag2: f.tag2 ?? '',
      endpoint: f.endpoint ?? null,
      feedback_uri: f.feedbackURI ?? null,
      running_digest: null,
      feedback_hash: f.feedbackHash ?? null,
      is_revoked: Boolean(f.isRevoked),
      revoked_at: f.revokedAt ? toIsoFromUnixSeconds(f.revokedAt) : null,
      block_slot: toNumberSafe(f?.solana?.blockSlot, 0),
      tx_signature: f?.solana?.txSignature ?? '',
      created_at: toIsoFromUnixSeconds(f.createdAt),
    };
  }

  async getFeedbacksByClient(client: string): Promise<IndexedFeedback[]> {
    const data = await this.request<{ feedbacks: any[] }>(
      `query($client: String!) {
        feedbacks(first: 250, where: { clientAddress: $client }, orderBy: createdAt, orderDirection: desc) {
          id
          clientAddress
          feedbackIndex
          tag1
          tag2
          endpoint
          feedbackURI
          feedbackHash
          isRevoked
          createdAt
          revokedAt
          solana { valueRaw valueDecimals score txSignature blockSlot }
        }
      }`,
      { client }
    );

    return data.feedbacks.map((f) => {
      const decoded = decodeFeedbackId(f.id);
      const asset = decoded?.asset ?? '';
      return {
        id: f.id,
        asset,
        client_address: f.clientAddress,
        feedback_index: toNumberSafe(f.feedbackIndex, 0),
        value: f?.solana?.valueRaw ?? '0',
        value_decimals: toNumberSafe(f?.solana?.valueDecimals, 0),
        score: f?.solana?.score ?? null,
        tag1: f.tag1 ?? '',
        tag2: f.tag2 ?? '',
        endpoint: f.endpoint ?? null,
        feedback_uri: f.feedbackURI ?? null,
        running_digest: null,
        feedback_hash: f.feedbackHash ?? null,
        is_revoked: Boolean(f.isRevoked),
        revoked_at: f.revokedAt ? toIsoFromUnixSeconds(f.revokedAt) : null,
        block_slot: toNumberSafe(f?.solana?.blockSlot, 0),
        tx_signature: f?.solana?.txSignature ?? '',
        created_at: toIsoFromUnixSeconds(f.createdAt),
      };
    });
  }

  async getFeedbacksByTag(tag: string): Promise<IndexedFeedback[]> {
    // GraphQL filter doesn't support OR on tag1/tag2, so query both and merge.
    const [tag1, tag2] = await Promise.all([
      this.request<{ feedbacks: any[] }>(
        `query($tag: String!) {
          feedbacks(first: 250, where: { tag1: $tag }, orderBy: createdAt, orderDirection: desc) {
            id
            clientAddress
            feedbackIndex
            tag1
            tag2
            endpoint
            feedbackURI
            feedbackHash
            isRevoked
            createdAt
            revokedAt
            solana { valueRaw valueDecimals score txSignature blockSlot }
          }
        }`,
        { tag }
      ),
      this.request<{ feedbacks: any[] }>(
        `query($tag: String!) {
          feedbacks(first: 250, where: { tag2: $tag }, orderBy: createdAt, orderDirection: desc) {
            id
            clientAddress
            feedbackIndex
            tag1
            tag2
            endpoint
            feedbackURI
            feedbackHash
            isRevoked
            createdAt
            revokedAt
            solana { valueRaw valueDecimals score txSignature blockSlot }
          }
        }`,
        { tag }
      ),
    ]);

    const merged = new Map<string, any>();
    for (const f of [...(tag1.feedbacks ?? []), ...(tag2.feedbacks ?? [])]) {
      merged.set(f.id, f);
    }

    return Array.from(merged.values()).map((f) => {
      const decoded = decodeFeedbackId(f.id);
      const asset = decoded?.asset ?? '';
      return {
        id: f.id,
        asset,
        client_address: f.clientAddress,
        feedback_index: toNumberSafe(f.feedbackIndex, 0),
        value: f?.solana?.valueRaw ?? '0',
        value_decimals: toNumberSafe(f?.solana?.valueDecimals, 0),
        score: f?.solana?.score ?? null,
        tag1: f.tag1 ?? '',
        tag2: f.tag2 ?? '',
        endpoint: f.endpoint ?? null,
        feedback_uri: f.feedbackURI ?? null,
        running_digest: null,
        feedback_hash: f.feedbackHash ?? null,
        is_revoked: Boolean(f.isRevoked),
        revoked_at: f.revokedAt ? toIsoFromUnixSeconds(f.revokedAt) : null,
        block_slot: toNumberSafe(f?.solana?.blockSlot, 0),
        tx_signature: f?.solana?.txSignature ?? '',
        created_at: toIsoFromUnixSeconds(f.createdAt),
      };
    });
  }

  async getFeedbacksByEndpoint(endpoint: string): Promise<IndexedFeedback[]> {
    const data = await this.request<{ feedbacks: any[] }>(
      `query($endpoint: String!) {
        feedbacks(first: 250, where: { endpoint: $endpoint }, orderBy: createdAt, orderDirection: desc) {
          id
          clientAddress
          feedbackIndex
          tag1
          tag2
          endpoint
          feedbackURI
          feedbackHash
          isRevoked
          createdAt
          revokedAt
          solana { valueRaw valueDecimals score txSignature blockSlot }
        }
      }`,
      { endpoint }
    );

    return data.feedbacks.map((f) => {
      const decoded = decodeFeedbackId(f.id);
      const asset = decoded?.asset ?? '';
      return {
        id: f.id,
        asset,
        client_address: f.clientAddress,
        feedback_index: toNumberSafe(f.feedbackIndex, 0),
        value: f?.solana?.valueRaw ?? '0',
        value_decimals: toNumberSafe(f?.solana?.valueDecimals, 0),
        score: f?.solana?.score ?? null,
        tag1: f.tag1 ?? '',
        tag2: f.tag2 ?? '',
        endpoint: f.endpoint ?? null,
        feedback_uri: f.feedbackURI ?? null,
        running_digest: null,
        feedback_hash: f.feedbackHash ?? null,
        is_revoked: Boolean(f.isRevoked),
        revoked_at: f.revokedAt ? toIsoFromUnixSeconds(f.revokedAt) : null,
        block_slot: toNumberSafe(f?.solana?.blockSlot, 0),
        tx_signature: f?.solana?.txSignature ?? '',
        created_at: toIsoFromUnixSeconds(f.createdAt),
      };
    });
  }

  async getAllFeedbacks(options?: { includeRevoked?: boolean; limit?: number }): Promise<IndexedFeedback[]> {
    const first = clampInt(options?.limit ?? 5000, 0, 5000);
    const where: Record<string, unknown> = {};
    if (!options?.includeRevoked) where.isRevoked = false;

    const data = await this.request<{ feedbacks: any[] }>(
      `query($where: FeedbackFilter) {
        feedbacks(first: ${first}, where: $where, orderBy: createdAt, orderDirection: desc) {
          id
          clientAddress
          feedbackIndex
          tag1
          tag2
          endpoint
          feedbackURI
          feedbackHash
          isRevoked
          createdAt
          revokedAt
          solana { valueRaw valueDecimals score txSignature blockSlot }
        }
      }`,
      { where: Object.keys(where).length ? where : null }
    );

    return data.feedbacks.map((f) => {
      const decoded = decodeFeedbackId(f.id);
      const asset = decoded?.asset ?? '';
      return {
        id: f.id,
        asset,
        client_address: f.clientAddress,
        feedback_index: toNumberSafe(f.feedbackIndex, 0),
        value: f?.solana?.valueRaw ?? '0',
        value_decimals: toNumberSafe(f?.solana?.valueDecimals, 0),
        score: f?.solana?.score ?? null,
        tag1: f.tag1 ?? '',
        tag2: f.tag2 ?? '',
        endpoint: f.endpoint ?? null,
        feedback_uri: f.feedbackURI ?? null,
        running_digest: null,
        feedback_hash: f.feedbackHash ?? null,
        is_revoked: Boolean(f.isRevoked),
        revoked_at: f.revokedAt ? toIsoFromUnixSeconds(f.revokedAt) : null,
        block_slot: toNumberSafe(f?.solana?.blockSlot, 0),
        tx_signature: f?.solana?.txSignature ?? '',
        created_at: toIsoFromUnixSeconds(f.createdAt),
      };
    });
  }

  async getLastFeedbackIndex(asset: string, client: string): Promise<bigint> {
    const data = await this.request<{ feedbacks: Array<{ feedbackIndex: string }> }>(
      `query($agent: ID!, $client: String!) {
        feedbacks(first: 1, where: { agent: $agent, clientAddress: $client }, orderBy: feedbackIndex, orderDirection: desc) {
          feedbackIndex
        }
      }`,
      { agent: agentId(asset), client }
    );
    if (!data.feedbacks || data.feedbacks.length === 0) return -1n;
    return BigInt(data.feedbacks[0].feedbackIndex);
  }

  // ============================================================================
  // Responses
  // ============================================================================

  async getFeedbackResponsesFor(
    asset: string,
    client: string,
    feedbackIndex: number | bigint,
    limit: number = 100
  ): Promise<IndexedFeedbackResponse[]> {
    const data = await this.request<{ feedbackResponses: any[] }>(
      `query($feedback: ID!) {
        feedbackResponses(first: ${clampInt(limit, 0, 1000)}, where: { feedback: $feedback }, orderBy: createdAt, orderDirection: asc) {
          id
          responder
          responseUri
          responseHash
          createdAt
          solana { txSignature blockSlot }
        }
      }`,
      { feedback: feedbackId(asset, client, feedbackIndex) }
    );

    return data.feedbackResponses.map((r) => ({
      id: r.id,
      asset,
      client_address: client,
      feedback_index: toNumberSafe(feedbackIndex, 0),
      responder: r.responder,
      response_uri: r.responseUri ?? null,
      response_hash: r.responseHash ?? null,
      running_digest: null,
      block_slot: toNumberSafe(r?.solana?.blockSlot, 0),
      tx_signature: r?.solana?.txSignature ?? '',
      created_at: toIsoFromUnixSeconds(r.createdAt),
    }));
  }

  // ============================================================================
  // Validations
  // ============================================================================

  async getPendingValidations(validator: string): Promise<IndexedValidation[]> {
    const data = await this.request<{ validations: any[] }>(
      `query($validator: String!) {
        validations(first: 250, where: { validatorAddress: $validator, status: PENDING }) {
          id
          validatorAddress
          requestUri
          requestHash
          response
          responseUri
          responseHash
          tag
          status
          createdAt
          updatedAt
        }
      }`,
      { validator }
    );

    return data.validations.map((v) => {
      const decoded = decodeValidationId(v.id);
      const asset = decoded?.asset ?? '';
      const nonce = decoded?.nonce ?? '0';
      return {
        id: v.id,
        asset,
        validator_address: v.validatorAddress,
        nonce: toNumberSafe(nonce, 0),
        requester: null,
        request_uri: v.requestUri ?? null,
        request_hash: v.requestHash ?? null,
        response: v.response ?? null,
        response_uri: v.responseUri ?? null,
        response_hash: v.responseHash ?? null,
        tag: v.tag ?? null,
        status: mapValidationStatus(v.status),
        block_slot: 0,
        tx_signature: '',
        created_at: toIsoFromUnixSeconds(v.createdAt),
        updated_at: v.updatedAt ? toIsoFromUnixSeconds(v.updatedAt) : toIsoFromUnixSeconds(v.createdAt),
      };
    });
  }

  // ============================================================================
  // Reputation
  // ============================================================================

  async getAgentReputation(_asset: string): Promise<IndexedAgentReputation | null> {
    // Not exposed by GraphQL v2. Prefer on-chain fallback in SolanaSDK.getAgentReputationFromIndexer().
    return null;
  }
}
