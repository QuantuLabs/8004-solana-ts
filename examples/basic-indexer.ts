/**
 * Indexer Example - DEPRECATED
 *
 * For production indexing, use our dedicated Solana indexer:
 * https://github.com/QuantuLabs/8004-solana-indexer
 *
 * The indexer provides:
 * - Real-time event indexing from Solana
 * - PostgreSQL storage (Supabase compatible)
 * - REST API via Supabase
 * - Leaderboard support with ATOM Engine integration
 *
 * SDK Integration:
 * The SolanaSDK automatically uses the indexer when available.
 * Configure with IndexerClient for direct access:
 *
 * ```typescript
 * import { IndexerClient } from '8004-solana';
 *
 * const indexer = new IndexerClient({
 *   baseUrl: 'https://your-indexer-url.supabase.co',
 *   apiKey: 'your-anon-key',
 * });
 *
 * // Fast queries via indexer
 * const agents = await indexer.searchAgents({ owner: 'pubkey...' });
 * const feedbacks = await indexer.getFeedbacks({ asset: 'pubkey...' });
 * const leaderboard = await indexer.getLeaderboard({ limit: 50 });
 * ```
 *
 * For on-chain only queries (no indexer), use SolanaSDK directly with
 * a custom RPC that supports getProgramAccounts (e.g., Helius).
 */

console.log('See https://github.com/QuantuLabs/8004-solana-indexer for indexer setup');
console.log('SDK indexer integration: import { IndexerClient } from "8004-solana"');
