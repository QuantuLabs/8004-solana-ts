/**
 * Comprehensive tests for src/core/instruction-builder.ts
 * Tests IdentityInstructionBuilder, ReputationInstructionBuilder,
 * ValidationInstructionBuilder, AtomInstructionBuilder
 */

import { describe, it, expect } from '@jest/globals';
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from '@solana/web3.js';
import {
  IdentityInstructionBuilder,
  ReputationInstructionBuilder,
  ValidationInstructionBuilder,
  AtomInstructionBuilder,
} from '../../src/core/instruction-builder.js';
import { PROGRAM_ID, MPL_CORE_PROGRAM_ID, ATOM_ENGINE_PROGRAM_ID } from '../../src/core/programs.js';

const pk = () => PublicKey.unique();

describe('IdentityInstructionBuilder', () => {
  const builder = new IdentityInstructionBuilder();

  describe('buildRegister', () => {
    it('should create register instruction with correct accounts', () => {
      const rootConfig = pk();
      const registryConfig = pk();
      const agentAccount = pk();
      const asset = pk();
      const collection = pk();
      const owner = pk();

      const ix = builder.buildRegister(rootConfig, registryConfig, agentAccount, asset, collection, owner, 'ipfs://test');

      expect(ix.programId).toEqual(PROGRAM_ID);
      expect(ix.keys).toHaveLength(8);
      expect(ix.keys[0].pubkey).toEqual(rootConfig);
      expect(ix.keys[0].isWritable).toBe(false);
      expect(ix.keys[3].pubkey).toEqual(asset);
      expect(ix.keys[3].isSigner).toBe(true);
      expect(ix.keys[5].pubkey).toEqual(owner);
      expect(ix.keys[5].isSigner).toBe(true);
      expect(ix.keys[6].pubkey).toEqual(SystemProgram.programId);
      expect(ix.keys[7].pubkey).toEqual(MPL_CORE_PROGRAM_ID);
    });

    it('should serialize agentUri in data', () => {
      const ix = builder.buildRegister(pk(), pk(), pk(), pk(), pk(), pk(), 'test-uri');
      // Data starts with 8-byte discriminator, then serialized string (4-byte len + bytes)
      const uriLen = ix.data.readUInt32LE(8);
      expect(uriLen).toBe(8); // 'test-uri'.length
      const uri = ix.data.slice(12, 12 + uriLen).toString('utf8');
      expect(uri).toBe('test-uri');
    });

    it('should handle empty agentUri', () => {
      const ix = builder.buildRegister(pk(), pk(), pk(), pk(), pk(), pk(), '');
      const uriLen = ix.data.readUInt32LE(8);
      expect(uriLen).toBe(0);
    });

    it('should use default empty string for agentUri', () => {
      const ix = builder.buildRegister(pk(), pk(), pk(), pk(), pk(), pk());
      const uriLen = ix.data.readUInt32LE(8);
      expect(uriLen).toBe(0);
    });
  });

  describe('buildRegisterWithOptions', () => {
    it('should include atomEnabled flag in data', () => {
      const ix = builder.buildRegisterWithOptions(pk(), pk(), pk(), pk(), pk(), pk(), 'uri', true);
      // After discriminator (8) + serialized string, there's the atomEnabled byte
      const uriLen = ix.data.readUInt32LE(8);
      const atomEnabledByte = ix.data[12 + uriLen];
      expect(atomEnabledByte).toBe(1);
    });

    it('should set atomEnabled=false correctly', () => {
      const ix = builder.buildRegisterWithOptions(pk(), pk(), pk(), pk(), pk(), pk(), 'uri', false);
      const uriLen = ix.data.readUInt32LE(8);
      const atomEnabledByte = ix.data[12 + uriLen];
      expect(atomEnabledByte).toBe(0);
    });

    it('should have same account structure as register', () => {
      const ix = builder.buildRegisterWithOptions(pk(), pk(), pk(), pk(), pk(), pk(), 'uri', true);
      expect(ix.keys).toHaveLength(8);
      expect(ix.programId).toEqual(PROGRAM_ID);
    });
  });

  describe('buildEnableAtom', () => {
    it('should create instruction with 3 accounts', () => {
      const agentAccount = pk();
      const asset = pk();
      const owner = pk();

      const ix = builder.buildEnableAtom(agentAccount, asset, owner);
      expect(ix.keys).toHaveLength(3);
      expect(ix.keys[0].pubkey).toEqual(agentAccount);
      expect(ix.keys[0].isWritable).toBe(true);
      expect(ix.keys[1].pubkey).toEqual(asset);
      expect(ix.keys[2].pubkey).toEqual(owner);
      expect(ix.keys[2].isSigner).toBe(true);
    });

    it('should use discriminator-only data', () => {
      const ix = builder.buildEnableAtom(pk(), pk(), pk());
      expect(ix.data.length).toBe(8); // Only discriminator
    });
  });

  describe('buildSetAgentUri', () => {
    it('should create instruction with correct accounts', () => {
      const registryConfig = pk();
      const agentAccount = pk();
      const asset = pk();
      const collection = pk();
      const owner = pk();

      const ix = builder.buildSetAgentUri(registryConfig, agentAccount, asset, collection, owner, 'new-uri');
      expect(ix.keys).toHaveLength(7);
      expect(ix.keys[0].pubkey).toEqual(registryConfig);
      expect(ix.keys[4].pubkey).toEqual(owner);
      expect(ix.keys[4].isSigner).toBe(true);
    });

    it('should serialize new URI in data', () => {
      const ix = builder.buildSetAgentUri(pk(), pk(), pk(), pk(), pk(), 'https://example.com');
      const uriLen = ix.data.readUInt32LE(8);
      expect(uriLen).toBe('https://example.com'.length);
    });
  });

  describe('buildSetMetadata', () => {
    it('should create instruction with 5 accounts', () => {
      const keyHash = Buffer.alloc(16, 0xab);
      const ix = builder.buildSetMetadata(pk(), pk(), pk(), pk(), keyHash, 'key', 'value', false);
      expect(ix.keys).toHaveLength(5);
      expect(ix.keys[3].isSigner).toBe(true); // owner
      expect(ix.keys[4].pubkey).toEqual(SystemProgram.programId);
    });

    it('should serialize key hash, key, value, and immutable flag', () => {
      const keyHash = Buffer.alloc(16, 0xcd);
      const ix = builder.buildSetMetadata(pk(), pk(), pk(), pk(), keyHash, 'mykey', 'myvalue', true);
      // data: discriminator (8) + keyHash (16) + key (4+5) + value (4+7) + immutable (1)
      expect(ix.data.length).toBe(8 + 16 + 4 + 5 + 4 + 7 + 1);
      // Check immutable byte is 1
      expect(ix.data[ix.data.length - 1]).toBe(1);
    });

    it('should set immutable to false by default', () => {
      const keyHash = Buffer.alloc(16);
      const ix = builder.buildSetMetadata(pk(), pk(), pk(), pk(), keyHash, 'k', 'v');
      expect(ix.data[ix.data.length - 1]).toBe(0);
    });

    it('should truncate keyHash to 16 bytes', () => {
      const longKeyHash = Buffer.alloc(32, 0xff);
      const ix = builder.buildSetMetadata(pk(), pk(), pk(), pk(), longKeyHash, 'k', 'v');
      // After discriminator (8), first 16 bytes should be from keyHash
      const embedded = ix.data.slice(8, 24);
      expect(embedded).toEqual(Buffer.alloc(16, 0xff));
    });
  });

  describe('buildDeleteMetadata', () => {
    it('should create instruction with 4 accounts', () => {
      const keyHash = Buffer.alloc(16);
      const ix = builder.buildDeleteMetadata(pk(), pk(), pk(), pk(), keyHash);
      expect(ix.keys).toHaveLength(4);
      expect(ix.keys[3].isSigner).toBe(true); // owner
    });

    it('should include key hash in data', () => {
      const keyHash = Buffer.alloc(16, 0xab);
      const ix = builder.buildDeleteMetadata(pk(), pk(), pk(), pk(), keyHash);
      // data: discriminator (8) + keyHash (16)
      expect(ix.data.length).toBe(24);
    });
  });

  describe('buildTransferAgent', () => {
    it('should create instruction with 6 accounts', () => {
      const agentAccount = pk();
      const asset = pk();
      const collection = pk();
      const owner = pk();
      const newOwner = pk();

      const ix = builder.buildTransferAgent(agentAccount, asset, collection, owner, newOwner);
      expect(ix.keys).toHaveLength(6);
      expect(ix.keys[3].pubkey).toEqual(owner);
      expect(ix.keys[3].isSigner).toBe(true);
      expect(ix.keys[4].pubkey).toEqual(newOwner);
      expect(ix.keys[4].isSigner).toBe(false);
      expect(ix.keys[5].pubkey).toEqual(MPL_CORE_PROGRAM_ID);
    });

    it('should use discriminator-only data', () => {
      const ix = builder.buildTransferAgent(pk(), pk(), pk(), pk(), pk());
      expect(ix.data.length).toBe(8);
    });
  });

  describe('buildSyncOwner', () => {
    it('should create instruction with 2 accounts', () => {
      const agentAccount = pk();
      const asset = pk();
      const ix = builder.buildSyncOwner(agentAccount, asset);
      expect(ix.keys).toHaveLength(2);
      expect(ix.keys[0].pubkey).toEqual(agentAccount);
      expect(ix.keys[0].isWritable).toBe(true);
      expect(ix.keys[1].pubkey).toEqual(asset);
    });
  });

  describe('buildSetAgentWallet', () => {
    it('should create instruction with deadline and wallet', () => {
      const owner = pk();
      const agentAccount = pk();
      const asset = pk();
      const newWallet = pk();
      const deadline = 1700000000n;

      const ix = builder.buildSetAgentWallet(owner, agentAccount, asset, newWallet, deadline);
      expect(ix.keys).toHaveLength(4);
      expect(ix.keys[0].pubkey).toEqual(owner);
      expect(ix.keys[0].isSigner).toBe(true);
      expect(ix.keys[3].pubkey).toEqual(SYSVAR_INSTRUCTIONS_PUBKEY);
      // data: discriminator (8) + pubkey (32) + deadline (8) = 48
      expect(ix.data.length).toBe(48);
    });

    it('should reject negative deadline', () => {
      expect(() => builder.buildSetAgentWallet(pk(), pk(), pk(), pk(), -1n)).toThrow('non-negative');
    });

    it('should reject deadline exceeding i64 max', () => {
      const tooLarge = 9223372036854775808n; // i64::MAX + 1
      expect(() => builder.buildSetAgentWallet(pk(), pk(), pk(), pk(), tooLarge)).toThrow('i64 max');
    });

    it('should accept i64 max value', () => {
      const maxI64 = 9223372036854775807n;
      expect(() => builder.buildSetAgentWallet(pk(), pk(), pk(), pk(), maxI64)).not.toThrow();
    });

    it('should accept zero deadline', () => {
      expect(() => builder.buildSetAgentWallet(pk(), pk(), pk(), pk(), 0n)).not.toThrow();
    });
  });

  describe('deprecated methods', () => {
    it('buildCreateUserRegistry should throw', () => {
      expect(() => builder.buildCreateUserRegistry(pk(), pk(), pk(), pk(), 'name', 'uri')).toThrow('v0.6.0');
    });

    it('buildUpdateUserRegistryMetadata should throw', () => {
      expect(() => builder.buildUpdateUserRegistryMetadata(pk(), pk(), pk(), pk(), null, null)).toThrow('v0.6.0');
    });
  });
});

