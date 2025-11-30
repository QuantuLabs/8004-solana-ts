/**
 * Borsh schemas for deserializing Solana account data
 * Based on ERC-8004 Solana program account structures
 * Must match exactly the Rust structs in 8004-solana programs
 */
import { Schema } from 'borsh';
import { PublicKey } from '@solana/web3.js';
/**
 * Metadata Entry (inline struct for AgentAccount and MetadataExtension)
 * Matches Rust: { metadata_key: String, metadata_value: Vec<u8> }
 */
export declare class MetadataEntry {
    metadata_key: string;
    metadata_value: Uint8Array;
    constructor(fields: {
        metadata_key: string;
        metadata_value: Uint8Array;
    });
    getValueString(): string;
    get key(): string;
    get value(): Uint8Array;
}
/**
 * Agent Account (Identity Registry) - Variable size (dynamic metadata)
 * Represents an agent NFT with metadata
 * Seeds: ["agent", mint.key()]
 */
export declare class AgentAccount {
    agent_id: bigint;
    owner: Uint8Array;
    agent_mint: Uint8Array;
    agent_uri: string;
    nft_name: string;
    nft_symbol: string;
    metadata: MetadataEntry[];
    created_at: bigint;
    bump: number;
    constructor(fields: {
        agent_id: bigint;
        owner: Uint8Array;
        agent_mint: Uint8Array;
        agent_uri: string;
        nft_name: string;
        nft_symbol: string;
        metadata: MetadataEntry[];
        created_at: bigint;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): AgentAccount;
    getOwnerPublicKey(): PublicKey;
    getMintPublicKey(): PublicKey;
    get token_uri(): string;
}
/**
 * Registry Config Account (Identity Registry)
 * Seeds: ["config"]
 */
export declare class RegistryConfig {
    authority: Uint8Array;
    next_agent_id: bigint;
    total_agents: bigint;
    collection_mint: Uint8Array;
    collection_authority_bump: number;
    bump: number;
    constructor(fields: {
        authority: Uint8Array;
        next_agent_id: bigint;
        total_agents: bigint;
        collection_mint: Uint8Array;
        collection_authority_bump: number;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): RegistryConfig;
    getAuthorityPublicKey(): PublicKey;
    getCollectionMintPublicKey(): PublicKey;
}
/**
 * Metadata Extension Account (Identity Registry)
 * Stores additional metadata entries beyond the base 10
 * Seeds: ["metadata_ext", mint.key(), extension_index]
 */
export declare class MetadataExtensionAccount {
    agent_mint: Uint8Array;
    extension_index: number;
    metadata: MetadataEntry[];
    bump: number;
    constructor(fields: {
        agent_mint: Uint8Array;
        extension_index: number;
        metadata: MetadataEntry[];
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): MetadataExtensionAccount;
    getMintPublicKey(): PublicKey;
}
/**
 * Feedback Account (Reputation Registry)
 * Represents feedback given by a client to an agent
 * Seeds: ["feedback", agent_id (LE), client_address, feedback_index (LE)]
 */
export declare class FeedbackAccount {
    agent_id: bigint;
    client_address: Uint8Array;
    feedback_index: bigint;
    score: number;
    tag1: string;
    tag2: string;
    file_uri: string;
    file_hash: Uint8Array;
    is_revoked: boolean;
    created_at: bigint;
    bump: number;
    constructor(fields: {
        agent_id: bigint;
        client_address: Uint8Array;
        feedback_index: bigint;
        score: number;
        tag1: string;
        tag2: string;
        file_uri: string;
        file_hash: Uint8Array;
        is_revoked: boolean;
        created_at: bigint;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): FeedbackAccount;
    getClientPublicKey(): PublicKey;
    get client(): Uint8Array;
    get revoked(): boolean;
}
/**
 * Agent Reputation Metadata Account (Reputation Registry)
 * Cached aggregated stats for O(1) queries
 * Seeds: ["agent_reputation", agent_id (LE)]
 */
export declare class AgentReputationAccount {
    agent_id: bigint;
    total_feedbacks: bigint;
    total_score_sum: bigint;
    average_score: number;
    last_updated: bigint;
    bump: number;
    constructor(fields: {
        agent_id: bigint;
        total_feedbacks: bigint;
        total_score_sum: bigint;
        average_score: number;
        last_updated: bigint;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): AgentReputationAccount;
    get sum_scores(): bigint;
}
/**
 * Client Index Account (Reputation Registry)
 * Tracks the next feedback index for a specific client-agent pair
 * Seeds: ["client_index", agent_id (LE), client_address]
 */
export declare class ClientIndexAccount {
    agent_id: bigint;
    client_address: Uint8Array;
    last_index: bigint;
    bump: number;
    constructor(fields: {
        agent_id: bigint;
        client_address: Uint8Array;
        last_index: bigint;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): ClientIndexAccount;
    getClientPublicKey(): PublicKey;
    get client(): Uint8Array;
    get last_feedback_index(): bigint;
}
/**
 * Response Index Account (Reputation Registry)
 * Tracks the next response index for a specific feedback
 * Seeds: ["response_index", agent_id (LE), client_address, feedback_index (LE)]
 */
export declare class ResponseIndexAccount {
    agent_id: bigint;
    client_address: Uint8Array;
    feedback_index: bigint;
    next_index: bigint;
    bump: number;
    constructor(fields: {
        agent_id: bigint;
        client_address: Uint8Array;
        feedback_index: bigint;
        next_index: bigint;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): ResponseIndexAccount;
    get client(): Uint8Array;
    get response_count(): bigint;
}
/**
 * Response Account (Reputation Registry)
 * Represents a response to feedback (from agent, aggregator, or community)
 * Seeds: ["response", agent_id (LE), client_address, feedback_index (LE), response_index (LE)]
 */
export declare class ResponseAccount {
    agent_id: bigint;
    client_address: Uint8Array;
    feedback_index: bigint;
    response_index: bigint;
    responder: Uint8Array;
    response_uri: string;
    response_hash: Uint8Array;
    created_at: bigint;
    bump: number;
    constructor(fields: {
        agent_id: bigint;
        client_address: Uint8Array;
        feedback_index: bigint;
        response_index: bigint;
        responder: Uint8Array;
        response_uri: string;
        response_hash: Uint8Array;
        created_at: bigint;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): ResponseAccount;
    getResponderPublicKey(): PublicKey;
    get client(): Uint8Array;
}
/**
 * Validation Config Account (Validation Registry)
 * Seeds: ["config"]
 */
export declare class ValidationConfig {
    authority: Uint8Array;
    identity_registry: Uint8Array;
    total_requests: bigint;
    total_responses: bigint;
    bump: number;
    constructor(fields: {
        authority: Uint8Array;
        identity_registry: Uint8Array;
        total_requests: bigint;
        total_responses: bigint;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): ValidationConfig;
    getAuthorityPublicKey(): PublicKey;
    getIdentityRegistryPublicKey(): PublicKey;
}
/**
 * Validation Request Account (Validation Registry)
 * Seeds: ["validation", agent_id (LE), validator_address, nonce (LE)]
 */
export declare class ValidationRequest {
    agent_id: bigint;
    validator_address: Uint8Array;
    nonce: number;
    request_hash: Uint8Array;
    response_hash: Uint8Array;
    response: number;
    created_at: bigint;
    responded_at: bigint;
    bump: number;
    constructor(fields: {
        agent_id: bigint;
        validator_address: Uint8Array;
        nonce: number;
        request_hash: Uint8Array;
        response_hash: Uint8Array;
        response: number;
        created_at: bigint;
        responded_at: bigint;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): ValidationRequest;
    getValidatorPublicKey(): PublicKey;
    hasResponse(): boolean;
    isPending(): boolean;
}
//# sourceMappingURL=borsh-schemas.d.ts.map