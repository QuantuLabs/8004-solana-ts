/**
 * Borsh schemas for deserializing Solana account data
 * Based on ERC-8004 Solana program account structures
 * Must match exactly the Rust structs in 8004-solana programs
 */
import { deserializeUnchecked } from 'borsh';
import { PublicKey } from '@solana/web3.js';
/**
 * Metadata Entry (inline struct for AgentAccount and MetadataExtension)
 * Matches Rust: { metadata_key: String, metadata_value: Vec<u8> }
 */
export class MetadataEntry {
    constructor(fields) {
        this.metadata_key = fields.metadata_key;
        this.metadata_value = fields.metadata_value;
    }
    getValueString() {
        return Buffer.from(this.metadata_value).toString('utf8');
    }
    // Alias for backwards compatibility
    get key() {
        return this.metadata_key;
    }
    get value() {
        return this.metadata_value;
    }
}
/**
 * Agent Account (Identity Registry) - v0.2.0 (no inline metadata)
 * Represents an agent NFT - metadata is now stored in separate MetadataEntryPda accounts
 * Seeds: ["agent", asset.key()]
 */
export class AgentAccount {
    constructor(fields) {
        this.agent_id = fields.agent_id;
        this.owner = fields.owner;
        this.agent_mint = fields.agent_mint;
        this.agent_uri = fields.agent_uri;
        this.nft_name = fields.nft_name;
        this.nft_symbol = fields.nft_symbol;
        this.created_at = fields.created_at;
        this.bump = fields.bump;
    }
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, AgentAccount, accountData);
    }
    getOwnerPublicKey() {
        return new PublicKey(this.owner);
    }
    getMintPublicKey() {
        return new PublicKey(this.agent_mint);
    }
    // Alias for backwards compatibility
    get token_uri() {
        return this.agent_uri;
    }
    // v0.2.0: metadata is now empty - use MetadataEntryPda for metadata
    get metadata() {
        return [];
    }
}
AgentAccount.schema = new Map([
    [
        AgentAccount,
        {
            kind: 'struct',
            // v0.2.0: No metadata Vec - stored in separate PDAs
            fields: [
                ['agent_id', 'u64'],
                ['owner', [32]],
                ['agent_mint', [32]],
                ['agent_uri', 'string'], // agent_uri not token_uri
                ['nft_name', 'string'],
                ['nft_symbol', 'string'],
                ['created_at', 'u64'], // Note: borsh 0.7 doesn't support i64, using u64
                ['bump', 'u8'],
            ],
        },
    ],
]);
/**
 * Metadata Entry PDA (v0.2.0 - Individual metadata storage)
 * Seeds: ["agent_meta", agent_id (LE), key_hash[0..8]]
 * Each metadata entry is stored in its own PDA for deleteability
 */
export class MetadataEntryPda {
    constructor(fields) {
        this.agent_id = fields.agent_id;
        this.metadata_key = fields.metadata_key;
        this.metadata_value = fields.metadata_value;
        this.immutable = fields.immutable;
        this.created_at = fields.created_at;
        this.bump = fields.bump;
    }
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, MetadataEntryPda, accountData);
    }
    getValueString() {
        return Buffer.from(this.metadata_value).toString('utf8');
    }
    // Convenient getters
    get key() {
        return this.metadata_key;
    }
    get value() {
        return this.getValueString();
    }
    get isImmutable() {
        return this.immutable;
    }
}
MetadataEntryPda.schema = new Map([
    [
        MetadataEntryPda,
        {
            kind: 'struct',
            fields: [
                ['agent_id', 'u64'],
                ['metadata_key', 'string'],
                ['metadata_value', ['u8']], // Vec<u8>
                ['immutable', 'u8'], // bool as u8
                ['created_at', 'u64'], // i64 as u64 (borsh 0.7 limitation)
                ['bump', 'u8'],
            ],
        },
    ],
]);
/**
 * Registry Config Account (Identity Registry)
 * Seeds: ["config"]
 * v0.2.0: Removed collection_authority_bump, collection_mint renamed to collection
 */
