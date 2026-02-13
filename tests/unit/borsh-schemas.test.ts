import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';

jest.unstable_mockModule('../../src/utils/constants.js', () => ({
  LIMITS: {
    MAX_URI_LENGTH: 250,
    MAX_NFT_NAME_LENGTH: 32,
    MAX_METADATA_KEY_LENGTH: 32,
    MAX_METADATA_VALUE_LENGTH: 250,
    MAX_TAG_LENGTH: 32,
  },
}));

const { ACCOUNT_DISCRIMINATORS, matchesDiscriminator } = await import(
  '../../src/core/instruction-discriminators.js'
);
const {
  RootConfig,
  RegistryConfig,
  AgentAccount,
  MetadataEntryPda,
  MetadataEntry,
  FeedbackAccount,
  FeedbackTagsPda,
  AgentReputationMetadata,
  AgentReputationAccount,
  ResponseIndexAccount,
  ResponseAccount,
  ValidationRequest,
} = await import('../../src/core/borsh-schemas.js');

// Helper: build a buffer with a given discriminator + payload
function buildAccountBuffer(discriminator: Buffer, payload: Buffer): Buffer {
  return Buffer.concat([discriminator, payload]);
}

// Helper: build a 32-byte pubkey-like array
function pubkeyBytes(seed = 0): Uint8Array {
  const buf = Buffer.alloc(32, seed);
  return buf;
}

// Helper: borsh-encode a string (u32 LE length prefix + UTF-8 bytes)
function borshString(s: string): Buffer {
  const strBuf = Buffer.from(s, 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(strBuf.length);
  return Buffer.concat([lenBuf, strBuf]);
}

// Helper: borsh-encode a vec<u8> (u32 LE length prefix + bytes)
function borshVec(data: Buffer): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(data.length);
  return Buffer.concat([lenBuf, data]);
}

describe('MetadataEntry', () => {
  it('should construct and return fields', () => {
    const entry = new MetadataEntry({
      metadata_key: 'version',
      metadata_value: Buffer.from('1.0.0'),
    });
    expect(entry.metadata_key).toBe('version');
    expect(entry.key).toBe('version');
    expect(entry.value).toEqual(Buffer.from('1.0.0'));
    expect(entry.getValueString()).toBe('1.0.0');
  });
});

describe('RootConfig', () => {
  function buildRootConfigPayload(baseCollection: Uint8Array, authority: Uint8Array, bump: number): Buffer {
    return Buffer.concat([
      Buffer.from(baseCollection),
      Buffer.from(authority),
      Buffer.from([bump]),
    ]);
  }

  it('should deserialize valid data', () => {
    const bc = pubkeyBytes(1);
    const auth = pubkeyBytes(2);
    const payload = buildRootConfigPayload(bc, auth, 254);
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.RootConfig, payload);

    const config = RootConfig.deserialize(data);
    expect(config.bump).toBe(254);
    expect(config.getBaseCollectionPublicKey()).toEqual(new PublicKey(bc));
    expect(config.getAuthorityPublicKey()).toEqual(new PublicKey(auth));
    expect(config.getBaseRegistryPublicKey()).toEqual(new PublicKey(bc));
  });

  it('should reject data too short', () => {
    expect(() => RootConfig.deserialize(Buffer.alloc(72))).toThrow('expected >= 73');
  });

  it('should reject wrong discriminator', () => {
    const data = Buffer.alloc(73);
    expect(() => RootConfig.deserialize(data)).toThrow('Invalid RootConfig discriminator');
  });

  it('should construct with fields', () => {
    const config = new RootConfig({
      base_collection: pubkeyBytes(1),
      authority: pubkeyBytes(2),
      bump: 255,
    });
    expect(config.bump).toBe(255);
  });
});

