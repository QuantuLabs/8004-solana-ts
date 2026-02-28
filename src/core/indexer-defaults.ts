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
 */

// Hardcoded defaults
// - GraphQL v2 reference deployment (public read-only)
const HARDCODED_INDEXER_GRAPHQL_URL = 'https://8004-indexer-production.up.railway.app/v2/graphql';
// - Legacy REST v1 (deprecated; kept for backward compatibility)
const HARDCODED_INDEXER_URL = 'https://8004-indexer-production.up.railway.app/rest/v1';

/**
 * Safe environment variable access (browser-compatible)
 */
function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

// Export with env override
export const DEFAULT_INDEXER_URL = getEnv('INDEXER_URL') || HARDCODED_INDEXER_URL;
export const DEFAULT_INDEXER_API_KEY = getEnv('INDEXER_API_KEY') || '';
export const DEFAULT_INDEXER_GRAPHQL_URL = getEnv('INDEXER_GRAPHQL_URL') || HARDCODED_INDEXER_GRAPHQL_URL;

/**
 * Force on-chain mode (bypass indexer):
 * - false (default): Smart routing - RPC for small queries, indexer for large
 * - true: Force all on-chain (indexer-only methods will throw)
 */
export const DEFAULT_FORCE_ON_CHAIN = getEnv('FORCE_ON_CHAIN') === 'true';

/**
 * List of operations considered "small queries" that prefer RPC
 * These are single-account fetches or queries with predictably small result sets
 */
export const SMALL_QUERY_OPERATIONS = [
  'getAgent',
  'getCollection',
  'readFeedback',
  'getSummary',
] as const;

// Tables accessible via anon key (RLS public read enabled):
// - agents, feedbacks, collections, global_stats, leaderboard
// - RPC: get_leaderboard, get_collection_agents
