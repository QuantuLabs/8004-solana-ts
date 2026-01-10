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
 * Agent Account (Identity Registry) - v0.2.1 (static fields first for indexing)
 * Represents an agent NFT - metadata is now stored in separate MetadataEntryPda accounts
 * Seeds: ["agent", asset.key()]
 */
export declare class AgentAccount {
    agent_id: bigint;
    owner: Uint8Array;
    agent_mint: Uint8Array;
    created_at: bigint;
    bump: number;
    agent_uri: string;
    nft_name: string;
    nft_symbol: string;
    constructor(fields: {
        agent_id: bigint;
        owner: Uint8Array;
        agent_mint: Uint8Array;
        created_at: bigint;
        bump: number;
        agent_uri: string;
        nft_name: string;
        nft_symbol: string;
    });
    /**
     * V2 Schema (v0.2.1) - Static fields first for indexing optimization
     */
    static schema: Schema;
    /**
     * Deserialize AgentAccount from buffer
     */
    static deserialize(data: Buffer): AgentAccount;
    getOwnerPublicKey(): PublicKey;
    getMintPublicKey(): PublicKey;
    get token_uri(): string;
    get metadata(): MetadataEntry[];
}
/**
 * Metadata Entry PDA (v0.2.1 - Static fields first for indexing)
 * Seeds: ["agent_meta", agent_id (LE), key_hash[0..8]]
 * Each metadata entry is stored in its own PDA for deleteability
 */
export declare class MetadataEntryPda {
    agent_id: bigint;
    created_at: bigint;
    immutable: boolean;
    bump: number;
    metadata_key: string;
    metadata_value: Uint8Array;
    constructor(fields: {
        agent_id: bigint;
        created_at: bigint;
        immutable: boolean;
        bump: number;
        metadata_key: string;
        metadata_value: Uint8Array;
    });
    /**
     * V2 Schema (v0.2.1) - Static fields first for indexing optimization
     */
    static schema: Schema;
    /**
     * Deserialize MetadataEntryPda from buffer
     */
    static deserialize(data: Buffer): MetadataEntryPda;
    getValueString(): string;
    get key(): string;
    get value(): string;
    get isImmutable(): boolean;
}
/**
 * Registry Config Account (Identity Registry)
 * Seeds: ["config"]
 * v0.2.0: Removed collection_authority_bump, collection_mint renamed to collection
 */
export declare class RegistryConfig {
    authority: Uint8Array;
    next_agent_id: bigint;
    total_agents: bigint;
    collection: Uint8Array;
    bump: number;
    constructor(fields: {
        authority: Uint8Array;
        next_agent_id: bigint;
        total_agents: bigint;
        collection: Uint8Array;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): RegistryConfig;
    getAuthorityPublicKey(): PublicKey;
    getCollectionPublicKey(): PublicKey;
    getCollectionMintPublicKey(): PublicKey;
    get collection_mint(): Uint8Array;
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
 * Seeds: ["feedback", agent_id (LE), feedback_index (LE)]
 * Tags moved to optional FeedbackTagsPda for cost optimization (-42%)
 */
export declare class FeedbackAccount {
    agent_id: bigint;
    client_address: Uint8Array;
    feedback_index: bigint;
    score: number;
    file_hash: Uint8Array;
    is_revoked: boolean;
    created_at: bigint;
    bump: number;
    constructor(fields: {
        agent_id: bigint;
        client_address: Uint8Array;
        feedback_index: bigint;
        score: number;
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
    get file_uri(): string;
    get tag1(): string;
    get tag2(): string;
}
/**
 * Feedback Tags PDA (Reputation Registry) - v0.2.1 (static fields first)
 * Optional tags for feedback, created only when needed
 * Seeds: ["feedback_tags", agent_id (LE), feedback_index (LE)]
 * Separated from FeedbackAccount for -42% cost savings when tags not used
 */
export declare class FeedbackTagsPda {
    agent_id: bigint;
    feedback_index: bigint;
    bump: number;
    tag1: string;
    tag2: string;
    constructor(fields: {
        agent_id: bigint;
        feedback_index: bigint;
        bump: number;
        tag1: string;
        tag2: string;
    });
    /**
     * V2 Schema (v0.2.1) - Static fields first for indexing optimization
     */
    static schema: Schema;
    /**
     * Deserialize FeedbackTagsPda from buffer
     */
    static deserialize(data: Buffer): FeedbackTagsPda;
}
/**
 * Agent Reputation Metadata Account (Reputation Registry)
 * Cached aggregated stats for O(1) queries
 * Seeds: ["agent_reputation", agent_id (LE)]
 * v0.2.0: Added next_feedback_index for global feedback tracking
 */
export declare class AgentReputationAccount {
    agent_id: bigint;
    total_feedbacks: bigint;
    total_score_sum: bigint;
    average_score: number;
    next_feedback_index: bigint;
    last_updated: bigint;
    bump: number;
    constructor(fields: {
        agent_id: bigint;
        total_feedbacks: bigint;
        total_score_sum: bigint;
        average_score: number;
        next_feedback_index: bigint;
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
 * Seeds: ["response_index", agent_id (LE), feedback_index (LE)]
 * v0.2.0: Removed client_address from struct (global feedback index)
 */
export declare class ResponseIndexAccount {
    agent_id: bigint;
    feedback_index: bigint;
    next_index: bigint;
    bump: number;
    constructor(fields: {
        agent_id: bigint;
        feedback_index: bigint;
        next_index: bigint;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): ResponseIndexAccount;
    get response_count(): bigint;
}
/**
 * Response Account (Reputation Registry)
 * Represents a response to feedback (from agent, aggregator, or community)
 * Seeds: ["response", agent_id (LE), feedback_index (LE), response_index (LE)]
 * v0.2.0: Removed client_address and response_uri (URI in events only)
 */
export declare class ResponseAccount {
    agent_id: bigint;
    feedback_index: bigint;
    response_index: bigint;
    responder: Uint8Array;
    response_hash: Uint8Array;
    created_at: bigint;
    bump: number;
    constructor(fields: {
        agent_id: bigint;
        feedback_index: bigint;
        response_index: bigint;
        responder: Uint8Array;
        response_hash: Uint8Array;
        created_at: bigint;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): ResponseAccount;
    getResponderPublicKey(): PublicKey;
    get response_uri(): string;
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