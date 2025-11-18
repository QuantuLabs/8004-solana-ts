/**
 * Unit tests for instruction builders
 */

import { describe, it, expect } from '@jest/globals';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import {
  IdentityInstructionBuilder,
  ReputationInstructionBuilder,
  ValidationInstructionBuilder,
} from '../../src/solana/instruction-builder.js';

describe('Instruction Builders', () => {
  describe('IdentityInstructionBuilder', () => {
    let builder: IdentityInstructionBuilder;

    beforeEach(() => {
      builder = new IdentityInstructionBuilder('devnet');
    });

    it('should build registerAgent instruction', () => {
      const owner = new PublicKey('11111111111111111111111111111111');
      const agent = new PublicKey('22222222222222222222222222222222');
      const agentMint = new PublicKey('33333333333333333333333333333333');
      const tokenUri = 'ipfs://QmTest';

      const ix = builder.buildRegisterAgent(owner, agent, agentMint, tokenUri);

      expect(ix).toBeInstanceOf(TransactionInstruction);
      expect(ix.keys).toHaveLength(4);
      expect(ix.data).toBeInstanceOf(Buffer);
      expect(ix.data.length).toBeGreaterThan(8); // Discriminator + data
    });

    it('should build setAgentUri instruction', () => {
      const owner = new PublicKey('11111111111111111111111111111111');
      const agent = new PublicKey('22222222222222222222222222222222');
      const newUri = 'ipfs://QmNewUri';

      const ix = builder.buildSetAgentUri(owner, agent, newUri);

      expect(ix).toBeInstanceOf(TransactionInstruction);
      expect(ix.keys).toHaveLength(2);
    });

    it('should build setMetadata instruction', () => {
      const owner = new PublicKey('11111111111111111111111111111111');
      const agent = new PublicKey('22222222222222222222222222222222');
      const metadata = new PublicKey('33333333333333333333333333333333');
      const key = 'version';
      const value = '1.0.0';

      const ix = builder.buildSetMetadata(owner, agent, metadata, key, value);

      expect(ix).toBeInstanceOf(TransactionInstruction);
      expect(ix.keys).toHaveLength(4);
    });
  });

  describe('ReputationInstructionBuilder', () => {
    let builder: ReputationInstructionBuilder;

    beforeEach(() => {
      builder = new ReputationInstructionBuilder('devnet');
    });

    it('should build giveFeedback instruction', () => {
      const client = new PublicKey('11111111111111111111111111111111');
      const agent = new PublicKey('22222222222222222222222222222222');
      const feedback = new PublicKey('33333333333333333333333333333333');
      const clientIndex = new PublicKey('44444444444444444444444444444444');
      const agentReputation = new PublicKey('55555555555555555555555555555555');

      const score = 85;
      const performanceTags = Buffer.alloc(32);
      const functionalityTags = Buffer.alloc(32);
      const fileUri = 'ipfs://QmFeedback';
      const fileHash = Buffer.alloc(32);

      const ix = builder.buildGiveFeedback(
        client,
        agent,
        feedback,
        clientIndex,
        agentReputation,
        score,
        performanceTags,
        functionalityTags,
        fileUri,
        fileHash
      );

      expect(ix).toBeInstanceOf(TransactionInstruction);
      expect(ix.keys.length).toBeGreaterThanOrEqual(5);
    });

    it('should build revokeFeedback instruction', () => {
      const client = new PublicKey('11111111111111111111111111111111');
      const agent = new PublicKey('22222222222222222222222222222222');
      const feedback = new PublicKey('33333333333333333333333333333333');
      const agentReputation = new PublicKey('44444444444444444444444444444444');

      const ix = builder.buildRevokeFeedback(client, agent, feedback, agentReputation);

      expect(ix).toBeInstanceOf(TransactionInstruction);
      expect(ix.keys).toHaveLength(4);
    });

    it('should build appendResponse instruction', () => {
      const agent_owner = new PublicKey('11111111111111111111111111111111');
      const agent = new PublicKey('22222222222222222222222222222222');
      const feedback = new PublicKey('33333333333333333333333333333333');
      const responseIndex = new PublicKey('44444444444444444444444444444444');
      const response = new PublicKey('55555555555555555555555555555555');

      const responseUri = 'ipfs://QmResponse';
      const responseHash = Buffer.alloc(32);

      const ix = builder.buildAppendResponse(
        agent_owner,
        agent,
        feedback,
        responseIndex,
        response,
        responseUri,
        responseHash
      );

      expect(ix).toBeInstanceOf(TransactionInstruction);
      expect(ix.keys.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('ValidationInstructionBuilder', () => {
    let builder: ValidationInstructionBuilder;

    beforeEach(() => {
      builder = new ValidationInstructionBuilder('devnet');
    });

    it('should build requestValidation instruction', () => {
      const requester = new PublicKey('11111111111111111111111111111111');
      const agent = new PublicKey('22222222222222222222222222222222');
      const validator = new PublicKey('33333333333333333333333333333333');
      const validationRequest = new PublicKey('44444444444444444444444444444444');
      const requestHash = Buffer.alloc(32);

      const ix = builder.buildRequestValidation(
        requester,
        agent,
        validator,
        validationRequest,
        requestHash
      );

      expect(ix).toBeInstanceOf(TransactionInstruction);
      expect(ix.keys.length).toBeGreaterThanOrEqual(4);
    });

    it('should build respondToValidation instruction', () => {
      const validator = new PublicKey('11111111111111111111111111111111');
      const agent = new PublicKey('22222222222222222222222222222222');
      const validationRequest = new PublicKey('33333333333333333333333333333333');
      const response = 1; // Approved
      const responseHash = Buffer.alloc(32);

      const ix = builder.buildRespondToValidation(
        validator,
        agent,
        validationRequest,
        response,
        responseHash
      );

      expect(ix).toBeInstanceOf(TransactionInstruction);
      expect(ix.keys).toHaveLength(3);
    });
  });

  describe('Instruction data encoding', () => {
    it('should encode string with correct length prefix', () => {
      const builder = new IdentityInstructionBuilder('devnet');
      const testString = 'test';

      // Access private method through any type for testing
      const encoded = (builder as any).serializeString(testString);

      expect(encoded.length).toBe(4 + testString.length);
      expect(encoded.readUInt32LE(0)).toBe(testString.length);
    });

    it('should handle empty strings', () => {
      const builder = new IdentityInstructionBuilder('devnet');
      const encoded = (builder as any).serializeString('');

      expect(encoded.length).toBe(4);
      expect(encoded.readUInt32LE(0)).toBe(0);
    });
  });
});
