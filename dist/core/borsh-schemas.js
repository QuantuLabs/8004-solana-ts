/**
 * Borsh schemas for deserializing Solana account data
 * Based on ERC-8004 Solana program v0.3.0 account structures
 * Must match exactly the Rust structs in 8004-solana programs
 *
 * v0.3.0 Breaking Changes:
 * - agent_id (u64) replaced by asset (Pubkey) as unique identifier
 * - Aggregates moved off-chain (total_feedbacks, average_score, etc.)
 * - Simplified account structures for storage optimization
 */
import { deserializeUnchecked } from 'borsh';
import { PublicKey } from '@solana/web3.js';
/**
 * Metadata Entry (inline struct for metadata storage)
 * Matches Rust: { metadata_key: String, metadata_value: Vec<u8> }
 */
export class MetadataEntry {
    metadata_key; // String in Rust (max 32 bytes)
    metadata_value; // Vec<u8> in Rust (max 256 bytes)
    constructor(fields) {
        this.metadata_key = fields.metadata_key;
        this.metadata_value = fields.metadata_value;
    }
    getValueString() {
        return Buffer.from(this.metadata_value).toString('utf8');
    }
    get key() {
        return this.metadata_key;
    }
    get value() {
        return this.metadata_value;
    }
}
/**
 * Root Config Account (Identity Registry) - v0.3.0
 * Global pointer to the current base registry
 * Seeds: ["root_config"]
 */
export class RootConfig {
    current_base_registry; // Pubkey of active base registry collection
    base_registry_count; // u32 - number of base registries created
    authority; // Pubkey - upgrade authority
    bump;
    constructor(fields) {
        this.current_base_registry = fields.current_base_registry;
        this.base_registry_count = fields.base_registry_count;
        this.authority = fields.authority;
        this.bump = fields.bump;
    }
    static schema = new Map([
        [
            RootConfig,
            {
                kind: 'struct',
                fields: [
                    ['current_base_registry', [32]],
                    ['base_registry_count', 'u32'],
                    ['authority', [32]],
                    ['bump', 'u8'],
                ],
            },
        ],
    ]);
    static deserialize(data) {
        // discriminator(8) + current_base_registry(32) + base_registry_count(4) + authority(32) + bump(1) = 77 bytes
        if (data.length < 77) {
            throw new Error(`Invalid RootConfig data: expected >= 77 bytes, got ${data.length}`);
        }
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, RootConfig, accountData);
    }
    getCurrentBaseRegistryPublicKey() {
        return new PublicKey(this.current_base_registry);
    }
    getAuthorityPublicKey() {
        return new PublicKey(this.authority);
    }
}
/**
 * Registry Config Account (Identity Registry) - v0.3.0
 * Per-collection configuration
 * Seeds: ["registry_config", collection]
 */
export class RegistryConfig {
    collection; // Pubkey - Metaplex Core collection
    registry_type; // u8 - 0 = Base, 1 = User
    authority; // Pubkey - registry authority
    base_index; // u32 - index for base registries
    bump;
    constructor(fields) {
        this.collection = fields.collection;
        this.registry_type = fields.registry_type;
        this.authority = fields.authority;
        this.base_index = fields.base_index;
        this.bump = fields.bump;
    }
    static schema = new Map([
        [
            RegistryConfig,
            {
                kind: 'struct',
                fields: [
                    ['collection', [32]],
                    ['registry_type', 'u8'],
                    ['authority', [32]],
                    ['base_index', 'u32'],
                    ['bump', 'u8'],
                ],
            },
        ],
    ]);
    static deserialize(data) {
        // discriminator(8) + collection(32) + registry_type(1) + authority(32) + base_index(4) + bump(1) = 78 bytes
        if (data.length < 78) {
            throw new Error(`Invalid RegistryConfig data: expected >= 78 bytes, got ${data.length}`);
        }
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, RegistryConfig, accountData);
    }
    getCollectionPublicKey() {
        return new PublicKey(this.collection);
    }
    getAuthorityPublicKey() {
        return new PublicKey(this.authority);
    }
    isBaseRegistry() {
        return this.registry_type === 0;
    }
    isUserRegistry() {
        return this.registry_type === 1;
    }
}
/**
 * Agent Account (Identity Registry) - v0.3.0
 * Represents an agent NFT
 * Seeds: ["agent", asset]
 */
