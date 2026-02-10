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

import { Schema, deserializeUnchecked } from 'borsh';
import { PublicKey } from '@solana/web3.js';
import { LIMITS } from '../utils/constants.js';
import { ACCOUNT_DISCRIMINATORS, matchesDiscriminator } from './instruction-discriminators.js';

// ============================================================================
// Raw Borsh Deserialized Interfaces
// These represent the raw data returned by deserializeUnchecked before processing
// ============================================================================

/** Raw deserialized MetadataEntryPda from Borsh */
interface RawMetadataEntry {
  asset: Uint8Array;
  immutable: number;
  bump: number;
  metadata_key: string;
  metadata_value: Uint8Array;
}

/** Raw deserialized FeedbackAccount from Borsh */
interface RawFeedbackAccount {
  asset: Uint8Array;
  client_address: Uint8Array;
  feedback_index: bigint;
  score: number;
  is_revoked: number;
  bump: number;
}

/** Raw deserialized ValidationRequest from Borsh */
interface RawValidationRequest {
  asset: Uint8Array;
  validator_address: Uint8Array;
  nonce: number;
  request_hash: Uint8Array;
  response: number;
  responded_at: bigint;
}

/**
 * Security: Pre-validate Borsh string/vec length prefixes BEFORE deserialization
 * This prevents DoS via malicious buffers with huge length values that would
 * cause OOM during deserializeUnchecked() before post-validation runs.
 *
 * Borsh string format: u32 length prefix (LE) + utf8 bytes
 * Borsh vec format: u32 length prefix (LE) + elements
 */
function preValidateBorshLength(
  data: Buffer,
  offset: number,
  maxLength: number,
  fieldName: string
): number {
  if (offset + 4 > data.length) {
    throw new Error(`Security: Buffer too short to read ${fieldName} length at offset ${offset}`);
  }
  const length = data.readUInt32LE(offset);
  if (length > maxLength) {
    throw new Error(
      `Security: ${fieldName} length prefix (${length}) exceeds max (${maxLength}). ` +
      `Rejecting before deserialization to prevent OOM.`
    );
  }
  // Also verify the buffer has enough data for the declared length
  if (offset + 4 + length > data.length) {
    throw new Error(
      `Security: ${fieldName} declares ${length} bytes but buffer only has ${data.length - offset - 4} remaining.`
    );
  }
  return length;
}

/**
 * Security: Pre-validate Borsh Option<Pubkey> format
 * Option format: 1 byte (0=None, 1=Some) + optional 32 bytes
 */
function preValidateBorshOption(
  data: Buffer,
  offset: number,
  innerSize: number
): { hasValue: boolean; consumedBytes: number } {
  if (offset >= data.length) {
    throw new Error(`Security: Buffer too short to read Option tag at offset ${offset}`);
  }
  const tag = data[offset];
  if (tag === 0) {
    return { hasValue: false, consumedBytes: 1 };
  } else if (tag === 1) {
    if (offset + 1 + innerSize > data.length) {
      throw new Error(`Security: Option(Some) at offset ${offset} declares ${innerSize} bytes but buffer too short`);
    }
    return { hasValue: true, consumedBytes: 1 + innerSize };
  } else {
    throw new Error(`Security: Invalid Option tag ${tag} at offset ${offset}`);
  }
}

/**
 * Security: Validate deserialized string lengths (post-validation backup)
 * Borsh can decode arbitrarily large strings that could cause OOM
 */
function validateStringLength(value: string, maxBytes: number, fieldName: string): void {
  const byteLength = Buffer.byteLength(value, 'utf8');
  if (byteLength > maxBytes) {
    throw new Error(
      `Security: ${fieldName} exceeds max length (${byteLength} > ${maxBytes} bytes). ` +
      `Possible malformed account data.`
    );
  }
}

/**
 * Security: Validate byte array lengths (post-validation backup)
 */
function validateArrayLength(value: Uint8Array, maxLength: number, fieldName: string): void {
  if (value.length > maxLength) {
    throw new Error(
      `Security: ${fieldName} exceeds max length (${value.length} > ${maxLength} bytes). ` +
      `Possible malformed account data.`
    );
  }
}

/**
 * Metadata Entry (inline struct for metadata storage)
 * Matches Rust: { metadata_key: String, metadata_value: Vec<u8> }
 */
export class MetadataEntry {
  metadata_key: string; // String in Rust (max 32 bytes)
  metadata_value: Uint8Array; // Vec<u8> in Rust (max 256 bytes)