describe('ReputationInstructionBuilder', () => {
  const builder = new ReputationInstructionBuilder();

  describe('buildGiveFeedback', () => {
    const validArgs = () => ({
      client: pk(),
      agentAccount: pk(),
      asset: pk(),
      collection: pk(),
      value: 100n,
      valueDecimals: 0,
      score: 85 as number | null,
      feedbackFileHash: null as Buffer | null,
      feedbackIndex: 0n,
      tag1: 'quality',
      tag2: 'speed',
      endpoint: '/api/chat',
      feedbackUri: 'ipfs://Qm...',
    });

    it('should create instruction without ATOM accounts', () => {
      const args = validArgs();
      const ix = builder.buildGiveFeedback(
        args.client, args.agentAccount, args.asset, args.collection,
        null, null, null,
        args.value, args.valueDecimals, args.score, args.feedbackFileHash,
        args.feedbackIndex, args.tag1, args.tag2, args.endpoint, args.feedbackUri
      );

      expect(ix.programId).toEqual(PROGRAM_ID);
      expect(ix.keys).toHaveLength(5); // client, agent, asset, collection, system
      expect(ix.keys[0].isSigner).toBe(true);
      expect(ix.keys[1].isWritable).toBe(true);
    });

    it('should create instruction with ATOM accounts', () => {
      const args = validArgs();
      const atomConfig = pk();
      const atomStats = pk();
      const registryAuthority = pk();

      const ix = builder.buildGiveFeedback(
        args.client, args.agentAccount, args.asset, args.collection,
        atomConfig, atomStats, registryAuthority,
        args.value, args.valueDecimals, args.score, args.feedbackFileHash,
        args.feedbackIndex, args.tag1, args.tag2, args.endpoint, args.feedbackUri
      );

      expect(ix.keys).toHaveLength(9); // 5 base + 4 ATOM
      expect(ix.keys[5].pubkey).toEqual(atomConfig);
      expect(ix.keys[6].pubkey).toEqual(atomStats);
      expect(ix.keys[7].pubkey).toEqual(ATOM_ENGINE_PROGRAM_ID);
      expect(ix.keys[8].pubkey).toEqual(registryAuthority);
    });

    it('should reject non-bigint value', () => {
      const args = validArgs();
      expect(() => builder.buildGiveFeedback(
        args.client, args.agentAccount, args.asset, args.collection,
        null, null, null,
        42 as any, args.valueDecimals, args.score, args.feedbackFileHash,
        args.feedbackIndex, args.tag1, args.tag2, args.endpoint, args.feedbackUri
      )).toThrow('bigint');
    });

    it('should reject invalid valueDecimals', () => {
      const args = validArgs();
      expect(() => builder.buildGiveFeedback(
        args.client, args.agentAccount, args.asset, args.collection,
        null, null, null,
        args.value, 7, args.score, args.feedbackFileHash,
        args.feedbackIndex, args.tag1, args.tag2, args.endpoint, args.feedbackUri
      )).toThrow('valueDecimals');
    });

    it('should reject negative valueDecimals', () => {
      const args = validArgs();
      expect(() => builder.buildGiveFeedback(
        args.client, args.agentAccount, args.asset, args.collection,
        null, null, null,
        args.value, -1, args.score, args.feedbackFileHash,
        args.feedbackIndex, args.tag1, args.tag2, args.endpoint, args.feedbackUri
      )).toThrow('valueDecimals');
    });

    it('should reject score > 100', () => {
      const args = validArgs();
      expect(() => builder.buildGiveFeedback(
        args.client, args.agentAccount, args.asset, args.collection,
        null, null, null,
        args.value, args.valueDecimals, 101, args.feedbackFileHash,
        args.feedbackIndex, args.tag1, args.tag2, args.endpoint, args.feedbackUri
      )).toThrow('score');
    });

    it('should reject score < 0', () => {
      const args = validArgs();
      expect(() => builder.buildGiveFeedback(
        args.client, args.agentAccount, args.asset, args.collection,
        null, null, null,
        args.value, args.valueDecimals, -1, args.feedbackFileHash,
        args.feedbackIndex, args.tag1, args.tag2, args.endpoint, args.feedbackUri
      )).toThrow('score');
    });

    it('should accept null score', () => {
      const args = validArgs();
      const ix = builder.buildGiveFeedback(
        args.client, args.agentAccount, args.asset, args.collection,
        null, null, null,
        args.value, args.valueDecimals, null, args.feedbackFileHash,
        args.feedbackIndex, args.tag1, args.tag2, args.endpoint, args.feedbackUri
      );
      expect(ix).toBeDefined();
    });

    it('should reject wrong-size feedbackFileHash', () => {
      const args = validArgs();
      expect(() => builder.buildGiveFeedback(
        args.client, args.agentAccount, args.asset, args.collection,
        null, null, null,
        args.value, args.valueDecimals, args.score, Buffer.alloc(16),
        args.feedbackIndex, args.tag1, args.tag2, args.endpoint, args.feedbackUri
      )).toThrow('32 bytes');
    });

    it('should accept 32-byte feedbackFileHash', () => {
      const args = validArgs();
      const ix = builder.buildGiveFeedback(
        args.client, args.agentAccount, args.asset, args.collection,
        null, null, null,
        args.value, args.valueDecimals, args.score, Buffer.alloc(32, 0xab),
        args.feedbackIndex, args.tag1, args.tag2, args.endpoint, args.feedbackUri
      );
      expect(ix).toBeDefined();
    });

    it('should reject partial ATOM accounts', () => {
      const args = validArgs();
      expect(() => builder.buildGiveFeedback(
        args.client, args.agentAccount, args.asset, args.collection,
        pk(), null, null,
        args.value, args.valueDecimals, args.score, args.feedbackFileHash,
        args.feedbackIndex, args.tag1, args.tag2, args.endpoint, args.feedbackUri
      )).toThrow('ATOM accounts');
    });

    it('should reject value exceeding i64 range', () => {
      const args = validArgs();
      const tooLarge = 2n ** 63n;
      expect(() => builder.buildGiveFeedback(
        args.client, args.agentAccount, args.asset, args.collection,
        null, null, null,
        tooLarge, args.valueDecimals, args.score, args.feedbackFileHash,
        args.feedbackIndex, args.tag1, args.tag2, args.endpoint, args.feedbackUri
      )).toThrow('i64');
    });
  });

  describe('buildRevokeFeedback', () => {
    it('should create instruction without ATOM accounts', () => {
      const sealHash = Buffer.alloc(32, 0xab);
      const ix = builder.buildRevokeFeedback(pk(), pk(), pk(), null, null, null, 5n, sealHash);

      expect(ix.keys).toHaveLength(4); // client, agent, asset, system
      expect(ix.keys[0].isSigner).toBe(true);
    });

    it('should create instruction with ATOM accounts', () => {
      const sealHash = Buffer.alloc(32, 0xab);
      const ix = builder.buildRevokeFeedback(pk(), pk(), pk(), pk(), pk(), pk(), 5n, sealHash);

      expect(ix.keys).toHaveLength(8); // 4 base + 4 ATOM
    });

    it('should reject invalid sealHash', () => {
      expect(() => builder.buildRevokeFeedback(pk(), pk(), pk(), null, null, null, 5n, Buffer.alloc(16))).toThrow('32 bytes');
    });

    it('should reject null sealHash', () => {
      expect(() => builder.buildRevokeFeedback(pk(), pk(), pk(), null, null, null, 5n, null as any)).toThrow();
    });

    it('should reject partial ATOM accounts', () => {
      const sealHash = Buffer.alloc(32);
      expect(() => builder.buildRevokeFeedback(pk(), pk(), pk(), pk(), null, pk(), 5n, sealHash)).toThrow('ATOM accounts');
    });
  });

  describe('buildAppendResponse', () => {
    it('should create instruction with correct accounts', () => {
      const responseHash = Buffer.alloc(32, 0xab);
      const sealHash = Buffer.alloc(32, 0xcd);
      const responder = pk();
      const agentAccount = pk();
      const asset = pk();
      const client = pk();

      const ix = builder.buildAppendResponse(responder, agentAccount, asset, client, 0n, 'ipfs://response', responseHash, sealHash);

      expect(ix.keys).toHaveLength(3); // responder, agent, asset
      expect(ix.keys[0].pubkey).toEqual(responder);
      expect(ix.keys[0].isSigner).toBe(true);
      expect(ix.keys[1].isWritable).toBe(true);
    });

    it('should reject wrong-size responseHash', () => {
      const sealHash = Buffer.alloc(32);
      expect(() => builder.buildAppendResponse(pk(), pk(), pk(), pk(), 0n, 'uri', Buffer.alloc(16), sealHash)).toThrow('responseHash');
    });

    it('should reject wrong-size sealHash', () => {
      const responseHash = Buffer.alloc(32);
      expect(() => builder.buildAppendResponse(pk(), pk(), pk(), pk(), 0n, 'uri', responseHash, Buffer.alloc(16))).toThrow('sealHash');
    });
  });

  describe('deprecated methods', () => {
    it('buildSetFeedbackTags should throw', () => {
      expect(() => builder.buildSetFeedbackTags(pk(), pk(), pk(), pk(), 0n, '', '')).toThrow('v0.5.0');
    });
  });
});