export class AgentAccount {
    owner; // Pubkey - cached from Core asset
    asset; // Pubkey - unique identifier (Metaplex Core asset)
    bump;
    agent_uri; // max 200 bytes
    nft_name; // max 32 bytes
    constructor(fields) {
        this.owner = fields.owner;
        this.asset = fields.asset;
        this.bump = fields.bump;
        this.agent_uri = fields.agent_uri;
        this.nft_name = fields.nft_name;
    }
    static schema = new Map([
        [
            AgentAccount,
            {
                kind: 'struct',
                fields: [
                    ['owner', [32]],
                    ['asset', [32]],
                    ['bump', 'u8'],
                    ['agent_uri', 'string'],
                    ['nft_name', 'string'],
                ],
            },
        ],
    ]);
    static deserialize(data) {
        // discriminator(8) + owner(32) + asset(32) + bump(1) = 73 bytes minimum
        if (data.length < 73) {
            throw new Error(`Invalid AgentAccount data: expected >= 73 bytes, got ${data.length}`);
        }
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, AgentAccount, accountData);
    }
    getOwnerPublicKey() {
        return new PublicKey(this.owner);
    }
    getAssetPublicKey() {
        return new PublicKey(this.asset);
    }
    // Alias for backwards compatibility
    get token_uri() {
        return this.agent_uri;
    }
    // v0.3.0: metadata is stored in MetadataEntryPda accounts
    get metadata() {
        return [];
    }
}
/**
 * Metadata Entry PDA (Identity Registry) - v0.3.0
 * Seeds: ["agent_meta", asset, key_hash[0..8]]
 */
