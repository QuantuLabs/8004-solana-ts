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

import type { Cluster } from './client.js';

const INDEXER_DEFAULTS_BY_CLUSTER: Record<Cluster, { graphqlUrl: string; restUrl: string }> = {
  devnet: {
    graphqlUrl: 'https://8004-indexer-production.up.railway.app/v2/graphql',
    restUrl: 'https://8004-indexer-production.up.railway.app/rest/v1',
  },
  testnet: {
    graphqlUrl: 'https://8004-indexer-production.up.railway.app/v2/graphql',
    restUrl: 'https://8004-indexer-production.up.railway.app/rest/v1',
  },
  'mainnet-beta': {
    graphqlUrl: 'https://8004.qnt.sh/v2/graphql',
    restUrl: 'https://8004.qnt.sh/rest/v1',
  },
  localnet: {
    graphqlUrl: 'http://127.0.0.1:3005/v2/graphql',
    restUrl: 'http://127.0.0.1:3005/rest/v1',
  },
};

/**
 * Safe environment variable access (browser-compatible)
 */
function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

export function getDefaultIndexerUrl(cluster: Cluster): string {
  return getEnv('INDEXER_URL') || INDEXER_DEFAULTS_BY_CLUSTER[cluster].restUrl;
}

export function getDefaultIndexerGraphqlUrl(cluster: Cluster): string {
  return getEnv('INDEXER_GRAPHQL_URL') || INDEXER_DEFAULTS_BY_CLUSTER[cluster].graphqlUrl;
}

export function getDefaultIndexerApiKey(): string {
  return getEnv('INDEXER_API_KEY') || '';
}

// Backward-compatible devnet exports.
export const DEFAULT_INDEXER_URL = getDefaultIndexerUrl('devnet');
export const DEFAULT_INDEXER_API_KEY = getDefaultIndexerApiKey();
export const DEFAULT_INDEXER_GRAPHQL_URL = getDefaultIndexerGraphqlUrl('devnet');

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
