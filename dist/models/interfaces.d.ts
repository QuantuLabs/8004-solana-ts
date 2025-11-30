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
    meta?: Record<string, any>;
}
/**
 * Agent registration file structure
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
    trustModels: (TrustModel | string)[];
    owners: Address[];
    operators: Address[];
    active: boolean;
    x402support: boolean;
    metadata: Record<string, any>;
    updatedAt: Timestamp;
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
    extras: Record<string, any>;
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
    context?: Record<string, any>;
    proofOfPayment?: Record<string, any>;
    fileURI?: URI;
    createdAt: Timestamp;
    answers: Array<Record<string, any>>;
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
 * Feedback authentication signature (ERC-8004 spec requirement)
 * Prevents spam by requiring agent owner pre-authorization
 */
export interface FeedbackAuth {
    /** Agent ID this auth is for */
    agentId: AgentId;
    /** Client address authorized to give feedback */
    clientAddress: Address;
    /** Maximum number of feedbacks this client can submit */
    indexLimit: number;
    /** Expiry timestamp (Unix epoch seconds) */
    expiry: number;
    /** Chain identifier (e.g., "solana-mainnet", "solana-devnet") */
    chainId: string;
    /** Identity Registry program ID */
    identityRegistry: Address;
    /** Signer address (agent owner or delegate) */
    signerAddress: Address;
    /** Ed25519 signature (64 bytes) */
    signature: Uint8Array;
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