export class RegistryConfig {
    constructor(fields) {
        this.authority = fields.authority;
        this.next_agent_id = fields.next_agent_id;
        this.total_agents = fields.total_agents;
        this.collection = fields.collection;
        this.bump = fields.bump;
    }
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, RegistryConfig, accountData);
    }
    getAuthorityPublicKey() {
        return new PublicKey(this.authority);
    }
    getCollectionPublicKey() {
        return new PublicKey(this.collection);
    }
    // Alias for backwards compatibility
    getCollectionMintPublicKey() {
        return this.getCollectionPublicKey();
    }
    // Alias for backwards compatibility
    get collection_mint() {
        return this.collection;
    }
}
RegistryConfig.schema = new Map([
    [
        RegistryConfig,
        {
            kind: 'struct',
            fields: [
                ['authority', [32]],
                ['next_agent_id', 'u64'],
                ['total_agents', 'u64'],
                ['collection', [32]],
                ['bump', 'u8'],
            ],
        },
    ],
]);
/**
 * Metadata Extension Account (Identity Registry)
 * Stores additional metadata entries beyond the base 10
 * Seeds: ["metadata_ext", mint.key(), extension_index]
 */
export class MetadataExtensionAccount {
    constructor(fields) {
        this.agent_mint = fields.agent_mint;
        this.extension_index = fields.extension_index;
        this.metadata = fields.metadata;
        this.bump = fields.bump;
    }
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, MetadataExtensionAccount, accountData);
    }
    getMintPublicKey() {
        return new PublicKey(this.agent_mint);
    }
}
MetadataExtensionAccount.schema = new Map([
    [
        MetadataEntry,
        {
            kind: 'struct',
            fields: [
                ['metadata_key', 'string'],
                ['metadata_value', ['u8']],
            ],
        },
    ],
    [
        MetadataExtensionAccount,
        {
            kind: 'struct',
            fields: [
                ['agent_mint', [32]],
                ['extension_index', 'u8'],
                ['metadata', [MetadataEntry]],
                ['bump', 'u8'],
            ],
        },
    ],
]);
/**
 * Feedback Account (Reputation Registry)
 * Represents feedback given by a client to an agent
 * Seeds: ["feedback", agent_id (LE), feedback_index (LE)]
 * Tags moved to optional FeedbackTagsPda for cost optimization (-42%)
 */
export class FeedbackAccount {
    constructor(fields) {
        this.agent_id = fields.agent_id;
        this.client_address = fields.client_address;
        this.feedback_index = fields.feedback_index;
        this.score = fields.score;
        this.file_hash = fields.file_hash;
        this.is_revoked = fields.is_revoked;
        this.created_at = fields.created_at;
        this.bump = fields.bump;
    }
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const accountData = data.slice(8);
        const raw = deserializeUnchecked(this.schema, FeedbackAccount, accountData);
        // Convert u8 to boolean
        return new FeedbackAccount({
            agent_id: raw.agent_id,
            client_address: raw.client_address,
            feedback_index: raw.feedback_index,
            score: raw.score,
            file_hash: raw.file_hash,
            is_revoked: raw.is_revoked === 1,
            created_at: raw.created_at,
            bump: raw.bump,
        });
    }
    getClientPublicKey() {
        return new PublicKey(this.client_address);
    }
    // Alias for backwards compatibility
    get client() {
        return this.client_address;
    }
    get revoked() {
        return this.is_revoked;
    }
    // file_uri is stored in event only
    get file_uri() {
        return '';
    }
    // Tags moved to FeedbackTagsPda
    get tag1() {
        return '';
    }
    get tag2() {
        return '';
    }
}
FeedbackAccount.schema = new Map([
    [
        FeedbackAccount,
        {
            kind: 'struct',
            // Tags moved to FeedbackTagsPda for cost optimization
            fields: [
                ['agent_id', 'u64'],
                ['client_address', [32]],
                ['feedback_index', 'u64'],
                ['score', 'u8'],
                ['file_hash', [32]],
                ['is_revoked', 'u8'], // bool serialized as u8
                ['created_at', 'u64'], // borsh 0.7 doesn't support i64
                ['bump', 'u8'],
            ],
        },
    ],
]);
/**
 * Feedback Tags PDA (Reputation Registry)
 * Optional tags for feedback, created only when needed
 * Seeds: ["feedback_tags", agent_id (LE), feedback_index (LE)]
 * Separated from FeedbackAccount for -42% cost savings when tags not used
 */
