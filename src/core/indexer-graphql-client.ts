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
import { decodeCanonicalFeedbackId } from './indexer-client.js';

export interface IndexerGraphQLClientConfig {
  /** GraphQL endpoint(s) in priority order (e.g., https://host/v2/graphql) */
  graphqlUrl: string | string[];
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
const VALIDATION_ARCHIVED_ERROR =
  'Validation feature is archived (v0.5.0+) and is not exposed by indexers.';
const CID_V1_BASE32_PATTERN = /^b[a-z2-7]{20,}$/;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

function normalizeCollectionPointerForRead(pointer: string): string {
  const trimmed = pointer.trim();
  if (!trimmed) {
    throw new IndexerError('Collection pointer cannot be empty', IndexerErrorCode.INVALID_RESPONSE);
  }
  if (trimmed.startsWith('c1:')) return trimmed;
  if (CID_V1_BASE32_PATTERN.test(trimmed)) return `c1:${trimmed}`;
  return trimmed;
}

function normalizeSequentialIdForRead(
  value: string | number | bigint,
  fieldName: string,
): string {
  let parsed: bigint;
  if (typeof value === 'bigint') {
    parsed = value;
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new IndexerError(
        `${fieldName} must be an integer (use string/bigint for large values)`,
        IndexerErrorCode.INVALID_RESPONSE,
      );
    }
    parsed = BigInt(value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new IndexerError(`${fieldName} must be an integer`, IndexerErrorCode.INVALID_RESPONSE);
    }
    parsed = BigInt(trimmed);
  } else {
    throw new IndexerError(`${fieldName} must be an integer`, IndexerErrorCode.INVALID_RESPONSE);
  }

  if (parsed < 0n) {
    throw new IndexerError(`${fieldName} must be >= 0`, IndexerErrorCode.INVALID_RESPONSE);
  }
  return parsed.toString();
}

function normalizePositiveSequentialIdFromResponse(
  value: unknown,
  fieldName: string,
): string {
  let parsed: bigint;
  if (typeof value === 'bigint') {
    parsed = value;
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new IndexerError(`${fieldName} must be a positive integer string`, IndexerErrorCode.INVALID_RESPONSE);
    }
    parsed = BigInt(value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new IndexerError(`${fieldName} must be a positive integer string`, IndexerErrorCode.INVALID_RESPONSE);
    }
    parsed = BigInt(trimmed);
  } else {
    throw new IndexerError(`${fieldName} must be a positive integer string`, IndexerErrorCode.INVALID_RESPONSE);
  }

  if (parsed <= 0n) {
    throw new IndexerError(`${fieldName} must be a positive integer string`, IndexerErrorCode.INVALID_RESPONSE);
  }
  return parsed.toString();
}

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

function parseStrictInteger(value: unknown, fieldName: string): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new IndexerError(`${fieldName} must be an integer`, IndexerErrorCode.INVALID_RESPONSE);
    }
    if (!Number.isSafeInteger(value)) {
      throw new IndexerError(
        `${fieldName} exceeds JS safe integer range; use string-safe fields or REST fallback`,
        IndexerErrorCode.INVALID_RESPONSE,
      );
    }
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^-?\d+$/.test(trimmed)) {
      throw new IndexerError(`${fieldName} must be an integer`, IndexerErrorCode.INVALID_RESPONSE);
    }
    return BigInt(trimmed);
  }
  throw new IndexerError(`${fieldName} must be an integer`, IndexerErrorCode.INVALID_RESPONSE);
}

function toLosslessIntegerValue(
  value: unknown,
  fieldName: string,
  fallback: number | string = 0,
): number | string {
  const parsed = parseStrictInteger(value, fieldName);
  if (parsed === null) return fallback;
  if (parsed <= MAX_SAFE_INTEGER_BIGINT && parsed >= MIN_SAFE_INTEGER_BIGINT) {
    return Number(parsed);
  }
  return parsed.toString();
}