  constructor(fields: { metadata_key: string; metadata_value: Uint8Array }) {
    this.metadata_key = fields.metadata_key;
    this.metadata_value = fields.metadata_value;
  }

  getValueString(): string {
    return Buffer.from(this.metadata_value).toString('utf8');
  }

  get key(): string {
    return this.metadata_key;
  }

  get value(): Uint8Array {
    return this.metadata_value;
  }
}

/**
 * Root Config Account (Identity Registry) - v0.6.0
 * Single-collection architecture: points directly to the base collection
 * Seeds: ["root_config"]
 */
export class RootConfig {
  base_collection: Uint8Array; // Pubkey of base Metaplex Core collection
  authority: Uint8Array; // Pubkey - upgrade authority
  bump: number;

  constructor(fields: {
    base_collection: Uint8Array;
    authority: Uint8Array;
    bump: number;
  }) {
    this.base_collection = fields.base_collection;
    this.authority = fields.authority;
    this.bump = fields.bump;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static schema: Schema = new Map([
    [
      RootConfig,
      {
        kind: 'struct',
        fields: [
          ['base_collection', [32]],
          ['authority', [32]],
          ['bump', 'u8'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): RootConfig {
    // discriminator(8) + base_collection(32) + authority(32) + bump(1) = 73 bytes
    if (data.length < 73) {
      throw new Error(`Invalid RootConfig data: expected >= 73 bytes, got ${data.length}`);
    }
    if (!matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.RootConfig)) {
      throw new Error('Invalid RootConfig discriminator');
    }
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, RootConfig, accountData);
  }

  getBaseCollectionPublicKey(): PublicKey {
    return new PublicKey(this.base_collection);
  }

  /** @deprecated Use getBaseCollectionPublicKey() instead */
  getBaseRegistryPublicKey(): PublicKey {
    return this.getBaseCollectionPublicKey();
  }

  getAuthorityPublicKey(): PublicKey {
    return new PublicKey(this.authority);
  }
}

/**
 * Registry Config Account (Identity Registry) - v0.6.0
 * Single-collection architecture
 * Seeds: ["registry_config", collection]
 */
export class RegistryConfig {
  collection: Uint8Array; // Pubkey - Metaplex Core collection
  authority: Uint8Array; // Pubkey - registry authority
  bump: number;

  constructor(fields: {
    collection: Uint8Array;
    authority: Uint8Array;
    bump: number;
  }) {
    this.collection = fields.collection;
    this.authority = fields.authority;
    this.bump = fields.bump;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static schema: Schema = new Map([
    [
      RegistryConfig,
      {
        kind: 'struct',
        fields: [
          ['collection', [32]],
          ['authority', [32]],
          ['bump', 'u8'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): RegistryConfig {
    // discriminator(8) + collection(32) + authority(32) + bump(1) = 73 bytes
    if (data.length < 73) {
      throw new Error(`Invalid RegistryConfig data: expected >= 73 bytes, got ${data.length}`);
    }
    if (!matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.RegistryConfig)) {
      throw new Error('Invalid RegistryConfig discriminator');
    }
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, RegistryConfig, accountData);
  }

  getCollectionPublicKey(): PublicKey {
    return new PublicKey(this.collection);
  }

  getAuthorityPublicKey(): PublicKey {
    return new PublicKey(this.authority);
  }
}

/**
 * Agent Account (Identity Registry) - v0.5.0
 * Represents an agent NFT with hash-chain support
 * Seeds: ["agent", asset]
 */
export class AgentAccount {
  collection: Uint8Array; // Pubkey - collection this agent belongs to
  owner: Uint8Array; // Pubkey - cached from Core asset
  asset: Uint8Array; // Pubkey - unique identifier (Metaplex Core asset)
  bump: number;
  atom_enabled: number; // bool (u8) - ATOM Engine enabled
  agent_wallet: Uint8Array | null; // Option<Pubkey> - operational wallet (Ed25519 verified)
  // Hash-chain fields for event verification
  feedback_digest: Uint8Array; // [u8; 32] - hash-chain of all feedbacks
  feedback_count: bigint; // u64 - total feedback count
  response_digest: Uint8Array; // [u8; 32] - hash-chain of all responses
  response_count: bigint; // u64 - total response count
  revoke_digest: Uint8Array; // [u8; 32] - hash-chain of all revocations
  revoke_count: bigint; // u64 - total revocation count
  // Dynamic-size fields last
  agent_uri: string; // max 250 bytes
  nft_name: string; // max 32 bytes

  constructor(fields: {
    collection: Uint8Array;
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
    agent_uri: string;
    nft_name: string;
  }) {
    this.collection = fields.collection;
    this.owner = fields.owner;
    this.asset = fields.asset;
    this.bump = fields.bump;
    this.atom_enabled = fields.atom_enabled;
    this.agent_wallet = fields.agent_wallet;
    this.feedback_digest = fields.feedback_digest;
    this.feedback_count = fields.feedback_count;
    this.response_digest = fields.response_digest;
    this.response_count = fields.response_count;
    this.revoke_digest = fields.revoke_digest;
    this.revoke_count = fields.revoke_count;
    this.agent_uri = fields.agent_uri;
    this.nft_name = fields.nft_name;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static schema: Schema = new Map([
    [
      AgentAccount,
      {
        kind: 'struct',
        fields: [
          ['collection', [32]], // Collection pubkey
          ['owner', [32]],
          ['asset', [32]],
          ['bump', 'u8'],
          ['atom_enabled', 'u8'],
          ['agent_wallet', { kind: 'option', type: [32] }], // Option<Pubkey>
          ['feedback_digest', [32]], // Hash-chain for feedbacks
          ['feedback_count', 'u64'],
          ['response_digest', [32]], // Hash-chain for responses
          ['response_count', 'u64'],
          ['revoke_digest', [32]], // Hash-chain for revocations
          ['revoke_count', 'u64'],
          ['agent_uri', 'string'],
          ['nft_name', 'string'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): AgentAccount {
    // discriminator(8) + collection(32) + owner(32) + asset(32) + bump(1) + atom_enabled(1)
    // + agent_wallet option tag(1) + feedback_digest(32) + feedback_count(8)
    // + response_digest(32) + response_count(8) + revoke_digest(32) + revoke_count(8) = 227 bytes minimum
    // With Some(wallet): 227 + 32 = 259 bytes minimum
    if (data.length < 227) {
      throw new Error(`Invalid AgentAccount data: expected >= 227 bytes, got ${data.length}`);
    }
    if (!matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.AgentAccount)) {
      throw new Error('Invalid AgentAccount discriminator');
    }
    const accountData = data.slice(8);

    // Security: PRE-VALIDATE string lengths BEFORE deserializeUnchecked to prevent OOM
    // Layout: collection(32) + owner(32) + asset(32) + bump(1) + atom_enabled(1) + agent_wallet(Option)
    //         + feedback_digest(32) + feedback_count(8) + response_digest(32) + response_count(8)
    //         + revoke_digest(32) + revoke_count(8) + agent_uri(String) + nft_name(String)
    let offset = 32 + 32 + 32 + 1 + 1; // = 98, at agent_wallet Option tag

    // Pre-validate Option<Pubkey>
    const optionResult = preValidateBorshOption(accountData, offset, 32);
    offset += optionResult.consumedBytes;

    // Skip hash-chain fixed fields: feedback_digest(32) + feedback_count(8) + response_digest(32) + response_count(8) + revoke_digest(32) + revoke_count(8) = 120 bytes
    offset += 32 + 8 + 32 + 8 + 32 + 8;

    // Pre-validate agent_uri string length
    const agentUriLen = preValidateBorshLength(accountData, offset, LIMITS.MAX_URI_LENGTH, 'agent_uri');
    offset += 4 + agentUriLen;

    // Pre-validate nft_name string length
    preValidateBorshLength(accountData, offset, LIMITS.MAX_NFT_NAME_LENGTH, 'nft_name');

    // Now safe to deserialize - lengths are validated
    const result = deserializeUnchecked(this.schema, AgentAccount, accountData);

    // Post-validation backup (defense in depth)
    validateStringLength(result.agent_uri, LIMITS.MAX_URI_LENGTH, 'agent_uri');
    validateStringLength(result.nft_name, LIMITS.MAX_NFT_NAME_LENGTH, 'nft_name');

    return result;
  }

  getCollectionPublicKey(): PublicKey {
    return new PublicKey(this.collection);
  }

  getOwnerPublicKey(): PublicKey {
    return new PublicKey(this.owner);
  }

  getAssetPublicKey(): PublicKey {
    return new PublicKey(this.asset);
  }

  /**
   * Get the agent's operational wallet if set
   * @returns PublicKey or null if no wallet is set
   */
  getAgentWalletPublicKey(): PublicKey | null {
    // Defensive check for both null and undefined (protects against data corruption)
    if (this.agent_wallet === null || this.agent_wallet === undefined) {
      return null;
    }
    return new PublicKey(this.agent_wallet);
  }

  isAtomEnabled(): boolean {
    return this.atom_enabled !== 0;
  }

  /**
   * Check if agent has an operational wallet configured
   */
  hasAgentWallet(): boolean {
    return this.agent_wallet !== null;
  }

  // Alias for backwards compatibility
  get token_uri(): string {
    return this.agent_uri;
  }

  // v0.3.0: metadata is stored in MetadataEntryPda accounts
  get metadata(): MetadataEntry[] {
    return [];
  }
}

/**
 * Metadata Entry PDA (Identity Registry) - v0.3.0
 * Seeds: ["agent_meta", asset, key_hash[0..8]]
 */
export class MetadataEntryPda {
  asset: Uint8Array; // Pubkey - unique identifier
  immutable: boolean;
  bump: number;
  metadata_key: string; // max 32 bytes
  metadata_value: Uint8Array; // max 256 bytes

  constructor(fields: {
    asset: Uint8Array;
    immutable: boolean;
    bump: number;
    metadata_key: string;
    metadata_value: Uint8Array;
  }) {
    this.asset = fields.asset;
    this.immutable = fields.immutable;
    this.bump = fields.bump;
    this.metadata_key = fields.metadata_key;
    this.metadata_value = fields.metadata_value;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static schema: Schema = new Map([
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

  static deserialize(data: Buffer): MetadataEntryPda {
    // discriminator(8) + asset(32) + immutable(1) + bump(1) = 42 bytes minimum
    if (data.length < 42) {
      throw new Error(`Invalid MetadataEntryPda data: expected >= 42 bytes, got ${data.length}`);
    }
    if (!matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.MetadataEntryPda)) {
      throw new Error('Invalid MetadataEntryPda discriminator');
    }
    const accountData = data.slice(8);

    // Security: PRE-VALIDATE lengths BEFORE deserializeUnchecked to prevent OOM
    // Layout: asset(32) + immutable(1) + bump(1) + metadata_key(String) + metadata_value(Vec<u8>)
    let offset = 32 + 1 + 1; // = 34, at metadata_key

    // Pre-validate metadata_key string length
    const keyLen = preValidateBorshLength(accountData, offset, LIMITS.MAX_METADATA_KEY_LENGTH, 'metadata_key');
    offset += 4 + keyLen;

    // Pre-validate metadata_value vec length
    preValidateBorshLength(accountData, offset, LIMITS.MAX_METADATA_VALUE_LENGTH, 'metadata_value');

    // Now safe to deserialize
    const raw = deserializeUnchecked(this.schema, MetadataEntryPda, accountData) as unknown as RawMetadataEntry;

    // Post-validation backup (defense in depth)
    validateStringLength(raw.metadata_key, LIMITS.MAX_METADATA_KEY_LENGTH, 'metadata_key');
    validateArrayLength(raw.metadata_value, LIMITS.MAX_METADATA_VALUE_LENGTH, 'metadata_value');

    return new MetadataEntryPda({
      asset: raw.asset,
      immutable: raw.immutable !== 0, // Security: treat any non-zero as true
      bump: raw.bump,
      metadata_key: raw.metadata_key,
      metadata_value: raw.metadata_value,
    });
  }

  getAssetPublicKey(): PublicKey {
    return new PublicKey(this.asset);
  }

  getValueString(): string {
    return Buffer.from(this.metadata_value).toString('utf8');
  }

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
 * Feedback Account (Reputation Registry) - v0.3.0
 * Seeds: ["feedback", asset, feedback_index]
 */
export class FeedbackAccount {
  asset: Uint8Array; // Pubkey - agent asset
  client_address: Uint8Array; // Pubkey - feedback giver
  feedback_index: bigint; // Global index per agent
  score: number; // 0-100
  is_revoked: boolean;
  bump: number;

  constructor(fields: {
    asset: Uint8Array;
    client_address: Uint8Array;
    feedback_index: bigint;
    score: number;
    is_revoked: boolean;
    bump: number;
  }) {
    this.asset = fields.asset;
    this.client_address = fields.client_address;
    this.feedback_index = fields.feedback_index;
    this.score = fields.score;
    this.is_revoked = fields.is_revoked;
    this.bump = fields.bump;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static schema: Schema = new Map([
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

  static deserialize(data: Buffer): FeedbackAccount {
    // discriminator(8) + asset(32) + client_address(32) + feedback_index(8) + score(1) + is_revoked(1) + bump(1) = 83 bytes
    if (data.length < 83) {
      throw new Error(`Invalid FeedbackAccount data: expected >= 83 bytes, got ${data.length}`);
    }
    if (!matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.FeedbackAccount)) {
      throw new Error('Invalid FeedbackAccount discriminator');
    }
    const accountData = data.slice(8);
    const raw = deserializeUnchecked(this.schema, FeedbackAccount, accountData) as unknown as RawFeedbackAccount;
    return new FeedbackAccount({
      asset: raw.asset,
      client_address: raw.client_address,
      feedback_index: raw.feedback_index,
      score: raw.score,
      is_revoked: raw.is_revoked !== 0, // Security: treat any non-zero as true (revoked)
      bump: raw.bump,
    });
  }

  getAssetPublicKey(): PublicKey {
    return new PublicKey(this.asset);
  }

  getClientPublicKey(): PublicKey {
    return new PublicKey(this.client_address);
  }

  get revoked(): boolean {
    return this.is_revoked;
  }
}

/**
 * Feedback Tags PDA (Reputation Registry) - v0.3.0
 * Seeds: ["feedback_tags", asset, feedback_index]
 * Note: asset and feedback_index are in seeds only, not stored in account
 */
export class FeedbackTagsPda {
  bump: number;
  tag1: string; // max 32 bytes
  tag2: string; // max 32 bytes

  constructor(fields: { bump: number; tag1: string; tag2: string }) {
    this.bump = fields.bump;
    this.tag1 = fields.tag1;
    this.tag2 = fields.tag2;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static schema: Schema = new Map([
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

  static deserialize(data: Buffer): FeedbackTagsPda {
    // discriminator(8) + bump(1) = 9 bytes minimum
    if (data.length < 9) {
      throw new Error(`Invalid FeedbackTagsPda data: expected >= 9 bytes, got ${data.length}`);
    }
    if (!matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.FeedbackTagsPda)) {
      throw new Error('Invalid FeedbackTagsPda discriminator');
    }
    const accountData = data.slice(8);

    // Security: PRE-VALIDATE string lengths BEFORE deserializeUnchecked to prevent OOM
    // Layout: bump(1) + tag1(String) + tag2(String)
    let offset = 1; // = 1, at tag1

    // Pre-validate tag1 string length
    const tag1Len = preValidateBorshLength(accountData, offset, LIMITS.MAX_TAG_LENGTH, 'tag1');
    offset += 4 + tag1Len;

    // Pre-validate tag2 string length
    preValidateBorshLength(accountData, offset, LIMITS.MAX_TAG_LENGTH, 'tag2');

    // Now safe to deserialize
    const result = deserializeUnchecked(this.schema, FeedbackTagsPda, accountData);

    // Post-validation backup (defense in depth)
    validateStringLength(result.tag1, LIMITS.MAX_TAG_LENGTH, 'tag1');
    validateStringLength(result.tag2, LIMITS.MAX_TAG_LENGTH, 'tag2');

    return result;
  }
}

/**
 * Agent Reputation Metadata (Reputation Registry) - v0.3.0
 * Sequencer for feedback indices only - aggregates moved off-chain
 * Seeds: ["agent_reputation", asset]
 */
export class AgentReputationMetadata {
  next_feedback_index: bigint; // Global counter for feedback indices
  bump: number;

  constructor(fields: { next_feedback_index: bigint; bump: number }) {
    this.next_feedback_index = fields.next_feedback_index;
    this.bump = fields.bump;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static schema: Schema = new Map([
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

  static deserialize(data: Buffer): AgentReputationMetadata {
    // discriminator(8) + next_feedback_index(8) + bump(1) = 17 bytes
    if (data.length < 17) {
      throw new Error(`Invalid AgentReputationMetadata data: expected >= 17 bytes, got ${data.length}`);
    }
    if (!matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.AgentReputationMetadata)) {
      throw new Error('Invalid AgentReputationMetadata discriminator');
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
  next_index: bigint;
  bump: number;

  constructor(fields: { next_index: bigint; bump: number }) {
    this.next_index = fields.next_index;
    this.bump = fields.bump;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static schema: Schema = new Map([
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

  static deserialize(data: Buffer): ResponseIndexAccount {
    // discriminator(8) + next_index(8) + bump(1) = 17 bytes
    if (data.length < 17) {
      throw new Error(`Invalid ResponseIndexAccount data: expected >= 17 bytes, got ${data.length}`);
    }
    if (!matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.ResponseIndexAccount)) {
      throw new Error('Invalid ResponseIndexAccount discriminator');
    }
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, ResponseIndexAccount, accountData);
  }

  get response_count(): bigint {
    return this.next_index;
  }
}

/**
 * Response Account (Reputation Registry) - v0.3.0
 * Seeds: ["response", asset, feedback_index, response_index]
 * Note: URIs and hashes stored in events only
 */
export class ResponseAccount {
  responder: Uint8Array; // Pubkey - who responded
  bump: number;

  constructor(fields: { responder: Uint8Array; bump: number }) {
    this.responder = fields.responder;
    this.bump = fields.bump;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static schema: Schema = new Map([
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

  static deserialize(data: Buffer): ResponseAccount {
    // discriminator(8) + responder(32) + bump(1) = 41 bytes
    if (data.length < 41) {
      throw new Error(`Invalid ResponseAccount data: expected >= 41 bytes, got ${data.length}`);
    }
    if (!matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.ResponseAccount)) {
      throw new Error('Invalid ResponseAccount discriminator');
    }
    const accountData = data.slice(8);
    return deserializeUnchecked(this.schema, ResponseAccount, accountData);
  }

  getResponderPublicKey(): PublicKey {
    return new PublicKey(this.responder);
  }
}

/**
 * Validation Request Account (Validation Registry) - v0.3.0
 * Seeds: ["validation", asset, validator_address, nonce]
 */
export class ValidationRequest {
  asset: Uint8Array; // Pubkey - agent asset
  validator_address: Uint8Array; // Pubkey
  nonce: number; // u32
  request_hash: Uint8Array; // [u8; 32]
  response: number; // u8 (0-100, 0 = pending)
  responded_at: bigint; // i64 - timestamp of last response (0 if no response yet)

  constructor(fields: {
    asset: Uint8Array;
    validator_address: Uint8Array;
    nonce: number;
    request_hash: Uint8Array;
    response: number;
    responded_at: bigint;
  }) {
    this.asset = fields.asset;
    this.validator_address = fields.validator_address;
    this.nonce = fields.nonce;
    this.request_hash = fields.request_hash;
    this.response = fields.response;
    this.responded_at = fields.responded_at;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static schema: Schema = new Map([
    [
      ValidationRequest,
      {
        kind: 'struct',
        fields: [
          ['asset', [32]],
          ['validator_address', [32]],
          ['nonce', 'u32'],
          ['request_hash', [32]],
          ['response', 'u8'],
          ['responded_at', 'u64'], // i64 on-chain, but borsh JS uses u64 for timestamps
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): ValidationRequest {
    // discriminator(8) + asset(32) + validator(32) + nonce(4) + request_hash(32) + response(1) + responded_at(8) = 117 bytes
    if (data.length < 117) {
      throw new Error(`Invalid ValidationRequest data: expected >= 117 bytes, got ${data.length}`);
    }
    if (!matchesDiscriminator(data, ACCOUNT_DISCRIMINATORS.ValidationRequest)) {
      throw new Error('Invalid ValidationRequest discriminator');
    }
    const accountData = data.slice(8);
    const raw = deserializeUnchecked(this.schema, ValidationRequest, accountData) as unknown as RawValidationRequest;
    return new ValidationRequest({
      asset: raw.asset,
      validator_address: raw.validator_address,
      nonce: raw.nonce,
      request_hash: raw.request_hash,
      response: raw.response,
      responded_at: raw.responded_at,
    });
  }

  getAssetPublicKey(): PublicKey {
    return new PublicKey(this.asset);
  }

  getValidatorPublicKey(): PublicKey {
    return new PublicKey(this.validator_address);
  }

  hasResponse(): boolean {
    return this.responded_at > 0n;
  }

  isPending(): boolean {
    return this.responded_at === 0n;
  }

  /**
   * Get last update timestamp (alias for responded_at)
   */
  getLastUpdate(): bigint {
    return this.responded_at;
  }
}