describe('RegistryConfig', () => {
  function buildRegistryConfigPayload(collection: Uint8Array, authority: Uint8Array, bump: number): Buffer {
    return Buffer.concat([
      Buffer.from(collection),
      Buffer.from(authority),
      Buffer.from([bump]),
    ]);
  }

  it('should deserialize valid data', () => {
    const coll = pubkeyBytes(3);
    const auth = pubkeyBytes(4);
    const payload = buildRegistryConfigPayload(coll, auth, 253);
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.RegistryConfig, payload);

    const config = RegistryConfig.deserialize(data);
    expect(config.bump).toBe(253);
    expect(config.getCollectionPublicKey()).toEqual(new PublicKey(coll));
    expect(config.getAuthorityPublicKey()).toEqual(new PublicKey(auth));
  });

  it('should reject data too short', () => {
    expect(() => RegistryConfig.deserialize(Buffer.alloc(72))).toThrow('expected >= 73');
  });

  it('should reject wrong discriminator', () => {
    const data = Buffer.alloc(73);
    expect(() => RegistryConfig.deserialize(data)).toThrow('Invalid RegistryConfig discriminator');
  });
});

describe('AgentAccount', () => {
  function buildAgentPayload(opts: {
    collection?: Uint8Array;
    owner?: Uint8Array;
    asset?: Uint8Array;
    bump?: number;
    atomEnabled?: number;
    agentWallet?: Uint8Array | null;
    feedbackDigest?: Uint8Array;
    feedbackCount?: bigint;
    responseDigest?: Uint8Array;
    responseCount?: bigint;
    revokeDigest?: Uint8Array;
    revokeCount?: bigint;
    agentUri?: string;
    nftName?: string;
  }): Buffer {
    const parts: Buffer[] = [
      Buffer.from(opts.collection ?? pubkeyBytes(1)),
      Buffer.from(opts.owner ?? pubkeyBytes(2)),
      Buffer.from(opts.asset ?? pubkeyBytes(3)),
      Buffer.from([opts.bump ?? 255]),
      Buffer.from([opts.atomEnabled ?? 0]),
    ];

    // Option<Pubkey>
    if (opts.agentWallet) {
      parts.push(Buffer.from([1])); // Some
      parts.push(Buffer.from(opts.agentWallet));
    } else {
      parts.push(Buffer.from([0])); // None
    }

    // hash-chain fields
    parts.push(Buffer.from(opts.feedbackDigest ?? Buffer.alloc(32)));
    const fcBuf = Buffer.alloc(8);
    fcBuf.writeBigUInt64LE(opts.feedbackCount ?? 0n);
    parts.push(fcBuf);

    parts.push(Buffer.from(opts.responseDigest ?? Buffer.alloc(32)));
    const rcBuf = Buffer.alloc(8);
    rcBuf.writeBigUInt64LE(opts.responseCount ?? 0n);
    parts.push(rcBuf);

    parts.push(Buffer.from(opts.revokeDigest ?? Buffer.alloc(32)));
    const rvBuf = Buffer.alloc(8);
    rvBuf.writeBigUInt64LE(opts.revokeCount ?? 0n);
    parts.push(rvBuf);

    // Strings
    parts.push(borshString(opts.agentUri ?? 'https://example.com'));
    parts.push(borshString(opts.nftName ?? 'TestAgent'));

    return Buffer.concat(parts);
  }

  it('should deserialize valid data without wallet', () => {
    const payload = buildAgentPayload({});
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AgentAccount, payload);
    const agent = AgentAccount.deserialize(data);

    expect(agent.bump).toBe(255);
    expect(agent.isAtomEnabled()).toBe(false);
    expect(agent.getAgentWalletPublicKey()).toBeNull();
    expect(agent.hasAgentWallet()).toBe(false);
    expect(agent.agent_uri).toBe('https://example.com');
    expect(agent.token_uri).toBe('https://example.com');
    expect(agent.nft_name).toBe('TestAgent');
    expect(agent.metadata).toEqual([]);
    expect(agent.getCollectionPublicKey()).toEqual(new PublicKey(pubkeyBytes(1)));
    expect(agent.getOwnerPublicKey()).toEqual(new PublicKey(pubkeyBytes(2)));
    expect(agent.getAssetPublicKey()).toEqual(new PublicKey(pubkeyBytes(3)));
  });

  it('should deserialize valid data with wallet', () => {
    const wallet = pubkeyBytes(99);
    const payload = buildAgentPayload({ agentWallet: wallet, atomEnabled: 1 });
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AgentAccount, payload);
    const agent = AgentAccount.deserialize(data);

    expect(agent.isAtomEnabled()).toBe(true);
    expect(agent.hasAgentWallet()).toBe(true);
    expect(agent.getAgentWalletPublicKey()).toEqual(new PublicKey(wallet));
  });

  it('should deserialize with hash-chain data', () => {
    const digest = Buffer.alloc(32, 0xab);
    const payload = buildAgentPayload({
      feedbackDigest: digest,
      feedbackCount: 42n,
      responseCount: 10n,
      revokeCount: 3n,
    });
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AgentAccount, payload);
    const agent = AgentAccount.deserialize(data);

    expect(agent.feedback_count.toString()).toBe('42');
    expect(agent.response_count.toString()).toBe('10');
    expect(agent.revoke_count.toString()).toBe('3');
    expect(Buffer.from(agent.feedback_digest).toString('hex')).toBe(digest.toString('hex'));
  });

  it('should reject data too short', () => {
    expect(() => AgentAccount.deserialize(Buffer.alloc(226))).toThrow('expected >= 227');
  });

  it('should reject wrong discriminator', () => {
    const data = Buffer.alloc(300);
    expect(() => AgentAccount.deserialize(data)).toThrow('Invalid AgentAccount discriminator');
  });

  it('should reject oversized agent_uri via pre-validation', () => {
    const longUri = 'x'.repeat(300);
    const payload = buildAgentPayload({ agentUri: longUri });
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AgentAccount, payload);
    expect(() => AgentAccount.deserialize(data)).toThrow('agent_uri');
  });

  it('should reject oversized nft_name via pre-validation', () => {
    const longName = 'x'.repeat(100);
    const payload = buildAgentPayload({ nftName: longName });
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AgentAccount, payload);
    expect(() => AgentAccount.deserialize(data)).toThrow('nft_name');
  });

  it('should reject invalid Option tag', () => {
    const payload = buildAgentPayload({});
    // Corrupt the option tag (at offset 98 in account data = after collection+owner+asset+bump+atom_enabled)
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AgentAccount, payload);
    // discriminator(8) + collection(32) + owner(32) + asset(32) + bump(1) + atom_enabled(1) = 106
    data[106] = 2; // invalid option tag
    expect(() => AgentAccount.deserialize(data)).toThrow('Invalid Option tag');
  });

  it('should handle getAgentWalletPublicKey with undefined wallet', () => {
    const agent = new AgentAccount({
      collection: pubkeyBytes(1),
      owner: pubkeyBytes(2),
      asset: pubkeyBytes(3),
      bump: 255,
      atom_enabled: 0,
      agent_wallet: null,
      feedback_digest: Buffer.alloc(32),
      feedback_count: 0n,
      response_digest: Buffer.alloc(32),
      response_count: 0n,
      revoke_digest: Buffer.alloc(32),
      revoke_count: 0n,
      agent_uri: '',
      nft_name: '',
    });
    // Force undefined to test defensive check
    (agent as any).agent_wallet = undefined;
    expect(agent.getAgentWalletPublicKey()).toBeNull();
  });
});

