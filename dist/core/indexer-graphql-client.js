/**
 * Indexer Client for GraphQL v2 API
 * Implements the IndexerReadClient contract used by the SDK.
 */
import { IndexerError, IndexerErrorCode, IndexerRateLimitError, IndexerTimeoutError, IndexerUnauthorizedError, IndexerUnavailableError, } from './indexer-errors.js';
function toIsoFromUnixSeconds(unix) {
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
function agentId(asset) {
    return `sol:${asset}`;
}
function feedbackId(asset, client, index) {
    return `sol:${asset}:${client}:${index.toString()}`;
}
function decodeFeedbackId(id) {
    const parts = id.split(':');
    if (parts.length !== 4 || parts[0] !== 'sol')
        return null;
    const [, asset, client, index] = parts;
    if (!asset || !client || !index)
        return null;
    return { asset, client, index };
}
function decodeValidationId(id) {
    const parts = id.split(':');
    if (parts.length !== 4 || parts[0] !== 'sol')
        return null;
    const [, asset, validator, nonce] = parts;
    if (!asset || !validator || !nonce)
        return null;
    return { asset, validator, nonce };
}
function mapValidationStatus(status) {
    if (status === 'PENDING')
        return 'PENDING';
    // GraphQL uses COMPLETED; legacy SDK uses RESPONDED.
    return 'RESPONDED';
}
export class IndexerGraphQLClient {
    graphqlUrl;
    headers;
    timeout;
    retries;
    hashChainHeadsInFlight = new Map();
    constructor(config) {
        this.graphqlUrl = config.graphqlUrl.replace(/\/$/, '');
        this.headers = config.headers ?? {};
        this.timeout = config.timeout ?? 10000;
        this.retries = config.retries ?? 2;
    }
    getBaseUrl() {
        return this.graphqlUrl;
    }
    async request(query, variables) {
        let lastError = null;
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
                    if (attempt < this.retries) {
                        await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                        continue;
                    }
                    throw new IndexerError(`GraphQL request failed: HTTP ${response.status}${details ? ` (${details})` : ''}`, IndexerErrorCode.SERVER_ERROR);
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
    async isAvailable() {
        try {
            await this.request('query { __typename }');
            return true;
        }
        catch {
            return false;
        }
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
        const data = await this.request(`query($id: ID!) {
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
      }`, { id: agentId(asset) });
        if (!data.agent)
            return null;
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
    async getAgents(options) {
        const limit = clampInt(options?.limit ?? 100, 0, 500);
        const offset = clampInt(options?.offset ?? 0, 0, 1_000_000);
        // Legacy order string (PostgREST-style) mapping
        const order = options?.order ?? 'created_at.desc';
        const orderDirection = order.includes('.asc') ? 'asc' : 'desc';
        const data = await this.request(`query($dir: OrderDirection!) {
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
      }`, { dir: orderDirection });
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
    async getAgentsByOwner(owner) {
        const data = await this.request(`query($owner: String!) {
        agents(first: 250, where: { owner: $owner }, orderBy: createdAt, orderDirection: desc) {
          owner agentURI agentWallet createdAt updatedAt totalFeedback
          solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
        }
      }`, { owner });
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
    async getAgentsByCollection(collection) {
        const data = await this.request(`query($collection: String!) {
        agents(first: 250, where: { collection: $collection }, orderBy: createdAt, orderDirection: desc) {
          owner agentURI agentWallet createdAt updatedAt totalFeedback
          solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
        }
      }`, { collection });
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
    async getAgentByWallet(wallet) {
        const data = await this.request(`query($wallet: String!) {
        agents(first: 1, where: { agentWallet: $wallet }, orderBy: createdAt, orderDirection: desc) {
          owner agentURI agentWallet createdAt updatedAt totalFeedback
          solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
        }
      }`, { wallet });
        if (!data.agents || data.agents.length === 0)
            return null;
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
    async getLeaderboard(options) {
        const limit = clampInt(options?.limit ?? 50, 0, 200);
        const where = {};
        if (options?.collection)
            where.collection = options.collection;
        if (options?.minTier !== undefined)
            where.trustTier_gte = options.minTier;
        const data = await this.request(`query($where: AgentFilter) {
        agents(first: ${limit}, where: $where, orderBy: qualityScore, orderDirection: desc) {
          owner agentURI agentWallet createdAt updatedAt totalFeedback
          solana { assetPubkey collection atomEnabled trustTier qualityScore confidence riskScore diversityRatio }
        }
      }`, { where: Object.keys(where).length ? where : null });
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
    async getGlobalStats() {
        const data = await this.request(`query {
        protocols { totalAgents totalFeedback totalValidations }
      }`);
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
    async getFeedbacks(asset, options) {
        const first = clampInt(options?.limit ?? 100, 0, 1000);
        const skip = clampInt(options?.offset ?? 0, 0, 1_000_000);
        const where = { agent: agentId(asset) };
        if (!options?.includeRevoked) {
            where.isRevoked = false;
        }
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
          solana { valueRaw valueDecimals score txSignature blockSlot }
        }
      }`, { where });
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
      solana { valueRaw valueDecimals score txSignature blockSlot }
    }
  }`, { id: feedbackId(asset, client, feedbackIndex) });
        if (!data.feedback)
            return null;
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
    async getFeedbacksByClient(client) {
        const data = await this.request(`query($client: String!) {
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
      }`, { client });
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
    async getFeedbacksByTag(tag) {
        // GraphQL filter doesn't support OR on tag1/tag2, so query both and merge.
        const [tag1, tag2] = await Promise.all([
            this.request(`query($tag: String!) {
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
        }`, { tag }),
            this.request(`query($tag: String!) {
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
        }`, { tag }),
        ]);
        const merged = new Map();
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
    async getFeedbacksByEndpoint(endpoint) {
        const data = await this.request(`query($endpoint: String!) {
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
      }`, { endpoint });
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
    async getAllFeedbacks(options) {
        const first = clampInt(options?.limit ?? 5000, 0, 5000);
        const where = {};
        if (!options?.includeRevoked)
            where.isRevoked = false;
        const data = await this.request(`query($where: FeedbackFilter) {
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
      }`, { where: Object.keys(where).length ? where : null });
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
        feedbackResponses(first: ${clampInt(limit, 0, 1000)}, where: { feedback: $feedback }, orderBy: createdAt, orderDirection: asc) {
          id
          responder
          responseUri
          responseHash
          createdAt
          solana { txSignature blockSlot }
        }
      }`, { feedback: feedbackId(asset, client, feedbackIndex) });
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
    async getPendingValidations(validator) {
        const data = await this.request(`query($validator: String!) {
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
      }`, { validator });
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
    async getAgentReputation(_asset) {
        // Not exposed by GraphQL v2. Prefer on-chain fallback in SolanaSDK.getAgentReputationFromIndexer().
        return null;
    }
    // ============================================================================
    // Integrity (hash-chain)
    // ============================================================================
    async getLastFeedbackDigest(asset) {
        const heads = await this.loadHashChainHeads(asset);
        return {
            digest: normalizeHexDigest(heads.feedback.digest),
            count: toIntSafe(heads.feedback.count, 0),
        };
    }
    async getLastResponseDigest(asset) {
        const heads = await this.loadHashChainHeads(asset);
        return {
            digest: normalizeHexDigest(heads.response.digest),
            count: toIntSafe(heads.response.count, 0),
        };
    }
    async getLastRevokeDigest(asset) {
        const heads = await this.loadHashChainHeads(asset);
        return {
            digest: normalizeHexDigest(heads.revoke.digest),
            count: toIntSafe(heads.revoke.count, 0),
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
    async getReplayData(asset, chainType, fromCount = 0, toCount = 1000, limit = 1000) {
        const first = clampInt(limit, 1, 1000);
        const data = await this.request(`query($agent: ID!, $chainType: HashChainType!, $fromCount: BigInt!, $toCount: BigInt, $first: Int!) {
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
      }`, {
            agent: agentId(asset),
            chainType: chainType.toUpperCase(),
            fromCount: String(fromCount),
            toCount: toCount != null ? String(toCount) : null,
            first,
        });
        const page = data.hashChainReplayData;
        const events = page.events.map((e) => ({
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
            const page = await this.getReplayData(asset, 'response', offset, offset + 1, 1);
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
            const idx = c - 1;
            const page = await this.getReplayData(asset, 'revoke', idx, idx + 1, 1);
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
                revoke_count: e.revoke_count ?? idx,
                tx_signature: '',
                created_at: new Date(0).toISOString(),
            });
        }));
        return result;
    }
}
//# sourceMappingURL=indexer-graphql-client.js.map