export class FeedbackTagsPda {
    constructor(fields) {
        this.agent_id = fields.agent_id;
        this.feedback_index = fields.feedback_index;
        this.tag1 = fields.tag1;
        this.tag2 = fields.tag2;
        this.bump = fields.bump;
    }
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, FeedbackTagsPda, accountData);
    }
}
FeedbackTagsPda.schema = new Map([
    [
        FeedbackTagsPda,
        {
            kind: 'struct',
            fields: [
                ['agent_id', 'u64'],
                ['feedback_index', 'u64'],
                ['tag1', 'string'],
                ['tag2', 'string'],
                ['bump', 'u8'],
            ],
        },
    ],
]);
/**
 * Agent Reputation Metadata Account (Reputation Registry)
 * Cached aggregated stats for O(1) queries
 * Seeds: ["agent_reputation", agent_id (LE)]
 * v0.2.0: Added next_feedback_index for global feedback tracking
 */
export class AgentReputationAccount {
    constructor(fields) {
        this.agent_id = fields.agent_id;
        this.total_feedbacks = fields.total_feedbacks;
        this.total_score_sum = fields.total_score_sum;
        this.average_score = fields.average_score;
        this.next_feedback_index = fields.next_feedback_index;
        this.last_updated = fields.last_updated;
        this.bump = fields.bump;
    }
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, AgentReputationAccount, accountData);
    }
    // Alias for backwards compatibility
    get sum_scores() {
        return this.total_score_sum;
    }
}
AgentReputationAccount.schema = new Map([
    [
        AgentReputationAccount,
        {
            kind: 'struct',
            // Field order MUST match Rust struct: AgentReputationMetadata
            fields: [
                ['agent_id', 'u64'],
                ['next_feedback_index', 'u64'], // v0.2.0 - SECOND field in Rust
                ['total_feedbacks', 'u64'],
                ['total_score_sum', 'u64'],
                ['average_score', 'u8'],
                ['last_updated', 'u64'],
                ['bump', 'u8'],
            ],
        },
    ],
]);
/**
 * Client Index Account (Reputation Registry)
 * Tracks the next feedback index for a specific client-agent pair
 * Seeds: ["client_index", agent_id (LE), client_address]
 */
export class ClientIndexAccount {
    constructor(fields) {
        this.agent_id = fields.agent_id;
        this.client_address = fields.client_address;
        this.last_index = fields.last_index;
        this.bump = fields.bump;
    }
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, ClientIndexAccount, accountData);
    }
    getClientPublicKey() {
        return new PublicKey(this.client_address);
    }
    // Alias for backwards compatibility
    get client() {
        return this.client_address;
    }
    get last_feedback_index() {
        return this.last_index;
    }
}
ClientIndexAccount.schema = new Map([
    [
        ClientIndexAccount,
        {
            kind: 'struct',
            fields: [
                ['agent_id', 'u64'],
                ['client_address', [32]],
                ['last_index', 'u64'], // Renamed from last_feedback_index
                ['bump', 'u8'],
            ],
        },
    ],
]);
/**
 * Response Index Account (Reputation Registry)
 * Tracks the next response index for a specific feedback
 * Seeds: ["response_index", agent_id (LE), feedback_index (LE)]
 * v0.2.0: Removed client_address from struct (global feedback index)
 */
export class ResponseIndexAccount {
    constructor(fields) {
        this.agent_id = fields.agent_id;
        this.feedback_index = fields.feedback_index;
        this.next_index = fields.next_index;
        this.bump = fields.bump;
    }
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, ResponseIndexAccount, accountData);
    }
    get response_count() {
        return this.next_index;
    }
}
ResponseIndexAccount.schema = new Map([
    [
        ResponseIndexAccount,
        {
            kind: 'struct',
            // v0.2.0: No client_address - global feedback index
            fields: [
                ['agent_id', 'u64'],
                ['feedback_index', 'u64'],
                ['next_index', 'u64'],
                ['bump', 'u8'],
            ],
        },
    ],
]);
/**
 * Response Account (Reputation Registry)
 * Represents a response to feedback (from agent, aggregator, or community)
 * Seeds: ["response", agent_id (LE), feedback_index (LE), response_index (LE)]
 * v0.2.0: Removed client_address and response_uri (URI in events only)
 */