describe('MetadataEntryPda', () => {
  function buildMetadataEntryPayload(
    asset: Uint8Array,
    immutable: number,
    bump: number,
    key: string,
    value: Buffer
  ): Buffer {
    return Buffer.concat([
      Buffer.from(asset),
      Buffer.from([immutable]),
      Buffer.from([bump]),
      borshString(key),
      borshVec(value),
    ]);
  }

  it('should deserialize valid data (immutable)', () => {
    const asset = pubkeyBytes(5);
    const payload = buildMetadataEntryPayload(asset, 1, 254, 'version', Buffer.from('2.0'));
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.MetadataEntryPda, payload);

    const entry = MetadataEntryPda.deserialize(data);
    expect(entry.getAssetPublicKey()).toEqual(new PublicKey(asset));
    expect(entry.isImmutable).toBe(true);
    expect(entry.immutable).toBe(true);
    expect(entry.bump).toBe(254);
    expect(entry.key).toBe('version');
    expect(entry.value).toBe('2.0');
    expect(entry.getValueString()).toBe('2.0');
  });

  it('should deserialize mutable entry', () => {
    const payload = buildMetadataEntryPayload(pubkeyBytes(1), 0, 250, 'status', Buffer.from('active'));
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.MetadataEntryPda, payload);

    const entry = MetadataEntryPda.deserialize(data);
    expect(entry.isImmutable).toBe(false);
  });

  it('should treat non-zero immutable as true', () => {
    const payload = buildMetadataEntryPayload(pubkeyBytes(1), 5, 250, 'key', Buffer.from('val'));
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.MetadataEntryPda, payload);

    const entry = MetadataEntryPda.deserialize(data);
    expect(entry.isImmutable).toBe(true);
  });

  it('should reject data too short', () => {
    expect(() => MetadataEntryPda.deserialize(Buffer.alloc(41))).toThrow('expected >= 42');
  });

  it('should reject wrong discriminator', () => {
    const data = Buffer.alloc(100);
    expect(() => MetadataEntryPda.deserialize(data)).toThrow('Invalid MetadataEntryPda discriminator');
  });

  it('should reject oversized metadata_key', () => {
    const longKey = 'x'.repeat(100);
    const payload = buildMetadataEntryPayload(pubkeyBytes(1), 0, 250, longKey, Buffer.from('val'));
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.MetadataEntryPda, payload);
    expect(() => MetadataEntryPda.deserialize(data)).toThrow('metadata_key');
  });

  it('should reject oversized metadata_value', () => {
    const longValue = Buffer.alloc(300, 0xff);
    const payload = buildMetadataEntryPayload(pubkeyBytes(1), 0, 250, 'key', longValue);
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.MetadataEntryPda, payload);
    expect(() => MetadataEntryPda.deserialize(data)).toThrow('metadata_value');
  });

  it('should reject truncated buffer for metadata_key length', () => {
    // Build a buffer that's too short to read the metadata_key length prefix
    const payload = Buffer.concat([
      Buffer.from(pubkeyBytes(1)),
      Buffer.from([0, 250]),
      Buffer.alloc(2), // only 2 bytes instead of 4 for the length prefix
    ]);
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.MetadataEntryPda, payload);
    expect(() => MetadataEntryPda.deserialize(data)).toThrow('Security');
  });
});

