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
  /** Filter by immutable creator snapshot pubkey */
  creator?: string;
  /** Filter by base registry collection pubkey */
  collection?: string;
  /** Filter by collection pointer (e.g., c1:<cid_norm>) */
  collectionPointer?: string;
  /** Filter by agent wallet pubkey */
  wallet?: string;
  /** Filter by parent asset pubkey */
  parentAsset?: string;
  /** Filter by parent creator pubkey */
  parentCreator?: string;
  /** Filter by collection pointer lock status */
  colLocked?: boolean;
  /** Filter by parent lock status */
  parentLocked?: boolean;
  /** Exact updated_at filter (unix seconds or ISO) */
  updatedAt?: string | number;
  /** updated_at greater-than filter (unix seconds or ISO) */
  updatedAtGt?: string | number;
  /** updated_at less-than filter (unix seconds or ISO) */
  updatedAtLt?: string | number;
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
export function indexedAgentToSimplified(indexed: IndexedAgent): {
  asset: PublicKey;
  owner: PublicKey;
  collection: PublicKey;
  agentUri: string | null;
  agentWallet: PublicKey | null;
  nftName: string | null;
  blockSlot: number;
  txSignature: string;
  createdAt: Date;
} {
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
export function indexedFeedbackToSolanaFeedback(indexed: IndexedFeedback): SolanaFeedback {
  // Handle value as BIGINT (may come as string from Supabase)
  const rawValue = indexed.value;
  const value = typeof rawValue === 'string' ? BigInt(rawValue) : BigInt(rawValue ?? 0);

  return {
    asset: new PublicKey(indexed.asset),
    client: new PublicKey(indexed.client_address),
    feedbackIndex: BigInt(indexed.feedback_index),
    value,
    valueDecimals: indexed.value_decimals ?? 0,
    score: indexed.score,
    tag1: indexed.tag1 || '',
    tag2: indexed.tag2 || '',
    revoked: indexed.is_revoked,       // backward compatibility
    isRevoked: indexed.is_revoked,
    endpoint: indexed.endpoint || '',
    feedbackUri: indexed.feedback_uri || '',
    // SEAL v1: feedback_hash from indexer is the on-chain computed sealHash
    sealHash: indexed.feedback_hash
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
export function indexedReputationToSummary(indexed: IndexedAgentReputation): SolanaAgentSummary {
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
export function indexedReputationToExtendedSummary(indexed: IndexedAgentReputation): ExtendedAgentSummary {
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