export class ResponseAccount {
    constructor(fields) {
        this.agent_id = fields.agent_id;
        this.feedback_index = fields.feedback_index;
        this.response_index = fields.response_index;
        this.responder = fields.responder;
        this.response_hash = fields.response_hash;
        this.created_at = fields.created_at;
        this.bump = fields.bump;
    }
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, ResponseAccount, accountData);
    }
    getResponderPublicKey() {
        return new PublicKey(this.responder);
    }
    // v0.2.0: response_uri is now empty - stored in event only
    get response_uri() {
        return '';
    }
}
ResponseAccount.schema = new Map([
    [
        ResponseAccount,
        {
            kind: 'struct',
            // v0.2.0: response_uri removed - hash-only storage
            fields: [
                ['agent_id', 'u64'],
                ['feedback_index', 'u64'],
                ['response_index', 'u64'],
                ['responder', [32]],
                ['response_hash', [32]],
                ['created_at', 'u64'],
                ['bump', 'u8'],
            ],
        },
    ],
]);
/**
 * Validation Config Account (Validation Registry)
 * Seeds: ["config"]
 */
export class ValidationConfig {
    constructor(fields) {
        this.authority = fields.authority;
        this.identity_registry = fields.identity_registry;
        this.total_requests = fields.total_requests;
        this.total_responses = fields.total_responses;
        this.bump = fields.bump;
    }
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, ValidationConfig, accountData);
    }
    getAuthorityPublicKey() {
        return new PublicKey(this.authority);
    }
    getIdentityRegistryPublicKey() {
        return new PublicKey(this.identity_registry);
    }
}
ValidationConfig.schema = new Map([
    [
        ValidationConfig,
        {
            kind: 'struct',
            fields: [
                ['authority', [32]],
                ['identity_registry', [32]],
                ['total_requests', 'u64'],
                ['total_responses', 'u64'],
                ['bump', 'u8'],
            ],
        },
    ],
]);
/**
 * Validation Request Account (Validation Registry)
 * Seeds: ["validation", agent_id (LE), validator_address, nonce (LE)]
 */
export class ValidationRequest {
    constructor(fields) {
        this.agent_id = fields.agent_id;
        this.validator_address = fields.validator_address;
        this.nonce = fields.nonce;
        this.request_hash = fields.request_hash;
        this.response_hash = fields.response_hash;
        this.response = fields.response;
        this.created_at = fields.created_at;
        this.responded_at = fields.responded_at;
        this.bump = fields.bump;
    }
    static deserialize(data) {
        // Skip 8-byte Anchor discriminator
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, ValidationRequest, accountData);
    }
    getValidatorPublicKey() {
        return new PublicKey(this.validator_address);
    }
    hasResponse() {
        // Handle both BigInt and BN (bn.js) from borsh deserialization
        const respondedAt = typeof this.responded_at === 'bigint'
            ? this.responded_at
            : BigInt(this.responded_at.toString());
        return respondedAt !== BigInt(0);
    }
    isPending() {
        // Handle both BigInt and BN (bn.js) from borsh deserialization
        const respondedAt = typeof this.responded_at === 'bigint'
            ? this.responded_at
            : BigInt(this.responded_at.toString());
        return respondedAt === BigInt(0);
    }
}
ValidationRequest.schema = new Map([
    [
        ValidationRequest,
        {
            kind: 'struct',
            fields: [
                ['agent_id', 'u64'],
                ['validator_address', [32]],
                ['nonce', 'u32'],
                ['request_hash', [32]],
                ['response_hash', [32]],
                ['response', 'u8'],
                ['created_at', 'u64'], // borsh 0.7 doesn't support i64
                ['responded_at', 'u64'], // borsh 0.7 doesn't support i64
                ['bump', 'u8'],
            ],
        },
    ],
]);
//# sourceMappingURL=borsh-schemas.js.map