describe('ValidationInstructionBuilder', () => {
  const builder = new ValidationInstructionBuilder();

  describe('buildRequestValidation', () => {
    it('should create instruction with 7 accounts', () => {
      const requestHash = Buffer.alloc(32);
      const ix = builder.buildRequestValidation(
        pk(), pk(), pk(), pk(), pk(), pk(), pk(), 42, 'ipfs://req', requestHash
      );

      expect(ix.keys).toHaveLength(7);
      expect(ix.keys[1].isSigner).toBe(true); // requester
      expect(ix.keys[2].isSigner).toBe(true); // payer
      expect(ix.keys[6].pubkey).toEqual(SystemProgram.programId);
    });

    it('should serialize nonce and request hash', () => {
      const requestHash = Buffer.alloc(32, 0xab);
      const ix = builder.buildRequestValidation(
        pk(), pk(), pk(), pk(), pk(), pk(), pk(), 123, 'ipfs://req', requestHash
      );
      expect(ix.data.length).toBeGreaterThan(8); // more than just discriminator
    });
  });

  describe('buildRespondToValidation', () => {
    it('should create instruction with 5 accounts', () => {
      const responseHash = Buffer.alloc(32);
      const ix = builder.buildRespondToValidation(
        pk(), pk(), pk(), pk(), pk(), 42, 85, 'ipfs://resp', responseHash, 'quality'
      );

      expect(ix.keys).toHaveLength(5);
      expect(ix.keys[1].isSigner).toBe(true); // validator
    });

    it('should validate string lengths', () => {
      const responseHash = Buffer.alloc(32);
      const longUri = 'x'.repeat(300);
      expect(() => builder.buildRespondToValidation(
        pk(), pk(), pk(), pk(), pk(), 42, 85, longUri, responseHash, 'tag'
      )).toThrow();
    });

    it('should validate tag length', () => {
      const responseHash = Buffer.alloc(32);
      const longTag = 'x'.repeat(50);
      expect(() => builder.buildRespondToValidation(
        pk(), pk(), pk(), pk(), pk(), 42, 85, 'uri', responseHash, longTag
      )).toThrow();
    });
  });

  describe('deprecated methods', () => {
    it('buildUpdateValidation should throw', () => {
      expect(() => builder.buildUpdateValidation(
        pk(), pk(), pk(), pk(), 0, '', Buffer.alloc(32), ''
      )).toThrow('v0.5.0');
    });

    it('buildCloseValidation should throw', () => {
      expect(() => builder.buildCloseValidation(
        pk(), pk(), pk(), pk(), pk()
      )).toThrow('v0.5.0');
    });
  });
});

