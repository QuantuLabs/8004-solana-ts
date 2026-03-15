/**
 * Indexer Client for GraphQL v2 API
 * Implements the IndexerReadClient contract used by the SDK.
 */
import { IndexerError, IndexerErrorCode, IndexerRateLimitError, IndexerTimeoutError, IndexerUnauthorizedError, IndexerUnavailableError, } from './indexer-errors.js';
import { decodeCanonicalFeedbackId } from './indexer-client.js';
const VALIDATION_ARCHIVED_ERROR = 'Validation feature is archived (v0.5.0+) and is not exposed by indexers.';
const CID_V1_BASE32_PATTERN = /^b[a-z2-7]{20,}$/;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
function normalizeCollectionPointerForRead(pointer) {
    const trimmed = pointer.trim();
    if (!trimmed) {
        throw new IndexerError('Collection pointer cannot be empty', IndexerErrorCode.INVALID_RESPONSE);
    }
    if (trimmed.startsWith('c1:'))
        return trimmed;
    if (CID_V1_BASE32_PATTERN.test(trimmed))
        return `c1:${trimmed}`;
    return trimmed;
}
function normalizeSequentialIdForRead(value, fieldName) {
    let parsed;
    if (typeof value === 'bigint') {
        parsed = value;
    }
    else if (typeof value === 'number') {
        if (!Number.isSafeInteger(value)) {
            throw new IndexerError(`${fieldName} must be an integer (use string/bigint for large values)`, IndexerErrorCode.INVALID_RESPONSE);
        }
        parsed = BigInt(value);
    }
    else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!/^-?\d+$/.test(trimmed)) {
            throw new IndexerError(`${fieldName} must be an integer`, IndexerErrorCode.INVALID_RESPONSE);
        }
        parsed = BigInt(trimmed);
    }
    else {
        throw new IndexerError(`${fieldName} must be an integer`, IndexerErrorCode.INVALID_RESPONSE);
    }
    if (parsed < 0n) {
        throw new IndexerError(`${fieldName} must be >= 0`, IndexerErrorCode.INVALID_RESPONSE);
    }
    return parsed.toString();
}
function normalizePositiveSequentialIdFromResponse(value, fieldName) {
    let parsed;
    if (typeof value === 'bigint') {
        parsed = value;
    }
    else if (typeof value === 'number') {
        if (!Number.isSafeInteger(value)) {
            throw new IndexerError(`${fieldName} must be a positive integer string`, IndexerErrorCode.INVALID_RESPONSE);
        }
        parsed = BigInt(value);
    }
    else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!/^-?\d+$/.test(trimmed)) {
            throw new IndexerError(`${fieldName} must be a positive integer string`, IndexerErrorCode.INVALID_RESPONSE);
        }
        parsed = BigInt(trimmed);
    }
    else {
        throw new IndexerError(`${fieldName} must be a positive integer string`, IndexerErrorCode.INVALID_RESPONSE);
    }
    if (parsed <= 0n) {
        throw new IndexerError(`${fieldName} must be a positive integer string`, IndexerErrorCode.INVALID_RESPONSE);
    }
    return parsed.toString();
}
function toIsoFromUnixSeconds(unix) {
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
    if (!Number.isFinite(n) || n <= 0)
        return new Date(0).toISOString();
    return new Date(n * 1000).toISOString();
}
function toNumberSafe(v, fallback = 0) {
    const n = typeof v === 'string' ? Number(v) : (typeof v === 'number' ? v : NaN);
    return Number.isFinite(n) ? n : fallback;
}
function toIntSafe(v, fallback = 0) {
    const n = typeof v === 'string' ? Number.parseInt(v, 10) : (typeof v === 'number' ? v : NaN);
    if (!Number.isFinite(n))
        return fallback;
    return Math.trunc(n);
}
function parseStrictInteger(value, fieldName) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === 'bigint')
        return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || !Number.isInteger(value)) {
            throw new IndexerError(`${fieldName} must be an integer`, IndexerErrorCode.INVALID_RESPONSE);
        }
        if (!Number.isSafeInteger(value)) {
            throw new IndexerError(`${fieldName} exceeds JS safe integer range; use string-safe fields or REST fallback`, IndexerErrorCode.INVALID_RESPONSE);
        }
        return BigInt(value);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        if (!/^-?\d+$/.test(trimmed)) {
            throw new IndexerError(`${fieldName} must be an integer`, IndexerErrorCode.INVALID_RESPONSE);
        }
        return BigInt(trimmed);
    }
    throw new IndexerError(`${fieldName} must be an integer`, IndexerErrorCode.INVALID_RESPONSE);
}
function toLosslessIntegerValue(value, fieldName, fallback = 0) {
    const parsed = parseStrictInteger(value, fieldName);
    if (parsed === null)
        return fallback;
    if (parsed <= MAX_SAFE_INTEGER_BIGINT && parsed >= MIN_SAFE_INTEGER_BIGINT) {
        return Number(parsed);
    }
    return parsed.toString();
}
function toExactSafeInteger(value, fieldName, fallback = 0) {
    const parsed = parseStrictInteger(value, fieldName);
    if (parsed === null)
        return fallback;
    if (parsed > MAX_SAFE_INTEGER_BIGINT || parsed < MIN_SAFE_INTEGER_BIGINT) {
        throw new IndexerError(`${fieldName} exceeds JS safe integer range; use REST fallback for exact values`, IndexerErrorCode.INVALID_RESPONSE);
    }
    return Number(parsed);
}
function normalizeHexDigest(v) {
    if (typeof v !== 'string')
        return null;
    let s = v.trim();
    if (s.startsWith('\\x') || s.startsWith('0x'))
        s = s.slice(2);
    if (!s)
        return null;
    return s.toLowerCase();
}
function clampInt(n, min, max) {
    if (!Number.isFinite(n))
        return min;
    return Math.min(max, Math.max(min, Math.trunc(n)));
}
function normalizeGraphqlAgentLookupId(agentId) {
    if (typeof agentId === 'bigint') {
        if (agentId < 0n) {
            throw new IndexerError('agentId must be a non-negative integer or non-empty string', IndexerErrorCode.INVALID_RESPONSE);
        }
        return agentId.toString();
    }
    if (typeof agentId === 'number') {
        if (!Number.isFinite(agentId) || !Number.isInteger(agentId) || agentId < 0) {
            throw new IndexerError('agentId must be a non-negative integer or non-empty string', IndexerErrorCode.INVALID_RESPONSE);
        }
        return Math.trunc(agentId).toString();
    }
    const normalized = String(agentId).trim();
    if (!normalized) {
        throw new IndexerError('agentId must be a non-empty string or non-negative integer', IndexerErrorCode.INVALID_RESPONSE);
    }
    if (normalized.startsWith('sol:')) {
        const stripped = normalized.slice(4).trim();
        if (stripped)
            return stripped;
    }
    return normalized;
}
function toSafeGraphqlAgentIdNumber(agentId) {
    if (!/^\d+$/.test(agentId))
        return null;
    try {
        const parsed = BigInt(agentId);
        if (parsed > BigInt(Number.MAX_SAFE_INTEGER))
            return null;
        return Number(parsed);
    }
    catch {
        return null;
    }
}
function toGraphqlUnixSeconds(value) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            return undefined;
        return Math.trunc(value).toString();
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return undefined;
        if (/^-?\d+$/.test(trimmed))
            return trimmed;
        const millis = Date.parse(trimmed);
        if (!Number.isFinite(millis))
            return undefined;
        return Math.floor(millis / 1000).toString();
    }
    if (value instanceof Date) {
        const millis = value.getTime();
        if (!Number.isFinite(millis))
            return undefined;
        return Math.floor(millis / 1000).toString();
    }
    return undefined;
}
function resolveAgentOrder(order) {
    const resolved = order ?? 'created_at.desc';
    const orderDirection = resolved.endsWith('.asc') ? 'asc' : 'desc';
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
function agentId(asset) {
    const normalized = asset.trim();
    if (normalized.startsWith('sol:')) {
        return normalized.slice(4);
    }
    return normalized;
}
function rot32(value, bits) {
    return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}
function mix32(a0, b0, c0) {
    let a = a0 >>> 0;
    let b = b0 >>> 0;
    let c = c0 >>> 0;
    a = (a - c) >>> 0;
    a = (a ^ rot32(c, 4)) >>> 0;
    c = (c + b) >>> 0;
    b = (b - a) >>> 0;
    b = (b ^ rot32(a, 6)) >>> 0;
    a = (a + c) >>> 0;
    c = (c - b) >>> 0;
    c = (c ^ rot32(b, 8)) >>> 0;
    b = (b + a) >>> 0;
    a = (a - c) >>> 0;
    a = (a ^ rot32(c, 16)) >>> 0;
    c = (c + b) >>> 0;
    b = (b - a) >>> 0;
    b = (b ^ rot32(a, 19)) >>> 0;
    a = (a + c) >>> 0;
    c = (c - b) >>> 0;
    c = (c ^ rot32(b, 4)) >>> 0;
    b = (b + a) >>> 0;
    return [a, b, c];
}
function final32(a0, b0, c0) {
    let a = a0 >>> 0;
    let b = b0 >>> 0;
    let c = c0 >>> 0;
    c = (c ^ b) >>> 0;
    c = (c - rot32(b, 14)) >>> 0;
    a = (a ^ c) >>> 0;
    a = (a - rot32(c, 11)) >>> 0;
    b = (b ^ a) >>> 0;
    b = (b - rot32(a, 25)) >>> 0;
    c = (c ^ b) >>> 0;
    c = (c - rot32(b, 16)) >>> 0;
    a = (a ^ c) >>> 0;
    a = (a - rot32(c, 4)) >>> 0;
    b = (b ^ a) >>> 0;
    b = (b - rot32(a, 14)) >>> 0;
    c = (c ^ b) >>> 0;
    c = (c - rot32(b, 24)) >>> 0;
    return [a, b, c];
}
function pgHashBytes(input) {
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
function pgHashtextTieBreaker(input) {
    const signed = pgHashBytes(Buffer.from(input, 'utf8')) | 0;
    const abs = signed === -2147483648 ? 2147483648 : Math.abs(signed);
    return abs % 10_000_000;
}
function computeGraphqlSortKey(asset, agent) {
    const trustTier = BigInt(toExactSafeInteger(agent?.solana?.trustTier, 'agent.solana.trustTier', 0));
    const qualityScore = BigInt(toExactSafeInteger(agent?.solana?.qualityScore, 'agent.solana.qualityScore', 0));
    const confidence = BigInt(toExactSafeInteger(agent?.solana?.confidence, 'agent.solana.confidence', 0));
    const tieBreaker = BigInt(pgHashtextTieBreaker(asset));
    return (trustTier * 1000200010000000n
        + qualityScore * 100010000000n
        + confidence * 10000000n
        + tieBreaker).toString();
}
function extractGraphqlNftName(agent) {
    if (typeof agent?.nftName === 'string')
        return agent.nftName.length > 0 ? agent.nftName : null;
    const metadata = Array.isArray(agent?.metadata) ? agent.metadata : [];
    for (const entry of metadata) {
        const key = typeof entry?.key === 'string' ? entry.key.toLowerCase() : '';
        if ((key === 'name' || key === 'nft_name') && typeof entry?.value === 'string') {
            return entry.value.length > 0 ? entry.value : null;
        }
    }
    return null;
}
function normalizeNullableText(value) {
    if (typeof value !== 'string')
        return value ?? null;
    return value.length > 0 ? value : null;
}
function deriveReadyUrlFromGraphqlEndpoint(endpoint) {
    try {
        const url = new URL(endpoint);
        let pathname = url.pathname.replace(/\/+$/, '');
        if (pathname.endsWith('/v2/graphql')) {
            pathname = pathname.slice(0, -'/v2/graphql'.length);
        }
        else if (pathname.endsWith('/graphql')) {
            pathname = pathname.slice(0, -'/graphql'.length);
        }
        url.pathname = `${pathname || ''}/ready`;
        url.search = '';
        url.hash = '';
        return url.toString();
    }
    catch {
        return null;
    }
}
function resolveGraphqlFeedbackCount(agent) {
    if (agent?.totalFeedback !== undefined && agent?.totalFeedback !== null) {
        return toExactSafeInteger(agent.totalFeedback, 'agent.totalFeedback', 0);
    }
    if (agent?.stats?.totalFeedback !== undefined && agent?.stats?.totalFeedback !== null) {
        return toExactSafeInteger(agent.stats.totalFeedback, 'agent.stats.totalFeedback', 0);
    }
    return 0;
}
function detailedAgentSelection(agentIdSelection) {
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
function mapGqlAgent(agent, fallbackAsset = '') {
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
function mapGqlCollectionPointer(row) {
    const collection = typeof row?.collection === 'string' ? row.collection : row?.col;
    const col = typeof row?.col === 'string' ? row.col : collection;
    const metadataUpdatedAt = row?.metadataUpdatedAt ?? row?.metadata_updated_at;
    const collectionId = row?.collectionId ?? row?.collection_id;
    return {
        collection_id: collectionId !== undefined && collectionId !== null
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
        metadata_updated_at: metadataUpdatedAt !== undefined && metadataUpdatedAt !== null
            ? toIsoFromUnixSeconds(metadataUpdatedAt)
            : null,
    };
}
function buildAgentWhere(options) {
    if (!options)
        return {};
    const where = {};
    if (options.owner)
        where.owner = options.owner;
    if (options.creator)
        where.creator = options.creator;
    if (options.collection)
        where.collection = options.collection;
    if (options.collectionPointer)
        where.collectionPointer = options.collectionPointer;
    if (options.wallet)
        where.agentWallet = options.wallet;
    if (options.parentAsset)
        where.parentAsset = options.parentAsset;
    if (options.parentCreator)
        where.parentCreator = options.parentCreator;
    if (options.colLocked !== undefined)
        where.colLocked = options.colLocked;
    if (options.parentLocked !== undefined)
        where.parentLocked = options.parentLocked;
    const updatedAt = toGraphqlUnixSeconds(options.updatedAt);
    const updatedAtGt = toGraphqlUnixSeconds(options.updatedAtGt);
    const updatedAtLt = toGraphqlUnixSeconds(options.updatedAtLt);
    if (updatedAt !== undefined) {
        try {
            const exact = BigInt(updatedAt);
            where.updatedAt_gt = (exact - 1n).toString();
            where.updatedAt_lt = (exact + 1n).toString();
        }
        catch {
            // Ignore invalid numeric coercion and let explicit gt/lt (if any) drive the filter.
        }
    }
    if (updatedAtGt !== undefined)
        where.updatedAt_gt = updatedAtGt;
    if (updatedAtLt !== undefined)
        where.updatedAt_lt = updatedAtLt;
    return where;
}
function feedbackId(asset, client, index) {
    return `${asset}:${client}:${index.toString()}`;
}
function decodeFeedbackId(id) {
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
function resolveFeedbackAsset(row, fallbackAsset = '') {
    if (typeof row?.id === 'string') {
        const decoded = decodeFeedbackId(row.id);
        if (decoded?.asset)
            return decoded.asset;
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
function mapGqlFeedback(row, fallbackAsset = '') {
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
        is_revoked: Boolean(row.isRevoked),
        revoked_at: row.revokedAt ? toIsoFromUnixSeconds(row.revokedAt) : null,
        block_slot: toNumberSafe(row?.solana?.blockSlot, 0),
        tx_signature: row?.solana?.txSignature ?? '',
        created_at: toIsoFromUnixSeconds(row.createdAt),
    };
}
function mapGqlFeedbackResponse(row, asset, client, feedbackIndex) {
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
export class IndexerGraphQLClient {
    graphqlUrl;
    graphqlUrls;
    headers;
    timeout;
    retries;
    hashChainHeadsInFlight = new Map();
    constructor(config) {
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
    getBaseUrl() {
        return this.graphqlUrl;
    }
    shouldFallbackEndpoint(error) {
        if (error instanceof IndexerRateLimitError)
            return true;
        if (error instanceof IndexerTimeoutError)
            return true;
        if (error instanceof IndexerUnavailableError)
            return true;
        if (error instanceof IndexerError && error.code === IndexerErrorCode.SERVER_ERROR)
            return true;
        return false;
    }
    async requestAgainstEndpoint(endpoint, query, variables) {
        let lastError = null;
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
                    body: JSON.stringify({ query, variables }),
                    signal: controller.signal,
                    redirect: 'error',
                });
                if (!response.ok) {
                    let details = '';
                    try {
                        const contentType = response.headers.get('content-type') ?? '';
                        const text = await response.text();
                        if (contentType.includes('application/json')) {
                            const parsed = JSON.parse(text);
                            const msg = parsed?.errors?.map(e => e?.message).filter(Boolean).join('; ');
                            if (msg)
                                details = msg;
                        }
                        else if (text) {
                            details = text.slice(0, 200).replace(/\s+/g, ' ').trim();
                        }
                    }
                    catch {
                        // Ignore body parsing issues for non-OK responses.
                    }
                    if (response.status === 401 || response.status === 403) {
                        throw new IndexerUnauthorizedError();
                    }
                    if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After');
                        throw new IndexerRateLimitError('Rate limited', retryAfter ? parseInt(retryAfter, 10) : undefined);
                    }
                    if (attempt < this.retries && response.status >= 500) {
                        await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                        continue;
                    }
                    throw new IndexerError(`GraphQL request failed: HTTP ${response.status}${details ? ` (${details})` : ''}`, response.status >= 500 ? IndexerErrorCode.SERVER_ERROR : IndexerErrorCode.INVALID_RESPONSE);
                }
                const json = (await response.json());
                if (json.errors && json.errors.length > 0) {
                    const msg = json.errors.map(e => e?.message).filter(Boolean).join('; ') || 'GraphQL error';
                    throw new IndexerError(msg, IndexerErrorCode.INVALID_RESPONSE);
                }
                if (!json.data) {
                    throw new IndexerError('GraphQL response missing data', IndexerErrorCode.INVALID_RESPONSE);
                }
                return json.data;
            }
            catch (err) {
                const e = err;
                lastError = err instanceof Error ? err : new Error(String(err));
                if (e?.name === 'AbortError') {
                    lastError = new IndexerTimeoutError();
                }
                else if (!(err instanceof IndexerError)) {
                    if (err instanceof TypeError) {
                        lastError = new IndexerUnavailableError(err.message);
                    }
                }
                if (attempt < this.retries && this.shouldFallbackEndpoint(lastError)) {
                    await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                    continue;
                }
                throw lastError instanceof IndexerError ? lastError : new IndexerUnavailableError(lastError.message);
            }
            finally {
                clearTimeout(timeoutId);
            }
        }
        throw lastError instanceof IndexerError
            ? lastError
            : new IndexerUnavailableError(lastError?.message ?? 'GraphQL request failed');
    }
    shouldUseLegacyCollectionRead(error) {
        if (!(error instanceof IndexerError))
            return false;
        if (error.code !== IndexerErrorCode.INVALID_RESPONSE)
            return false;
        const msg = error.message;
        return (/Cannot query field ['"]collections['"] on type ['"]Query['"]/.test(msg)
            || /Unknown argument ['"]collection['"] on field ['"]Query\.collectionAssetCount['"]/.test(msg)
            || /Unknown argument ['"]collection['"] on field ['"]Query\.collectionAssets['"]/.test(msg)
            || /Unknown argument ['"]creator['"] on field ['"]Query\.collections['"]/.test(msg)
            || /Unknown argument ['"]creator['"] on field ['"]Query\.collectionAssetCount['"]/.test(msg)
            || /Unknown argument ['"]creator['"] on field ['"]Query\.collectionAssets['"]/.test(msg));
    }
    shouldFallbackGlobalStatsExtendedFields(error) {
        if (!(error instanceof IndexerError))
            return false;
        if (error.code !== IndexerErrorCode.INVALID_RESPONSE)
            return false;
        const msg = error.message;
        return (/Cannot query field ['"]platinumAgents['"] on type ['"]GlobalStats['"]/.test(msg)
            || /Cannot query field ['"]goldAgents['"] on type ['"]GlobalStats['"]/.test(msg)
            || /Cannot query field ['"]avgQuality['"] on type ['"]GlobalStats['"]/.test(msg));
    }
    async resolveCollectionCreatorScope(normalizedCollection, creator, methodName) {
        const direct = creator?.trim();
        if (direct)
            return direct;
        const pointers = await this.getCollectionPointers({
            collection: normalizedCollection,
            col: normalizedCollection,
            limit: 2,
            offset: 0,
        });
        const uniqueCreators = Array.from(new Set(pointers
            .map((p) => p.creator?.trim())
            .filter((v) => !!v)));
        if (uniqueCreators.length === 1) {
            return uniqueCreators[0];
        }
        if (uniqueCreators.length > 1) {
            throw new IndexerError(`${methodName} requires creator (scope is creator+collection): multiple creators found for ${normalizedCollection}.`, IndexerErrorCode.INVALID_RESPONSE);
        }
        throw new IndexerError(`${methodName} requires creator (scope is creator+collection).`, IndexerErrorCode.INVALID_RESPONSE);
    }
    shouldFallbackAgentIdField(error, field) {
        if (!(error instanceof IndexerError))
            return false;
        if (error.code !== IndexerErrorCode.INVALID_RESPONSE)
            return false;
        const msg = error.message;
        return (new RegExp(`Cannot query field ['"]${field}['"] on type ['"]Agent['"]`).test(msg)
            || new RegExp(`Cannot query field ['"]${field}['"] on type ['"]AgentFilter['"]`).test(msg)
            || new RegExp(`Field ['"]${field}['"] is not defined by type ['"]AgentFilter['"]`).test(msg)
            || new RegExp(`Unknown argument ['"]${field}['"]`).test(msg)
            || new RegExp(`Unknown field ['"]${field}['"]`).test(msg));
    }
    shouldFallbackAgentIdVariableType(error, variableType) {
        if (!(error instanceof IndexerError))
            return false;
        if (error.code !== IndexerErrorCode.INVALID_RESPONSE)
            return false;
        const msg = error.message;
        if (variableType === 'String') {
            return (/type ['"]String!?['"] used in position expecting type ['"]BigInt!?['"]/i.test(msg)
                || /Expected type ['"]BigInt!?['"]/i.test(msg)
                || /expecting type ['"]BigInt!?['"]/i.test(msg));
        }
        return false;
    }
    shouldRetryBigIntAgentIdAsNumber(error) {
        if (!(error instanceof IndexerError))
            return false;
        if (error.code !== IndexerErrorCode.INVALID_RESPONSE)
            return false;
        const msg = error.message;
        return (/BigInt cannot represent non-integer value/i.test(msg)
            || /Expected value of type ['"]BigInt!?['"], found ['"][^'"]+['"]/i.test(msg)
            || /Expected type ['"]BigInt!?['"], found ['"][^'"]+['"]/i.test(msg));
    }
    async requestAgentBySequentialIdField(agentIdField, normalizedAgentId) {
        const requestByType = async (variableType, variableValue) => {
            const data = await this.request(`query($agentId: ${variableType}!) {
          agents(first: 1, where: { ${agentIdField}: $agentId }) {
            ${detailedAgentSelection('')}
          }
        }`, { agentId: variableValue });
            return data.agents[0] ?? null;
        };
        try {
            return await requestByType('String', normalizedAgentId);
        }
        catch (error) {
            if (!this.shouldFallbackAgentIdVariableType(error, 'String')) {
                throw error;
            }
        }
        try {
            return await requestByType('BigInt', normalizedAgentId);
        }
        catch (error) {
            const safeNumericAgentId = toSafeGraphqlAgentIdNumber(normalizedAgentId);
            if (safeNumericAgentId !== null && this.shouldRetryBigIntAgentIdAsNumber(error)) {
                return requestByType('BigInt', safeNumericAgentId);
            }
            throw error;
        }
    }
    async requestWithAgentIdField(requester) {
        try {
            return await requester('agentId');
        }
        catch (error) {
            if (!this.shouldFallbackAgentIdField(error, 'agentId')) {
                throw error;
            }
        }
        try {
            return await requester('agentid');
        }
        catch (error) {
            if (!this.shouldFallbackAgentIdField(error, 'agentid')) {
                throw error;
            }
        }
        return requester(null);
    }
    async request(query, variables) {
        let lastError = null;
        for (const endpoint of this.graphqlUrls) {
            try {
                return await this.requestAgainstEndpoint(endpoint, query, variables);
            }
            catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                if (!this.shouldFallbackEndpoint(lastError)) {
                    throw lastError instanceof IndexerError ? lastError : new IndexerUnavailableError(lastError.message);
                }
            }
        }
        throw lastError ?? new IndexerUnavailableError();
    }
    async isAvailable() {
        for (const endpoint of this.graphqlUrls) {
            const readyUrl = deriveReadyUrlFromGraphqlEndpoint(endpoint);
            if (readyUrl) {
                try {
                    const response = await fetch(readyUrl, { headers: this.headers, redirect: 'error' });
                    if (response.ok || response.status === 503) {
                        let payload = null;
                        try {
                            payload = await response.json();
                        }
                        catch {
                            payload = null;
                        }
                        if (payload?.status === 'ready') {
                            return true;
                        }
                        continue;
                    }
                }
                catch {
                    // Fall through to the legacy GraphQL availability probe for this endpoint.
                }
            }
            try {
                await this.requestAgainstEndpoint(endpoint, 'query { __typename }');
                return true;
            }
            catch {
                // Try next configured endpoint.
            }
        }
        return false;
    }
    loadHashChainHeads(asset) {
        const key = asset;
        const existing = this.hashChainHeadsInFlight.get(key);
        if (existing)
            return existing;
        const pending = this.request(`query($agent: ID!) {
        hashChainHeads(agent: $agent) {
          feedback { digest count }
          response { digest count }
          revoke { digest count }
        }
      }`, { agent: agentId(asset) })
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
    async getAgent(asset) {
        const normalizedAsset = agentId(asset);
        const data = await this.requestWithAgentIdField((agentIdField) => {
            const agentIdSelection = agentIdField ? `\n          ${agentIdField}` : '';
            return this.request(`query($id: ID!) {
            agent(id: $id) {
              ${detailedAgentSelection(agentIdSelection)}
            }
          }`, { id: normalizedAsset });
        });
        if (!data.agent)
            return null;
        return mapGqlAgent(data.agent, normalizedAsset);
    }
    async getAgentByAgentId(agentId) {
        const normalizedAgentId = normalizeGraphqlAgentLookupId(agentId);
        let agent;
        try {
            agent = await this.requestAgentBySequentialIdField('agentId', normalizedAgentId);
        }
        catch (error) {
            if (!this.shouldFallbackAgentIdField(error, 'agentId')) {
                throw error;
            }
            try {
                agent = await this.requestAgentBySequentialIdField('agentid', normalizedAgentId);
            }
            catch (fallbackError) {
                if (!this.shouldFallbackAgentIdField(fallbackError, 'agentid')) {
                    throw fallbackError;
                }
                return null;
            }
        }
        if (!agent)
            return null;
        const mapped = mapGqlAgent(agent, normalizedAgentId);
        mapped.agent_id = normalizedAgentId;
        return mapped;
    }
    /** @deprecated Use getAgentByAgentId(agentId) */
    async getAgentByIndexerId(agentId) {
        return this.getAgentByAgentId(agentId);
    }
    async getAgents(options) {
        const limit = clampInt(options?.limit ?? 100, 0, 500);
        const offset = clampInt(options?.offset ?? 0, 0, 1_000_000);
        const { orderBy, orderDirection } = resolveAgentOrder(options?.order);
        const where = buildAgentWhere(options);
        const data = await this.requestWithAgentIdField((agentIdField) => {
            const agentIdSelection = agentIdField ? `\n          ${agentIdField}` : '';
            return this.request(`query($orderBy: AgentOrderBy!, $dir: OrderDirection!, $where: AgentFilter) {
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
          }`, {
                orderBy,
                dir: orderDirection,
                where: Object.keys(where).length ? where : null,
            });
        });
        return data.agents.map((a) => mapGqlAgent(a));
    }
    async getAgentsByOwner(owner) {
        return this.getAgents({
            owner,
            limit: 250,
            order: 'created_at.desc',
        });
    }
    async getAgentsByCollection(collection) {
        return this.getAgents({
            collection,
            limit: 250,
            order: 'created_at.desc',
        });
    }
    async getAgentByWallet(wallet) {
        const data = await this.requestWithAgentIdField((agentIdField) => {
            const agentIdSelection = agentIdField ? `\n          ${agentIdField}` : '';
            return this.request(`query($wallet: String!) {
            agents(first: 1, skip: 0, where: { agentWallet: $wallet }, orderBy: createdAt, orderDirection: desc) {
              ${detailedAgentSelection(agentIdSelection)}
            }
          }`, { wallet });
        });
        return data.agents[0] ? mapGqlAgent(data.agents[0]) : null;
    }
    async getLeaderboard(options) {
        if (options?.cursorSortKey) {
            throw new Error('GraphQL backend does not support cursorSortKey keyset pagination; use REST indexer client.');
        }
        const limit = clampInt(options?.limit ?? 50, 0, 200);
        const data = await this.request(`query($first: Int!, $collection: String) {
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
      }`, {
            first: limit,
            collection: options?.collection ?? null,
        });
        const rows = (data.leaderboard ?? []).filter((row) => options?.minTier === undefined
            ? true
            : toNumberSafe(row?.trustTier, 0) >= options.minTier);
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
    async getGlobalStats() {
        const mapStats = (stats) => ({
            total_agents: toExactSafeInteger(stats?.totalAgents, 'globalStats.totalAgents', 0),
            total_collections: toExactSafeInteger(stats?.totalCollections, 'globalStats.totalCollections', 0),
            total_feedbacks: toExactSafeInteger(stats?.totalFeedback, 'globalStats.totalFeedback', 0),
            platinum_agents: toExactSafeInteger(stats?.platinumAgents, 'globalStats.platinumAgents', 0),
            gold_agents: toExactSafeInteger(stats?.goldAgents, 'globalStats.goldAgents', 0),
            avg_quality: stats?.avgQuality === null || stats?.avgQuality === undefined
                ? null
                : toNumberSafe(stats.avgQuality, 0),
        });
        try {
            const data = await this.request(`query {
          globalStats { totalAgents totalFeedback totalCollections platinumAgents goldAgents avgQuality tags }
        }`);
            return mapStats(data.globalStats);
        }
        catch (error) {
            if (!this.shouldFallbackGlobalStatsExtendedFields(error)) {
                throw error;
            }
        }
        const legacyData = await this.request(`query {
        globalStats { totalAgents totalFeedback totalCollections tags }
      }`);
        return mapStats(legacyData.globalStats);
    }
    async getCollectionPointers(options) {
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
            const data = await this.request(query, {
                first,
                skip,
                ...(includeCollectionId ? { collectionId } : {}),
                collection: collection ?? null,
                creator: options?.creator ?? null,
            });
            return data.collections.map((p) => mapGqlCollectionPointer(p));
        }
        catch (error) {
            if (collectionId !== undefined) {
                throw error;
            }
            if (!this.shouldUseLegacyCollectionRead(error)) {
                throw error;
            }
            const data = await this.request(`query($first: Int!, $skip: Int!, $col: String, $creator: String) {
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
        }`, {
                first,
                skip,
                col: collection ?? null,
                creator: options?.creator ?? null,
            });
            return data.collectionPointers.map((p) => mapGqlCollectionPointer(p));
        }
    }
    async getCollectionAssetCount(col, creator) {
        const normalizedCollection = normalizeCollectionPointerForRead(col);
        const creatorScope = await this.resolveCollectionCreatorScope(normalizedCollection, creator, 'getCollectionAssetCount');
        try {
            const data = await this.request(`query($collection: String!, $creator: String!) {
          collectionAssetCount(collection: $collection, creator: $creator)
        }`, {
                collection: normalizedCollection,
                creator: creatorScope,
            });
            return toExactSafeInteger(data.collectionAssetCount, 'collectionAssetCount', 0);
        }
        catch (error) {
            if (!this.shouldUseLegacyCollectionRead(error)) {
                throw error;
            }
            const data = await this.request(`query($col: String!, $creator: String!) {
          collectionAssetCount(col: $col, creator: $creator)
        }`, {
                col: normalizedCollection,
                creator: creatorScope,
            });
            return toExactSafeInteger(data.collectionAssetCount, 'collectionAssetCount', 0);
        }
    }
    async getCollectionAssets(col, options) {
        const normalizedCollection = normalizeCollectionPointerForRead(col);
        const creatorScope = await this.resolveCollectionCreatorScope(normalizedCollection, options?.creator, 'getCollectionAssets');
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
                const data = await this.request(`query($collection: String!, $creator: String!, $first: Int!, $skip: Int!, $orderBy: AgentOrderBy!, $dir: OrderDirection!) {
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
          }`, {
                    collection: normalizedCollection,
                    creator: creatorScope,
                    first,
                    skip,
                    orderBy,
                    dir: orderDirection,
                });
                return data.collectionAssets.map((a) => mapGqlAgent(a));
            }
            catch (error) {
                if (!this.shouldUseLegacyCollectionRead(error)) {
                    throw error;
                }
                const data = await this.request(`query($col: String!, $creator: String!, $first: Int!, $skip: Int!, $orderBy: AgentOrderBy!, $dir: OrderDirection!) {
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
          }`, {
                    col: normalizedCollection,
                    creator: creatorScope,
                    first,
                    skip,
                    orderBy,
                    dir: orderDirection,
                });
                return data.collectionAssets.map((a) => mapGqlAgent(a));
            }
        });
    }
    // ============================================================================
    // Feedbacks
    // ============================================================================
    async getFeedbacks(asset, options) {
        const limit = clampInt(options?.limit ?? 100, 0, 1000);
        const initialSkip = clampInt(options?.offset ?? 0, 0, 1_000_000);
        if (limit === 0)
            return [];
        const where = { agent: agentId(asset) };
        if (!options?.includeRevoked) {
            where.isRevoked = false;
        }
        const pageSize = 100;
        const feedbacks = [];
        let skip = initialSkip;
        while (feedbacks.length < limit) {
            const first = Math.min(pageSize, limit - feedbacks.length);
            const data = await this.request(`query($where: FeedbackFilter) {
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
            solana { valueRaw valueDecimals score txSignature blockSlot runningDigest }
          }
        }`, { where });
            const page = data.feedbacks.map((f) => mapGqlFeedback(f, asset));
            if (page.length === 0)
                break;
            feedbacks.push(...page);
            skip += page.length;
        }
        return feedbacks;
    }
    async getFeedback(asset, client, feedbackIndex) {
        const data = await this.request(`query($id: ID!) {
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
      solana { valueRaw valueDecimals score txSignature blockSlot runningDigest }
    }
  }`, { id: feedbackId(asset, client, feedbackIndex) });
        if (!data.feedback)
            return null;
        return mapGqlFeedback(data.feedback, asset);
    }
    async getFeedbackById(feedbackId) {
        const normalizedId = feedbackId.trim();
        const canonical = decodeCanonicalFeedbackId(normalizedId);
        if (canonical) {
            return this.getFeedback(canonical.asset, canonical.client, BigInt(canonical.index));
        }
        if (!/^\d+$/.test(normalizedId))
            return null;
        const data = await this.request(`query($id: ID!) {
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
          solana { valueRaw valueDecimals score txSignature blockSlot runningDigest }
        }
      }`, { id: normalizedId });
        if (!data.feedback)
            return null;
        return mapGqlFeedback(data.feedback);
    }
    async getFeedbacksByClient(client) {
        const pageSize = 100;
        const maxRows = 5000;
        const rows = [];
        let skip = 0;
        while (rows.length < maxRows) {
            const first = Math.min(pageSize, maxRows - rows.length);
            const data = await this.request(`query($client: String!) {
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
            solana { valueRaw valueDecimals score txSignature blockSlot runningDigest }
          }
        }`, { client });
            const page = data.feedbacks ?? [];
            if (page.length === 0)
                break;
            rows.push(...page);
            if (page.length < first)
                break;
            skip += page.length;
        }
        return rows.map((f) => mapGqlFeedback(f));
    }
    async getFeedbacksByTag(tag) {
        // GraphQL filter doesn't support OR on tag1/tag2, so query both and merge.
        // Use paginated reads to stay below hosted GraphQL complexity limits.
        const pageSize = 100;
        const maxRows = 5000;
        const fetchByTagField = async (field) => {
            const rows = [];
            let skip = 0;
            while (rows.length < maxRows) {
                const first = Math.min(pageSize, maxRows - rows.length);
                const data = await this.request(`query($tag: String!) {
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
              solana { valueRaw valueDecimals score txSignature blockSlot runningDigest }
            }
          }`, { tag });
                const page = data.feedbacks ?? [];
                if (page.length === 0)
                    break;
                rows.push(...page);
                if (page.length < first)
                    break;
                skip += page.length;
            }
            return rows;
        };
        const [tag1Rows, tag2Rows] = await Promise.all([
            fetchByTagField('tag1'),
            fetchByTagField('tag2'),
        ]);
        const merged = new Map();
        for (const f of [...tag1Rows, ...tag2Rows]) {
            merged.set(f.id, f);
        }
        return Array.from(merged.values()).map((f) => mapGqlFeedback(f));
    }
    async getFeedbacksByEndpoint(endpoint) {
        const pageSize = 100;
        const maxRows = 5000;
        const rows = [];
        let skip = 0;
        while (rows.length < maxRows) {
            const first = Math.min(pageSize, maxRows - rows.length);
            const data = await this.request(`query($endpoint: String!) {
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
            solana { valueRaw valueDecimals score txSignature blockSlot runningDigest }
          }
        }`, { endpoint });
            const page = data.feedbacks ?? [];
            if (page.length === 0)
                break;
            rows.push(...page);
            if (page.length < first)
                break;
            skip += page.length;
        }
        return rows.map((f) => mapGqlFeedback(f));
    }
    async getAllFeedbacks(options) {
        const first = clampInt(options?.limit ?? 5000, 0, 5000);
        const where = {};
        if (!options?.includeRevoked)
            where.isRevoked = false;
        const data = await this.request(`query($where: FeedbackFilter) {
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
          solana { valueRaw valueDecimals score txSignature blockSlot runningDigest }
        }
      }`, { where: Object.keys(where).length ? where : null });
        return data.feedbacks.map((f) => mapGqlFeedback(f));
    }
    async getLastFeedbackIndex(asset, client) {
        const data = await this.request(`query($agent: ID!, $client: String!) {
        feedbacks(first: 1, where: { agent: $agent, clientAddress: $client }, orderBy: feedbackIndex, orderDirection: desc) {
          feedbackIndex
        }
      }`, { agent: agentId(asset), client });
        if (!data.feedbacks || data.feedbacks.length === 0)
            return -1n;
        return BigInt(data.feedbacks[0].feedbackIndex);
    }
    // ============================================================================
    // Responses
    // ============================================================================
    async getFeedbackResponsesFor(asset, client, feedbackIndex, limit = 100) {
        const data = await this.request(`query($feedback: ID!) {
        feedbackResponses(first: ${clampInt(limit, 0, 1000)}, where: { feedback: $feedback }, orderBy: responseId, orderDirection: asc) {
          id
          responder
          responseUri
          responseHash
          createdAt
          solana { runningDigest responseCount txSignature blockSlot }
        }
      }`, { feedback: feedbackId(asset, client, feedbackIndex) });
        return (data.feedbackResponses ?? []).map((r) => mapGqlFeedbackResponse(r, asset, client, feedbackIndex));
    }
    async getFeedbackResponsesByFeedbackId(feedbackId, limit = 100) {
        const normalizedId = feedbackId.trim();
        const canonical = decodeCanonicalFeedbackId(normalizedId);
        if (canonical) {
            return this.getFeedbackResponsesFor(canonical.asset, canonical.client, BigInt(canonical.index), limit);
        }
        if (!/^\d+$/.test(normalizedId))
            return [];
        const data = await this.request(`query($id: ID!) {
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
      }`, { id: normalizedId });
        if (!data.feedback)
            return [];
        const asset = resolveFeedbackAsset(data.feedback);
        const client = data.feedback.clientAddress;
        const feedbackIndex = data.feedback.feedbackIndex;
        return (data.feedback.responses ?? []).map((response) => mapGqlFeedbackResponse(response, asset, client, feedbackIndex));
    }
    // ============================================================================
    // Validations
    // ============================================================================
    async getPendingValidations(_validator) {
        throw new Error(VALIDATION_ARCHIVED_ERROR);
    }
    // ============================================================================
    // Reputation
    // ============================================================================
    async getAgentReputation(asset) {
        const normalizedAsset = agentId(asset);
        const data = await this.request(`query($asset: ID!) {
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
      }`, { asset: normalizedAsset });
        const row = data.agentReputation;
        if (!row)
            return null;
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
    async getLastFeedbackDigest(asset) {
        const heads = await this.loadHashChainHeads(asset);
        return {
            digest: normalizeHexDigest(heads.feedback.digest),
            count: toExactSafeInteger(heads.feedback.count, 'feedback.count', 0),
        };
    }
    async getLastResponseDigest(asset) {
        const heads = await this.loadHashChainHeads(asset);
        return {
            digest: normalizeHexDigest(heads.response.digest),
            count: toExactSafeInteger(heads.response.count, 'response.count', 0),
        };
    }
    async getLastRevokeDigest(asset) {
        const heads = await this.loadHashChainHeads(asset);
        return {
            digest: normalizeHexDigest(heads.revoke.digest),
            count: toExactSafeInteger(heads.revoke.count, 'revoke.count', 0),
        };
    }
    async getLatestCheckpoints(asset) {
        const data = await this.request(`query($agent: ID!) {
        hashChainLatestCheckpoints(agent: $agent) {
          feedback { eventCount digest createdAt }
          response { eventCount digest createdAt }
          revoke { eventCount digest createdAt }
        }
      }`, { agent: agentId(asset) });
        const mapCp = (cp) => {
            if (!cp)
                return null;
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
    async getReplayData(asset, chainType, fromCount = 0, toCount = 1000, limit = 1000) {
        const first = clampInt(limit, 1, 250);
        const data = await this.request(`query($agent: ID!, $chainType: HashChainType!, $fromCount: BigInt!, $toCount: BigInt) {
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
      }`, {
            agent: agentId(asset),
            chainType: chainType.toUpperCase(),
            fromCount: String(fromCount),
            toCount: toCount != null ? String(toCount) : null,
        });
        const page = data.hashChainReplayData;
        const events = page.events.map((e) => ({
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
    async getFeedbacksAtIndices(asset, indices) {
        const result = new Map();
        if (indices.length === 0)
            return result;
        for (const idx of indices) {
            result.set(idx, null);
        }
        await Promise.all(indices.map(async (idx) => {
            const page = await this.getReplayData(asset, 'feedback', idx, idx + 1, 1);
            const e = page.events[0];
            if (!e)
                return;
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
    async getResponsesAtOffsets(asset, offsets) {
        const result = new Map();
        if (offsets.length === 0)
            return result;
        for (const offset of offsets) {
            result.set(offset, null);
        }
        await Promise.all(offsets.map(async (offset) => {
            const replayCount = offset + 1;
            const page = await this.getReplayData(asset, 'response', replayCount, replayCount + 1, 1);
            const e = page.events[0];
            if (!e)
                return;
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
    async getRevocationsAtCounts(asset, revokeCounts) {
        const result = new Map();
        if (revokeCounts.length === 0)
            return result;
        for (const c of revokeCounts) {
            result.set(c, null);
        }
        await Promise.all(revokeCounts.map(async (c) => {
            if (!Number.isFinite(c) || c < 1)
                return;
            const page = await this.getReplayData(asset, 'revoke', c, c + 1, 1);
            const e = page.events[0];
            if (!e)
                return;
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
//# sourceMappingURL=indexer-graphql-client.js.map