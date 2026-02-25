/**
 * Borsh schemas for deserializing Solana account data
 * Based on 8004 Solana program v0.3.0 account structures
 * Must match exactly the Rust structs in 8004-solana programs
 *
 * v0.3.0 Breaking Changes:
 * - agent_id (u64) replaced by asset (Pubkey) as unique identifier
 * - Aggregates moved off-chain (total_feedbacks, average_score, etc.)
 * - Simplified account structures for storage optimization
 */
import { Schema } from 'borsh';
import { PublicKey } from '@solana/web3.js';
/**
 * Metadata Entry (inline struct for metadata storage)
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
 * Root Config Account (Identity Registry) - v0.6.0
 * Single-collection architecture: points directly to the base collection
 * Seeds: ["root_config"]
 */
export declare class RootConfig {
    base_collection: Uint8Array;
    authority: Uint8Array;
    bump: number;
    constructor(fields: {
        base_collection: Uint8Array;
        authority: Uint8Array;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): RootConfig;
    getBaseCollectionPublicKey(): PublicKey;
    /** @deprecated Use getBaseCollectionPublicKey() instead */
    getBaseRegistryPublicKey(): PublicKey;
    getAuthorityPublicKey(): PublicKey;
}
/**
 * Registry Config Account (Identity Registry) - v0.6.0
 * Single-collection architecture
 * Seeds: ["registry_config", collection]
 */
export declare class RegistryConfig {
    collection: Uint8Array;
    authority: Uint8Array;
    bump: number;
    constructor(fields: {
        collection: Uint8Array;
        authority: Uint8Array;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): RegistryConfig;
    getCollectionPublicKey(): PublicKey;
    getAuthorityPublicKey(): PublicKey;
}
/**
 * Agent Account (Identity Registry) - v0.5.0
 * Represents an agent NFT with hash-chain support
 * Seeds: ["agent", asset]
 */
export declare class AgentAccount {
    collection: Uint8Array;
    creator: Uint8Array;
    owner: Uint8Array;
    asset: Uint8Array;
    bump: number;
    atom_enabled: number;
    agent_wallet: Uint8Array | null;
    feedback_digest: Uint8Array;
    feedback_count: bigint;
    response_digest: Uint8Array;
    response_count: bigint;
    revoke_digest: Uint8Array;
    revoke_count: bigint;
    parent_asset: Uint8Array | null;
    parent_locked: number;
    col_locked: number;
    agent_uri: string;
    nft_name: string;
    col: string;
    constructor(fields: {
        collection: Uint8Array;
        creator: Uint8Array;
        owner: Uint8Array;
        asset: Uint8Array;
        bump: number;
        atom_enabled: number;
        agent_wallet: Uint8Array | null;
        feedback_digest: Uint8Array;
        feedback_count: bigint;
        response_digest: Uint8Array;
        response_count: bigint;
        revoke_digest: Uint8Array;
        revoke_count: bigint;
        parent_asset: Uint8Array | null;
        parent_locked: number;
        col_locked: number;
        agent_uri: string;
        nft_name: string;
        col: string;
    });
    static schema: Schema;
    static deserialize(data: Buffer): AgentAccount;
    getCollectionPublicKey(): PublicKey;
    getOwnerPublicKey(): PublicKey;
    getCreatorPublicKey(): PublicKey;
    /**
     * Alias list for compatibility with clients expecting `creators`.
     * On-chain AgentAccount stores a single immutable creator snapshot.
     */
    getCreatorsPublicKeys(): PublicKey[];
    /**
     * Backward-compatible property alias (`creators`) for SDK consumers.
     */
    get creators(): PublicKey[];
    getAssetPublicKey(): PublicKey;
    /**
     * Get the agent's operational wallet if set
     * @returns PublicKey or null if no wallet is set
     */
    getAgentWalletPublicKey(): PublicKey | null;
    isAtomEnabled(): boolean;
    /**
     * Check if agent has an operational wallet configured
     */
    hasAgentWallet(): boolean;
    getParentAssetPublicKey(): PublicKey | null;
    isParentLocked(): boolean;
    isCollectionPointerLocked(): boolean;
    get token_uri(): string;
    get metadata(): MetadataEntry[];
}
/**
 * Metadata Entry PDA (Identity Registry) - v0.3.0
 * Seeds: ["agent_meta", asset, key_hash[0..8]]
 */
export declare class MetadataEntryPda {
    asset: Uint8Array;
    immutable: boolean;
    bump: number;
    metadata_key: string;
    metadata_value: Uint8Array;
    constructor(fields: {
        asset: Uint8Array;
        immutable: boolean;
        bump: number;
        metadata_key: string;
        metadata_value: Uint8Array;
    });
    static schema: Schema;
    static deserialize(data: Buffer): MetadataEntryPda;
    getAssetPublicKey(): PublicKey;
    getValueString(): string;
    get key(): string;
    get value(): string;
    get isImmutable(): boolean;
}
/**
 * Feedback Account (Reputation Registry) - v0.3.0
 * Seeds: ["feedback", asset, feedback_index]
 */
export declare class FeedbackAccount {
    asset: Uint8Array;
    client_address: Uint8Array;
    feedback_index: bigint;
    score: number;
    is_revoked: boolean;
    bump: number;
    constructor(fields: {
        asset: Uint8Array;
        client_address: Uint8Array;
        feedback_index: bigint;
        score: number;
        is_revoked: boolean;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): FeedbackAccount;
    getAssetPublicKey(): PublicKey;
    getClientPublicKey(): PublicKey;
    get revoked(): boolean;
}
/**
 * Feedback Tags PDA (Reputation Registry) - v0.3.0
 * Seeds: ["feedback_tags", asset, feedback_index]
 * Note: asset and feedback_index are in seeds only, not stored in account
 */
export declare class FeedbackTagsPda {
    bump: number;
    tag1: string;
    tag2: string;
    constructor(fields: {
        bump: number;
        tag1: string;
        tag2: string;
    });
    static schema: Schema;
    static deserialize(data: Buffer): FeedbackTagsPda;
}
/**
 * Agent Reputation Metadata (Reputation Registry) - v0.3.0
 * Sequencer for feedback indices only - aggregates moved off-chain
 * Seeds: ["agent_reputation", asset]
 */
export declare class AgentReputationMetadata {
    next_feedback_index: bigint;
    bump: number;
    constructor(fields: {
        next_feedback_index: bigint;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): AgentReputationMetadata;
}
export { AgentReputationMetadata as AgentReputationAccount };
/**
 * Response Index Account (Reputation Registry) - v0.3.0
 * Seeds: ["response_index", asset, feedback_index]
 */
export declare class ResponseIndexAccount {
    next_index: bigint;
    bump: number;
    constructor(fields: {
        next_index: bigint;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): ResponseIndexAccount;
    get response_count(): bigint;
}
/**
 * Response Account (Reputation Registry) - v0.3.0
 * Seeds: ["response", asset, feedback_index, response_index]
 * Note: URIs and hashes stored in events only
 */
export declare class ResponseAccount {
    responder: Uint8Array;
    bump: number;
    constructor(fields: {
        responder: Uint8Array;
        bump: number;
    });
    static schema: Schema;
    static deserialize(data: Buffer): ResponseAccount;
    getResponderPublicKey(): PublicKey;
}
/**
 * Validation Request Account (Validation Registry) - v0.3.0
 * Seeds: ["validation", asset, validator_address, nonce]
 */
export declare class ValidationRequest {
    asset: Uint8Array;
    validator_address: Uint8Array;
    nonce: number;
    request_hash: Uint8Array;
    response: number;
    responded_at: bigint;
    constructor(fields: {
        asset: Uint8Array;
        validator_address: Uint8Array;
        nonce: number;
        request_hash: Uint8Array;
        response: number;
        responded_at: bigint;
    });
    static schema: Schema;
    static deserialize(data: Buffer): ValidationRequest;
    getAssetPublicKey(): PublicKey;
    getValidatorPublicKey(): PublicKey;
    hasResponse(): boolean;
    isPending(): boolean;
    /**
     * Get last update timestamp (alias for responded_at)
     */
    getLastUpdate(): bigint;
}
//# sourceMappingURL=borsh-schemas.d.ts.map