describe('FeedbackAccount', () => {
  function buildFeedbackPayload(
    asset: Uint8Array,
    client: Uint8Array,
    feedbackIndex: bigint,
    score: number,
    isRevoked: number,
    bump: number
  ): Buffer {
    const indexBuf = Buffer.alloc(8);
    indexBuf.writeBigUInt64LE(feedbackIndex);
    return Buffer.concat([
      Buffer.from(asset),
      Buffer.from(client),
      indexBuf,
      Buffer.from([score, isRevoked, bump]),
    ]);
  }

  it('should deserialize valid data', () => {
    const asset = pubkeyBytes(10);
    const client = pubkeyBytes(20);
    const payload = buildFeedbackPayload(asset, client, 5n, 85, 0, 253);
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.FeedbackAccount, payload);

    const fb = FeedbackAccount.deserialize(data);
    expect(fb.getAssetPublicKey()).toEqual(new PublicKey(asset));
    expect(fb.getClientPublicKey()).toEqual(new PublicKey(client));
    expect(fb.feedback_index.toString()).toBe('5');
    expect(fb.score).toBe(85);
    expect(fb.is_revoked).toBe(false);
    expect(fb.revoked).toBe(false);
    expect(fb.bump).toBe(253);
  });

  it('should treat non-zero is_revoked as true', () => {
    const payload = buildFeedbackPayload(pubkeyBytes(1), pubkeyBytes(2), 0n, 50, 3, 255);
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.FeedbackAccount, payload);
    const fb = FeedbackAccount.deserialize(data);
    expect(fb.is_revoked).toBe(true);
    expect(fb.revoked).toBe(true);
  });

  it('should reject data too short', () => {
    expect(() => FeedbackAccount.deserialize(Buffer.alloc(82))).toThrow('expected >= 83');
  });

  it('should reject wrong discriminator', () => {
    const data = Buffer.alloc(83);
    expect(() => FeedbackAccount.deserialize(data)).toThrow('Invalid FeedbackAccount discriminator');
  });
});

