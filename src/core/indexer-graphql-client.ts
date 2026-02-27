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
  AgentQueryOptions,
  CheckpointSet,
  CollectionAssetsQueryOptions,
  CollectionPointerQueryOptions,
  CollectionPointerRecord,
  GlobalStats,
  IndexedAgent,
  IndexedAgentReputation,
  IndexedFeedback,
  IndexedFeedbackResponse,
  IndexedRevocation,
  IndexedValidation,
  IndexerReadClient,
  ReplayDataPage,
  ReplayEventData,
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
type AgentIdFieldName = 'agentId' | 'agentid';
type AgentIdVariableType = 'String' | 'BigInt';

function toIsoFromUnixSeconds(unix: unknown): string {
  if (typeof unix === 'string') {
    const trimmed = unix.trim();
    if (trimmed.length > 0 && !/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const parsed = Date.parse(trimmed);
      if (Number.isFinite(parsed)) {
        return new Date(parsed).toISOString();
      }
    }
  }
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

function normalizeHexDigest(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (s.startsWith('\\x') || s.startsWith('0x')) s = s.slice(2);
  if (!s) return null;
  return s.toLowerCase();
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function normalizeGraphqlAgentLookupId(agentId: string | number | bigint): string {
  if (typeof agentId === 'bigint') {
    if (agentId < 0n) {
      throw new IndexerError(
        'agentId must be a non-negative integer or non-empty string',
        IndexerErrorCode.INVALID_RESPONSE
      );
    }
    return agentId.toString();
  }

  if (typeof agentId === 'number') {
    if (!Number.isFinite(agentId) || !Number.isInteger(agentId) || agentId < 0) {
      throw new IndexerError(
        'agentId must be a non-negative integer or non-empty string',
        IndexerErrorCode.INVALID_RESPONSE
      );
    }
    return Math.trunc(agentId).toString();
  }

  const normalized = String(agentId).trim();
  if (!normalized) {
    throw new IndexerError(
      'agentId must be a non-empty string or non-negative integer',
      IndexerErrorCode.INVALID_RESPONSE
    );
  }

  if (normalized.startsWith('sol:')) {
    const stripped = normalized.slice(4).trim();
    if (stripped) return stripped;
  }

  return normalized;
}

function toSafeGraphqlAgentIdNumber(agentId: string): number | null {
  if (!/^\d+$/.test(agentId)) return null;
  try {
    const parsed = BigInt(agentId);
    if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(parsed);
  } catch {
    return null;
  }
}

function toGraphqlUnixSeconds(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return Math.trunc(value).toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (/^-?\d+$/.test(trimmed)) return trimmed;
    const millis = Date.parse(trimmed);
    if (!Number.isFinite(millis)) return undefined;
    return Math.floor(millis / 1000).toString();
  }
  if (value instanceof Date) {
    const millis = value.getTime();
    if (!Number.isFinite(millis)) return undefined;
    return Math.floor(millis / 1000).toString();
  }
  return undefined;
}

type AgentOrderField = 'createdAt' | 'updatedAt' | 'totalFeedback' | 'qualityScore' | 'trustTier';

function resolveAgentOrder(order?: string): { orderBy: AgentOrderField; orderDirection: 'asc' | 'desc' } {
  const resolved = order ?? 'created_at.desc';
  const orderDirection: 'asc' | 'desc' = resolved.endsWith('.asc') ? 'asc' : 'desc';
  const field = resolved.split('.')[0] ?? 'created_at';
  const normalized = field.toLowerCase();

  if (normalized === 'updated_at' || normalized === 'updatedat') {
    return { orderBy: 'updatedAt', orderDirection };
  }
  if (normalized === 'total_feedback' || normalized === 'totalfeedback') {
    return { orderBy: 'totalFeedback', orderDirection };
  }
  if (normalized === 'quality_score' || normalized === 'qualityscore') {
    return { orderBy: 'qualityScore', orderDirection };
  }
  if (normalized === 'trust_tier' || normalized === 'trusttier') {
    return { orderBy: 'trustTier', orderDirection };
  }
  if (normalized === 'agentid' || normalized === 'agent_id') {
    // Keep compatibility for callers that still pass agent_id ordering.
    // GraphQL ordering support is backend-specific, so normalize to createdAt.
    return { orderBy: 'createdAt', orderDirection };
  }
  return { orderBy: 'createdAt', orderDirection };
}

function agentId(asset: string): string {
  const normalized = asset.trim();
  if (normalized.startsWith('sol:')) {
    return normalized.slice(4);
  }
  return normalized;
}

function mapGqlAgent(agent: any, fallbackAsset = ''): IndexedAgent {
  const mappedAsset = agent?.solana?.assetPubkey ?? agent?.id ?? fallbackAsset;
  const mappedAgentId = agent?.agentid ?? agent?.agentId ?? agent?.globalId ?? agent?.global_id ?? null;
  return {
    agent_id: mappedAgentId,
    asset: mappedAsset,
    owner: agent?.owner ?? '',
    creator: agent?.creator ?? null,
    agent_uri: agent?.agentURI ?? null,
    agent_wallet: agent?.agentWallet ?? null,
    collection: agent?.solana?.collection ?? '',
    collection_pointer: agent?.collectionPointer ?? null,
    col_locked: Boolean(agent?.colLocked),
    parent_asset: agent?.parentAsset ?? null,
    parent_creator: agent?.parentCreator ?? null,
    parent_locked: Boolean(agent?.parentLocked),
    nft_name: null,
    atom_enabled: Boolean(agent?.solana?.atomEnabled),
    trust_tier: toNumberSafe(agent?.solana?.trustTier, 0),
    quality_score: toNumberSafe(agent?.solana?.qualityScore, 0),
    confidence: toNumberSafe(agent?.solana?.confidence, 0),
    risk_score: toNumberSafe(agent?.solana?.riskScore, 0),
    diversity_ratio: toNumberSafe(agent?.solana?.diversityRatio, 0),
    feedback_count: toNumberSafe(agent?.totalFeedback, 0),
    raw_avg_score: 0,
    sort_key: '0',
    block_slot: 0,
    tx_signature: '',
    created_at: toIsoFromUnixSeconds(agent?.createdAt),
    updated_at: toIsoFromUnixSeconds(agent?.updatedAt),
  };
}

function mapGqlCollectionPointer(row: any): CollectionPointerRecord {
  const collection = typeof row?.collection === 'string' ? row.collection : row?.col;
  const col = typeof row?.col === 'string' ? row.col : collection;
  const metadataUpdatedAt = row?.metadataUpdatedAt ?? row?.metadata_updated_at;
  return {
    collection: collection ?? col ?? '',
    col: col ?? collection ?? '',
    creator: row?.creator ?? '',
    first_seen_asset: row?.firstSeenAsset ?? row?.first_seen_asset ?? '',
    first_seen_at: toIsoFromUnixSeconds(row?.firstSeenAt ?? row?.first_seen_at),
    first_seen_slot: String(row?.firstSeenSlot ?? row?.first_seen_slot ?? '0'),
    first_seen_tx_signature: row?.firstSeenTxSignature ?? row?.first_seen_tx_signature ?? null,
    last_seen_at: toIsoFromUnixSeconds(row?.lastSeenAt ?? row?.last_seen_at),
    last_seen_slot: String(row?.lastSeenSlot ?? row?.last_seen_slot ?? '0'),
    last_seen_tx_signature: row?.lastSeenTxSignature ?? row?.last_seen_tx_signature ?? null,
    asset_count: String(row?.assetCount ?? row?.asset_count ?? '0'),
    version: row?.version ?? null,
    name: row?.name ?? null,
    symbol: row?.symbol ?? null,
    description: row?.description ?? null,
    image: row?.image ?? null,
    banner_image: row?.bannerImage ?? row?.banner_image ?? null,
    social_website: row?.socialWebsite ?? row?.social_website ?? null,
    social_x: row?.socialX ?? row?.social_x ?? null,
    social_discord: row?.socialDiscord ?? row?.social_discord ?? null,
    metadata_status: row?.metadataStatus ?? row?.metadata_status ?? null,
    metadata_hash: row?.metadataHash ?? row?.metadata_hash ?? null,
    metadata_bytes: row?.metadataBytes ?? row?.metadata_bytes ?? null,
    metadata_updated_at:
      metadataUpdatedAt !== undefined && metadataUpdatedAt !== null
        ? toIsoFromUnixSeconds(metadataUpdatedAt)
        : null,
  };
}

function buildAgentWhere(options?: AgentQueryOptions): Record<string, unknown> {
  if (!options) return {};
  const where: Record<string, unknown> = {};
  if (options.owner) where.owner = options.owner;
  if (options.creator) where.creator = options.creator;
  if (options.collection) where.collection = options.collection;
  if (options.collectionPointer) where.collectionPointer = options.collectionPointer;
  if (options.wallet) where.agentWallet = options.wallet;
  if (options.parentAsset) where.parentAsset = options.parentAsset;
  if (options.parentCreator) where.parentCreator = options.parentCreator;
  if (options.colLocked !== undefined) where.colLocked = options.colLocked;
  if (options.parentLocked !== undefined) where.parentLocked = options.parentLocked;
  const updatedAt = toGraphqlUnixSeconds(options.updatedAt);
  const updatedAtGt = toGraphqlUnixSeconds(options.updatedAtGt);
  const updatedAtLt = toGraphqlUnixSeconds(options.updatedAtLt);

  if (updatedAt !== undefined) {
    try {
      const exact = BigInt(updatedAt);
      where.updatedAt_gt = (exact - 1n).toString();
      where.updatedAt_lt = (exact + 1n).toString();
    } catch {
      // Ignore invalid numeric coercion and let explicit gt/lt (if any) drive the filter.
    }
  }
  if (updatedAtGt !== undefined) where.updatedAt_gt = updatedAtGt;
  if (updatedAtLt !== undefined) where.updatedAt_lt = updatedAtLt;

  return where;
}

function feedbackId(asset: string, client: string, index: number | bigint): string {
  return `${asset}:${client}:${index.toString()}`;
}

function decodeFeedbackId(id: string): { asset: string; client: string; index: string } | null {
  const parts = id.split(':');
  if (parts.length === 3) {
    const [asset, client, index] = parts;
    if (asset === 'sol') return null;
    if (!asset || !client || !index) return null;
    return { asset, client, index };
  }
  if (parts.length === 4 && parts[0] === 'sol') {
    const [, asset, client, index] = parts;
    if (!asset || !client || !index) return null;
    return { asset, client, index };
  }
  return null;
}

function decodeValidationId(id: string): { asset: string; validator: string; nonce: string } | null {
  const parts = id.split(':');
  if (parts.length !== 4 || parts[0] !== 'sol') return null;
  const [, asset, validator, nonce] = parts;
  if (!asset || !validator || !nonce) return null;
  return { asset, validator, nonce };
}

function resolveFeedbackAsset(row: any, fallbackAsset = ''): string {
  if (typeof row?.id === 'string') {
    const decoded = decodeFeedbackId(row.id);
    if (decoded?.asset) return decoded.asset;
  }

  const directAgent = row?.agent;
  if (typeof directAgent === 'string' && directAgent.length > 0) {
    return directAgent;
  }
  if (typeof directAgent?.id === 'string' && directAgent.id.length > 0) {
    return directAgent.id;
  }
  if (typeof row?.asset === 'string' && row.asset.length > 0) {
    return row.asset;
  }
  return fallbackAsset;
}

function mapGqlFeedback(row: any, fallbackAsset = ''): IndexedFeedback {
  return {
    id: row.id,
    asset: resolveFeedbackAsset(row, fallbackAsset),
    client_address: row.clientAddress,
    feedback_index: toNumberSafe(row.feedbackIndex, 0),
    value: row?.solana?.valueRaw ?? '0',
    value_decimals: toNumberSafe(row?.solana?.valueDecimals, 0),
    score: row?.solana?.score ?? null,
    tag1: row.tag1 ?? '',
    tag2: row.tag2 ?? '',
    endpoint: row.endpoint ?? null,
    feedback_uri: row.feedbackURI ?? null,
    running_digest: null,
    feedback_hash: row.feedbackHash ?? null,
    is_revoked: Boolean(row.isRevoked),
    revoked_at: row.revokedAt ? toIsoFromUnixSeconds(row.revokedAt) : null,
    block_slot: toNumberSafe(row?.solana?.blockSlot, 0),
    tx_signature: row?.solana?.txSignature ?? '',
    created_at: toIsoFromUnixSeconds(row.createdAt),
  };
}

function mapGqlFeedbackResponse(
  row: any,
  asset: string,
  client: string,
  feedbackIndex: number | bigint
): IndexedFeedbackResponse {
  return {
    id: row.id,
    asset,
    client_address: client,
    feedback_index: toNumberSafe(feedbackIndex, 0),
    responder: row.responder,
    response_uri: row.responseUri ?? null,
    response_hash: row.responseHash ?? null,
    running_digest: null,
    block_slot: toNumberSafe(row?.solana?.blockSlot, 0),
    tx_signature: row?.solana?.txSignature ?? '',
    created_at: toIsoFromUnixSeconds(row.createdAt),
  };
}

function mapValidationStatus(status: unknown): 'PENDING' | 'RESPONDED' {
  if (status === 'PENDING') return 'PENDING';
  // GraphQL uses COMPLETED; legacy SDK uses RESPONDED.
  return 'RESPONDED';
}

type GqlHashChainHead = { digest: string | null; count: string };
type GqlHashChainHeads = {
  feedback: GqlHashChainHead;
  response: GqlHashChainHead;
  revoke: GqlHashChainHead;
};

type GqlHashChainCheckpoint = { eventCount: string; digest: string; createdAt: string };
type GqlHashChainCheckpointSet = {
  feedback: GqlHashChainCheckpoint | null;
  response: GqlHashChainCheckpoint | null;
  revoke: GqlHashChainCheckpoint | null;
};

type GqlHashChainReplayEvent = {
  asset: string;
  client: string;
  feedbackIndex: string;
  slot: string;
  runningDigest: string | null;
  feedbackHash: string | null;
  responder?: string | null;
  responseHash?: string | null;
  responseCount?: string | null;
  revokeCount?: string | null;
};

type GqlHashChainReplayPage = {
  events: GqlHashChainReplayEvent[];
  hasMore: boolean;
  nextFromCount: string;
};

export class IndexerGraphQLClient implements IndexerReadClient {
  private readonly graphqlUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly hashChainHeadsInFlight = new Map<string, Promise<GqlHashChainHeads>>();

  constructor(config: IndexerGraphQLClientConfig) {
    this.graphqlUrl = config.graphqlUrl.replace(/\/$/, '');
    this.headers = config.headers ?? {};
    this.timeout = config.timeout ?? 10000;
    this.retries = config.retries ?? 2;
  }

  getBaseUrl(): string {
    return this.graphqlUrl;
  }

  private shouldUseLegacyCollectionRead(error: unknown): boolean {
    if (!(error instanceof IndexerError)) return false;
    if (error.code !== IndexerErrorCode.INVALID_RESPONSE) return false;
    const msg = error.message;
    return (
      /Cannot query field ['"]collections['"] on type ['"]Query['"]/.test(msg)
      || /Unknown argument ['"]collection['"] on field ['"]Query\.collectionAssetCount['"]/.test(msg)
      || /Unknown argument ['"]collection['"] on field ['"]Query\.collectionAssets['"]/.test(msg)
    );
  }

  private shouldFallbackAgentIdField(error: unknown, field: AgentIdFieldName): boolean {
    if (!(error instanceof IndexerError)) return false;
    if (error.code !== IndexerErrorCode.INVALID_RESPONSE) return false;
    const msg = error.message;
    return (
      new RegExp(`Cannot query field ['"]${field}['"] on type ['"]Agent['"]`).test(msg)
      || new RegExp(`Cannot query field ['"]${field}['"] on type ['"]AgentFilter['"]`).test(msg)
      || new RegExp(`Field ['"]${field}['"] is not defined by type ['"]AgentFilter['"]`).test(msg)
      || new RegExp(`Unknown argument ['"]${field}['"]`).test(msg)
      || new RegExp(`Unknown field ['"]${field}['"]`).test(msg)
    );
  }

  private shouldFallbackAgentIdVariableType(error: unknown, variableType: AgentIdVariableType): boolean {
    if (!(error instanceof IndexerError)) return false;
    if (error.code !== IndexerErrorCode.INVALID_RESPONSE) return false;
    const msg = error.message;
    if (variableType === 'String') {
      return (
        /type ['"]String!?['"] used in position expecting type ['"]BigInt!?['"]/i.test(msg)
        || /Expected type ['"]BigInt!?['"]/i.test(msg)
        || /expecting type ['"]BigInt!?['"]/i.test(msg)
      );
    }
    return false;
  }

  private shouldRetryBigIntAgentIdAsNumber(error: unknown): boolean {
    if (!(error instanceof IndexerError)) return false;
    if (error.code !== IndexerErrorCode.INVALID_RESPONSE) return false;
    const msg = error.message;
    return (
      /BigInt cannot represent non-integer value/i.test(msg)
      || /Expected value of type ['"]BigInt!?['"], found ['"][^'"]+['"]/i.test(msg)
      || /Expected type ['"]BigInt!?['"], found ['"][^'"]+['"]/i.test(msg)
    );
  }

  private async requestAgentBySequentialIdField(
    agentIdField: AgentIdFieldName,
    normalizedAgentId: string
  ): Promise<any | null> {
    const requestByType = async (
      variableType: AgentIdVariableType,
      variableValue: string | number
    ): Promise<any | null> => {
      const data = await this.request<{ agents: any[] }>(
        `query($agentId: ${variableType}!) {
          agents(first: 1, where: { ${agentIdField}: $agentId }) {
            id
            owner
            creator
            agentURI
            agentWallet
            collectionPointer
            colLocked
            parentAsset
            parentCreator
            parentLocked
            createdAt
            updatedAt
            totalFeedback
            solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
          }
        }`,
        { agentId: variableValue }
      );
      return data.agents[0] ?? null;
    };

    try {
      return await requestByType('String', normalizedAgentId);
    } catch (error) {
      if (!this.shouldFallbackAgentIdVariableType(error, 'String')) {
        throw error;
      }
    }

    try {
      return await requestByType('BigInt', normalizedAgentId);
    } catch (error) {
      const safeNumericAgentId = toSafeGraphqlAgentIdNumber(normalizedAgentId);
      if (safeNumericAgentId !== null && this.shouldRetryBigIntAgentIdAsNumber(error)) {
        return requestByType('BigInt', safeNumericAgentId);
      }
      throw error;
    }
  }

  private async requestWithAgentIdField<T>(
    requester: (agentIdField: AgentIdFieldName | null) => Promise<T>
  ): Promise<T> {
    try {
      return await requester('agentId');
    } catch (error) {
      if (!this.shouldFallbackAgentIdField(error, 'agentId')) {
        throw error;
      }
    }

    try {
      return await requester('agentid');
    } catch (error) {
      if (!this.shouldFallbackAgentIdField(error, 'agentid')) {
        throw error;
      }
    }

    return requester(null);
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

  private loadHashChainHeads(asset: string): Promise<GqlHashChainHeads> {
    const key = asset;
    const existing = this.hashChainHeadsInFlight.get(key);
    if (existing) return existing;

    const pending = this.request<{ hashChainHeads: GqlHashChainHeads }>(
      `query($agent: ID!) {
        hashChainHeads(agent: $agent) {
          feedback { digest count }
          response { digest count }
          revoke { digest count }
        }
      }`,
      { agent: agentId(asset) }
    )
      .then((d) => d.hashChainHeads)
      .finally(() => {
        this.hashChainHeadsInFlight.delete(key);
      });

    this.hashChainHeadsInFlight.set(key, pending);
    return pending;
  }

  // ============================================================================
  // Agents
  // ============================================================================

  async getAgent(asset: string): Promise<IndexedAgent | null> {
    const normalizedAsset = agentId(asset);
    const data = await this.requestWithAgentIdField<{ agent: any | null }>(
      (agentIdField) => {
        const agentIdSelection = agentIdField ? `\n          ${agentIdField}` : '';
        return this.request<{
          agent: any | null;
        }>(
          `query($id: ID!) {
            agent(id: $id) {
              id${agentIdSelection}
              owner
              creator
              agentURI
              agentWallet
              collectionPointer
              colLocked
              parentAsset
              parentCreator
              parentLocked
              createdAt
              updatedAt
              totalFeedback
              solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
            }
          }`,
          { id: normalizedAsset }
        );
      }
    );

    if (!data.agent) return null;
    return mapGqlAgent(data.agent, normalizedAsset);
  }

  async getAgentByAgentId(agentId: string | number | bigint): Promise<IndexedAgent | null> {
    const normalizedAgentId = normalizeGraphqlAgentLookupId(agentId);

    const agent = await this.requestWithAgentIdField<any | null>(
      async (agentIdField) => {
        if (agentIdField === null) {
          const legacy = await this.request<{ agent: any | null }>(
            `query($id: ID!) {
              agent(id: $id) {
                id
                owner
                creator
                agentURI
                agentWallet
                collectionPointer
                colLocked
                parentAsset
                parentCreator
                parentLocked
                createdAt
                updatedAt
                totalFeedback
                solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
              }
            }`,
            { id: normalizedAgentId }
          );
          return legacy.agent;
        }

        return this.requestAgentBySequentialIdField(agentIdField, normalizedAgentId);
      }
    );

    if (!agent) return null;
    const mapped = mapGqlAgent(agent, normalizedAgentId);
    mapped.agent_id = normalizedAgentId;
    return mapped;
  }

  /** @deprecated Use getAgentByAgentId(agentId) */
  async getAgentByIndexerId(agentId: string | number | bigint): Promise<IndexedAgent | null> {
    return this.getAgentByAgentId(agentId);
  }

  async getAgents(options?: AgentQueryOptions): Promise<IndexedAgent[]> {
    const limit = clampInt(options?.limit ?? 100, 0, 500);
    const offset = clampInt(options?.offset ?? 0, 0, 1_000_000);

    const { orderBy, orderDirection } = resolveAgentOrder(options?.order);
    const where = buildAgentWhere(options);

    const data = await this.requestWithAgentIdField<{ agents: any[] }>(
      (agentIdField) => {
        const agentIdSelection = agentIdField ? `\n          ${agentIdField}` : '';
        return this.request<{
          agents: any[];
        }>(
          `query($orderBy: AgentOrderBy!, $dir: OrderDirection!, $where: AgentFilter) {
            agents(first: ${limit}, skip: ${offset}, where: $where, orderBy: $orderBy, orderDirection: $dir) {
              id${agentIdSelection}
              owner
              creator
              agentURI
              agentWallet
              collectionPointer
              colLocked
              parentAsset
              parentCreator
              parentLocked
              createdAt
              updatedAt
              totalFeedback
              solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
            }
          }`,
          {
            orderBy,
            dir: orderDirection,
            where: Object.keys(where).length ? where : null,
          }
        );
      }
    );

    return data.agents.map((a) => mapGqlAgent(a));
  }

  async getAgentsByOwner(owner: string): Promise<IndexedAgent[]> {
    return this.getAgents({
      owner,
      limit: 250,
      order: 'created_at.desc',
    });
  }

  async getAgentsByCollection(collection: string): Promise<IndexedAgent[]> {
    return this.getAgents({
      collection,
      limit: 250,
      order: 'created_at.desc',
    });
  }

  async getAgentByWallet(wallet: string): Promise<IndexedAgent | null> {
    const agents = await this.getAgents({
      wallet,
      limit: 1,
      order: 'created_at.desc',
    });
    return agents[0] ?? null;
  }

  async getLeaderboard(options?: {
    collection?: string;
    minTier?: number;
    limit?: number;
    cursorSortKey?: string;
  }): Promise<IndexedAgent[]> {
    if (options?.cursorSortKey) {
      throw new Error('GraphQL backend does not support cursorSortKey keyset pagination; use REST indexer client.');
    }

    const limit = clampInt(options?.limit ?? 50, 0, 200);
    const where: Record<string, unknown> = {};
    if (options?.collection) where.collection = options.collection;
    if (options?.minTier !== undefined) where.trustTier_gte = options.minTier;

    const data = await this.requestWithAgentIdField<{ agents: any[] }>(
      (agentIdField) => {
        const agentIdSelection = agentIdField ? `${agentIdField} ` : '';
        return this.request<{ agents: any[] }>(
          `query($where: AgentFilter) {
            agents(first: ${limit}, where: $where, orderBy: qualityScore, orderDirection: desc) {
              ${agentIdSelection}owner creator agentURI agentWallet collectionPointer colLocked parentAsset parentCreator parentLocked createdAt updatedAt totalFeedback
              solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
            }
          }`,
          { where: Object.keys(where).length ? where : null }
        );
      }
    );

    return data.agents.map((a) => mapGqlAgent(a));
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

  async getCollectionPointers(options?: CollectionPointerQueryOptions): Promise<CollectionPointerRecord[]> {
    const first = clampInt(options?.limit ?? 100, 0, 500);
    const skip = clampInt(options?.offset ?? 0, 0, 1_000_000);
    const collection = options?.collection ?? options?.col;
    try {
      const data = await this.request<{ collections: any[] }>(
        `query($first: Int!, $skip: Int!, $collection: String, $creator: String) {
          collections(first: $first, skip: $skip, collection: $collection, creator: $creator) {
            collection
            creator
            firstSeenAsset
            firstSeenAt
            firstSeenSlot
            firstSeenTxSignature
            lastSeenAt
            lastSeenSlot
            lastSeenTxSignature
            assetCount
            version
            name
            symbol
            description
            image
            bannerImage
            socialWebsite
            socialX
            socialDiscord
            metadataStatus
            metadataHash
            metadataBytes
            metadataUpdatedAt
          }
        }`,
        {
          first,
          skip,
          collection: collection ?? null,
          creator: options?.creator ?? null,
        }
      );
      return data.collections.map((p) => mapGqlCollectionPointer(p));
    } catch (error) {
      if (!this.shouldUseLegacyCollectionRead(error)) {
        throw error;
      }

      const data = await this.request<{ collectionPointers: any[] }>(
        `query($first: Int!, $skip: Int!, $col: String, $creator: String) {
          collectionPointers(first: $first, skip: $skip, col: $col, creator: $creator) {
            col
            creator
            firstSeenAsset
            firstSeenAt
            firstSeenSlot
            firstSeenTxSignature
            lastSeenAt
            lastSeenSlot
            lastSeenTxSignature
            assetCount
          }
        }`,
        {
          first,
          skip,
          col: collection ?? null,
          creator: options?.creator ?? null,
        }
      );
      return data.collectionPointers.map((p) => mapGqlCollectionPointer(p));
    }
  }

  async getCollectionAssetCount(col: string, creator?: string): Promise<number> {
    try {
      const data = await this.request<{ collectionAssetCount: string | number }>(
        `query($collection: String!, $creator: String) {
          collectionAssetCount(collection: $collection, creator: $creator)
        }`,
        {
          collection: col,
          creator: creator ?? null,
        }
      );
      return toIntSafe(data.collectionAssetCount, 0);
    } catch (error) {
      if (!this.shouldUseLegacyCollectionRead(error)) {
        throw error;
      }

      const data = await this.request<{ collectionAssetCount: string | number }>(
        `query($col: String!, $creator: String) {
          collectionAssetCount(col: $col, creator: $creator)
        }`,
        {
          col,
          creator: creator ?? null,
        }
      );
      return toIntSafe(data.collectionAssetCount, 0);
    }
  }

  async getCollectionAssets(col: string, options?: CollectionAssetsQueryOptions): Promise<IndexedAgent[]> {
    const first = clampInt(options?.limit ?? 100, 0, 500);
    const skip = clampInt(options?.offset ?? 0, 0, 1_000_000);
    const order = options?.order ?? 'created_at.desc';
    const orderDirection = order.includes('.asc') ? 'asc' : 'desc';
    const orderBy = order.startsWith('updated_at')
      ? 'updatedAt'
      : order.startsWith('total_feedback')
        ? 'totalFeedback'
        : order.startsWith('quality_score')
          ? 'qualityScore'
          : order.startsWith('trust_tier')
            ? 'trustTier'
            : 'createdAt';

    return this.requestWithAgentIdField(async (agentIdField) => {
      const agentIdSelection = agentIdField ? `\n            ${agentIdField}` : '';
      try {
        const data = await this.request<{ collectionAssets: any[] }>(
          `query($collection: String!, $creator: String, $first: Int!, $skip: Int!, $orderBy: AgentOrderBy!, $dir: OrderDirection!) {
            collectionAssets(
              collection: $collection,
              creator: $creator,
              first: $first,
              skip: $skip,
              orderBy: $orderBy,
              orderDirection: $dir
            ) {
              id${agentIdSelection}
              owner
              creator
              agentURI
              agentWallet
              collectionPointer
              colLocked
              parentAsset
              parentCreator
              parentLocked
              createdAt
              updatedAt
              totalFeedback
              solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
            }
          }`,
          {
            collection: col,
            creator: options?.creator ?? null,
            first,
            skip,
            orderBy,
            dir: orderDirection,
          }
        );
        return data.collectionAssets.map((a) => mapGqlAgent(a));
      } catch (error) {
        if (!this.shouldUseLegacyCollectionRead(error)) {
          throw error;
        }

        const data = await this.request<{ collectionAssets: any[] }>(
          `query($col: String!, $creator: String, $first: Int!, $skip: Int!, $orderBy: AgentOrderBy!, $dir: OrderDirection!) {
            collectionAssets(
              col: $col,
              creator: $creator,
              first: $first,
              skip: $skip,
              orderBy: $orderBy,
              orderDirection: $dir
            ) {
              id${agentIdSelection}
              owner
              creator
              agentURI
              agentWallet
              collectionPointer
              colLocked
              parentAsset
              parentCreator
              parentLocked
              createdAt
              updatedAt
              totalFeedback
              solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
            }
          }`,
          {
            col,
            creator: options?.creator ?? null,
            first,
            skip,
            orderBy,
            dir: orderDirection,
          }
        );
        return data.collectionAssets.map((a) => mapGqlAgent(a));
      }
    });
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

    return data.feedbacks.map((f) => mapGqlFeedback(f, asset));
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
    return mapGqlFeedback(data.feedback, asset);
  }

  async getFeedbacksByClient(client: string): Promise<IndexedFeedback[]> {
    const data = await this.request<{ feedbacks: any[] }>(
      `query($client: String!) {
        feedbacks(first: 250, where: { clientAddress: $client }, orderBy: createdAt, orderDirection: desc) {
          id
          agent { id }
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

    return data.feedbacks.map((f) => mapGqlFeedback(f));
  }

  async getFeedbacksByTag(tag: string): Promise<IndexedFeedback[]> {
    // GraphQL filter doesn't support OR on tag1/tag2, so query both and merge.
    const [tag1, tag2] = await Promise.all([
      this.request<{ feedbacks: any[] }>(
        `query($tag: String!) {
          feedbacks(first: 250, where: { tag1: $tag }, orderBy: createdAt, orderDirection: desc) {
            id
            agent { id }
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
            agent { id }
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

    return Array.from(merged.values()).map((f) => mapGqlFeedback(f));
  }

  async getFeedbacksByEndpoint(endpoint: string): Promise<IndexedFeedback[]> {
    const data = await this.request<{ feedbacks: any[] }>(
      `query($endpoint: String!) {
        feedbacks(first: 250, where: { endpoint: $endpoint }, orderBy: createdAt, orderDirection: desc) {
          id
          agent { id }
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

    return data.feedbacks.map((f) => mapGqlFeedback(f));
  }

  async getAllFeedbacks(options?: { includeRevoked?: boolean; limit?: number }): Promise<IndexedFeedback[]> {
    const first = clampInt(options?.limit ?? 5000, 0, 5000);
    const where: Record<string, unknown> = {};
    if (!options?.includeRevoked) where.isRevoked = false;

    const data = await this.request<{ feedbacks: any[] }>(
      `query($where: FeedbackFilter) {
        feedbacks(first: ${first}, where: $where, orderBy: createdAt, orderDirection: desc) {
          id
          agent { id }
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

    return data.feedbacks.map((f) => mapGqlFeedback(f));
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

    return (data.feedbackResponses ?? []).map((r) =>
      mapGqlFeedbackResponse(r, asset, client, feedbackIndex)
    );
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
    throw new Error('GraphQL backend does not expose getAgentReputation');
  }

  // ============================================================================
  // Integrity (hash-chain)
  // ============================================================================

  async getLastFeedbackDigest(asset: string): Promise<{ digest: string | null; count: number }> {
    const heads = await this.loadHashChainHeads(asset);
    return {
      digest: normalizeHexDigest(heads.feedback.digest),
      count: toIntSafe(heads.feedback.count, 0),
    };
  }

  async getLastResponseDigest(asset: string): Promise<{ digest: string | null; count: number }> {
    const heads = await this.loadHashChainHeads(asset);
    return {
      digest: normalizeHexDigest(heads.response.digest),
      count: toIntSafe(heads.response.count, 0),
    };
  }

  async getLastRevokeDigest(asset: string): Promise<{ digest: string | null; count: number }> {
    const heads = await this.loadHashChainHeads(asset);
    return {
      digest: normalizeHexDigest(heads.revoke.digest),
      count: toIntSafe(heads.revoke.count, 0),
    };
  }

  async getLatestCheckpoints(asset: string): Promise<CheckpointSet> {
    const data = await this.request<{ hashChainLatestCheckpoints: GqlHashChainCheckpointSet }>(
      `query($agent: ID!) {
        hashChainLatestCheckpoints(agent: $agent) {
          feedback { eventCount digest createdAt }
          response { eventCount digest createdAt }
          revoke { eventCount digest createdAt }
        }
      }`,
      { agent: agentId(asset) }
    );

    const mapCp = (cp: GqlHashChainCheckpoint | null) => {
      if (!cp) return null;
      return {
        event_count: toIntSafe(cp.eventCount, 0),
        digest: normalizeHexDigest(cp.digest) ?? cp.digest,
        created_at: toIsoFromUnixSeconds(cp.createdAt),
      };
    };

    return {
      feedback: mapCp(data.hashChainLatestCheckpoints.feedback),
      response: mapCp(data.hashChainLatestCheckpoints.response),
      revoke: mapCp(data.hashChainLatestCheckpoints.revoke),
    };
  }

  async getReplayData(
    asset: string,
    chainType: 'feedback' | 'response' | 'revoke',
    fromCount: number = 0,
    toCount: number = 1000,
    limit: number = 1000,
  ): Promise<ReplayDataPage> {
    const first = clampInt(limit, 1, 1000);

    const data = await this.request<{ hashChainReplayData: GqlHashChainReplayPage }>(
      `query($agent: ID!, $chainType: HashChainType!, $fromCount: BigInt!, $toCount: BigInt, $first: Int!) {
        hashChainReplayData(
          agent: $agent,
          chainType: $chainType,
          fromCount: $fromCount,
          toCount: $toCount,
          first: $first
        ) {
          hasMore
          nextFromCount
          events {
            asset
            client
            feedbackIndex
            slot
            runningDigest
            feedbackHash
            responder
            responseHash
            responseCount
            revokeCount
          }
        }
      }`,
      {
        agent: agentId(asset),
        chainType: chainType.toUpperCase(),
        fromCount: String(fromCount),
        toCount: toCount != null ? String(toCount) : null,
        first,
      }
    );

    const page = data.hashChainReplayData;

    const events: ReplayEventData[] = page.events.map((e) => ({
      asset: e.asset,
      client: e.client,
      feedback_index: String(e.feedbackIndex),
      slot: toNumberSafe(e.slot, 0),
      running_digest: normalizeHexDigest(e.runningDigest) ?? null,
      feedback_hash: e.feedbackHash ?? null,
      responder: e.responder ?? undefined,
      response_hash: e.responseHash ?? null,
      response_count: e.responseCount != null ? toNumberSafe(e.responseCount, 0) : null,
      revoke_count: e.revokeCount != null ? toNumberSafe(e.revokeCount, 0) : null,
    }));

    return {
      events,
      hasMore: Boolean(page.hasMore),
      nextFromCount: toNumberSafe(page.nextFromCount, fromCount),
    };
  }

  async getFeedbacksAtIndices(
    asset: string,
    indices: number[]
  ): Promise<Map<number, IndexedFeedback | null>> {
    const result = new Map<number, IndexedFeedback | null>();
    if (indices.length === 0) return result;

    for (const idx of indices) {
      result.set(idx, null);
    }

    await Promise.all(indices.map(async (idx) => {
      const page = await this.getReplayData(asset, 'feedback', idx, idx + 1, 1);
      const e = page.events[0];
      if (!e) return;
      result.set(idx, {
        id: '',
        asset,
        client_address: e.client,
        feedback_index: toIntSafe(e.feedback_index, 0),
        value: '0',
        value_decimals: 0,
        score: null,
        tag1: null,
        tag2: null,
        endpoint: null,
        feedback_uri: null,
        running_digest: e.running_digest,
        feedback_hash: e.feedback_hash ?? null,
        is_revoked: false,
        revoked_at: null,
        block_slot: e.slot,
        tx_signature: '',
        created_at: new Date(0).toISOString(),
      });
    }));

    return result;
  }

  async getResponsesAtOffsets(
    asset: string,
    offsets: number[]
  ): Promise<Map<number, IndexedFeedbackResponse | null>> {
    const result = new Map<number, IndexedFeedbackResponse | null>();
    if (offsets.length === 0) return result;

    for (const offset of offsets) {
      result.set(offset, null);
    }

    await Promise.all(offsets.map(async (offset) => {
      const page = await this.getReplayData(asset, 'response', offset, offset + 1, 1);
      const e = page.events[0];
      if (!e) return;
      result.set(offset, {
        id: '',
        asset,
        client_address: e.client,
        feedback_index: toIntSafe(e.feedback_index, 0),
        responder: e.responder ?? '',
        response_uri: null,
        response_hash: e.response_hash ?? null,
        running_digest: e.running_digest,
        block_slot: e.slot,
        tx_signature: '',
        created_at: new Date(0).toISOString(),
      });
    }));

    return result;
  }

  async getRevocationsAtCounts(
    asset: string,
    revokeCounts: number[]
  ): Promise<Map<number, IndexedRevocation | null>> {
    const result = new Map<number, IndexedRevocation | null>();
    if (revokeCounts.length === 0) return result;

    for (const c of revokeCounts) {
      result.set(c, null);
    }

    await Promise.all(revokeCounts.map(async (c) => {
      if (!Number.isFinite(c) || c < 1) return;
      const idx = c - 1;
      const page = await this.getReplayData(asset, 'revoke', idx, idx + 1, 1);
      const e = page.events[0];
      if (!e) return;
      result.set(c, {
        id: '',
        asset,
        client_address: e.client,
        feedback_index: toIntSafe(e.feedback_index, 0),
        feedback_hash: e.feedback_hash ?? null,
        slot: e.slot,
        original_score: null,
        atom_enabled: false,
        had_impact: false,
        running_digest: e.running_digest,
        revoke_count: e.revoke_count ?? idx,
        tx_signature: '',
        created_at: new Date(0).toISOString(),
      });
    }));

    return result;
  }
}
