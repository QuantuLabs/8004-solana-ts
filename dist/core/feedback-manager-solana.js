/**
 * Solana feedback management system for Agent0 SDK
 * v0.4.0 - ATOM Engine + Indexer support
 * Implements the 6 ERC-8004 read functions for Solana
 *
 * BREAKING CHANGES from v0.3.0:
 * - Optional indexer support for fast queries
 * - SolanaFeedback interface extended with event-sourced fields
 */
import { PublicKey } from '@solana/web3.js';
import { PDAHelpers } from './pda-helpers.js';
import { ResponseIndexAccount, ResponseAccount } from './borsh-schemas.js';
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
 * Implements all 6 ERC-8004 read functions
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
            if ((minScore || clientFilter) && this.indexerClient) {
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
        // Get feedbacks from indexer
        const feedbacks = await this.indexerClient.getFeedbacks(asset.toBase58(), {
            includeRevoked: false,
        });
        // Apply filters
        const filtered = feedbacks.filter((f) => (!minScore || f.score >= minScore) &&
            (!clientFilter || f.client_address === clientFilter.toBase58()));
        const sum = filtered.reduce((acc, f) => acc + f.score, 0);
        const uniqueClients = new Set(filtered.map((f) => f.client_address));
        const positiveCount = filtered.filter((f) => f.score >= 50).length;
        const negativeCount = filtered.filter((f) => f.score < 50).length;
        return {
            averageScore: filtered.length > 0 ? sum / filtered.length : 0,
            totalFeedbacks: filtered.length,
            nextFeedbackIndex: filtered.length,
            totalClients: uniqueClients.size,
            positiveCount,
            negativeCount,
        };
    }
    /**
     * 2. readFeedback - Read single feedback - v0.4.0
     * @param asset - Agent Core asset pubkey
     * @param _client - Client public key (kept for API compatibility)
     * @param feedbackIndex - Feedback index
     * @returns Feedback object or null if not found
     *
     * v0.4.0: FeedbackAccount PDAs no longer exist - uses indexer
     * REQUIRES indexer to be configured
     */
    async readFeedback(asset, _client, feedbackIndex) {
        if (!this.indexerClient) {
            logger.error('readFeedback requires indexer - FeedbackAccount PDAs removed in v0.4.0');
            throw new Error('Indexer required for readFeedback in v0.4.0');
        }
        try {
            // Get all feedbacks for this asset from indexer
            const feedbacks = await this.indexerClient.getFeedbacks(asset.toBase58(), {
                includeRevoked: true,
            });
            // Find the specific feedback by index
            const indexed = feedbacks.find((f) => f.feedback_index === Number(feedbackIndex));
            if (!indexed) {
                return null;
            }
            return this.mapIndexedFeedback(indexed);
        }
        catch (error) {
            logger.error(`Error reading feedback index ${feedbackIndex}`, error);
            return null;
        }
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
        try {
            const feedbacks = await this.indexerClient.getFeedbacks(asset.toBase58(), {
                includeRevoked,
                limit: maxResults,
            });
            return feedbacks.map((f) => this.mapIndexedFeedback(f));
        }
        catch (error) {
            logger.error(`Error reading all feedback for agent`, error);
            return [];
        }
    }
    /**
     * 4. getLastIndex - Get feedback count for a client - v0.4.0
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key
     * @returns Count of feedbacks given by this client
     *
     * v0.4.0: Uses indexer for efficient client-scoped query
     * REQUIRES indexer to be configured
     */
    async getLastIndex(asset, client) {
        if (!this.indexerClient) {
            logger.error('getLastIndex requires indexer - FeedbackAccount PDAs removed in v0.4.0');
            throw new Error('Indexer required for getLastIndex in v0.4.0');
        }
        try {
            // Get all feedbacks for this asset and filter by client
            const feedbacks = await this.indexerClient.getFeedbacks(asset.toBase58(), {
                includeRevoked: true,
            });
            const clientFeedbacks = feedbacks.filter((f) => f.client_address === client.toBase58());
            return BigInt(clientFeedbacks.length);
        }
        catch (error) {
            logger.error(`Error getting last index for client`, error);
            return BigInt(0);
        }
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
        try {
            const feedbacks = await this.indexerClient.getFeedbacks(asset.toBase58(), {
                includeRevoked: true,
            });
            // Extract unique client pubkeys
            const uniqueClients = Array.from(new Set(feedbacks.map((f) => f.client_address))).map((base58) => new PublicKey(base58));
            return uniqueClients;
        }
        catch (error) {
            logger.error(`Error getting clients for agent`, error);
            return [];
        }
    }
    /**
     * 6. getResponseCount - Get number of responses for a feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index
     * @returns Number of responses
     */
    async getResponseCount(asset, feedbackIndex) {
        try {
            const [responseIndexPDA] = PDAHelpers.getResponseIndexPDA(asset, feedbackIndex);
            const data = await this.client.getAccount(responseIndexPDA);
            if (!data) {
                return 0;
            }
            const responseIndex = ResponseIndexAccount.deserialize(data);
            return Number(responseIndex.next_index);
        }
        catch (error) {
            logger.error(`Error getting response count for feedback index ${feedbackIndex}`, error);
            return 0;
        }
    }
    /**
     * Bonus: Read all responses for a feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index
     * @returns Array of response objects
     */
    async readResponses(asset, feedbackIndex) {
        try {
            // Get response count first
            const responseCount = await this.getResponseCount(asset, feedbackIndex);
            if (responseCount === 0) {
                return [];
            }
            // Fetch all responses by deriving PDAs
            const responsePDAs = [];
            for (let i = 0; i < responseCount; i++) {
                const [responsePDA] = PDAHelpers.getResponsePDA(asset, feedbackIndex, BigInt(i));
                responsePDAs.push(responsePDA);
            }
            // Batch fetch all response accounts
            const accountsData = await this.client.getMultipleAccounts(responsePDAs);
            const responses = [];
            let skipped = 0;
            for (let i = 0; i < accountsData.length; i++) {
                const data = accountsData[i];
                if (data) {
                    try {
                        const response = ResponseAccount.deserialize(data);
                        responses.push({
                            asset,
                            feedbackIndex,
                            responseIndex: BigInt(i),
                            responder: response.getResponderPublicKey(),
                        });
                    }
                    catch {
                        skipped++;
                    }
                }
            }
            if (skipped > 0) {
                logger.warn(`Skipped ${skipped} malformed response account(s)`);
            }
            return responses;
        }
        catch (error) {
            logger.error(`Error reading responses for feedback index ${feedbackIndex}`, error);
            return [];
        }
    }
    /**
     * Read feedbacks from indexer (v0.4.0)
     * Falls back to on-chain if indexer unavailable
     * @param asset - Agent Core asset pubkey
     * @param options - Query options
     * @returns Array of feedbacks with full event-sourced data
     */
    async readFeedbackListFromIndexer(asset, options) {
        if (!this.indexerClient) {
            logger.warn('No indexer client configured, falling back to on-chain');
            return this.readAllFeedback(asset, options?.includeRevoked ?? false);
        }
        try {
            const indexed = await this.indexerClient.getFeedbacks(asset.toBase58(), options);
            return indexed.map((f) => this.mapIndexedFeedback(f));
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.warn(`Indexer failed, falling back to on-chain: ${errMsg}`);
            return this.readAllFeedback(asset, options?.includeRevoked ?? false);
        }
    }
    /**
     * Helper to map IndexedFeedback to SolanaFeedback - v0.4.0
     */
    mapIndexedFeedback(indexed) {
        return {
            asset: new PublicKey(indexed.asset),
            client: new PublicKey(indexed.client_address),
            feedbackIndex: BigInt(indexed.feedback_index),
            score: indexed.score,
            tag1: indexed.tag1 || '',
            tag2: indexed.tag2 || '',
            revoked: indexed.is_revoked,
            isRevoked: indexed.is_revoked,
            endpoint: indexed.endpoint || '',
            feedbackUri: indexed.feedback_uri || '',
            feedbackHash: indexed.feedback_hash
                ? Buffer.from(indexed.feedback_hash, 'hex')
                : undefined,
            blockSlot: BigInt(indexed.block_slot),
            txSignature: indexed.tx_signature,
        };
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
     * REQUIRES indexer to be configured
     * Note: For large datasets, consider using indexer APIs directly
     */
    async fetchAllFeedbacks(includeRevoked = false, options = {}) {
        if (!this.indexerClient) {
            logger.error('fetchAllFeedbacks requires indexer - FeedbackAccount PDAs removed in v0.4.0');
            throw new Error('Indexer required for fetchAllFeedbacks in v0.4.0');
        }
        const maxResults = options.maxResults ?? DEFAULT_MAX_ALL_FEEDBACKS;
        try {
            // Get all agents from indexer
            const agents = await this.indexerClient.getAgents({ limit: 1000 });
            // Fetch feedbacks for each agent in parallel (batched)
            const grouped = new Map();
            let totalProcessed = 0;
            // Process in batches of 10 to avoid overwhelming the indexer
            const batchSize = 10;
            for (let i = 0; i < agents.length && totalProcessed < maxResults; i += batchSize) {
                const batch = agents.slice(i, i + batchSize);
                const batchResults = await Promise.all(batch.map(async (agent) => {
                    const feedbacks = await this.indexerClient.getFeedbacks(agent.asset, {
                        includeRevoked,
                        limit: Math.min(100, maxResults - totalProcessed),
                    });
                    return { asset: agent.asset, feedbacks };
                }));
                for (const { asset, feedbacks } of batchResults) {
                    if (feedbacks.length > 0 && totalProcessed < maxResults) {
                        const mapped = feedbacks
                            .slice(0, maxResults - totalProcessed)
                            .map((f) => this.mapIndexedFeedback(f));
                        grouped.set(asset, mapped);
                        totalProcessed += mapped.length;
                    }
                }
            }
            logger.debug(`fetchAllFeedbacks processed ${totalProcessed} feedbacks across ${grouped.size} agents`);
            return grouped;
        }
        catch (error) {
            logger.error('Error fetching all feedbacks', error);
            return new Map();
        }
    }
}
//# sourceMappingURL=feedback-manager-solana.js.map