describe('FeedbackTagsPda', () => {
  function buildTagsPayload(bump: number, tag1: string, tag2: string): Buffer {
    return Buffer.concat([
      Buffer.from([bump]),
      borshString(tag1),
      borshString(tag2),
    ]);
  }

  it('should deserialize valid data', () => {
    const payload = buildTagsPayload(252, 'quality', 'speed');
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.FeedbackTagsPda, payload);
    const tags = FeedbackTagsPda.deserialize(data);
    expect(tags.bump).toBe(252);
    expect(tags.tag1).toBe('quality');
    expect(tags.tag2).toBe('speed');
  });

  it('should handle empty tags', () => {
    const payload = buildTagsPayload(251, '', '');
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.FeedbackTagsPda, payload);
    const tags = FeedbackTagsPda.deserialize(data);
    expect(tags.tag1).toBe('');
    expect(tags.tag2).toBe('');
  });

  it('should reject data too short', () => {
    expect(() => FeedbackTagsPda.deserialize(Buffer.alloc(8))).toThrow('expected >= 9');
  });

  it('should reject wrong discriminator', () => {
    const data = Buffer.alloc(50);
    expect(() => FeedbackTagsPda.deserialize(data)).toThrow('Invalid FeedbackTagsPda discriminator');
  });

  it('should reject oversized tag1', () => {
    const payload = buildTagsPayload(251, 'x'.repeat(100), 'ok');
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.FeedbackTagsPda, payload);
    expect(() => FeedbackTagsPda.deserialize(data)).toThrow('tag1');
  });

  it('should reject oversized tag2', () => {
    const payload = buildTagsPayload(251, 'ok', 'x'.repeat(100));
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.FeedbackTagsPda, payload);
    expect(() => FeedbackTagsPda.deserialize(data)).toThrow('tag2');
  });
});

describe('AgentReputationMetadata', () => {
  function buildReputationPayload(nextIndex: bigint, bump: number): Buffer {
    const indexBuf = Buffer.alloc(8);
    indexBuf.writeBigUInt64LE(nextIndex);
    return Buffer.concat([indexBuf, Buffer.from([bump])]);
  }

  it('should deserialize valid data', () => {
    const payload = buildReputationPayload(100n, 248);
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.AgentReputationMetadata, payload);
    const rep = AgentReputationMetadata.deserialize(data);
    expect(rep.next_feedback_index.toString()).toBe('100');
    expect(rep.bump).toBe(248);
  });

  it('should reject data too short', () => {
    expect(() => AgentReputationMetadata.deserialize(Buffer.alloc(16))).toThrow('expected >= 17');
  });

  it('should reject wrong discriminator', () => {
    const data = Buffer.alloc(17);
    expect(() => AgentReputationMetadata.deserialize(data)).toThrow('Invalid AgentReputationMetadata discriminator');
  });

  it('should export alias AgentReputationAccount', () => {
    expect(AgentReputationAccount).toBe(AgentReputationMetadata);
  });
});

