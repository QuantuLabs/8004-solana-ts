/**
 * Unit tests for Borsh schema deserialization
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';
import {
  AgentAccount,
  FeedbackAccount,
  AgentReputationAccount,
  ClientIndexAccount,
  ResponseAccount,
  MetadataEntry,
} from '../../src/solana/borsh-schemas.js';

describe('Borsh Schemas', () => {
  describe('AgentAccount', () => {
    it('should deserialize valid agent account data', () => {
      // Create mock account data (8-byte discriminator + 289 bytes)
      const discriminator = Buffer.alloc(8);
      const agentId = Buffer.alloc(8);
      agentId.writeBigUInt64LE(1n);

      const owner = new PublicKey('11111111111111111111111111111111').toBuffer();
      const agentMint = new PublicKey('11111111111111111111111111111111').toBuffer();

      const tokenUriLength = Buffer.alloc(4);
      tokenUriLength.writeUInt32LE(15);
      const tokenUri = Buffer.from('ipfs://QmTest123');

      const createdAt = Buffer.alloc(8);
      createdAt.writeBigInt64LE(1700000000n);

      const status = Buffer.from([1]); // Active
      const bump = Buffer.from([255]);

      const data = Buffer.concat([
        discriminator,
        agentId,
        owner,
        agentMint,
        tokenUriLength,
        tokenUri,
        createdAt,
        status,
        bump,
      ]);

      const account = AgentAccount.deserialize(data);

      expect(account.agent_id).toBe(1n);
      expect(account.token_uri).toContain('ipfs://');
      expect(account.status).toBe(1);
      expect(account.bump).toBe(255);
    });

    it('should get owner PublicKey', () => {
      const mockData = Buffer.alloc(297);
      mockData.writeBigUInt64LE(1n, 8); // agent_id

      const ownerPubkey = new PublicKey('11111111111111111111111111111111');
      ownerPubkey.toBuffer().copy(mockData, 16); // owner at offset 16

      const account = AgentAccount.deserialize(mockData);
      const owner = account.getOwnerPublicKey();

      expect(owner.toBase58()).toBe(ownerPubkey.toBase58());
    });
  });

  describe('FeedbackAccount', () => {
    it('should deserialize valid feedback account data', () => {
      const mockData = Buffer.alloc(526);

      // Write discriminator
      mockData.writeBigUInt64LE(0n, 0);

      // Write agent_id
      mockData.writeBigUInt64LE(1n, 8);

      // Write client (32 bytes at offset 16)
      const client = new PublicKey('11111111111111111111111111111111');
      client.toBuffer().copy(mockData, 16);

      // Write feedback_index
      mockData.writeBigUInt64LE(0n, 48);

      // Write score
      mockData.writeUInt8(85, 56);

      const feedback = FeedbackAccount.deserialize(mockData);

      expect(feedback.agent_id).toBe(1n);
      expect(feedback.feedback_index).toBe(0n);
      expect(feedback.score).toBe(85);
      expect(feedback.revoked).toBe(false);
    });

    it('should handle revoked feedback', () => {
      const mockData = Buffer.alloc(526);
      mockData.writeBigUInt64LE(1n, 8); // agent_id
      mockData.writeUInt8(1, 409); // revoked = true

      const feedback = FeedbackAccount.deserialize(mockData);
      expect(feedback.revoked).toBe(true);
    });
  });

  describe('AgentReputationAccount', () => {
    it('should deserialize reputation account with cached data', () => {
      const mockData = Buffer.alloc(100);

      mockData.writeBigUInt64LE(1n, 8); // agent_id
      mockData.writeUInt8(85, 16); // average_score
      mockData.writeBigUInt64LE(10n, 24); // total_feedbacks

      const reputation = AgentReputationAccount.deserialize(mockData);

      expect(reputation.agent_id).toBe(1n);
      expect(reputation.average_score).toBe(85);
      expect(reputation.total_feedbacks).toBe(10n);
    });
  });

  describe('ClientIndexAccount', () => {
    it('should deserialize client index account', () => {
      const mockData = Buffer.alloc(100);

      mockData.writeBigUInt64LE(1n, 8); // agent_id

      const client = new PublicKey('11111111111111111111111111111111');
      client.toBuffer().copy(mockData, 16);

      mockData.writeBigUInt64LE(5n, 48); // last_index

      const clientIndex = ClientIndexAccount.deserialize(mockData);

      expect(clientIndex.agent_id).toBe(1n);
      expect(clientIndex.last_index).toBe(5n);
    });
  });

  describe('ResponseAccount', () => {
    it('should deserialize response account', () => {
      const mockData = Buffer.alloc(300);

      mockData.writeBigUInt64LE(1n, 8); // agent_id

      const client = new PublicKey('11111111111111111111111111111111');
      client.toBuffer().copy(mockData, 16);

      mockData.writeBigUInt64LE(0n, 48); // feedback_index
      mockData.writeBigUInt64LE(0n, 56); // response_index

      const response = ResponseAccount.deserialize(mockData);

      expect(response.agent_id).toBe(1n);
      expect(response.feedback_index).toBe(0n);
      expect(response.response_index).toBe(0n);
    });
  });

  describe('MetadataEntry', () => {
    it('should create and serialize metadata entry', () => {
      const entry = new MetadataEntry();
      entry.key = 'version';
      entry.value = '1.0.0';

      expect(entry.key).toBe('version');
      expect(entry.value).toBe('1.0.0');
    });
  });
});
