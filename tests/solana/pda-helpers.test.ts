/**
 * Unit tests for PDA helpers
 */

import { describe, it, expect } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';
import { PDAHelpers, stringToBytes32, bytes32ToString } from '../../src/solana/pda-helpers.js';

describe('PDA Helpers', () => {
  describe('getAgentPDA', () => {
    it('should derive agent PDA deterministically', async () => {
      const agentId = 1n;
      const [pda1, bump1] = await PDAHelpers.getAgentPDA(agentId);
      const [pda2, bump2] = await PDAHelpers.getAgentPDA(agentId);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
      expect(bump1).toBeGreaterThanOrEqual(0);
      expect(bump1).toBeLessThanOrEqual(255);
    });

    it('should generate different PDAs for different agent IDs', async () => {
      const [pda1] = await PDAHelpers.getAgentPDA(1n);
      const [pda2] = await PDAHelpers.getAgentPDA(2n);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('getFeedbackPDA', () => {
    it('should derive feedback PDA deterministically', async () => {
      const agentId = 1n;
      const client = new PublicKey('11111111111111111111111111111111');
      const feedbackIndex = 0n;

      const [pda1, bump1] = await PDAHelpers.getFeedbackPDA(agentId, client, feedbackIndex);
      const [pda2, bump2] = await PDAHelpers.getFeedbackPDA(agentId, client, feedbackIndex);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should generate different PDAs for different clients', async () => {
      const agentId = 1n;
      const feedbackIndex = 0n;
      const client1 = new PublicKey('11111111111111111111111111111111');
      const client2 = new PublicKey('22222222222222222222222222222222');

      const [pda1] = await PDAHelpers.getFeedbackPDA(agentId, client1, feedbackIndex);
      const [pda2] = await PDAHelpers.getFeedbackPDA(agentId, client2, feedbackIndex);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it('should generate different PDAs for different feedback indexes', async () => {
      const agentId = 1n;
      const client = new PublicKey('11111111111111111111111111111111');

      const [pda1] = await PDAHelpers.getFeedbackPDA(agentId, client, 0n);
      const [pda2] = await PDAHelpers.getFeedbackPDA(agentId, client, 1n);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('getAgentReputationPDA', () => {
    it('should derive reputation PDA deterministically', async () => {
      const agentId = 1n;
      const [pda1, bump1] = await PDAHelpers.getAgentReputationPDA(agentId);
      const [pda2, bump2] = await PDAHelpers.getAgentReputationPDA(agentId);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getClientIndexPDA', () => {
    it('should derive client index PDA deterministically', async () => {
      const agentId = 1n;
      const client = new PublicKey('11111111111111111111111111111111');

      const [pda1, bump1] = await PDAHelpers.getClientIndexPDA(agentId, client);
      const [pda2, bump2] = await PDAHelpers.getClientIndexPDA(agentId, client);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getResponseIndexPDA', () => {
    it('should derive response index PDA deterministically', async () => {
      const agentId = 1n;
      const client = new PublicKey('11111111111111111111111111111111');
      const feedbackIndex = 0n;

      const [pda1, bump1] = await PDAHelpers.getResponseIndexPDA(agentId, client, feedbackIndex);
      const [pda2, bump2] = await PDAHelpers.getResponseIndexPDA(agentId, client, feedbackIndex);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getResponsePDA', () => {
    it('should derive response PDA deterministically', async () => {
      const agentId = 1n;
      const client = new PublicKey('11111111111111111111111111111111');
      const feedbackIndex = 0n;
      const responseIndex = 0n;

      const [pda1, bump1] = await PDAHelpers.getResponsePDA(
        agentId,
        client,
        feedbackIndex,
        responseIndex
      );
      const [pda2, bump2] = await PDAHelpers.getResponsePDA(
        agentId,
        client,
        feedbackIndex,
        responseIndex
      );

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should generate different PDAs for different response indexes', async () => {
      const agentId = 1n;
      const client = new PublicKey('11111111111111111111111111111111');
      const feedbackIndex = 0n;

      const [pda1] = await PDAHelpers.getResponsePDA(agentId, client, feedbackIndex, 0n);
      const [pda2] = await PDAHelpers.getResponsePDA(agentId, client, feedbackIndex, 1n);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('getValidationRequestPDA', () => {
    it('should derive validation request PDA deterministically', async () => {
      const agentId = 1n;
      const requester = new PublicKey('11111111111111111111111111111111');
      const validator = new PublicKey('22222222222222222222222222222222');
      const nonce = 0;

      const [pda1, bump1] = await PDAHelpers.getValidationRequestPDA(
        agentId,
        requester,
        validator,
        nonce
      );
      const [pda2, bump2] = await PDAHelpers.getValidationRequestPDA(
        agentId,
        requester,
        validator,
        nonce
      );

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });
  });

  describe('getMetadataPDA', () => {
    it('should derive metadata PDA deterministically', async () => {
      const agentId = 1n;
      const key = 'version';

      const [pda1, bump1] = await PDAHelpers.getMetadataPDA(agentId, key);
      const [pda2, bump2] = await PDAHelpers.getMetadataPDA(agentId, key);

      expect(pda1.toBase58()).toBe(pda2.toBase58());
      expect(bump1).toBe(bump2);
    });

    it('should generate different PDAs for different keys', async () => {
      const agentId = 1n;

      const [pda1] = await PDAHelpers.getMetadataPDA(agentId, 'version');
      const [pda2] = await PDAHelpers.getMetadataPDA(agentId, 'name');

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('String conversion helpers', () => {
    it('should convert string to bytes32', () => {
      const str = 'test';
      const bytes = stringToBytes32(str);

      expect(bytes).toHaveLength(32);
      expect(bytes[0]).toBe('t'.charCodeAt(0));
      expect(bytes[1]).toBe('e'.charCodeAt(0));
      expect(bytes[2]).toBe('s'.charCodeAt(0));
      expect(bytes[3]).toBe('t'.charCodeAt(0));
      expect(bytes[4]).toBe(0); // Null terminated
    });

    it('should convert bytes32 to string', () => {
      const bytes = new Uint8Array(32);
      bytes[0] = 't'.charCodeAt(0);
      bytes[1] = 'e'.charCodeAt(0);
      bytes[2] = 's'.charCodeAt(0);
      bytes[3] = 't'.charCodeAt(0);

      const str = bytes32ToString(bytes);
      expect(str).toBe('test');
    });

    it('should handle round-trip conversion', () => {
      const original = 'hello world';
      const bytes = stringToBytes32(original);
      const converted = bytes32ToString(bytes);

      expect(converted).toBe(original);
    });

    it('should truncate strings longer than 32 bytes', () => {
      const longString = 'a'.repeat(40);
      const bytes = stringToBytes32(longString);

      expect(bytes).toHaveLength(32);
    });
  });
});
