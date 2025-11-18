/**
 * Borsh schemas for deserializing Solana account data
 * Based on ERC-8004 Solana program account structures
 */

import { Schema, deserialize } from 'borsh';
import { PublicKey } from '@solana/web3.js';

/**
 * Agent Account (Identity Registry) - 297 bytes
 * Represents an agent NFT with metadata
 */
export class AgentAccount {
  agent_id: bigint;
  owner: Uint8Array;
  agent_mint: Uint8Array;
  token_uri: string;
  created_at: bigint;
  status: number;
  bump: number;

  constructor(fields: {
    agent_id: bigint;
    owner: Uint8Array;
    agent_mint: Uint8Array;
    token_uri: string;
    created_at: bigint;
    status: number;
    bump: number;
  }) {
    this.agent_id = fields.agent_id;
    this.owner = fields.owner;
    this.agent_mint = fields.agent_mint;
    this.token_uri = fields.token_uri;
    this.created_at = fields.created_at;
    this.status = fields.status;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map([
    [
      AgentAccount,
      {
        kind: 'struct',
        fields: [
          ['agent_id', 'u64'],
          ['owner', [32]],
          ['agent_mint', [32]],
          ['token_uri', 'string'],
          ['created_at', 'i64'],
          ['status', 'u8'],
          ['bump', 'u8'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): AgentAccount {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserialize(this.schema, AgentAccount, accountData);
  }

  getOwnerPublicKey(): PublicKey {
    return new PublicKey(this.owner);
  }

  getMintPublicKey(): PublicKey {
    return new PublicKey(this.agent_mint);
  }
}

/**
 * Feedback Account (Reputation Registry) - 526 bytes
 * Represents feedback given by a client to an agent
 */
export class FeedbackAccount {
  agent_id: bigint;
  client: Uint8Array;
  feedback_index: bigint;
  score: number;
  performance_tags: Uint8Array;
  functionality_tags: Uint8Array;
  file_uri: string;
  file_hash: Uint8Array;
  revoked: boolean;
  created_at: bigint;
  bump: number;

  constructor(fields: {
    agent_id: bigint;
    client: Uint8Array;
    feedback_index: bigint;
    score: number;
    performance_tags: Uint8Array;
    functionality_tags: Uint8Array;
    file_uri: string;
    file_hash: Uint8Array;
    revoked: boolean;
    created_at: bigint;
    bump: number;
  }) {
    this.agent_id = fields.agent_id;
    this.client = fields.client;
    this.feedback_index = fields.feedback_index;
    this.score = fields.score;
    this.performance_tags = fields.performance_tags;
    this.functionality_tags = fields.functionality_tags;
    this.file_uri = fields.file_uri;
    this.file_hash = fields.file_hash;
    this.revoked = fields.revoked;
    this.created_at = fields.created_at;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map([
    [
      FeedbackAccount,
      {
        kind: 'struct',
        fields: [
          ['agent_id', 'u64'],
          ['client', [32]],
          ['feedback_index', 'u64'],
          ['score', 'u8'],
          ['performance_tags', [32]],
          ['functionality_tags', [32]],
          ['file_uri', 'string'],
          ['file_hash', [32]],
          ['revoked', 'u8'],
          ['created_at', 'i64'],
          ['bump', 'u8'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): FeedbackAccount {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    const deserialized = deserialize(this.schema, FeedbackAccount, accountData);
    // Convert u8 to boolean
    deserialized.revoked = deserialized.revoked === 1;
    return deserialized;
  }

  getClientPublicKey(): PublicKey {
    return new PublicKey(this.client);
  }
}

/**
 * Agent Reputation Account (Reputation Registry) - Cached aggregates
 * Stores pre-computed reputation metrics for O(1) queries
 */
export class AgentReputationAccount {
  agent_id: bigint;
  total_feedbacks: bigint;
  sum_scores: bigint;
  average_score: number;
  last_updated: bigint;
  bump: number;

  constructor(fields: {
    agent_id: bigint;
    total_feedbacks: bigint;
    sum_scores: bigint;
    average_score: number;
    last_updated: bigint;
    bump: number;
  }) {
    this.agent_id = fields.agent_id;
    this.total_feedbacks = fields.total_feedbacks;
    this.sum_scores = fields.sum_scores;
    this.average_score = fields.average_score;
    this.last_updated = fields.last_updated;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map([
    [
      AgentReputationAccount,
      {
        kind: 'struct',
        fields: [
          ['agent_id', 'u64'],
          ['total_feedbacks', 'u64'],
          ['sum_scores', 'u64'],
          ['average_score', 'u8'],
          ['last_updated', 'i64'],
          ['bump', 'u8'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): AgentReputationAccount {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserialize(this.schema, AgentReputationAccount, accountData);
  }
}

/**
 * Client Index Account (Reputation Registry)
 * Tracks the last feedback index for a specific client
 */
export class ClientIndexAccount {
  agent_id: bigint;
  client: Uint8Array;
  last_feedback_index: bigint;
  bump: number;

  constructor(fields: {
    agent_id: bigint;
    client: Uint8Array;
    last_feedback_index: bigint;
    bump: number;
  }) {
    this.agent_id = fields.agent_id;
    this.client = fields.client;
    this.last_feedback_index = fields.last_feedback_index;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map([
    [
      ClientIndexAccount,
      {
        kind: 'struct',
        fields: [
          ['agent_id', 'u64'],
          ['client', [32]],
          ['last_feedback_index', 'u64'],
          ['bump', 'u8'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): ClientIndexAccount {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserialize(this.schema, ClientIndexAccount, accountData);
  }

  getClientPublicKey(): PublicKey {
    return new PublicKey(this.client);
  }
}

/**
 * Response Index Account (Reputation Registry)
 * Tracks the number of responses for a specific feedback
 */
export class ResponseIndexAccount {
  agent_id: bigint;
  client: Uint8Array;
  feedback_index: bigint;
  response_count: bigint;
  bump: number;

  constructor(fields: {
    agent_id: bigint;
    client: Uint8Array;
    feedback_index: bigint;
    response_count: bigint;
    bump: number;
  }) {
    this.agent_id = fields.agent_id;
    this.client = fields.client;
    this.feedback_index = fields.feedback_index;
    this.response_count = fields.response_count;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map([
    [
      ResponseIndexAccount,
      {
        kind: 'struct',
        fields: [
          ['agent_id', 'u64'],
          ['client', [32]],
          ['feedback_index', 'u64'],
          ['response_count', 'u64'],
          ['bump', 'u8'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): ResponseIndexAccount {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserialize(this.schema, ResponseIndexAccount, accountData);
  }
}

/**
 * Response Account (Reputation Registry) - 322 bytes
 * Represents a response to feedback (from agent, aggregator, or community)
 */
export class ResponseAccount {
  agent_id: bigint;
  client: Uint8Array;
  feedback_index: bigint;
  response_index: bigint;
  responder: Uint8Array;
  response_uri: string;
  response_hash: Uint8Array;
  created_at: bigint;
  bump: number;

  constructor(fields: {
    agent_id: bigint;
    client: Uint8Array;
    feedback_index: bigint;
    response_index: bigint;
    responder: Uint8Array;
    response_uri: string;
    response_hash: Uint8Array;
    created_at: bigint;
    bump: number;
  }) {
    this.agent_id = fields.agent_id;
    this.client = fields.client;
    this.feedback_index = fields.feedback_index;
    this.response_index = fields.response_index;
    this.responder = fields.responder;
    this.response_uri = fields.response_uri;
    this.response_hash = fields.response_hash;
    this.created_at = fields.created_at;
    this.bump = fields.bump;
  }

  static schema: Schema = new Map([
    [
      ResponseAccount,
      {
        kind: 'struct',
        fields: [
          ['agent_id', 'u64'],
          ['client', [32]],
          ['feedback_index', 'u64'],
          ['response_index', 'u64'],
          ['responder', [32]],
          ['response_uri', 'string'],
          ['response_hash', [32]],
          ['created_at', 'i64'],
          ['bump', 'u8'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): ResponseAccount {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserialize(this.schema, ResponseAccount, accountData);
  }

  getResponderPublicKey(): PublicKey {
    return new PublicKey(this.responder);
  }
}

/**
 * Metadata Entry Account (Identity Registry) - 307 bytes
 * Stores key-value metadata for an agent
 */
export class MetadataEntry {
  agent_id: bigint;
  key: Uint8Array;
  value: string;
  bump: number;
  created_at: bigint;

  constructor(fields: {
    agent_id: bigint;
    key: Uint8Array;
    value: string;
    bump: number;
    created_at: bigint;
  }) {
    this.agent_id = fields.agent_id;
    this.key = fields.key;
    this.value = fields.value;
    this.bump = fields.bump;
    this.created_at = fields.created_at;
  }

  static schema: Schema = new Map([
    [
      MetadataEntry,
      {
        kind: 'struct',
        fields: [
          ['agent_id', 'u64'],
          ['key', [32]],
          ['value', 'string'],
          ['bump', 'u8'],
          ['created_at', 'i64'],
        ],
      },
    ],
  ]);

  static deserialize(data: Buffer): MetadataEntry {
    // Skip 8-byte Anchor discriminator
    const accountData = data.slice(8);
    return deserialize(this.schema, MetadataEntry, accountData);
  }

  getKeyString(): string {
    // Convert bytes32 key to string (null-terminated)
    const nullIndex = this.key.indexOf(0);
    const keyBytes = nullIndex >= 0 ? this.key.slice(0, nullIndex) : this.key;
    return Buffer.from(keyBytes).toString('utf8');
  }
}
