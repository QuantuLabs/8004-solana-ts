import { describe, it, expect } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';
import {
  PDAHelpers,
  PROGRAM_ID,
  MPL_CORE_PROGRAM_ID,
  IDENTITY_PROGRAM_ID,
  REPUTATION_PROGRAM_ID,
  VALIDATION_PROGRAM_ID,
  bytes32ToString,
  stringToBytes32,
} from '../../src/core/pda-helpers.js';

describe('pda-helpers', () => {
  const asset = new PublicKey('So11111111111111111111111111111111111111112');
  const collection = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const client = new PublicKey('11111111111111111111111111111111');
  const validator = new PublicKey('SysvarRent111111111111111111111111111111111');

  describe('program IDs', () => {
    it('should export PROGRAM_ID', () => {
      expect(PROGRAM_ID).toBeInstanceOf(PublicKey);
    });

    it('should export MPL_CORE_PROGRAM_ID', () => {
      expect(MPL_CORE_PROGRAM_ID).toBeInstanceOf(PublicKey);
    });

    it('should have IDENTITY_PROGRAM_ID as alias', () => {
      expect(IDENTITY_PROGRAM_ID.equals(PROGRAM_ID)).toBe(true);
    });

    it('should have REPUTATION_PROGRAM_ID as alias', () => {
      expect(REPUTATION_PROGRAM_ID.equals(PROGRAM_ID)).toBe(true);
    });

    it('should have VALIDATION_PROGRAM_ID as alias', () => {
      expect(VALIDATION_PROGRAM_ID.equals(PROGRAM_ID)).toBe(true);
    });
  });

  describe('Identity Module PDAs', () => {
    describe('getRootConfigPDA', () => {
      it('should return [PublicKey, number] tuple', () => {
        const [pda, bump] = PDAHelpers.getRootConfigPDA();
        expect(pda).toBeInstanceOf(PublicKey);
        expect(typeof bump).toBe('number');
        expect(bump).toBeGreaterThanOrEqual(0);
        expect(bump).toBeLessThanOrEqual(255);
      });

      it('should be deterministic', () => {
        const [a] = PDAHelpers.getRootConfigPDA();
        const [b] = PDAHelpers.getRootConfigPDA();
        expect(a.equals(b)).toBe(true);
      });

      it('should differ with different program IDs', () => {
        const [a] = PDAHelpers.getRootConfigPDA(PROGRAM_ID);
        const [b] = PDAHelpers.getRootConfigPDA(MPL_CORE_PROGRAM_ID);
        expect(a.equals(b)).toBe(false);
      });
    });

    describe('getRegistryConfigPDA', () => {
      it('should return [PublicKey, number] tuple', () => {
        const [pda, bump] = PDAHelpers.getRegistryConfigPDA(collection);
        expect(pda).toBeInstanceOf(PublicKey);
        expect(typeof bump).toBe('number');
      });

      it('should differ for different collections', () => {
        const [a] = PDAHelpers.getRegistryConfigPDA(collection);
        const [b] = PDAHelpers.getRegistryConfigPDA(asset);
        expect(a.equals(b)).toBe(false);
      });
    });

    describe('getConfigPDA', () => {
      it('should return legacy config PDA', () => {
        const [pda, bump] = PDAHelpers.getConfigPDA();
        expect(pda).toBeInstanceOf(PublicKey);
        expect(typeof bump).toBe('number');
      });
    });

    describe('getAgentPDA', () => {
      it('should derive from asset', () => {
        const [pda, bump] = PDAHelpers.getAgentPDA(asset);
        expect(pda).toBeInstanceOf(PublicKey);
        expect(typeof bump).toBe('number');
      });

      it('should differ for different assets', () => {
        const [a] = PDAHelpers.getAgentPDA(asset);
        const [b] = PDAHelpers.getAgentPDA(collection);
        expect(a.equals(b)).toBe(false);
      });
    });

    describe('getMetadataEntryPDA', () => {
      it('should derive from asset and key hash', () => {
        const keyHash = Buffer.alloc(32);
        keyHash.write('test', 0);
        const [pda, bump] = PDAHelpers.getMetadataEntryPDA(asset, keyHash);
        expect(pda).toBeInstanceOf(PublicKey);
        expect(typeof bump).toBe('number');
      });

      it('should use first 16 bytes of key hash', () => {
        const keyHash1 = Buffer.alloc(32, 0);
        keyHash1[0] = 1;
        const keyHash2 = Buffer.alloc(32, 0);
        keyHash2[0] = 2;
        const [a] = PDAHelpers.getMetadataEntryPDA(asset, keyHash1);
        const [b] = PDAHelpers.getMetadataEntryPDA(asset, keyHash2);
        expect(a.equals(b)).toBe(false);
      });
    });
  });

  describe('Reputation Module PDAs', () => {
    describe('getAtomCpiAuthorityPDA', () => {
      it('should derive ATOM CPI authority', () => {
        const [pda, bump] = PDAHelpers.getAtomCpiAuthorityPDA();
        expect(pda).toBeInstanceOf(PublicKey);
        expect(typeof bump).toBe('number');
      });
    });

    describe('getFeedbackPDA', () => {
      it('should derive from asset and feedback index', () => {
        const [pda, bump] = PDAHelpers.getFeedbackPDA(asset, 0n);
        expect(pda).toBeInstanceOf(PublicKey);
        expect(typeof bump).toBe('number');
      });

      it('should accept number index', () => {
        const [pda] = PDAHelpers.getFeedbackPDA(asset, 5);
        expect(pda).toBeInstanceOf(PublicKey);
      });

      it('should differ for different indices', () => {
        const [a] = PDAHelpers.getFeedbackPDA(asset, 0n);
        const [b] = PDAHelpers.getFeedbackPDA(asset, 1n);
        expect(a.equals(b)).toBe(false);
      });
    });

    describe('getFeedbackTagsPDA', () => {
      it('should derive from asset and feedback index', () => {
        const [pda] = PDAHelpers.getFeedbackTagsPDA(asset, 0n);
        expect(pda).toBeInstanceOf(PublicKey);
      });

      it('should differ from feedback PDA', () => {
        const [feedback] = PDAHelpers.getFeedbackPDA(asset, 0n);
        const [tags] = PDAHelpers.getFeedbackTagsPDA(asset, 0n);
        expect(feedback.equals(tags)).toBe(false);
      });
    });

    describe('getAgentReputationPDA', () => {
      it('should derive from asset', () => {
        const [pda] = PDAHelpers.getAgentReputationPDA(asset);
        expect(pda).toBeInstanceOf(PublicKey);
      });
    });

    describe('getResponsePDA', () => {
      it('should derive from asset, feedback index, response index', () => {
        const [pda] = PDAHelpers.getResponsePDA(asset, 0n, 0n);
        expect(pda).toBeInstanceOf(PublicKey);
      });

      it('should differ for different response indices', () => {
        const [a] = PDAHelpers.getResponsePDA(asset, 0n, 0n);
        const [b] = PDAHelpers.getResponsePDA(asset, 0n, 1n);
        expect(a.equals(b)).toBe(false);
      });
    });

    describe('getResponseIndexPDA', () => {
      it('should derive from asset and feedback index', () => {
        const [pda] = PDAHelpers.getResponseIndexPDA(asset, 0n);
        expect(pda).toBeInstanceOf(PublicKey);
      });
    });

    describe('getClientIndexPDA', () => {
      it('should derive from asset and client', () => {
        const [pda] = PDAHelpers.getClientIndexPDA(asset, client);
        expect(pda).toBeInstanceOf(PublicKey);
      });

      it('should differ for different clients', () => {
        const [a] = PDAHelpers.getClientIndexPDA(asset, client);
        const [b] = PDAHelpers.getClientIndexPDA(asset, validator);
        expect(a.equals(b)).toBe(false);
      });
    });
  });

  describe('Validation Module PDAs', () => {
    describe('getValidationConfigPDA', () => {
      it('should derive validation config', () => {
        const [pda] = PDAHelpers.getValidationConfigPDA();
        expect(pda).toBeInstanceOf(PublicKey);
      });
    });

    describe('getValidationRequestPDA', () => {
      it('should derive from asset, validator, nonce', () => {
        const [pda] = PDAHelpers.getValidationRequestPDA(asset, validator, 0);
        expect(pda).toBeInstanceOf(PublicKey);
      });

      it('should accept bigint nonce', () => {
        const [pda] = PDAHelpers.getValidationRequestPDA(asset, validator, 5n);
        expect(pda).toBeInstanceOf(PublicKey);
      });

      it('should differ for different nonces', () => {
        const [a] = PDAHelpers.getValidationRequestPDA(asset, validator, 0);
        const [b] = PDAHelpers.getValidationRequestPDA(asset, validator, 1);
        expect(a.equals(b)).toBe(false);
      });
    });
  });

  describe('bytes32ToString', () => {
    it('should convert null-terminated bytes to string', () => {
      const bytes = new Uint8Array(32);
      bytes.set(Buffer.from('hello'));
      expect(bytes32ToString(bytes)).toBe('hello');
    });

    it('should handle full 32-byte string without null', () => {
      const bytes = Buffer.alloc(32, 0x61); // all 'a'
      expect(bytes32ToString(bytes)).toBe('a'.repeat(32));
    });

    it('should handle empty (all zeros)', () => {
      const bytes = new Uint8Array(32);
      expect(bytes32ToString(bytes)).toBe('');
    });
  });

  describe('stringToBytes32', () => {
    it('should convert string to 32-byte buffer', () => {
      const buf = stringToBytes32('hello');
      expect(buf.length).toBe(32);
      expect(buf.toString('utf8', 0, 5)).toBe('hello');
    });

    it('should zero-pad short strings', () => {
      const buf = stringToBytes32('hi');
      expect(buf[2]).toBe(0);
      expect(buf[31]).toBe(0);
    });

    it('should handle empty string', () => {
      const buf = stringToBytes32('');
      expect(buf.every(b => b === 0)).toBe(true);
    });

    it('should roundtrip with bytes32ToString', () => {
      const original = 'testkey';
      const bytes = stringToBytes32(original);
      expect(bytes32ToString(bytes)).toBe(original);
    });
  });
});