export class MetadataEntryPda {
    asset; // Pubkey - unique identifier
    immutable;
    bump;
    metadata_key; // max 32 bytes
    metadata_value; // max 256 bytes
    constructor(fields) {
        this.asset = fields.asset;
        this.immutable = fields.immutable;
        this.bump = fields.bump;
        this.metadata_key = fields.metadata_key;
        this.metadata_value = fields.metadata_value;
    }
    static schema = new Map([
        [
            MetadataEntryPda,
            {
                kind: 'struct',
                fields: [
                    ['asset', [32]],
                    ['immutable', 'u8'],
                    ['bump', 'u8'],
                    ['metadata_key', 'string'],
                    ['metadata_value', ['u8']],
                ],
            },
        ],
    ]);
    static deserialize(data) {
        // discriminator(8) + asset(32) + immutable(1) + bump(1) = 42 bytes minimum
        if (data.length < 42) {
            throw new Error(`Invalid MetadataEntryPda data: expected >= 42 bytes, got ${data.length}`);
        }
        const accountData = data.slice(8);
        const raw = deserializeUnchecked(this.schema, MetadataEntryPda, accountData);
        return new MetadataEntryPda({
            asset: raw.asset,
            immutable: raw.immutable === 1,
            bump: raw.bump,
            metadata_key: raw.metadata_key,
            metadata_value: raw.metadata_value,
        });
    }
    getAssetPublicKey() {
        return new PublicKey(this.asset);
    }
    getValueString() {
        return Buffer.from(this.metadata_value).toString('utf8');
    }
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
/**
 * Feedback Account (Reputation Registry) - v0.3.0
 * Seeds: ["feedback", asset, feedback_index]
 */
export class FeedbackAccount {
    asset; // Pubkey - agent asset
    client_address; // Pubkey - feedback giver
    feedback_index; // Global index per agent
    score; // 0-100
    is_revoked;
    bump;
    constructor(fields) {
        this.asset = fields.asset;
        this.client_address = fields.client_address;
        this.feedback_index = fields.feedback_index;
        this.score = fields.score;
        this.is_revoked = fields.is_revoked;
        this.bump = fields.bump;
    }
    static schema = new Map([
        [
            FeedbackAccount,
            {
                kind: 'struct',
                fields: [
                    ['asset', [32]],
                    ['client_address', [32]],
                    ['feedback_index', 'u64'],
                    ['score', 'u8'],
                    ['is_revoked', 'u8'],
                    ['bump', 'u8'],
                ],
            },
        ],
    ]);
    static deserialize(data) {
        // discriminator(8) + asset(32) + client_address(32) + feedback_index(8) + score(1) + is_revoked(1) + bump(1) = 83 bytes
        if (data.length < 83) {
            throw new Error(`Invalid FeedbackAccount data: expected >= 83 bytes, got ${data.length}`);
        }
        const accountData = data.slice(8);
        const raw = deserializeUnchecked(this.schema, FeedbackAccount, accountData);
        return new FeedbackAccount({
            asset: raw.asset,
            client_address: raw.client_address,
            feedback_index: raw.feedback_index,
            score: raw.score,
            is_revoked: raw.is_revoked === 1,
            bump: raw.bump,
        });
    }
    getAssetPublicKey() {
        return new PublicKey(this.asset);
    }
    getClientPublicKey() {
        return new PublicKey(this.client_address);
    }
    get revoked() {
        return this.is_revoked;
    }
}
/**
 * Feedback Tags PDA (Reputation Registry) - v0.3.0
 * Seeds: ["feedback_tags", asset, feedback_index]
 * Note: asset and feedback_index are in seeds only, not stored in account
 */
export class FeedbackTagsPda {
    bump;
    tag1; // max 32 bytes
    tag2; // max 32 bytes
    constructor(fields) {
        this.bump = fields.bump;
        this.tag1 = fields.tag1;
        this.tag2 = fields.tag2;
    }
    static schema = new Map([
        [
            FeedbackTagsPda,
            {
                kind: 'struct',
                fields: [
                    ['bump', 'u8'],
                    ['tag1', 'string'],
                    ['tag2', 'string'],
                ],
            },
        ],
    ]);
    static deserialize(data) {
        // discriminator(8) + bump(1) = 9 bytes minimum
        if (data.length < 9) {
            throw new Error(`Invalid FeedbackTagsPda data: expected >= 9 bytes, got ${data.length}`);
        }
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, FeedbackTagsPda, accountData);
    }
}
/**
 * Agent Reputation Metadata (Reputation Registry) - v0.3.0
 * Sequencer for feedback indices only - aggregates moved off-chain
 * Seeds: ["agent_reputation", asset]
 */
export class AgentReputationMetadata {
    next_feedback_index; // Global counter for feedback indices
    bump;
    constructor(fields) {
        this.next_feedback_index = fields.next_feedback_index;
        this.bump = fields.bump;
    }
    static schema = new Map([
        [
            AgentReputationMetadata,
            {
                kind: 'struct',
                fields: [
                    ['next_feedback_index', 'u64'],
                    ['bump', 'u8'],
                ],
            },
        ],
    ]);
    static deserialize(data) {
        // discriminator(8) + next_feedback_index(8) + bump(1) = 17 bytes
        if (data.length < 17) {
            throw new Error(`Invalid AgentReputationMetadata data: expected >= 17 bytes, got ${data.length}`);
        }
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, AgentReputationMetadata, accountData);
    }
}
// Alias for backwards compatibility
export { AgentReputationMetadata as AgentReputationAccount };
/**
 * Response Index Account (Reputation Registry) - v0.3.0
 * Seeds: ["response_index", asset, feedback_index]
 */
