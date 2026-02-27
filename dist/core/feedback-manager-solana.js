/**
 * Solana feedback management system for Agent0 SDK
 * v0.4.0 - ATOM Engine + Indexer support
 * Implements the 6 8004 read functions for Solana
 *
 * BREAKING CHANGES from v0.3.0:
 * - Optional indexer support for fast queries
 * - SolanaFeedback interface extended with event-sourced fields
 */
import { PublicKey } from '@solana/web3.js';
import { indexedFeedbackToSolanaFeedback } from './indexer-types.js';
import { AtomStats } from './atom-schemas.js';
import { getAtomStatsPDA } from './atom-pda.js';
import { logger } from '../utils/logger.js';
/**
 * Security: Default limits for getProgramAccounts to prevent OOM
 */
const DEFAULT_MAX_FEEDBACKS = 1000;
const DEFAULT_MAX_ALL_FEEDBACKS = 5000;
/**
 * Manages feedback operations for Solana - v0.4.0
 * Implements all 6 8004 read functions
 * Optional indexer support for fast queries
 */
export class SolanaFeedbackManager {
    client;
    ipfsClient;
    indexerClient;
    constructor(client, ipfsClient, indexerClient) {
        this.client = client;
        this.ipfsClient = ipfsClient;
        this.indexerClient = indexerClient;
    }
    /**
     * Set the indexer client (for late binding)
     */
    setIndexerClient(indexerClient) {
        this.indexerClient = indexerClient;
    }
    /**
     * 1. getSummary - Get agent reputation summary - v0.4.0
     * @param asset - Agent Core asset pubkey
     * @param minScore - Optional minimum score filter (requires indexer for filtering)
     * @param clientFilter - Optional client address filter (requires indexer for filtering)
     * @returns Summary with average score, total feedbacks, and positive/negative counts
     *
     * v0.4.0: Uses AtomStats on-chain (primary) with indexer fallback
     * Note: minScore and clientFilter require indexer for accurate filtering
     */
    async getSummary(asset, minScore, clientFilter) {
        try {
            // If filters are provided, must use indexer for accurate results
            if ((minScore !== undefined || clientFilter) && this.indexerClient) {
                return this.getSummaryFromIndexer(asset, minScore, clientFilter);
            }
            // Primary: Read AtomStats on-chain
            const atomStats = await this.getAtomStatsForSummary(asset);
            if (atomStats) {
                // Convert quality_score (0-10000) to average score (0-100)
                const averageScore = atomStats.quality_score / 100;
                const totalFeedbacks = Number(atomStats.feedback_count);
                // Estimate positive/negative from quality score
                // If quality > 5000, assume more positive; otherwise more negative
                const positiveRatio = atomStats.quality_score / 10000;
                const positiveCount = Math.round(totalFeedbacks * positiveRatio);
                const negativeCount = totalFeedbacks - positiveCount;
                return {
                    averageScore,
                    totalFeedbacks,
                    nextFeedbackIndex: totalFeedbacks,
                    totalClients: atomStats.getUniqueCallersEstimate(),
                    positiveCount,
                    negativeCount,
                };
            }
            // Fallback: Use indexer if available
            if (this.indexerClient) {
                return this.getSummaryFromIndexer(asset, minScore, clientFilter);
            }
            // No data available
            return {
                averageScore: 0,
                totalFeedbacks: 0,
                nextFeedbackIndex: 0,
                totalClients: 0,
                positiveCount: 0,
                negativeCount: 0,
            };
        }
        catch (error) {
            logger.error(`Error getting summary for agent`, error);
            return {
                averageScore: 0,
                totalFeedbacks: 0,
                nextFeedbackIndex: 0,
                totalClients: 0,
                positiveCount: 0,
                negativeCount: 0,
            };
        }
    }
    /**
     * Get AtomStats for summary calculation
     * @internal
     */
    async getAtomStatsForSummary(asset) {
        try {
            const [atomStatsPDA] = getAtomStatsPDA(asset);
            const data = await this.client.getAccount(atomStatsPDA);
            if (!data)
                return null;
            return AtomStats.deserialize(Buffer.from(data));
        }
        catch {
            return null;
        }
    }
    /**
     * Get summary from indexer (fallback or when filters are needed)
     * @internal
     */
    async getSummaryFromIndexer(asset, minScore, clientFilter) {
        if (!this.indexerClient) {
            throw new Error('Indexer required for filtered queries');
        }
        // Fast path: for unfiltered summaries, prefer the aggregated agent record.
        // This avoids fetching feedback rows and is compatible with GraphQL backends that
        // enforce strict query complexity limits.
        if (minScore === undefined && !clientFilter) {
            const indexedAgent = await this.indexerClient.getAgent(asset.toBase58());
            if (!indexedAgent) {
                return {
                    averageScore: 0,
                    totalFeedbacks: 0,
                    nextFeedbackIndex: 0,
                    totalClients: 0,
                    positiveCount: 0,
                    negativeCount: 0,
                };
            }
            const totalFeedbacks = indexedAgent.feedback_count ?? 0;
            const averageScore = (indexedAgent.quality_score ?? 0) / 100;
            // We do not have an exact positive/negative split from the agent record alone.
            // Provide a consistent approximation based on ATOM quality score.
            const positiveRatio = (indexedAgent.quality_score ?? 0) / 10000;
            const positiveCount = Math.round(totalFeedbacks * positiveRatio);
            const negativeCount = totalFeedbacks - positiveCount;
            return {
                averageScore,
                totalFeedbacks,
                nextFeedbackIndex: totalFeedbacks,
                totalClients: 0,
                positiveCount,
                negativeCount,
            };
        }
        // Get feedbacks from indexer (bounded)
        const feedbacks = await this.indexerClient.getFeedbacks(asset.toBase58(), {
            includeRevoked: false,
            limit: DEFAULT_MAX_FEEDBACKS,
        });
        // Apply filters (score can be null)
        const filtered = feedbacks.filter((f) => (minScore === undefined || (f.score !== null && f.score >= minScore)) &&
            (!clientFilter || f.client_address === clientFilter.toBase58()));
        // Only sum feedbacks with non-null scores
        const withScore = filtered.filter((f) => f.score !== null);
        const sum = withScore.reduce((acc, f) => acc + (f.score ?? 0), 0);
        const uniqueClients = new Set(filtered.map((f) => f.client_address));
        const positiveCount = withScore.filter((f) => (f.score ?? 0) >= 50).length;
        const negativeCount = withScore.filter((f) => (f.score ?? 0) < 50).length;
        let nextFeedbackIndex = filtered.length;
        try {
            const indexedAgent = await this.indexerClient.getAgent(asset.toBase58());
            if (indexedAgent && typeof indexedAgent.feedback_count === 'number') {
                nextFeedbackIndex = indexedAgent.feedback_count;
            }
        }
        catch {
            // Keep filtered-length fallback when the aggregate agent row is unavailable.
        }
        return {
            averageScore: withScore.length > 0 ? sum / withScore.length : 0,
            totalFeedbacks: filtered.length,
            nextFeedbackIndex,
            totalClients: uniqueClients.size,
            positiveCount,
            negativeCount,
        };
    }
    /**
     * 2. readFeedback - Read single feedback - v0.4.1
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key (who gave the feedback)
     * @param feedbackIndex - Feedback index (per client per agent)
     * @returns Feedback object or null if not found
     *
     * v0.4.0: FeedbackAccount PDAs no longer exist - uses indexer
     * v0.4.1: Fixed to filter by client (audit finding #1 HIGH)
     * REQUIRES indexer to be configured
     */
    async readFeedback(asset, client, feedbackIndex) {
        if (!this.indexerClient) {
            logger.error('readFeedback requires indexer - FeedbackAccount PDAs removed in v0.4.0');
            throw new Error('Indexer required for readFeedback in v0.4.0');
        }
        // Get specific feedback by asset, client, and index (8004 compliant)
        const indexed = await this.indexerClient.getFeedback(asset.toBase58(), client.toBase58(), feedbackIndex);
        if (!indexed) {
            logger.warn(`Feedback index ${feedbackIndex} not yet indexed. It may take a few seconds for the indexer to process new transactions. Try again shortly.`);
            return null;
        }
        return this.mapIndexedFeedback(indexed);
    }
    /**
     * 3. readAllFeedback - Read all feedbacks for an agent - v0.4.0
     * @param asset - Agent Core asset pubkey
     * @param includeRevoked - Include revoked feedbacks (default: false)
     * @param options - Query options including maxResults limit
     * @returns Array of feedback objects
     *
     * v0.4.0: FeedbackAccount PDAs no longer exist - uses indexer
     * REQUIRES indexer to be configured
     */
    async readAllFeedback(asset, includeRevoked = false, options = {}) {
        if (!this.indexerClient) {
            logger.error('readAllFeedback requires indexer - FeedbackAccount PDAs removed in v0.4.0');
            throw new Error('Indexer required for readAllFeedback in v0.4.0');
        }
        const maxResults = options.maxResults ?? DEFAULT_MAX_FEEDBACKS;
        const feedbacks = await this.indexerClient.getFeedbacks(asset.toBase58(), {
            includeRevoked,
            limit: maxResults,
        });
        return feedbacks.map((f) => this.mapIndexedFeedback(f));
    }
    /**
     * 4. getLastIndex - Get the last feedback index for a client - v0.4.0
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key
     * @returns Last feedback index (-1 if no feedbacks, so next index = lastIndex + 1)
     *
     * v0.4.0: Uses indexer for efficient client-scoped query
     * REQUIRES indexer to be configured
     *
     * Semantics: Returns MAX index, not COUNT. Consistent with IndexerClient.getLastFeedbackIndex()
     * - No feedbacks → returns -1n (next index = 0)
     * - 3 feedbacks (0,1,2) → returns 2n (next index = 3)
     */
    async getLastIndex(asset, client) {
        if (!this.indexerClient) {
            logger.error('getLastIndex requires indexer - FeedbackAccount PDAs removed in v0.4.0');
            throw new Error('Indexer required for getLastIndex in v0.4.0');
        }
        return this.indexerClient.getLastFeedbackIndex(asset.toBase58(), client.toBase58());
    }
    /**
     * 5. getClients - Get all clients who gave feedback to an agent - v0.4.0
     * @param asset - Agent Core asset pubkey
     * @returns Array of unique client public keys
     *
     * v0.4.0: Uses indexer for efficient query
     * REQUIRES indexer to be configured
     */
    async getClients(asset) {
        if (!this.indexerClient) {
            logger.error('getClients requires indexer - FeedbackAccount PDAs removed in v0.4.0');
            throw new Error('Indexer required for getClients in v0.4.0');
        }
        const feedbacks = await this.indexerClient.getFeedbacks(asset.toBase58(), {
            includeRevoked: true,
            limit: DEFAULT_MAX_FEEDBACKS,
        });
        // Extract unique client pubkeys
        const uniqueClients = Array.from(new Set(feedbacks.map((f) => f.client_address))).map((base58) => new PublicKey(base58));
        return uniqueClients;
    }
    /**
     * 6. getResponseCount - Get number of responses for a feedback - v0.4.1
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key (who gave the feedback)
     * @param feedbackIndex - Feedback index
     * @returns Number of responses
     *
     * v0.4.1: Migrated to indexer (audit finding #3 HIGH)
     * Response PDAs no longer exist - data is event-only and indexed off-chain
     * REQUIRES indexer to be configured
     */
    async getResponseCount(asset, client, feedbackIndex) {
        if (!this.indexerClient) {
            logger.error('getResponseCount requires indexer - Response PDAs removed in v0.4.0');
            throw new Error('Indexer required for getResponseCount in v0.4.1');
        }
        const responses = await this.indexerClient.getFeedbackResponsesFor(asset.toBase58(), client.toBase58(), feedbackIndex);
        return responses.length;
    }
    /**
     * Bonus: Read all responses for a feedback - v0.4.1
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key (who gave the feedback)
     * @param feedbackIndex - Feedback index
     * @returns Array of response objects
     *
     * v0.4.1: Migrated to indexer (audit finding #3 HIGH)
     * Response PDAs no longer exist - data is event-only and indexed off-chain
     * REQUIRES indexer to be configured
     */
    async readResponses(asset, client, feedbackIndex) {
        if (!this.indexerClient) {
            logger.error('readResponses requires indexer - Response PDAs removed in v0.4.0');
            throw new Error('Indexer required for readResponses in v0.4.1');
        }
        try {
            const indexedResponses = await this.indexerClient.getFeedbackResponsesFor(asset.toBase58(), client.toBase58(), feedbackIndex);
            if (indexedResponses.length === 0) {
                logger.debug(`No responses found for feedback index ${feedbackIndex}. If recently submitted, the indexer may not have processed it yet.`);
            }
            return indexedResponses.map((r, i) => ({
                asset,
                feedbackIndex,
                responseIndex: BigInt(i),
                responder: new PublicKey(r.responder),
            }));
        }
        catch (error) {
            logger.error(`Error reading responses for feedback index ${feedbackIndex}`, error);
            throw error;
        }
    }
    /**
     * Read feedbacks from indexer
     * @param asset - Agent Core asset pubkey
     * @param options - Query options
     * @returns Array of feedbacks with full event-sourced data
     */
    async readFeedbackListFromIndexer(asset, options) {
        if (!this.indexerClient) {
            throw new Error('Indexer required for readFeedbackListFromIndexer');
        }
        const indexed = await this.indexerClient.getFeedbacks(asset.toBase58(), options);
        return indexed.map((f) => this.mapIndexedFeedback(f));
    }
    /**
     * Helper to map IndexedFeedback to SolanaFeedback
     */
    mapIndexedFeedback(indexed) {
        return indexedFeedbackToSolanaFeedback(indexed);
    }
    /**
     * Helper to fetch and parse feedback file from IPFS/Arweave
     */
    async fetchFeedbackFile(_uri) {
        if (!this.ipfsClient) {
            logger.warn('IPFS client not configured, cannot fetch feedback file');
            return null;
        }
        try {
            // This would use the ipfsClient to fetch
            // For now, return null as IPFS client needs to be adapted
            return null;
        }
        catch (error) {
            logger.error(`Error fetching feedback file`, error);
            return null;
        }
    }
    /**
     * Fetch ALL feedbacks for ALL agents - v0.4.0
     * @param includeRevoked - Include revoked feedbacks? default: false
     * @param options - Query options including maxResults limit
     * @returns Map of asset (base58 string) -> SolanaFeedback[]
     *
     * v0.4.0: FeedbackAccount PDAs no longer exist - uses indexer
     * v0.4.2: Optimized to use single bulk query instead of N+1 pattern
     * REQUIRES indexer to be configured
     */
    async fetchAllFeedbacks(includeRevoked = false, options = {}) {
        if (!this.indexerClient) {
            logger.error('fetchAllFeedbacks requires indexer - FeedbackAccount PDAs removed in v0.4.0');
            throw new Error('Indexer required for fetchAllFeedbacks in v0.4.0');
        }
        const maxResults = options.maxResults ?? DEFAULT_MAX_ALL_FEEDBACKS;
        try {
            // Single bulk query instead of N+1 (one query per agent)
            const allFeedbacks = await this.indexerClient.getAllFeedbacks({
                includeRevoked,
                limit: maxResults,
            });
            // Group feedbacks by asset
            const grouped = new Map();
            for (const indexed of allFeedbacks) {
                const mapped = this.mapIndexedFeedback(indexed);
                const existing = grouped.get(indexed.asset) || [];
                existing.push(mapped);
                grouped.set(indexed.asset, existing);
            }
            logger.debug(`fetchAllFeedbacks processed ${allFeedbacks.length} feedbacks across ${grouped.size} agents`);
            return grouped;
        }
        catch (error) {
            logger.error('Error fetching all feedbacks', error);
            return new Map();
        }
    }
}
// Modified:
// - readFeedback: Now filters by client parameter
// - getResponseCount: Migrated to indexer, added client parameter
// - readResponses: Migrated to indexer, added client parameter
//# sourceMappingURL=feedback-manager-solana.js.map