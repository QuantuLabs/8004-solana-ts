/**
 * Default Indexer Configuration
 * Public anon key for read-only access to Supabase indexer
 * Browser-compatible - guards process.env access
 *
 * Override via environment variables:
 * - INDEXER_URL: Custom Supabase REST API URL
 * - INDEXER_API_KEY: Custom anon key
 * - FORCE_ON_CHAIN: Set to 'true' to bypass indexer
 */
export declare const DEFAULT_INDEXER_URL: string;
export declare const DEFAULT_INDEXER_API_KEY: string;
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