/**
 * Security tests for buffer bounds validation in Borsh deserialization
 * Ensures malformed account data is rejected before causing crashes or undefined behavior
 */

import {
  AgentAccount,
  MetadataEntryPda,
  FeedbackTagsPda,
  RegistryConfig,
  MetadataExtensionAccount,
} from '../../src/core/borsh-schemas.js';

describe('Buffer Bounds Validation', () => {
  describe('AgentAccount.deserialize', () => {
    it('should reject buffers smaller than minimum size', () => {
      // Minimum: discriminator(8) + agent_id(8) + owner(32) + agent_mint(32) + created_at(8) + bump(1) = 89 bytes
      const tooSmall = Buffer.alloc(50);
      expect(() => AgentAccount.deserialize(tooSmall)).toThrow(
        /Invalid AgentAccount data: expected >= 89 bytes, got 50/
      );
    });

    it('should reject empty buffer', () => {
      const empty = Buffer.alloc(0);
      expect(() => AgentAccount.deserialize(empty)).toThrow(
        /Invalid AgentAccount data: expected >= 89 bytes, got 0/
      );
    });

    it('should reject buffer at boundary (88 bytes)', () => {
      const boundary = Buffer.alloc(88);
      expect(() => AgentAccount.deserialize(boundary)).toThrow(
        /Invalid AgentAccount data: expected >= 89 bytes, got 88/
      );
    });

    it('should accept buffer at minimum size (89 bytes)', () => {
      // Note: This may still fail deserialization due to invalid data,
      // but it should pass the size check
      const minimal = Buffer.alloc(89);
      // The deserialization may fail due to schema mismatch, but not due to size check
      expect(() => AgentAccount.deserialize(minimal)).not.toThrow(
        /Invalid AgentAccount data: expected >= 89 bytes/
      );
    });
  });

  describe('MetadataEntryPda.deserialize', () => {
    it('should reject buffers smaller than minimum size', () => {
      // Minimum: discriminator(8) + agent_id(8) + created_at(8) + immutable(1) + bump(1) = 26 bytes
      const tooSmall = Buffer.alloc(20);
      expect(() => MetadataEntryPda.deserialize(tooSmall)).toThrow(
        /Invalid MetadataEntryPda data: expected >= 26 bytes, got 20/
      );
    });

    it('should reject empty buffer', () => {
      const empty = Buffer.alloc(0);
      expect(() => MetadataEntryPda.deserialize(empty)).toThrow(
        /Invalid MetadataEntryPda data: expected >= 26 bytes, got 0/
      );
    });
  });

  describe('FeedbackTagsPda.deserialize', () => {
    it('should reject buffers smaller than minimum size', () => {
      // Minimum: discriminator(8) + agent_id(8) + feedback_index(8) + bump(1) = 25 bytes
      const tooSmall = Buffer.alloc(20);
      expect(() => FeedbackTagsPda.deserialize(tooSmall)).toThrow(
        /Invalid FeedbackTagsPda data: expected >= 25 bytes, got 20/
      );
    });

    it('should reject empty buffer', () => {
      const empty = Buffer.alloc(0);
      expect(() => FeedbackTagsPda.deserialize(empty)).toThrow(
        /Invalid FeedbackTagsPda data: expected >= 25 bytes, got 0/
      );
    });
  });

  describe('RegistryConfig.deserialize', () => {
    it('should reject buffers smaller than minimum size', () => {
      // Minimum: discriminator(8) + authority(32) + next_agent_id(8) + total_agents(8) + collection(32) + bump(1) = 89 bytes
      const tooSmall = Buffer.alloc(50);
      expect(() => RegistryConfig.deserialize(tooSmall)).toThrow(
        /Invalid RegistryConfig data: expected >= 89 bytes, got 50/
      );
    });

    it('should reject empty buffer', () => {
      const empty = Buffer.alloc(0);
      expect(() => RegistryConfig.deserialize(empty)).toThrow(
        /Invalid RegistryConfig data: expected >= 89 bytes, got 0/
      );
    });

    it('should reject buffer at boundary (88 bytes)', () => {
      const boundary = Buffer.alloc(88);
      expect(() => RegistryConfig.deserialize(boundary)).toThrow(
        /Invalid RegistryConfig data: expected >= 89 bytes, got 88/
      );
    });
  });

  describe('MetadataExtensionAccount.deserialize', () => {
    it('should reject buffers smaller than minimum size', () => {
      // Minimum: discriminator(8) + agent_mint(32) + extension_index(1) + metadata vec len(4) + bump(1) = 46 bytes
      const tooSmall = Buffer.alloc(30);
      expect(() => MetadataExtensionAccount.deserialize(tooSmall)).toThrow(
        /Invalid MetadataExtensionAccount data: expected >= 46 bytes, got 30/
      );
    });

    it('should reject empty buffer', () => {
      const empty = Buffer.alloc(0);
      expect(() => MetadataExtensionAccount.deserialize(empty)).toThrow(
        /Invalid MetadataExtensionAccount data: expected >= 46 bytes, got 0/
      );
    });
  });

  describe('Corrupted data handling', () => {
    it('should provide clear error for corrupted AgentAccount data', () => {
      // Create buffer with valid size but garbage data
      const corrupted = Buffer.alloc(200);
      corrupted.fill(0xff); // Fill with 0xFF

      // Should either throw size error or deserialization error, not crash
      expect(() => AgentAccount.deserialize(corrupted)).toThrow();
    });

    it('should not crash on random data', () => {
      // Random data that passes size check but has invalid structure
      const random = Buffer.alloc(100);
      for (let i = 0; i < random.length; i++) {
        random[i] = Math.floor(Math.random() * 256);
      }

      // Should throw an error, not crash
      expect(() => AgentAccount.deserialize(random)).toThrow();
    });
  });
});