function toExactSafeInteger(value: unknown, fieldName: string, fallback = 0): number {
  const parsed = parseStrictInteger(value, fieldName);
  if (parsed === null) return fallback;
  if (parsed > MAX_SAFE_INTEGER_BIGINT || parsed < MIN_SAFE_INTEGER_BIGINT) {
    throw new IndexerError(
      `${fieldName} exceeds JS safe integer range; use REST fallback for exact values`,
      IndexerErrorCode.INVALID_RESPONSE,
    );
  }
  return Number(parsed);
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

function rot32(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function mix32(a0: number, b0: number, c0: number): [number, number, number] {
  let a = a0 >>> 0;
  let b = b0 >>> 0;
  let c = c0 >>> 0;
  a = (a - c) >>> 0; a = (a ^ rot32(c, 4)) >>> 0; c = (c + b) >>> 0;
  b = (b - a) >>> 0; b = (b ^ rot32(a, 6)) >>> 0; a = (a + c) >>> 0;
  c = (c - b) >>> 0; c = (c ^ rot32(b, 8)) >>> 0; b = (b + a) >>> 0;
  a = (a - c) >>> 0; a = (a ^ rot32(c, 16)) >>> 0; c = (c + b) >>> 0;
  b = (b - a) >>> 0; b = (b ^ rot32(a, 19)) >>> 0; a = (a + c) >>> 0;
  c = (c - b) >>> 0; c = (c ^ rot32(b, 4)) >>> 0; b = (b + a) >>> 0;
  return [a, b, c];
}

function final32(a0: number, b0: number, c0: number): [number, number, number] {
  let a = a0 >>> 0;
  let b = b0 >>> 0;
  let c = c0 >>> 0;
  c = (c ^ b) >>> 0; c = (c - rot32(b, 14)) >>> 0;
  a = (a ^ c) >>> 0; a = (a - rot32(c, 11)) >>> 0;
  b = (b ^ a) >>> 0; b = (b - rot32(a, 25)) >>> 0;
  c = (c ^ b) >>> 0; c = (c - rot32(b, 16)) >>> 0;
  a = (a ^ c) >>> 0; a = (a - rot32(c, 4)) >>> 0;
  b = (b ^ a) >>> 0; b = (b - rot32(a, 14)) >>> 0;
  c = (c ^ b) >>> 0; c = (c - rot32(b, 24)) >>> 0;
  return [a, b, c];
}

function pgHashBytes(input: Uint8Array): number {
  let len = input.length >>> 0;
  let a = (0x9e3779b9 + len + 3923095) >>> 0;
  let b = a;
  let c = a;
  let offset = 0;

  while (len >= 12) {
    a = (a + input[offset + 0] + (input[offset + 1] << 8) + (input[offset + 2] << 16) + (input[offset + 3] << 24)) >>> 0;
    b = (b + input[offset + 4] + (input[offset + 5] << 8) + (input[offset + 6] << 16) + (input[offset + 7] << 24)) >>> 0;
    c = (c + input[offset + 8] + (input[offset + 9] << 8) + (input[offset + 10] << 16) + (input[offset + 11] << 24)) >>> 0;
    [a, b, c] = mix32(a, b, c);
    offset += 12;
    len -= 12;
  }

  switch (len) {
    case 11:
      c = (c + (input[offset + 10] << 24)) >>> 0;
      // falls through
    case 10:
      c = (c + (input[offset + 9] << 16)) >>> 0;
      // falls through
    case 9:
      c = (c + (input[offset + 8] << 8)) >>> 0;
      // falls through
    case 8:
      b = (b + (input[offset + 7] << 24)) >>> 0;
      // falls through
    case 7:
      b = (b + (input[offset + 6] << 16)) >>> 0;
      // falls through
    case 6:
      b = (b + (input[offset + 5] << 8)) >>> 0;
      // falls through
    case 5:
      b = (b + input[offset + 4]) >>> 0;
      // falls through
    case 4:
      a = (a + (input[offset + 3] << 24)) >>> 0;
      // falls through
    case 3:
      a = (a + (input[offset + 2] << 16)) >>> 0;
      // falls through
    case 2:
      a = (a + (input[offset + 1] << 8)) >>> 0;
      // falls through
    case 1:
      a = (a + input[offset + 0]) >>> 0;
      // falls through
    default:
      break;
  }

  [, , c] = final32(a, b, c);
  return c >>> 0;
}

function pgHashtextTieBreaker(input: string): number {
  const signed = pgHashBytes(Buffer.from(input, 'utf8')) | 0;
  const abs = signed === -2147483648 ? 2147483648 : Math.abs(signed);
  return abs % 10_000_000;
}

function computeGraphqlSortKey(asset: string, agent: any): string {
  const trustTier = BigInt(toExactSafeInteger(agent?.solana?.trustTier, 'agent.solana.trustTier', 0));
  const qualityScore = BigInt(toExactSafeInteger(agent?.solana?.qualityScore, 'agent.solana.qualityScore', 0));
  const confidence = BigInt(toExactSafeInteger(agent?.solana?.confidence, 'agent.solana.confidence', 0));
  const tieBreaker = BigInt(pgHashtextTieBreaker(asset));
  return (
    trustTier * 1000200010000000n
    + qualityScore * 100010000000n
    + confidence * 10000000n
    + tieBreaker
  ).toString();
}

function extractGraphqlNftName(agent: any): string | null {
  if (typeof agent?.nftName === 'string') return agent.nftName.length > 0 ? agent.nftName : null;
  const metadata = Array.isArray(agent?.metadata) ? agent.metadata : [];
  for (const entry of metadata) {
    const key = typeof entry?.key === 'string' ? entry.key.toLowerCase() : '';
    if ((key === 'name' || key === 'nft_name') && typeof entry?.value === 'string') {
      return entry.value.length > 0 ? entry.value : null;
    }
  }
  return null;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return value ?? null;
  return value.length > 0 ? value : null;
}

function deriveReadyUrlFromGraphqlEndpoint(endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    let pathname = url.pathname.replace(/\/+$/, '');
    if (pathname.endsWith('/v2/graphql')) {
      pathname = pathname.slice(0, -'/v2/graphql'.length);
    } else if (pathname.endsWith('/graphql')) {
      pathname = pathname.slice(0, -'/graphql'.length);
    }
    url.pathname = `${pathname || ''}/ready`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function resolveGraphqlFeedbackCount(agent: any): number {
  if (agent?.totalFeedback !== undefined && agent?.totalFeedback !== null) {
    return toExactSafeInteger(agent.totalFeedback, 'agent.totalFeedback', 0);
  }
  if (agent?.stats?.totalFeedback !== undefined && agent?.stats?.totalFeedback !== null) {
    return toExactSafeInteger(agent.stats.totalFeedback, 'agent.stats.totalFeedback', 0);
  }
  return 0;
}

function detailedAgentSelection(agentIdSelection: string): string {
  return `id${agentIdSelection}
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
              metadata { key value }
              stats { totalFeedback }
              solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }`;
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
    nft_name: extractGraphqlNftName(agent),
    atom_enabled: Boolean(agent?.solana?.atomEnabled),
    trust_tier: toExactSafeInteger(agent?.solana?.trustTier, 'agent.solana.trustTier', 0),
    quality_score: toExactSafeInteger(agent?.solana?.qualityScore, 'agent.solana.qualityScore', 0),
    confidence: toExactSafeInteger(agent?.solana?.confidence, 'agent.solana.confidence', 0),
    risk_score: toExactSafeInteger(agent?.solana?.riskScore, 'agent.solana.riskScore', 0),
    diversity_ratio: toExactSafeInteger(agent?.solana?.diversityRatio, 'agent.solana.diversityRatio', 0),
    feedback_count: resolveGraphqlFeedbackCount(agent),
    raw_avg_score: 0,
    sort_key: computeGraphqlSortKey(mappedAsset, agent),
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
  const collectionId = row?.collectionId ?? row?.collection_id;
  return {
    collection_id:
      collectionId !== undefined && collectionId !== null
        ? normalizePositiveSequentialIdFromResponse(collectionId, 'collection_id')
        : null,
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
    feedback_index: toLosslessIntegerValue(row.feedbackIndex, 'feedbackIndex', 0),
    value: row?.solana?.valueRaw ?? '0',
    value_decimals: toNumberSafe(row?.solana?.valueDecimals, 0),
    score: row?.solana?.score ?? null,
    tag1: row.tag1 ?? null,
    tag2: row.tag2 ?? null,
    endpoint: row.endpoint ?? null,
    feedback_uri: row.feedbackURI ?? null,
    running_digest: normalizeHexDigest(row?.solana?.runningDigest),
    feedback_hash: normalizeHexDigest(row.feedbackHash),
    proof_pass_auth: row?.solana?.proofPassAuth ?? false,
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
    feedback_index: toLosslessIntegerValue(feedbackIndex, 'feedbackIndex', 0),
    responder: row.responder,
    response_uri: row.responseUri ?? null,
    response_hash: normalizeHexDigest(row.responseHash),
    running_digest: normalizeHexDigest(row?.solana?.runningDigest),
    response_count: row?.solana?.responseCount != null
      ? toLosslessIntegerValue(row.solana.responseCount, 'responseCount', 0)
      : null,
    block_slot: toNumberSafe(row?.solana?.blockSlot, 0),
    tx_signature: row?.solana?.txSignature ?? '',
    created_at: toIsoFromUnixSeconds(row.createdAt),
  };
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
  private readonly graphqlUrls: string[];
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly hashChainHeadsInFlight = new Map<string, Promise<GqlHashChainHeads>>();

  constructor(config: IndexerGraphQLClientConfig) {
    this.graphqlUrls = (Array.isArray(config.graphqlUrl) ? config.graphqlUrl : [config.graphqlUrl])
      .map((url) => url.trim().replace(/\/$/, ''))
      .filter((url, index, list) => url.length > 0 && list.indexOf(url) === index);
    if (this.graphqlUrls.length === 0) {
      throw new IndexerError('At least one GraphQL URL is required', IndexerErrorCode.INVALID_RESPONSE);
    }
    this.graphqlUrl = this.graphqlUrls[0];
    this.headers = config.headers ?? {};
    this.timeout = config.timeout ?? 10000;
    this.retries = config.retries ?? 2;
  }

  getBaseUrl(): string {
    return this.graphqlUrl;
  }

  private shouldFallbackEndpoint(error: unknown): boolean {
    if (error instanceof IndexerRateLimitError) return true;
    if (error instanceof IndexerTimeoutError) return true;
    if (error instanceof IndexerUnavailableError) return true;
    if (error instanceof IndexerError && error.code === IndexerErrorCode.SERVER_ERROR) return true;
    return false;
  }

  private async requestAgainstEndpoint<TData>(
    endpoint: string,
    query: string,
    variables?: Record<string, unknown>
  ): Promise<TData> {
    let lastError: Error | null = null;
    let currentQuery = query;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...this.headers,
          },
          body: JSON.stringify({ query: currentQuery, variables }),
          signal: controller.signal,
          redirect: 'error',
        });

        if (!response.ok) {
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

          if (attempt < this.retries && response.status >= 500) {
            await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
            continue;
          }

          throw new IndexerError(
            `GraphQL request failed: HTTP ${response.status}${details ? ` (${details})` : ''}`,
            response.status >= 500 ? IndexerErrorCode.SERVER_ERROR : IndexerErrorCode.INVALID_RESPONSE
          );
        }

        const json = (await response.json()) as { data?: TData; errors?: GraphQLErrorShape[] };

        if (json.errors && json.errors.length > 0) {
          const msg = json.errors.map(e => e?.message).filter(Boolean).join('; ') || 'GraphQL error';
          if (this.shouldFallbackUnsupportedProofPassAuth(msg)) {
            const fallbackQuery = this.stripUnsupportedProofPassAuthSelections(currentQuery);
            if (fallbackQuery !== currentQuery) {
              currentQuery = fallbackQuery;
              continue;
            }
          }
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
          if (err instanceof TypeError) {
            lastError = new IndexerUnavailableError(err.message);
          }
        }

        if (attempt < this.retries && this.shouldFallbackEndpoint(lastError)) {
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
          continue;
        }

        throw lastError instanceof IndexerError ? lastError : new IndexerUnavailableError(lastError.message);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError instanceof IndexerError
      ? lastError
      : new IndexerUnavailableError(lastError?.message ?? 'GraphQL request failed');
  }

  private shouldUseLegacyCollectionRead(error: unknown): boolean {
    if (!(error instanceof IndexerError)) return false;
    if (error.code !== IndexerErrorCode.INVALID_RESPONSE) return false;
    const msg = error.message;
    return (
      /Cannot query field ['"]collections['"] on type ['"]Query['"]/.test(msg)
      || /Unknown argument ['"]collection['"] on field ['"]Query\.collectionAssetCount['"]/.test(msg)
      || /Unknown argument ['"]collection['"] on field ['"]Query\.collectionAssets['"]/.test(msg)
      || /Unknown argument ['"]creator['"] on field ['"]Query\.collections['"]/.test(msg)
      || /Unknown argument ['"]creator['"] on field ['"]Query\.collectionAssetCount['"]/.test(msg)
      || /Unknown argument ['"]creator['"] on field ['"]Query\.collectionAssets['"]/.test(msg)
    );
  }

  private shouldFallbackUnsupportedProofPassAuth(error: unknown): boolean {
    if (typeof error !== 'string') return false;
    return /Cannot query field ['"]proofPassAuth['"] on type ['"]SolanaFeedbackExtension['"]/.test(error);
  }

  private stripUnsupportedProofPassAuthSelections(query: string): string {
    return query.replace(/\s+proofPassAuth\b/g, '');
  }

  private shouldFallbackGlobalStatsExtendedFields(error: unknown): boolean {
    if (!(error instanceof IndexerError)) return false;
    if (error.code !== IndexerErrorCode.INVALID_RESPONSE) return false;
    const msg = error.message;
    return (
      /Cannot query field ['"]platinumAgents['"] on type ['"]GlobalStats['"]/.test(msg)
      || /Cannot query field ['"]goldAgents['"] on type ['"]GlobalStats['"]/.test(msg)
      || /Cannot query field ['"]avgQuality['"] on type ['"]GlobalStats['"]/.test(msg)
    );
  }

  private async resolveCollectionCreatorScope(
    normalizedCollection: string,
    creator: string | undefined,
    methodName: 'getCollectionAssetCount' | 'getCollectionAssets',
  ): Promise<string> {
    const direct = creator?.trim();
    if (direct) return direct;

    const pointers = await this.getCollectionPointers({
      collection: normalizedCollection,
      col: normalizedCollection,
      limit: 2,
      offset: 0,
    });
    const uniqueCreators = Array.from(
      new Set(
        pointers
          .map((p) => p.creator?.trim())
          .filter((v): v is string => !!v),
      ),
    );

    if (uniqueCreators.length === 1) {
      return uniqueCreators[0];
    }

    if (uniqueCreators.length > 1) {
      throw new IndexerError(
        `${methodName} requires creator (scope is creator+collection): multiple creators found for ${normalizedCollection}.`,
        IndexerErrorCode.INVALID_RESPONSE,
      );
    }

    throw new IndexerError(
      `${methodName} requires creator (scope is creator+collection).`,
      IndexerErrorCode.INVALID_RESPONSE,
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
            ${detailedAgentSelection('')}
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

    for (const endpoint of this.graphqlUrls) {
      try {
        return await this.requestAgainstEndpoint(endpoint, query, variables);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (!this.shouldFallbackEndpoint(lastError)) {
          throw lastError instanceof IndexerError ? lastError : new IndexerUnavailableError(lastError.message);
        }
      }
    }

    throw lastError ?? new IndexerUnavailableError();
  }

  async isAvailable(): Promise<boolean> {
    for (const endpoint of this.graphqlUrls) {
      const readyUrl = deriveReadyUrlFromGraphqlEndpoint(endpoint);
      if (readyUrl) {
        try {
          const response = await fetch(readyUrl, { headers: this.headers, redirect: 'error' });
          if (response.ok || response.status === 503) {
            let payload: any = null;
            try {
              payload = await response.json();
            } catch {
              payload = null;
            }
            if (payload?.status === 'ready') {
              return true;
            }
            continue;
          }
        } catch {
          // Fall through to the legacy GraphQL availability probe for this endpoint.
        }
      }

      try {
        await this.requestAgainstEndpoint<{ __typename: string }>(endpoint, 'query { __typename }');
        return true;
      } catch {
        // Try next configured endpoint.
      }
    }
    return false;
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
              ${detailedAgentSelection(agentIdSelection)}
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

    let agent: any | null;

    try {
      agent = await this.requestAgentBySequentialIdField('agentId', normalizedAgentId);
    } catch (error) {
      if (!this.shouldFallbackAgentIdField(error, 'agentId')) {
        throw error;
      }

      try {
        agent = await this.requestAgentBySequentialIdField('agentid', normalizedAgentId);
      } catch (fallbackError) {
        if (!this.shouldFallbackAgentIdField(fallbackError, 'agentid')) {
          throw fallbackError;
        }
        return null;
      }
    }

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
    const data = await this.requestWithAgentIdField<{ agents: any[] }>(
      (agentIdField) => {
        const agentIdSelection = agentIdField ? `\n          ${agentIdField}` : '';
        return this.request<{ agents: any[] }>(
          `query($wallet: String!) {
            agents(first: 1, skip: 0, where: { agentWallet: $wallet }, orderBy: createdAt, orderDirection: desc) {
              ${detailedAgentSelection(agentIdSelection)}
            }
          }`,
          { wallet }
        );
      }
    );
    return data.agents[0] ? mapGqlAgent(data.agents[0]) : null;
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
    const data = await this.request<{ leaderboard: any[] }>(
      `query($first: Int!, $collection: String) {
        leaderboard(first: $first, collection: $collection) {
          asset
          owner
          collection
          nftName
          agentUri
          trustTier
          qualityScore
          confidence
          riskScore
          diversityRatio
          feedbackCount
          sortKey
        }
      }`,
      {
        first: limit,
        collection: options?.collection ?? null,
      }
    );

    const rows = (data.leaderboard ?? []).filter((row) =>
      options?.minTier === undefined
        ? true
        : toNumberSafe(row?.trustTier, 0) >= options.minTier
    );

    return rows.map((row) => ({
      agent_id: null,
      asset: row?.asset ?? '',
      owner: row?.owner ?? '',
      creator: null,
      agent_uri: row?.agentUri ?? null,
      agent_wallet: null,
      collection: row?.collection ?? '',
      collection_pointer: null,
      col_locked: false,
      parent_asset: null,
      parent_creator: null,
      parent_locked: false,
      nft_name: normalizeNullableText(row?.nftName ?? null),
      atom_enabled: false,
      trust_tier: toExactSafeInteger(row?.trustTier, 'leaderboard.trustTier', 0),
      quality_score: toExactSafeInteger(row?.qualityScore, 'leaderboard.qualityScore', 0),
      confidence: toExactSafeInteger(row?.confidence, 'leaderboard.confidence', 0),
      risk_score: toExactSafeInteger(row?.riskScore, 'leaderboard.riskScore', 0),
      diversity_ratio: toExactSafeInteger(row?.diversityRatio, 'leaderboard.diversityRatio', 0),
      feedback_count: toExactSafeInteger(row?.feedbackCount, 'leaderboard.feedbackCount', 0),
      raw_avg_score: 0,
      sort_key: String(row?.sortKey ?? '0'),
      block_slot: 0,
      tx_signature: '',
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    }));
  }

  async getGlobalStats(): Promise<GlobalStats> {
    const mapStats = (stats: {
      totalAgents?: string | number | null;
      totalFeedback?: string | number | null;
      totalCollections?: string | number | null;
      platinumAgents?: string | number | null;
      goldAgents?: string | number | null;
      avgQuality?: string | number | null;
    } | null | undefined): GlobalStats => ({
      total_agents: toExactSafeInteger(stats?.totalAgents, 'globalStats.totalAgents', 0),
      total_collections: toExactSafeInteger(stats?.totalCollections, 'globalStats.totalCollections', 0),
      total_feedbacks: toExactSafeInteger(stats?.totalFeedback, 'globalStats.totalFeedback', 0),
      platinum_agents: toExactSafeInteger(stats?.platinumAgents, 'globalStats.platinumAgents', 0),
      gold_agents: toExactSafeInteger(stats?.goldAgents, 'globalStats.goldAgents', 0),
      avg_quality:
        stats?.avgQuality === null || stats?.avgQuality === undefined
          ? null
          : toNumberSafe(stats.avgQuality, 0),
    });

    try {
      const data = await this.request<{
        globalStats: {
          totalAgents?: string | number | null;
          totalFeedback?: string | number | null;
          totalCollections?: string | number | null;
          platinumAgents?: string | number | null;
          goldAgents?: string | number | null;
          avgQuality?: string | number | null;
          tags?: unknown[];
        } | null;
      }>(
        `query {
          globalStats { totalAgents totalFeedback totalCollections platinumAgents goldAgents avgQuality tags }
        }`
      );
      return mapStats(data.globalStats);
    } catch (error) {
      if (!this.shouldFallbackGlobalStatsExtendedFields(error)) {
        throw error;
      }
    }

    const legacyData = await this.request<{
      globalStats: {
        totalAgents?: string | number | null;
        totalFeedback?: string | number | null;
        totalCollections?: string | number | null;
        tags?: unknown[];
      } | null;
    }>(
      `query {
        globalStats { totalAgents totalFeedback totalCollections tags }
      }`
    );
    return mapStats(legacyData.globalStats);
  }

  async getCollectionPointers(options?: CollectionPointerQueryOptions): Promise<CollectionPointerRecord[]> {
    const first = clampInt(options?.limit ?? 100, 0, 500);
    const skip = clampInt(options?.offset ?? 0, 0, 1_000_000);
    const collectionId = options?.collectionId !== undefined
      ? normalizeSequentialIdForRead(options.collectionId, 'collectionId')
      : undefined;
    const includeCollectionId = collectionId !== undefined;
    const hasCollectionFilter = options?.collection !== undefined || options?.col !== undefined;
    const collection = hasCollectionFilter
      ? normalizeCollectionPointerForRead(options?.collection ?? options?.col ?? '')
      : undefined;
    try {
      const query = includeCollectionId
        ? `query($first: Int!, $skip: Int!, $collectionId: BigInt, $collection: String, $creator: String) {
          collections(first: $first, skip: $skip, collectionId: $collectionId, collection: $collection, creator: $creator) {
            collectionId
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
        }`
        : `query($first: Int!, $skip: Int!, $collection: String, $creator: String) {
          collections(first: $first, skip: $skip, collection: $collection, creator: $creator) {
            collectionId
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
        }`;
      const data = await this.request<{ collections: any[] }>(
        query,
        {
          first,
          skip,
          ...(includeCollectionId ? { collectionId } : {}),
          collection: collection ?? null,
          creator: options?.creator ?? null,
        }
      );
      return data.collections.map((p) => mapGqlCollectionPointer(p));
    } catch (error) {
      if (collectionId !== undefined) {
        throw error;
      }
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
    const normalizedCollection = normalizeCollectionPointerForRead(col);
    const creatorScope = await this.resolveCollectionCreatorScope(
      normalizedCollection,
      creator,
      'getCollectionAssetCount',
    );

    try {
      const data = await this.request<{ collectionAssetCount: string | number }>(
        `query($collection: String!, $creator: String!) {
          collectionAssetCount(collection: $collection, creator: $creator)
        }`,
        {
          collection: normalizedCollection,
          creator: creatorScope,
        }
      );
      return toExactSafeInteger(data.collectionAssetCount, 'collectionAssetCount', 0);
    } catch (error) {
      if (!this.shouldUseLegacyCollectionRead(error)) {
        throw error;
      }

      const data = await this.request<{ collectionAssetCount: string | number }>(
        `query($col: String!, $creator: String!) {
          collectionAssetCount(col: $col, creator: $creator)
        }`,
        {
          col: normalizedCollection,
          creator: creatorScope,
        }
      );
      return toExactSafeInteger(data.collectionAssetCount, 'collectionAssetCount', 0);
    }
  }

  async getCollectionAssets(col: string, options?: CollectionAssetsQueryOptions): Promise<IndexedAgent[]> {
    const normalizedCollection = normalizeCollectionPointerForRead(col);
    const creatorScope = await this.resolveCollectionCreatorScope(
      normalizedCollection,
      options?.creator,
      'getCollectionAssets',
    );
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
          `query($collection: String!, $creator: String!, $first: Int!, $skip: Int!, $orderBy: AgentOrderBy!, $dir: OrderDirection!) {
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
            collection: normalizedCollection,
            creator: creatorScope,
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
          `query($col: String!, $creator: String!, $first: Int!, $skip: Int!, $orderBy: AgentOrderBy!, $dir: OrderDirection!) {
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
            col: normalizedCollection,
            creator: creatorScope,
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
    const limit = clampInt(options?.limit ?? 100, 0, 1000);
    const initialSkip = clampInt(options?.offset ?? 0, 0, 1_000_000);
    if (limit === 0) return [];

    const where: Record<string, unknown> = { agent: agentId(asset) };
    if (!options?.includeRevoked) {
      where.isRevoked = false;
    }

    const pageSize = 100;
    const feedbacks: IndexedFeedback[] = [];
    let skip = initialSkip;

    while (feedbacks.length < limit) {
      const first = Math.min(pageSize, limit - feedbacks.length);
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
            solana { valueRaw valueDecimals score txSignature blockSlot runningDigest proofPassAuth }
          }
        }`,
        { where }
      );

      const page = data.feedbacks.map((f) => mapGqlFeedback(f, asset));
      if (page.length === 0) break;
      feedbacks.push(...page);
      skip += page.length;
    }

    return feedbacks;
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
      solana { valueRaw valueDecimals score txSignature blockSlot runningDigest proofPassAuth }
    }
  }`,
  { id: feedbackId(asset, client, feedbackIndex) }
);

    if (!data.feedback) return null;
    return mapGqlFeedback(data.feedback, asset);
  }

  async getFeedbackById(feedbackId: string): Promise<IndexedFeedback | null> {
    const normalizedId = feedbackId.trim();
    const canonical = decodeCanonicalFeedbackId(normalizedId);
    if (canonical) {
      return this.getFeedback(canonical.asset, canonical.client, BigInt(canonical.index));
    }
    if (!/^\d+$/.test(normalizedId)) return null;

    const data = await this.request<{ feedback: any | null }>(
      `query($id: ID!) {
        feedback(id: $id) {
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
          solana { valueRaw valueDecimals score txSignature blockSlot runningDigest proofPassAuth }
        }
      }`,
      { id: normalizedId }
    );

    if (!data.feedback) return null;
    return mapGqlFeedback(data.feedback);
  }

  async getFeedbacksByClient(client: string): Promise<IndexedFeedback[]> {
    const pageSize = 100;
    const maxRows = 5000;
    const rows: any[] = [];
    let skip = 0;

    while (rows.length < maxRows) {
      const first = Math.min(pageSize, maxRows - rows.length);
      const data = await this.request<{ feedbacks: any[] }>(
        `query($client: String!) {
          feedbacks(first: ${first}, skip: ${skip}, where: { clientAddress: $client }, orderBy: createdAt, orderDirection: desc) {
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
            solana { valueRaw valueDecimals score txSignature blockSlot runningDigest proofPassAuth }
          }
        }`,
        { client }
      );

      const page = data.feedbacks ?? [];
      if (page.length === 0) break;
      rows.push(...page);
      if (page.length < first) break;
      skip += page.length;
    }

    return rows.map((f) => mapGqlFeedback(f));
  }

  async getFeedbacksByTag(tag: string): Promise<IndexedFeedback[]> {
    // GraphQL filter doesn't support OR on tag1/tag2, so query both and merge.
    // Use paginated reads to stay below hosted GraphQL complexity limits.
    const pageSize = 100;
    const maxRows = 5000;

    const fetchByTagField = async (field: 'tag1' | 'tag2'): Promise<any[]> => {
      const rows: any[] = [];
      let skip = 0;

      while (rows.length < maxRows) {
        const first = Math.min(pageSize, maxRows - rows.length);
        const data = await this.request<{ feedbacks: any[] }>(
          `query($tag: String!) {
            feedbacks(
              first: ${first},
              skip: ${skip},
              where: { ${field}: $tag },
              orderBy: createdAt,
              orderDirection: desc
            ) {
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
              solana { valueRaw valueDecimals score txSignature blockSlot runningDigest proofPassAuth }
            }
          }`,
          { tag }
        );

        const page = data.feedbacks ?? [];
        if (page.length === 0) break;
        rows.push(...page);
        if (page.length < first) break;
        skip += page.length;
      }

      return rows;
    };

    const [tag1Rows, tag2Rows] = await Promise.all([
      fetchByTagField('tag1'),
      fetchByTagField('tag2'),
    ]);

    const merged = new Map<string, any>();
    for (const f of [...tag1Rows, ...tag2Rows]) {
      merged.set(f.id, f);
    }

    return Array.from(merged.values()).map((f) => mapGqlFeedback(f));
  }

  async getFeedbacksByEndpoint(endpoint: string): Promise<IndexedFeedback[]> {
    const pageSize = 100;
    const maxRows = 5000;
    const rows: any[] = [];
    let skip = 0;

    while (rows.length < maxRows) {
      const first = Math.min(pageSize, maxRows - rows.length);
      const data = await this.request<{ feedbacks: any[] }>(
        `query($endpoint: String!) {
          feedbacks(
            first: ${first},
            skip: ${skip},
            where: { endpoint: $endpoint },
            orderBy: createdAt,
            orderDirection: desc
          ) {
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
            solana { valueRaw valueDecimals score txSignature blockSlot runningDigest proofPassAuth }
          }
        }`,
        { endpoint }
      );

      const page = data.feedbacks ?? [];
      if (page.length === 0) break;
      rows.push(...page);
      if (page.length < first) break;
      skip += page.length;
    }

    return rows.map((f) => mapGqlFeedback(f));
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
          solana { valueRaw valueDecimals score txSignature blockSlot runningDigest proofPassAuth }
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
        feedbackResponses(first: ${clampInt(limit, 0, 1000)}, where: { feedback: $feedback }, orderBy: responseId, orderDirection: asc) {
          id
          responder
          responseUri
          responseHash
          createdAt
          solana { runningDigest responseCount txSignature blockSlot }
        }
      }`,
      { feedback: feedbackId(asset, client, feedbackIndex) }
    );

    return (data.feedbackResponses ?? []).map((r) =>
      mapGqlFeedbackResponse(r, asset, client, feedbackIndex)
    );
  }

  async getFeedbackResponsesByFeedbackId(
    feedbackId: string,
    limit: number = 100
  ): Promise<IndexedFeedbackResponse[]> {
    const normalizedId = feedbackId.trim();
    const canonical = decodeCanonicalFeedbackId(normalizedId);
    if (canonical) {
      return this.getFeedbackResponsesFor(
        canonical.asset,
        canonical.client,
        BigInt(canonical.index),
        limit,
      );
    }
    if (!/^\d+$/.test(normalizedId)) return [];

    const data = await this.request<{ feedback: any | null }>(
      `query($id: ID!) {
        feedback(id: $id) {
          id
          agent { id }
          clientAddress
          feedbackIndex
          responses(first: ${clampInt(limit, 0, 1000)}, skip: 0) {
            id
            responder
            responseUri
            responseHash
            createdAt
            solana { runningDigest responseCount txSignature blockSlot }
          }
        }
      }`,
      { id: normalizedId }
    );

    if (!data.feedback) return [];
    const asset = resolveFeedbackAsset(data.feedback);
    const client = data.feedback.clientAddress;
    const feedbackIndex = data.feedback.feedbackIndex;
    return (data.feedback.responses ?? []).map((response: any) =>
      mapGqlFeedbackResponse(response, asset, client, feedbackIndex)
    );
  }

  // ============================================================================
  // Validations
  // ============================================================================

  async getPendingValidations(_validator: string): Promise<IndexedValidation[]> {
    throw new Error(VALIDATION_ARCHIVED_ERROR);
  }

  // ============================================================================
  // Reputation
  // ============================================================================

  async getAgentReputation(asset: string): Promise<IndexedAgentReputation | null> {
    const normalizedAsset = agentId(asset);
    const data = await this.request<{ agentReputation: any | null }>(
      `query($asset: ID!) {
        agentReputation(asset: $asset) {
          asset
          owner
          collection
          nftName
          agentUri
          feedbackCount
          avgScore
          positiveCount
          negativeCount
          validationCount
        }
      }`,
      { asset: normalizedAsset }
    );

    const row = data.agentReputation;
    if (!row) return null;

    return {
      asset: row?.asset ?? normalizedAsset,
      owner: row?.owner ?? '',
      collection: row?.collection ?? '',
      nft_name: normalizeNullableText(row?.nftName ?? null),
      agent_uri: row?.agentUri ?? null,
      feedback_count: toExactSafeInteger(row?.feedbackCount, 'agentReputation.feedbackCount', 0),
      avg_score: row?.avgScore === null || row?.avgScore === undefined ? null : toNumberSafe(row.avgScore, 0),
      positive_count: toExactSafeInteger(row?.positiveCount, 'agentReputation.positiveCount', 0),
      negative_count: toExactSafeInteger(row?.negativeCount, 'agentReputation.negativeCount', 0),
      validation_count: toExactSafeInteger(row?.validationCount, 'agentReputation.validationCount', 0),
    };
  }

  // ============================================================================
  // Integrity (hash-chain)
  // ============================================================================

  async getLastFeedbackDigest(asset: string): Promise<{ digest: string | null; count: number }> {
    const heads = await this.loadHashChainHeads(asset);
    return {
      digest: normalizeHexDigest(heads.feedback.digest),
      count: toExactSafeInteger(heads.feedback.count, 'feedback.count', 0),
    };
  }

  async getLastResponseDigest(asset: string): Promise<{ digest: string | null; count: number }> {
    const heads = await this.loadHashChainHeads(asset);
    return {
      digest: normalizeHexDigest(heads.response.digest),
      count: toExactSafeInteger(heads.response.count, 'response.count', 0),
    };
  }

  async getLastRevokeDigest(asset: string): Promise<{ digest: string | null; count: number }> {
    const heads = await this.loadHashChainHeads(asset);
    return {
      digest: normalizeHexDigest(heads.revoke.digest),
      count: toExactSafeInteger(heads.revoke.count, 'revoke.count', 0),
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
        event_count: toExactSafeInteger(cp.eventCount, 'checkpoint.eventCount', 0),
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
    const first = clampInt(limit, 1, 250);

    const data = await this.request<{ hashChainReplayData: GqlHashChainReplayPage }>(
      `query($agent: ID!, $chainType: HashChainType!, $fromCount: BigInt!, $toCount: BigInt) {
        hashChainReplayData(
          agent: $agent,
          chainType: $chainType,
          fromCount: $fromCount,
          toCount: $toCount,
          first: ${first}
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
      }
    );

    const page = data.hashChainReplayData;

    const events: ReplayEventData[] = page.events.map((e) => ({
      asset: e.asset,
      client: e.client,
      feedback_index: String(e.feedbackIndex),
      slot: toNumberSafe(e.slot, 0),
      running_digest: normalizeHexDigest(e.runningDigest) ?? null,
      feedback_hash: normalizeHexDigest(e.feedbackHash),
      responder: e.responder ?? undefined,
      response_hash: normalizeHexDigest(e.responseHash),
      response_count: e.responseCount != null
        ? toLosslessIntegerValue(e.responseCount, 'responseCount', 0)
        : null,
      revoke_count: e.revokeCount != null
        ? toLosslessIntegerValue(e.revokeCount, 'revokeCount', 0)
        : null,
    }));

    return {
      events,
      hasMore: Boolean(page.hasMore),
      nextFromCount: toExactSafeInteger(page.nextFromCount, 'nextFromCount', fromCount),
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
      const replayCount = offset + 1;
      const page = await this.getReplayData(asset, 'response', replayCount, replayCount + 1, 1);
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
      const page = await this.getReplayData(asset, 'revoke', c, c + 1, 1);
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
        revoke_count: e.revoke_count ?? c,
        tx_signature: '',
        created_at: new Date(0).toISOString(),
      });
    }));

    return result;
  }
}
