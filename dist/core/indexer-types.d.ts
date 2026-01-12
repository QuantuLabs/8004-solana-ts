/**
 * Indexer type definitions and conversion utilities
 * Maps between Supabase indexed data and SDK types
 */
import { PublicKey } from '@solana/web3.js';
import type { SolanaFeedback, SolanaAgentSummary } from './feedback-manager-solana.js';
import type { IndexedAgent, IndexedFeedback, IndexedAgentReputation } from './indexer-client.js';
/**
 * Search parameters for agent queries
 */
export interface AgentSearchParams {
    /** Filter by owner pubkey */
    owner?: string;
    /** Filter by collection pubkey */
    collection?: string;
    /** Filter by agent wallet pubkey */
    wallet?: string;
    /** Filter by minimum reputation score */
    minScore?: number;
    /** Maximum number of results */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
    /** Order by field (e.g., 'created_at.desc') */
    orderBy?: string;
}
/**
 * Search parameters for feedback queries
 */
export interface FeedbackSearchParams {
    /** Filter by agent asset pubkey */
    asset?: string;
    /** Filter by client pubkey */
    client?: string;
    /** Filter by tag (tag1 or tag2) */
    tag?: string;
    /** Filter by endpoint */
    endpoint?: string;
    /** Filter by minimum score */
    minScore?: number;
    /** Include revoked feedbacks (default: false) */
    includeRevoked?: boolean;
    /** Maximum number of results */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
}
/**
 * Convert indexed agent to a simplified agent object
 * Note: Does not include full AgentAccount data (no bump, etc.)
 */
export declare function indexedAgentToSimplified(indexed: IndexedAgent): {
    asset: PublicKey;
    owner: PublicKey;
    collection: PublicKey;
    agentUri: string | null;
    agentWallet: PublicKey | null;
    nftName: string | null;
    blockSlot: number;
    txSignature: string;
    createdAt: Date;
};
/**
 * Convert indexed feedback to SolanaFeedback format
 */
export declare function indexedFeedbackToSolanaFeedback(indexed: IndexedFeedback): SolanaFeedback;
/**
 * Convert indexed reputation to SolanaAgentSummary format
 * Note: Only includes fields available in SolanaAgentSummary
 */
export declare function indexedReputationToSummary(indexed: IndexedAgentReputation): SolanaAgentSummary;
/**
 * Extended SolanaAgentSummary with additional indexed fields
 */
export interface ExtendedAgentSummary extends SolanaAgentSummary {
    asset: PublicKey;
    owner: PublicKey;
    collection: PublicKey;
    nftName: string;
    validationCount: number;
}
/**
 * Convert indexed reputation to ExtendedAgentSummary format
 * Includes additional fields from indexed data
 */
export declare function indexedReputationToExtendedSummary(indexed: IndexedAgentReputation): ExtendedAgentSummary;
//# sourceMappingURL=indexer-types.d.ts.map