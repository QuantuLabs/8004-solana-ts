/**
 * Borsh schemas for deserializing Solana account data
 * Based on ERC-8004 Solana program account structures
 * Must match exactly the Rust structs in 8004-solana programs
 */

import { Schema, deserializeUnchecked } from 'borsh';
import { PublicKey } from '@solana/web3.js';

/**
 * Metadata Entry (inline struct for AgentAccount and MetadataExtension)
 * Matches Rust: { metadata_key: String, metadata_value: Vec<u8> }
 */
export class MetadataEntry {
  metadata_key: string;    // String in Rust (max 32 bytes)
  metadata_value: Uint8Array;  // Vec<u8> in Rust (max 256 bytes)

  constructor(fields: { metadata_key: string; metadata_value: Uint8Array }) {
    this.metadata_key = fields.metadata_key;
    this.metadata_value = fields.metadata_value;
  }

  getValueString(): string {
    return Buffer.from(this.metadata_value).toString('utf8');
  }

  // Alias for backwards compatibility
  get key(): string {
    return this.metadata_key;
  }

  get value(): Uint8Array {
    return this.metadata_value;
  }
}

/**
 * Agent Account (Identity Registry) - v0.2.1 (static fields first for indexing)
 * Represents an agent NFT - metadata is now stored in separate MetadataEntryPda accounts
 * Seeds: ["agent", asset.key()]
 */
export class AgentAccount {
  agent_id: bigint;
  owner: Uint8Array;
  agent_mint: Uint8Array;
  created_at: bigint;        // v0.2.1: moved before dynamic fields
  bump: number;              // v0.2.1: moved before dynamic fields
  agent_uri: string;         // Note: field name is agent_uri, not token_uri
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
  }) {
    this.agent_id = fields.agent_id;
    this.owner = fields.owner;
    this.agent_mint = fields.agent_mint;
    this.created_at = fields.created_at;
    this.bump = fields.bump;
    this.agent_uri = fields.agent_uri;
    this.nft_name = fields.nft_name;
    this.nft_symbol = fields.nft_symbol;
  }

  /**
   * V2 Schema (v0.2.1) - Static fields first for indexing optimization
   */
  static schema: Schema = new Map<any, any>([
    [
      AgentAccount,
      {
        kind: 'struct',
        // v0.2.1: Static fields first for memcmp filtering
        fields: [
          ['agent_id', 'u64'],
          ['owner', [32]],
          ['agent_mint', [32]],
          ['created_at', 'u64'],           // Static first (v0.2.1)
          ['bump', 'u8'],                  // Static first (v0.2.1)
          ['agent_uri', 'string'],
          ['nft_name', 'string'],
          ['nft_symbol', 'string'],
        ],
      },
    ],
  ]);

  /**
   * Deserialize AgentAccount from buffer
   */
  static deserialize(data: Buffer): AgentAccount {
    // Security: Validate minimum buffer size
    // Minimum: discriminator(8) + agent_id(8) + owner(32) + agent_mint(32) + created_at(8) + bump(1) = 89 bytes
    if (data.length < 89) {
      throw new Error(`Invalid AgentAccount data: expected >= 89 bytes, got ${data.length}`);
    }

    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, AgentAccount, accountData);
  }

  getOwnerPublicKey(): PublicKey {
    return new PublicKey(this.owner);
  }

  getMintPublicKey(): PublicKey {
    return new PublicKey(this.agent_mint);
  }

  // Alias for backwards compatibility
  get token_uri(): string {
    return this.agent_uri;
  }

  // v0.2.0: metadata is now empty - use MetadataEntryPda for metadata
  get metadata(): MetadataEntry[] {
    return [];
  }
}

/**
 * Metadata Entry PDA (v0.2.1 - Static fields first for indexing)
 * Seeds: ["agent_meta", agent_id (LE), key_hash[0..8]]
 * Each metadata entry is stored in its own PDA for deleteability
 */
