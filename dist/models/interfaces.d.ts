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
    value: string;
    meta?: Record<string, unknown>;
}
/**
 * Agent registration file structure
 * Used to build ERC-8004 compliant metadata JSON
 */
export interface RegistrationFile {
    agentId?: AgentId;
    agentURI?: URI;
    name: string;
    description: string;
    image?: URI;
    walletAddress?: Address;
    walletChainId?: number;
    endpoints: Endpoint[];
    trustModels?: (TrustModel | string)[];
    owners?: Address[];
    operators?: Address[];
    active?: boolean;
    x402support?: boolean;
    metadata?: Record<string, unknown>;
    updatedAt?: Timestamp;
    skills?: string[];
    domains?: string[];
}
/**
 * Summary information for agent discovery and search
 */
export interface AgentSummary {
    chainId: number;
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
    supportedTrusts: string[];
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
    id: FeedbackIdTuple;
    agentId: AgentId;
    reviewer: Address;
    score?: number;
    tags: string[];
    text?: string;
    context?: Record<string, unknown>;
    proofOfPayment?: Record<string, unknown>;
    fileURI?: URI;
    createdAt: Timestamp;
    answers: Array<Record<string, unknown>>;
    isRevoked: boolean;
    capability?: string;
    name?: string;
    skill?: string;
    task?: string;
}
/**
 * Feedback ID tuple: [agentId, clientAddress, feedbackIndex]
 */
export type FeedbackIdTuple = [AgentId, Address, number];
/**
 * Feedback ID string format: "agentId:clientAddress:feedbackIndex"
 */
export type FeedbackId = string;
/**
 * Parameters for giveFeedback - v0.5.0+
 */
export interface GiveFeedbackParams {
    /**
     * Raw metric value (e.g., 9977 for 99.77%) - supports negative for yields/PnL
     * Must be integer. Use bigint for values > Number.MAX_SAFE_INTEGER (9007199254740991)
     * Range: i64 (-9223372036854775808 to 9223372036854775807)
     */
    value: bigint | number;
    /** Decimal precision (e.g., 2 for 99.77%) - integer 0-6, default 0 */
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
    chains?: number[] | 'all';
    name?: string;
    description?: string;
    owners?: Address[];
    operators?: Address[];
    mcp?: boolean;
    a2a?: boolean;
    ens?: string;
    did?: string;
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
    names?: string[];
    minScore?: number;
    maxScore?: number;
    includeRevoked?: boolean;
}
/**
 * Metadata for multi-chain search results
 */
export interface SearchResultMeta {
    chains: number[];
    successfulChains: number[];
    failedChains: number[];
    totalResults: number;
    timing: {
        totalMs: number;
        averagePerChainMs?: number;
    };
}
//# sourceMappingURL=interfaces.d.ts.map