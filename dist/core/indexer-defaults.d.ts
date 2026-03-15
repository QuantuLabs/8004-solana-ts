/**
 * Default Indexer Configuration
 * Browser-compatible - guards process.env access
 *
 * Override via environment variables:
 * - INDEXER_GRAPHQL_URL: Custom GraphQL v2 endpoint (recommended)
 *
 * Legacy REST v1:
 * - INDEXER_URL: Custom REST API URL
 * - INDEXER_API_KEY: Optional API key/bearer token (only if your endpoint requires it)
 * - FORCE_ON_CHAIN: Set to 'true' to bypass indexer
 *
 * Built-in public endpoint order:
 * - devnet/testnet: primary `8004-indexer-dev`, then fallback `8004-indexer-dev2`
 * - mainnet-beta: primary `8004-indexer-main`, then fallback `8004-indexer-main2`
 */
import type { Cluster } from './client.js';
export declare function getDefaultIndexerUrl(cluster: Cluster): string;
export declare function getDefaultIndexerGraphqlUrl(cluster: Cluster): string;
export declare function getDefaultIndexerUrls(cluster: Cluster): string[];
export declare function getDefaultIndexerGraphqlUrls(cluster: Cluster): string[];
export declare function getDefaultIndexerApiKey(): string;
export declare const DEFAULT_INDEXER_URL: string;
export declare const DEFAULT_INDEXER_API_KEY: string;
export declare const DEFAULT_INDEXER_GRAPHQL_URL: string;
/**
 * Force on-chain mode (bypass indexer):
 * - false (default): Smart routing - RPC for small queries, indexer for large
 * - true: Force all on-chain (indexer-only methods will throw)
 */
export declare const DEFAULT_FORCE_ON_CHAIN: boolean;
/**
 * List of operations considered "small queries" that prefer RPC
 * These are single-account fetches or queries with predictably small result sets
 */
export declare const SMALL_QUERY_OPERATIONS: readonly ["getAgent", "getCollection", "readFeedback", "getSummary"];
//# sourceMappingURL=indexer-defaults.d.ts.map