export class MetadataEntryPda {
  agent_id: bigint;
  created_at: bigint;        // v0.2.1: moved before dynamic fields
  immutable: boolean;        // v0.2.1: moved before dynamic fields
  bump: number;              // v0.2.1: moved before dynamic fields
  metadata_key: string;
  metadata_value: Uint8Array;

  constructor(fields: {
    agent_id: bigint;
    created_at: bigint;
    immutable: boolean;
    bump: number;
    metadata_key: string;
    metadata_value: Uint8Array;
  }) {
    this.agent_id = fields.agent_id;
    this.created_at = fields.created_at;
    this.immutable = fields.immutable;
    this.bump = fields.bump;
    this.metadata_key = fields.metadata_key;
    this.metadata_value = fields.metadata_value;
  }

  /**
   * V2 Schema (v0.2.1) - Static fields first for indexing optimization
   */
  static schema: Schema = new Map<any, any>([
    [
      MetadataEntryPda,
      {
        kind: 'struct',
        // v0.2.1: Static fields first for memcmp filtering
        fields: [
          ['agent_id', 'u64'],
          ['created_at', 'u64'],       // Static first (v0.2.1)
          ['immutable', 'u8'],         // Static first (v0.2.1)
          ['bump', 'u8'],              // Static first (v0.2.1)
          ['metadata_key', 'string'],
          ['metadata_value', ['u8']],  // Vec<u8>
        ],
      },
    ],
  ]);

  /**
   * Deserialize MetadataEntryPda from buffer
   */
  static deserialize(data: Buffer): MetadataEntryPda {
    // Security: Validate minimum buffer size
    // Minimum: discriminator(8) + agent_id(8) + created_at(8) + immutable(1) + bump(1) = 26 bytes
    if (data.length < 26) {
      throw new Error(`Invalid MetadataEntryPda data: expected >= 26 bytes, got ${data.length}`);
    }

    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    const raw = deserializeUnchecked(this.schema, MetadataEntryPda, accountData) as any;
    return new MetadataEntryPda({
      agent_id: raw.agent_id,
      created_at: raw.created_at,
      immutable: raw.immutable === 1,
      bump: raw.bump,
      metadata_key: raw.metadata_key,
      metadata_value: raw.metadata_value,
    });
  }

  getValueString(): string {
    return Buffer.from(this.metadata_value).toString('utf8');
  }

  // Convenient getters
  get key(): string {
    return this.metadata_key;
  }

  get value(): string {
    return this.getValueString();
  }

  get isImmutable(): boolean {
    return this.immutable;
  }
}

/**
 * Registry Config Account (Identity Registry)
 * Seeds: ["config"]
 * v0.2.0: Removed collection_authority_bump, collection_mint renamed to collection
 */
