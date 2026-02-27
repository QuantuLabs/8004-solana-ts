/**
 * Indexer Client for GraphQL v2 API
 * Implements the IndexerReadClient contract used by the SDK.
 */
import type { AgentQueryOptions, CheckpointSet, CollectionAssetsQueryOptions, CollectionPointerQueryOptions, CollectionPointerRecord, GlobalStats, IndexedAgent, IndexedAgentReputation, IndexedFeedback, IndexedFeedbackResponse, IndexedRevocation, IndexedValidation, IndexerReadClient, ReplayDataPage } from './indexer-client.js';
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
export declare class IndexerGraphQLClient implements IndexerReadClient {
    private readonly graphqlUrl;
    private readonly headers;
    private readonly timeout;
    private readonly retries;
    private readonly hashChainHeadsInFlight;
    constructor(config: IndexerGraphQLClientConfig);
    getBaseUrl(): string;
    private shouldUseLegacyCollectionRead;
    private shouldFallbackAgentIdField;
    private shouldFallbackAgentIdVariableType;
    private shouldRetryBigIntAgentIdAsNumber;
    private requestAgentBySequentialIdField;
    private requestWithAgentIdField;
    private request;
    isAvailable(): Promise<boolean>;
    private loadHashChainHeads;
    getAgent(asset: string): Promise<IndexedAgent | null>;
    getAgentByAgentId(agentId: string | number | bigint): Promise<IndexedAgent | null>;
    /** @deprecated Use getAgentByAgentId(agentId) */
    getAgentByIndexerId(agentId: string | number | bigint): Promise<IndexedAgent | null>;
    getAgents(options?: AgentQueryOptions): Promise<IndexedAgent[]>;
    getAgentsByOwner(owner: string): Promise<IndexedAgent[]>;
    getAgentsByCollection(collection: string): Promise<IndexedAgent[]>;
    getAgentByWallet(wallet: string): Promise<IndexedAgent | null>;
    getLeaderboard(options?: {
        collection?: string;
        minTier?: number;
        limit?: number;
        cursorSortKey?: string;
    }): Promise<IndexedAgent[]>;
    getGlobalStats(): Promise<GlobalStats>;
    getCollectionPointers(options?: CollectionPointerQueryOptions): Promise<CollectionPointerRecord[]>;
    getCollectionAssetCount(col: string, creator?: string): Promise<number>;
    getCollectionAssets(col: string, options?: CollectionAssetsQueryOptions): Promise<IndexedAgent[]>;
    getFeedbacks(asset: string, options?: {
        includeRevoked?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<IndexedFeedback[]>;
    getFeedback(asset: string, client: string, feedbackIndex: number | bigint): Promise<IndexedFeedback | null>;
    getFeedbacksByClient(client: string): Promise<IndexedFeedback[]>;
    getFeedbacksByTag(tag: string): Promise<IndexedFeedback[]>;
    getFeedbacksByEndpoint(endpoint: string): Promise<IndexedFeedback[]>;
    getAllFeedbacks(options?: {
        includeRevoked?: boolean;
        limit?: number;
    }): Promise<IndexedFeedback[]>;
    getLastFeedbackIndex(asset: string, client: string): Promise<bigint>;
    getFeedbackResponsesFor(asset: string, client: string, feedbackIndex: number | bigint, limit?: number): Promise<IndexedFeedbackResponse[]>;
    getPendingValidations(validator: string): Promise<IndexedValidation[]>;
    getAgentReputation(_asset: string): Promise<IndexedAgentReputation | null>;
    getLastFeedbackDigest(asset: string): Promise<{
        digest: string | null;
        count: number;
    }>;
    getLastResponseDigest(asset: string): Promise<{
        digest: string | null;
        count: number;
    }>;
    getLastRevokeDigest(asset: string): Promise<{
        digest: string | null;
        count: number;
    }>;
    getLatestCheckpoints(asset: string): Promise<CheckpointSet>;
    getReplayData(asset: string, chainType: 'feedback' | 'response' | 'revoke', fromCount?: number, toCount?: number, limit?: number): Promise<ReplayDataPage>;
    getFeedbacksAtIndices(asset: string, indices: number[]): Promise<Map<number, IndexedFeedback | null>>;
    getResponsesAtOffsets(asset: string, offsets: number[]): Promise<Map<number, IndexedFeedbackResponse | null>>;
    getRevocationsAtCounts(asset: string, revokeCounts: number[]): Promise<Map<number, IndexedRevocation | null>>;
}
//# sourceMappingURL=indexer-graphql-client.d.ts.map