export class ResponseIndexAccount {
    next_index;
    bump;
    constructor(fields) {
        this.next_index = fields.next_index;
        this.bump = fields.bump;
    }
    static schema = new Map([
        [
            ResponseIndexAccount,
            {
                kind: 'struct',
                fields: [
                    ['next_index', 'u64'],
                    ['bump', 'u8'],
                ],
            },
        ],
    ]);
    static deserialize(data) {
        // discriminator(8) + next_index(8) + bump(1) = 17 bytes
        if (data.length < 17) {
            throw new Error(`Invalid ResponseIndexAccount data: expected >= 17 bytes, got ${data.length}`);
        }
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, ResponseIndexAccount, accountData);
    }
    get response_count() {
        return this.next_index;
    }
}
/**
 * Response Account (Reputation Registry) - v0.3.0
 * Seeds: ["response", asset, feedback_index, response_index]
 * Note: URIs and hashes stored in events only
 */
export class ResponseAccount {
    responder; // Pubkey - who responded
    bump;
    constructor(fields) {
        this.responder = fields.responder;
        this.bump = fields.bump;
    }
    static schema = new Map([
        [
            ResponseAccount,
            {
                kind: 'struct',
                fields: [
                    ['responder', [32]],
                    ['bump', 'u8'],
                ],
            },
        ],
    ]);
    static deserialize(data) {
        // discriminator(8) + responder(32) + bump(1) = 41 bytes
        if (data.length < 41) {
            throw new Error(`Invalid ResponseAccount data: expected >= 41 bytes, got ${data.length}`);
        }
        const accountData = data.slice(8);
        return deserializeUnchecked(this.schema, ResponseAccount, accountData);
    }
    getResponderPublicKey() {
        return new PublicKey(this.responder);
    }
}
/**
 * Validation Request Account (Validation Registry) - v0.3.0
 * Seeds: ["validation", asset, validator_address, nonce]
 */
export class ValidationRequest {
    asset; // Pubkey - agent asset
    validator_address; // Pubkey
    nonce; // u32
    request_hash; // [u8; 32]
    response_hash; // [u8; 32]
    response; // u8 (0-100, 0 = pending)
    last_update; // i64 as u64 - timestamp of last update
    has_response; // explicit flag
    bump;
    constructor(fields) {
        this.asset = fields.asset;
        this.validator_address = fields.validator_address;
        this.nonce = fields.nonce;
        this.request_hash = fields.request_hash;
        this.response_hash = fields.response_hash;
        this.response = fields.response;
        this.last_update = fields.last_update;
        this.has_response = fields.has_response;
        this.bump = fields.bump;
    }
    static schema = new Map([
        [
            ValidationRequest,
            {
                kind: 'struct',
                fields: [
                    ['asset', [32]],
                    ['validator_address', [32]],
                    ['nonce', 'u32'],
                    ['request_hash', [32]],
                    ['response_hash', [32]],
                    ['response', 'u8'],
                    ['last_update', 'u64'],
                    ['has_response', 'u8'],
                    ['bump', 'u8'],
                ],
            },
        ],
    ]);
    static deserialize(data) {
        // discriminator(8) + asset(32) + validator(32) + nonce(4) + req_hash(32) + resp_hash(32) + response(1) + last_update(8) + has_response(1) + bump(1) = 151 bytes
        if (data.length < 151) {
            throw new Error(`Invalid ValidationRequest data: expected >= 151 bytes, got ${data.length}`);
        }
        const accountData = data.slice(8);
        const raw = deserializeUnchecked(this.schema, ValidationRequest, accountData);
        return new ValidationRequest({
            asset: raw.asset,
            validator_address: raw.validator_address,
            nonce: raw.nonce,
            request_hash: raw.request_hash,
            response_hash: raw.response_hash,
            response: raw.response,
            last_update: raw.last_update,
            has_response: raw.has_response === 1,
            bump: raw.bump,
        });
    }
    getAssetPublicKey() {
        return new PublicKey(this.asset);
    }
    getValidatorPublicKey() {
        return new PublicKey(this.validator_address);
    }
    hasResponse() {
        return this.has_response;
    }
    isPending() {
        return !this.has_response;
    }
}
//# sourceMappingURL=borsh-schemas.js.map