export class RegistryConfig {
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
  }) {
    this.authority = fields.authority;
    this.next_agent_id = fields.next_agent_id;
    this.total_agents = fields.total_agents;
    this.collection = fields.collection;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map<any, any>([
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

  static deserialize(data: Buffer): RegistryConfig {
    // Security: Validate minimum buffer size
    // discriminator(8) + authority(32) + next_agent_id(8) + total_agents(8) + collection(32) + bump(1) = 89 bytes
    if (data.length < 89) {
      throw new Error(`Invalid RegistryConfig data: expected >= 89 bytes, got ${data.length}`);
    }
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, RegistryConfig, accountData);
  }

  getAuthorityPublicKey(): PublicKey {
    return new PublicKey(this.authority);
  }

  getCollectionPublicKey(): PublicKey {
    return new PublicKey(this.collection);
  }

  // Alias for backwards compatibility
  getCollectionMintPublicKey(): PublicKey {
    return this.getCollectionPublicKey();
  }

  // Alias for backwards compatibility
  get collection_mint(): Uint8Array {
    return this.collection;
  }
}

/**
 * Metadata Extension Account (Identity Registry)
 * Stores additional metadata entries beyond the base 10
 * Seeds: ["metadata_ext", mint.key(), extension_index]
 */
export class MetadataExtensionAccount {
  agent_mint: Uint8Array;        // Reference to agent NFT mint
  extension_index: number;        // Extension index (0, 1, 2, ...)
  metadata: MetadataEntry[];      // Vec<MetadataEntry> (max 10 per extension)
  bump: number;

  constructor(fields: {
    agent_mint: Uint8Array;
    extension_index: number;
    metadata: MetadataEntry[];
    bump: number;
  }) {
    this.agent_mint = fields.agent_mint;
    this.extension_index = fields.extension_index;
    this.metadata = fields.metadata;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map<any, any>([
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

  static deserialize(data: Buffer): MetadataExtensionAccount {
    // Security: Validate minimum buffer size
    // discriminator(8) + agent_mint(32) + extension_index(1) + metadata vec len(4) + bump(1) = 46 bytes minimum
    if (data.length < 46) {
      throw new Error(`Invalid MetadataExtensionAccount data: expected >= 46 bytes, got ${data.length}`);
    }
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, MetadataExtensionAccount, accountData);
  }

  getMintPublicKey(): PublicKey {
    return new PublicKey(this.agent_mint);
  }
}

/**
 * Feedback Account (Reputation Registry)
 * Represents feedback given by a client to an agent
 * Seeds: ["feedback", agent_id (LE), feedback_index (LE)]
 * Tags moved to optional FeedbackTagsPda for cost optimization (-42%)
 */
export class FeedbackAccount {
  agent_id: bigint;
  client_address: Uint8Array;     // Renamed from client
  feedback_index: bigint;
  score: number;
  // Tags moved to FeedbackTagsPda - use setFeedbackTags if needed
  file_hash: Uint8Array;
  is_revoked: boolean;            // Renamed from revoked
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
  }) {
    this.agent_id = fields.agent_id;
    this.client_address = fields.client_address;
    this.feedback_index = fields.feedback_index;
    this.score = fields.score;
    this.file_hash = fields.file_hash;
    this.is_revoked = fields.is_revoked;
    this.created_at = fields.created_at;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map<any, any>([
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
          ['is_revoked', 'u8'],         // bool serialized as u8
          ['created_at', 'u64'],        // borsh 0.7 doesn't support i64
          ['bump', 'u8'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): FeedbackAccount {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    const raw = deserializeUnchecked(this.schema, FeedbackAccount, accountData) as any;

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

  getClientPublicKey(): PublicKey {
    return new PublicKey(this.client_address);
  }

  // Alias for backwards compatibility
  get client(): Uint8Array {
    return this.client_address;
  }

  get revoked(): boolean {
    return this.is_revoked;
  }

  // file_uri is stored in event only
  get file_uri(): string {
    return '';
  }

  // Tags moved to FeedbackTagsPda
  get tag1(): string {
    return '';
  }

  get tag2(): string {
    return '';
  }
}

/**
 * Feedback Tags PDA (Reputation Registry) - v0.2.1 (static fields first)
 * Optional tags for feedback, created only when needed
 * Seeds: ["feedback_tags", agent_id (LE), feedback_index (LE)]
 * Separated from FeedbackAccount for -42% cost savings when tags not used
 */
export class FeedbackTagsPda {
  agent_id: bigint;
  feedback_index: bigint;
  bump: number;              // v0.2.1: moved before dynamic fields
  tag1: string;
  tag2: string;

  constructor(fields: {
    agent_id: bigint;
    feedback_index: bigint;
    bump: number;
    tag1: string;
    tag2: string;
  }) {
    this.agent_id = fields.agent_id;
    this.feedback_index = fields.feedback_index;
    this.bump = fields.bump;
    this.tag1 = fields.tag1;
    this.tag2 = fields.tag2;
  }

  /**
   * V2 Schema (v0.2.1) - Static fields first for indexing optimization
   */
  static schema: Schema = new Map<any, any>([
    [
      FeedbackTagsPda,
      {
        kind: 'struct',
        // v0.2.1: Static fields first for memcmp filtering
        fields: [
          ['agent_id', 'u64'],
          ['feedback_index', 'u64'],
          ['bump', 'u8'],              // Static first (v0.2.1)
          ['tag1', 'string'],
          ['tag2', 'string'],
        ],
      },
    ],
  ]);

  /**
   * Deserialize FeedbackTagsPda from buffer
   */
  static deserialize(data: Buffer): FeedbackTagsPda {
    // Security: Validate minimum buffer size
    // Minimum: discriminator(8) + agent_id(8) + feedback_index(8) + bump(1) = 25 bytes
    if (data.length < 25) {
      throw new Error(`Invalid FeedbackTagsPda data: expected >= 25 bytes, got ${data.length}`);
    }

    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, FeedbackTagsPda, accountData);
  }
}

/**
 * Agent Reputation Metadata Account (Reputation Registry)
 * Cached aggregated stats for O(1) queries
 * Seeds: ["agent_reputation", agent_id (LE)]
 * v0.2.0: Added next_feedback_index for global feedback tracking
 */
export class AgentReputationAccount {
  agent_id: bigint;
  total_feedbacks: bigint;
  total_score_sum: bigint;
  average_score: number;
  next_feedback_index: bigint;    // v0.2.0: global feedback counter
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
  }) {
    this.agent_id = fields.agent_id;
    this.total_feedbacks = fields.total_feedbacks;
    this.total_score_sum = fields.total_score_sum;
    this.average_score = fields.average_score;
    this.next_feedback_index = fields.next_feedback_index;
    this.last_updated = fields.last_updated;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map<any, any>([
    [
      AgentReputationAccount,
      {
        kind: 'struct',
        // Field order MUST match Rust struct: AgentReputationMetadata
        fields: [
          ['agent_id', 'u64'],
          ['next_feedback_index', 'u64'],  // v0.2.0 - SECOND field in Rust
          ['total_feedbacks', 'u64'],
          ['total_score_sum', 'u64'],
          ['average_score', 'u8'],
          ['last_updated', 'u64'],
          ['bump', 'u8'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): AgentReputationAccount {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, AgentReputationAccount, accountData);
  }

  // Alias for backwards compatibility
  get sum_scores(): bigint {
    return this.total_score_sum;
  }
}

/**
 * Client Index Account (Reputation Registry)
 * Tracks the next feedback index for a specific client-agent pair
 * Seeds: ["client_index", agent_id (LE), client_address]
 */
export class ClientIndexAccount {
  agent_id: bigint;
  client_address: Uint8Array;     // Renamed from client
  last_index: bigint;             // Renamed from last_feedback_index
  bump: number;

  constructor(fields: {
    agent_id: bigint;
    client_address: Uint8Array;
    last_index: bigint;
    bump: number;
  }) {
    this.agent_id = fields.agent_id;
    this.client_address = fields.client_address;
    this.last_index = fields.last_index;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map<any, any>([
    [
      ClientIndexAccount,
      {
        kind: 'struct',
        fields: [
          ['agent_id', 'u64'],
          ['client_address', [32]],
          ['last_index', 'u64'],          // Renamed from last_feedback_index
          ['bump', 'u8'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): ClientIndexAccount {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, ClientIndexAccount, accountData);
  }

  getClientPublicKey(): PublicKey {
    return new PublicKey(this.client_address);
  }

  // Alias for backwards compatibility
  get client(): Uint8Array {
    return this.client_address;
  }

  get last_feedback_index(): bigint {
    return this.last_index;
  }
}

/**
 * Response Index Account (Reputation Registry)
 * Tracks the next response index for a specific feedback
 * Seeds: ["response_index", agent_id (LE), feedback_index (LE)]
 * v0.2.0: Removed client_address from struct (global feedback index)
 */
export class ResponseIndexAccount {
  agent_id: bigint;
  feedback_index: bigint;
  next_index: bigint;
  bump: number;

  constructor(fields: {
    agent_id: bigint;
    feedback_index: bigint;
    next_index: bigint;
    bump: number;
  }) {
    this.agent_id = fields.agent_id;
    this.feedback_index = fields.feedback_index;
    this.next_index = fields.next_index;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map<any, any>([
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

  static deserialize(data: Buffer): ResponseIndexAccount {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, ResponseIndexAccount, accountData);
  }

  get response_count(): bigint {
    return this.next_index;
  }
}

/**
 * Response Account (Reputation Registry)
 * Represents a response to feedback (from agent, aggregator, or community)
 * Seeds: ["response", agent_id (LE), feedback_index (LE), response_index (LE)]
 * v0.2.0: Removed client_address and response_uri (URI in events only)
 */
export class ResponseAccount {
  agent_id: bigint;
  feedback_index: bigint;
  response_index: bigint;
  responder: Uint8Array;
  // v0.2.0: response_uri removed - stored in ResponseAppended event only
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
  }) {
    this.agent_id = fields.agent_id;
    this.feedback_index = fields.feedback_index;
    this.response_index = fields.response_index;
    this.responder = fields.responder;
    this.response_hash = fields.response_hash;
    this.created_at = fields.created_at;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map<any, any>([
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

  static deserialize(data: Buffer): ResponseAccount {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, ResponseAccount, accountData);
  }

  getResponderPublicKey(): PublicKey {
    return new PublicKey(this.responder);
  }

  // v0.2.0: response_uri is now empty - stored in event only
  get response_uri(): string {
    return '';
  }
}

/**
 * Validation Config Account (Validation Registry)
 * Seeds: ["config"]
 */
export class ValidationConfig {
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
  }) {
    this.authority = fields.authority;
    this.identity_registry = fields.identity_registry;
    this.total_requests = fields.total_requests;
    this.total_responses = fields.total_responses;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map<any, any>([
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

  static deserialize(data: Buffer): ValidationConfig {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, ValidationConfig, accountData);
  }

  getAuthorityPublicKey(): PublicKey {
    return new PublicKey(this.authority);
  }

  getIdentityRegistryPublicKey(): PublicKey {
    return new PublicKey(this.identity_registry);
  }
}

/**
 * Validation Request Account (Validation Registry)
 * Seeds: ["validation", agent_id (LE), validator_address, nonce (LE)]
 */
export class ValidationRequest {
  agent_id: bigint;
  validator_address: Uint8Array;
  nonce: number;                  // u32
  request_hash: Uint8Array;
  response_hash: Uint8Array;
  response: number;               // u8 (0-100)
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
  }) {
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

  static schema: Schema = new Map<any, any>([
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
          ['created_at', 'u64'],          // borsh 0.7 doesn't support i64
          ['responded_at', 'u64'],        // borsh 0.7 doesn't support i64
          ['bump', 'u8'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): ValidationRequest {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, ValidationRequest, accountData);
  }

  getValidatorPublicKey(): PublicKey {
    return new PublicKey(this.validator_address);
  }

  hasResponse(): boolean {
    // Handle both BigInt and BN (bn.js) from borsh deserialization
    const respondedAt = typeof this.responded_at === 'bigint'
      ? this.responded_at
      : BigInt((this.responded_at as unknown as { toString(): string }).toString());
    return respondedAt !== BigInt(0);
  }

  isPending(): boolean {
    // Handle both BigInt and BN (bn.js) from borsh deserialization
    const respondedAt = typeof this.responded_at === 'bigint'
      ? this.responded_at
      : BigInt((this.responded_at as unknown as { toString(): string }).toString());
    return respondedAt === BigInt(0);
  }
}
