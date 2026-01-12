/**
 * Indexer type definitions and conversion utilities
 * Maps between Supabase indexed data and SDK types
 */
import { PublicKey } from '@solana/web3.js';
/**
 * Convert indexed agent to a simplified agent object
 * Note: Does not include full AgentAccount data (no bump, etc.)
 */
export function indexedAgentToSimplified(indexed) {
    return {
        asset: new PublicKey(indexed.asset),
        owner: new PublicKey(indexed.owner),
        collection: new PublicKey(indexed.collection),
        agentUri: indexed.agent_uri,
        agentWallet: indexed.agent_wallet ? new PublicKey(indexed.agent_wallet) : null,
        nftName: indexed.nft_name,
        blockSlot: indexed.block_slot,
        txSignature: indexed.tx_signature,
        createdAt: new Date(indexed.created_at),
    };
}
/**
 * Convert indexed feedback to SolanaFeedback format
 */
export function indexedFeedbackToSolanaFeedback(indexed) {
    return {
        asset: new PublicKey(indexed.asset),
        client: new PublicKey(indexed.client_address),
        feedbackIndex: BigInt(indexed.feedback_index),
        score: indexed.score,
        tag1: indexed.tag1 || '',
        tag2: indexed.tag2 || '',
        revoked: indexed.is_revoked, // backward compatibility
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
 * Convert indexed reputation to SolanaAgentSummary format
 * Note: Only includes fields available in SolanaAgentSummary
 */
export function indexedReputationToSummary(indexed) {
    return {
        totalFeedbacks: indexed.feedback_count,
        averageScore: indexed.avg_score || 0,
        positiveCount: indexed.positive_count,
        negativeCount: indexed.negative_count,
        nextFeedbackIndex: indexed.feedback_count, // Best approximation from indexed data
        totalClients: undefined, // Not available in indexed reputation view
    };
}
/**
 * Convert indexed reputation to ExtendedAgentSummary format
 * Includes additional fields from indexed data
 */
export function indexedReputationToExtendedSummary(indexed) {
    return {
        totalFeedbacks: indexed.feedback_count,
        averageScore: indexed.avg_score || 0,
        positiveCount: indexed.positive_count,
        negativeCount: indexed.negative_count,
        nextFeedbackIndex: indexed.feedback_count,
        // Extended fields
        asset: new PublicKey(indexed.asset),
        owner: new PublicKey(indexed.owner),
        collection: new PublicKey(indexed.collection),
        nftName: indexed.nft_name || '',
        validationCount: indexed.validation_count,
    };
}
//# sourceMappingURL=indexer-types.js.map