describe('ResponseIndexAccount', () => {
  function buildResponseIndexPayload(nextIndex: bigint, bump: number): Buffer {
    const indexBuf = Buffer.alloc(8);
    indexBuf.writeBigUInt64LE(nextIndex);
    return Buffer.concat([indexBuf, Buffer.from([bump])]);
  }

  it('should deserialize valid data', () => {
    const payload = buildResponseIndexPayload(7n, 247);
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.ResponseIndexAccount, payload);
    const ri = ResponseIndexAccount.deserialize(data);
    expect(ri.next_index.toString()).toBe('7');
    expect(ri.response_count.toString()).toBe('7');
    expect(ri.bump).toBe(247);
  });

  it('should reject data too short', () => {
    expect(() => ResponseIndexAccount.deserialize(Buffer.alloc(16))).toThrow('expected >= 17');
  });

  it('should reject wrong discriminator', () => {
    const data = Buffer.alloc(17);
    expect(() => ResponseIndexAccount.deserialize(data)).toThrow('Invalid ResponseIndexAccount discriminator');
  });
});

describe('ResponseAccount', () => {
  function buildResponsePayload(responder: Uint8Array, bump: number): Buffer {
    return Buffer.concat([Buffer.from(responder), Buffer.from([bump])]);
  }

  it('should deserialize valid data', () => {
    const responder = pubkeyBytes(30);
    const payload = buildResponsePayload(responder, 246);
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.ResponseAccount, payload);
    const resp = ResponseAccount.deserialize(data);
    expect(resp.getResponderPublicKey()).toEqual(new PublicKey(responder));
    expect(resp.bump).toBe(246);
  });

  it('should reject data too short', () => {
    expect(() => ResponseAccount.deserialize(Buffer.alloc(40))).toThrow('expected >= 41');
  });

  it('should reject wrong discriminator', () => {
    const data = Buffer.alloc(41);
    expect(() => ResponseAccount.deserialize(data)).toThrow('Invalid ResponseAccount discriminator');
  });
});

describe('ValidationRequest', () => {
  function buildValidationPayload(
    asset: Uint8Array,
    validator: Uint8Array,
    nonce: number,
    requestHash: Uint8Array,
    response: number,
    respondedAt: bigint
  ): Buffer {
    const nonceBuf = Buffer.alloc(4);
    nonceBuf.writeUInt32LE(nonce);
    const raBuf = Buffer.alloc(8);
    raBuf.writeBigUInt64LE(respondedAt);
    return Buffer.concat([
      Buffer.from(asset),
      Buffer.from(validator),
      nonceBuf,
      Buffer.from(requestHash),
      Buffer.from([response]),
      raBuf,
    ]);
  }

  it('should deserialize valid data (pending)', () => {
    const asset = pubkeyBytes(40);
    const validator = pubkeyBytes(50);
    const hash = Buffer.alloc(32, 0xcc);
    const payload = buildValidationPayload(asset, validator, 42, hash, 0, 0n);
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.ValidationRequest, payload);

    const vr = ValidationRequest.deserialize(data);
    expect(vr.getAssetPublicKey()).toEqual(new PublicKey(asset));
    expect(vr.getValidatorPublicKey()).toEqual(new PublicKey(validator));
    expect(vr.nonce).toBe(42);
    expect(vr.response).toBe(0);
    expect(vr.responded_at.toString()).toBe('0');
    expect(vr.getLastUpdate().toString()).toBe('0');
  });

  it('should deserialize responded validation', () => {
    const payload = buildValidationPayload(pubkeyBytes(1), pubkeyBytes(2), 1, Buffer.alloc(32), 85, 1234567890n);
    const data = buildAccountBuffer(ACCOUNT_DISCRIMINATORS.ValidationRequest, payload);
    const vr = ValidationRequest.deserialize(data);
    expect(vr.response).toBe(85);
    expect(vr.responded_at.toString()).toBe('1234567890');
    expect(vr.getLastUpdate().toString()).toBe('1234567890');
  });

  it('should reject data too short', () => {
    expect(() => ValidationRequest.deserialize(Buffer.alloc(116))).toThrow('expected >= 117');
  });

  it('should reject wrong discriminator', () => {
    const data = Buffer.alloc(117);
    expect(() => ValidationRequest.deserialize(data)).toThrow('Invalid ValidationRequest discriminator');
  });
});
