/**
 * Default Indexer Configuration
 * Public anon key for read-only access to Supabase indexer
 *
 * Override via environment variables:
 * - INDEXER_URL: Custom Supabase REST API URL
 * - INDEXER_API_KEY: Custom anon key
 * - FORCE_ON_CHAIN: Set to 'true' to bypass indexer
 */
// Hardcoded defaults (public anon key - safe to commit)
const HARDCODED_INDEXER_URL = 'https://uhjytdjxvfbppgjicfly.supabase.co/rest/v1';
const HARDCODED_INDEXER_API_KEY = 'sb_publishable_i-ycBRGiolBr8GMdiVq1rA_nwt7N2bq';
// Export with env override
export const DEFAULT_INDEXER_URL = process.env.INDEXER_URL || HARDCODED_INDEXER_URL;
export const DEFAULT_INDEXER_API_KEY = process.env.INDEXER_API_KEY || HARDCODED_INDEXER_API_KEY;
/**
 * Force on-chain mode (bypass indexer):
 * - false (default): Smart routing - RPC for small queries, indexer for large
 * - true: Force all on-chain (indexer-only methods will throw)
 */
export const DEFAULT_FORCE_ON_CHAIN = process.env.FORCE_ON_CHAIN === 'true';
/**
 * List of operations considered "small queries" that prefer RPC
 * These are single-account fetches or queries with predictably small result sets
 */
export const SMALL_QUERY_OPERATIONS = [
    'getAgent',
    'getCollection',
    'readFeedback',
    'getSummary',
];
// Tables accessible via anon key (RLS public read enabled):
// - agents, feedbacks, collections, global_stats, leaderboard
// - RPC: get_leaderboard, get_collection_agents
//# sourceMappingURL=indexer-defaults.js.map