/**
 * Core interfaces for Agent0 SDK
 */

import type { AgentId, Address, URI, Timestamp } from './types.js';
import type { EndpointType, TrustModel } from './enums.js';

/**
 * Represents an agent endpoint
 */
export interface Endpoint {
  type: EndpointType;
  value: string; // endpoint value (URL, name, DID, ENS)
  meta?: Record<string, unknown>; // optional metadata
}

/**
 * Agent registration file structure
 * Used to build 8004 compliant metadata JSON
 */
export interface RegistrationFile {
  agentId?: AgentId; // None until minted
  agentURI?: URI; // where this file is (or will be) published
  name: string;
  description: string;
  image?: URI;
  walletAddress?: Address;
  walletChainId?: number; // Chain ID for the wallet address
  endpoints: Endpoint[];
  trustModels?: (TrustModel | string)[]; // optional trust models
  owners?: Address[]; // from chain (read-only, hydrated)
  operators?: Address[]; // from chain (read-only, hydrated)
  active?: boolean; // SDK extension flag (default: true)
  x402support?: boolean; // Binary flag for x402 payment support (default: false)
  metadata?: Record<string, unknown>; // arbitrary, SDK-managed
  updatedAt?: Timestamp;
  // OASF taxonomies - validated against taxonomy files
  skills?: string[]; // e.g. ["natural_language_processing/summarization"]
  domains?: string[]; // e.g. ["finance_and_business/investment_services"]
}

/**
 * Summary information for agent discovery and search
 */
export interface AgentSummary {
  chainId: number; // ChainId
  agentId: AgentId;
  name: string;
  image?: URI;
  description: string;
  owners: Address[];
  operators: Address[];
  mcp: boolean;
  a2a: boolean;
  ens?: string;
  did?: string;
  walletAddress?: Address;
  supportedTrusts: string[]; // normalized string keys
  a2aSkills: string[];
  mcpTools: string[];
  mcpPrompts: string[];
  mcpResources: string[];
  active: boolean;
  x402support: boolean;
  extras: Record<string, unknown>;
}

/**
 * Feedback data structure
 */
export interface Feedback {
  id: FeedbackIdTuple; // (agentId, clientAddress, feedbackIndex)
  agentId: AgentId;
  reviewer: Address;
  score?: number; // 0-100
  tags: string[];
  text?: string;
  context?: Record<string, unknown>;
  proofOfPayment?: Record<string, unknown>;
  fileURI?: URI;
  createdAt: Timestamp;
  answers: Array<Record<string, unknown>>;
  isRevoked: boolean;

  // Off-chain only fields (not stored on blockchain)
  capability?: string; // MCP capability: "prompts", "resources", "tools", "completions"
  name?: string; // MCP tool/resource name
  skill?: string; // A2A skill
  task?: string; // A2A task
}

/**
 * Feedback ID tuple: [agentId, clientAddress, feedbackIndex]
 */
export type FeedbackIdTuple = [AgentId, Address, number];

/**
 * Feedback ID string format: "agentId:clientAddress:feedbackIndex"
 */
export type FeedbackId = string;

// FeedbackAuth interface removed - not used by Solana program (uses native Signer constraint)

/**
 * Parameters for giveFeedback - v0.5.0+
 */
export interface GiveFeedbackParams {
  /**
   * Metric value - accepts multiple formats:
   * - Decimal string: "99.77" → auto-encoded to value=9977, valueDecimals=2
   * - Number: 99.77 → auto-encoded to value=9977, valueDecimals=2
   * - Raw bigint/int: 9977n with valueDecimals=2 → used directly
   *
   * Supports negative values for yields, PnL, etc.
   * Range: i64 (-9223372036854775808 to 9223372036854775807)
   * Max 6 decimal places.
   */
  value: string | number | bigint;
  /**
   * Decimal precision (0-6) - only needed when value is raw integer/bigint.
   * Auto-detected when value is a decimal string like "99.77".
   */
  valueDecimals?: number;
  /** Direct 0-100 score (optional, integer) - takes priority over tag normalization */
  score?: number;
  /** Category tag 1 (max 32 UTF-8 bytes) - case-insensitive for ATOM tags */
  tag1?: string;
  /** Category tag 2 (max 32 UTF-8 bytes) */
  tag2?: string;
  /** Endpoint used (max 250 UTF-8 bytes) */
  endpoint?: string;
  /** URI to detailed feedback file (max 250 UTF-8 bytes) */
  feedbackUri: string;
  /** SHA-256 hash of feedback content (32 bytes) */
  feedbackHash: Buffer;
}

/**
 * Parameters for agent search
 */
export interface SearchParams {
  chains?: number[] | 'all'; // ChainId[] or 'all' to search all configured chains
  name?: string; // case-insensitive substring
  description?: string; // semantic; vector distance < threshold
  owners?: Address[];
  operators?: Address[];
  mcp?: boolean;
  a2a?: boolean;
  ens?: string; // exact, case-insensitive
  did?: string; // exact
  walletAddress?: Address;
  supportedTrust?: string[];
  a2aSkills?: string[];
  mcpTools?: string[];
  mcpPrompts?: string[];
  mcpResources?: string[];
  active?: boolean;
  x402support?: boolean;
}

/**
 * Parameters for feedback search
 */
export interface SearchFeedbackParams {
  agents?: AgentId[];
  tags?: string[];
  reviewers?: Address[];
  capabilities?: string[];
  skills?: string[];
  tasks?: string[];
  names?: string[]; // MCP tool/resource/prompt names
  minScore?: number; // 0-100
  maxScore?: number; // 0-100
  includeRevoked?: boolean;
}

/**
 * Metadata for multi-chain search results
 */
export interface SearchResultMeta {
  chains: number[]; // ChainId[]
  successfulChains: number[]; // ChainId[]
  failedChains: number[]; // ChainId[]
  totalResults: number;
  timing: {
    totalMs: number;
    averagePerChainMs?: number;
  };
}