describe('AtomInstructionBuilder', () => {
  const builder = new AtomInstructionBuilder();

  describe('buildInitializeStats', () => {
    it('should create instruction with 6 accounts', () => {
      const ix = builder.buildInitializeStats(pk(), pk(), pk(), pk(), pk());
      expect(ix.keys).toHaveLength(6);
      expect(ix.programId).toEqual(ATOM_ENGINE_PROGRAM_ID);
      expect(ix.keys[0].isSigner).toBe(true); // owner
      expect(ix.keys[4].isWritable).toBe(true); // stats
      expect(ix.keys[5].pubkey).toEqual(SystemProgram.programId);
    });

    it('should use discriminator-only data', () => {
      const ix = builder.buildInitializeStats(pk(), pk(), pk(), pk(), pk());
      expect(ix.data.length).toBe(8);
    });
  });

  describe('buildInitializeConfig', () => {
    it('should create instruction with 4 accounts', () => {
      const agentRegistryProgram = pk();
      const ix = builder.buildInitializeConfig(pk(), pk(), pk(), agentRegistryProgram);
      expect(ix.keys).toHaveLength(4);
      expect(ix.programId).toEqual(ATOM_ENGINE_PROGRAM_ID);
      // data: discriminator (8) + pubkey (32) = 40
      expect(ix.data.length).toBe(40);
    });

    it('should embed agent registry program in data', () => {
      const agentRegistryProgram = pk();
      const ix = builder.buildInitializeConfig(pk(), pk(), pk(), agentRegistryProgram);
      const embeddedPubkey = new PublicKey(ix.data.slice(8, 40));
      expect(embeddedPubkey).toEqual(agentRegistryProgram);
    });
  });

  describe('buildUpdateConfig', () => {
    it('should create instruction with 2 accounts', () => {
      const ix = builder.buildUpdateConfig(pk(), pk(), {});
      expect(ix.keys).toHaveLength(2);
      expect(ix.keys[0].isSigner).toBe(true); // authority
      expect(ix.keys[1].isWritable).toBe(true); // config
    });

    it('should encode all-None params when empty object', () => {
      const ix = builder.buildUpdateConfig(pk(), pk(), {});
      // discriminator (8) + 15 Option::None bytes (1 each) = 23
      expect(ix.data.length).toBe(23);
      // All option bytes should be 0 (None)
      for (let i = 8; i < 23; i++) {
        expect(ix.data[i]).toBe(0);
      }
    });

    it('should encode Some values for provided params', () => {
      const ix = builder.buildUpdateConfig(pk(), pk(), {
        alphaFast: 500,
        weightSybil: 25,
        paused: true,
      });
      // Should be larger than all-None
      expect(ix.data.length).toBeGreaterThan(23);
    });

    it('should encode boolean paused correctly', () => {
      const ix = builder.buildUpdateConfig(pk(), pk(), {
        paused: false,
      });
      // Last option should be Some(false) = [1, 0]
      const pausedStart = ix.data.length - 2;
      expect(ix.data[pausedStart]).toBe(1); // Some
      expect(ix.data[pausedStart + 1]).toBe(0); // false
    });

    it('should encode u16 params with LE encoding', () => {
      const ix = builder.buildUpdateConfig(pk(), pk(), {
        alphaFast: 0x1234,
      });
      // After discriminator (8), first option is alphaFast = Some(0x1234)
      expect(ix.data[8]).toBe(1); // Some
      expect(ix.data.readUInt16LE(9)).toBe(0x1234);
    });
  });
});
