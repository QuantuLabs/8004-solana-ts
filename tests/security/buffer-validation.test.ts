/**
 * Security tests for buffer bounds validation in Borsh deserialization
 * v0.3.0 - Updated for asset-based structures
 * Ensures malformed account data is rejected before causing crashes or undefined behavior
 */

import {
  AgentAccount,
  MetadataEntryPda,
  FeedbackTagsPda,
  RegistryConfig,
  RootConfig,
} from '../../src/core/borsh-schemas.js';

describe('Buffer Bounds Validation', () => {
  describe('AgentAccount.deserialize', () => {
    it('should reject buffers smaller than minimum size', () => {
      // Minimum is 266 bytes for the current AgentAccount layout.
      const tooSmall = Buffer.alloc(50);
      expect(() => AgentAccount.deserialize(tooSmall)).toThrow(
        /Invalid AgentAccount data: expected >= 266 bytes, got 50/
      );
    });

    it('should reject empty buffer', () => {
      const empty = Buffer.alloc(0);
      expect(() => AgentAccount.deserialize(empty)).toThrow(
        /Invalid AgentAccount data: expected >= 266 bytes, got 0/
      );
    });

    it('should reject buffer at boundary (265 bytes)', () => {
      const boundary = Buffer.alloc(265);
      expect(() => AgentAccount.deserialize(boundary)).toThrow(
        /Invalid AgentAccount data: expected >= 266 bytes, got 265/
      );
    });

    it('should accept buffer at minimum size (266 bytes)', () => {
      const minimal = Buffer.alloc(266);
      expect(() => AgentAccount.deserialize(minimal)).not.toThrow(
        /Invalid AgentAccount data: expected >= 266 bytes/
      );
    });
  });

  describe('MetadataEntryPda.deserialize - v0.3.0', () => {
    it('should reject buffers smaller than minimum size', () => {
      // v0.3.0 Minimum: discriminator(8) + asset(32) + immutable(1) + bump(1) = 42 bytes
      const tooSmall = Buffer.alloc(30);
      expect(() => MetadataEntryPda.deserialize(tooSmall)).toThrow(
        /Invalid MetadataEntryPda data: expected >= 42 bytes, got 30/
      );
    });

    it('should reject empty buffer', () => {
      const empty = Buffer.alloc(0);
      expect(() => MetadataEntryPda.deserialize(empty)).toThrow(
        /Invalid MetadataEntryPda data: expected >= 42 bytes, got 0/
      );
    });
  });

  describe('FeedbackTagsPda.deserialize - v0.3.0', () => {
    it('should reject buffers smaller than minimum size', () => {
      // v0.3.0 Minimum: discriminator(8) + bump(1) = 9 bytes
      const tooSmall = Buffer.alloc(5);
      expect(() => FeedbackTagsPda.deserialize(tooSmall)).toThrow(
        /Invalid FeedbackTagsPda data: expected >= 9 bytes, got 5/
      );
    });

    it('should reject empty buffer', () => {
      const empty = Buffer.alloc(0);
      expect(() => FeedbackTagsPda.deserialize(empty)).toThrow(
        /Invalid FeedbackTagsPda data: expected >= 9 bytes, got 0/
      );
    });
  });

  describe('RegistryConfig.deserialize - v0.6.0', () => {
    it('should reject buffers smaller than minimum size', () => {
      // Minimum: discriminator(8) + collection(32) + authority(32) + bump(1) = 73 bytes
      const tooSmall = Buffer.alloc(50);
      expect(() => RegistryConfig.deserialize(tooSmall)).toThrow(
        /Invalid RegistryConfig data: expected >= 73 bytes, got 50/
      );
    });

    it('should reject empty buffer', () => {
      const empty = Buffer.alloc(0);
      expect(() => RegistryConfig.deserialize(empty)).toThrow(
        /Invalid RegistryConfig data: expected >= 73 bytes, got 0/
      );
    });

    it('should reject buffer at boundary (72 bytes)', () => {
      const boundary = Buffer.alloc(72);
      expect(() => RegistryConfig.deserialize(boundary)).toThrow(
        /Invalid RegistryConfig data: expected >= 73 bytes, got 72/
      );
    });
  });

  describe('RootConfig.deserialize - v0.3.0', () => {
    it('should reject buffers smaller than minimum size', () => {
      // Minimum: discriminator(8) + base_registry(32) + authority(32) + bump(1) = 73 bytes
      const tooSmall = Buffer.alloc(50);
      expect(() => RootConfig.deserialize(tooSmall)).toThrow(
        /Invalid RootConfig data: expected >= 73 bytes, got 50/
      );
    });

    it('should reject empty buffer', () => {
      const empty = Buffer.alloc(0);
      expect(() => RootConfig.deserialize(empty)).toThrow(
        /Invalid RootConfig data: expected >= 73 bytes, got 0/
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
