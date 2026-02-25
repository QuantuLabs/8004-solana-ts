import { describe, it, expect } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';
import {
  TOKEN_METADATA_PROGRAM_ID,
  getMetadataPDA,
  getMasterEditionPDA,
  getCollectionAuthorityPDA,
} from '../../src/core/metaplex-helpers.js';

describe('metaplex-helpers', () => {
  const mint = new PublicKey('So11111111111111111111111111111111111111112');
  const programId = new PublicKey('8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C');

  describe('TOKEN_METADATA_PROGRAM_ID', () => {
    it('should be the correct Metaplex Token Metadata program', () => {
      expect(TOKEN_METADATA_PROGRAM_ID.toBase58()).toBe('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    });
  });

  describe('getMetadataPDA', () => {
    it('should derive a valid PDA', () => {
      const pda = getMetadataPDA(mint);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should be deterministic', () => {
      const pda1 = getMetadataPDA(mint);
      const pda2 = getMetadataPDA(mint);
      expect(pda1.equals(pda2)).toBe(true);
    });

    it('should differ for different mints', () => {
      const mint2 = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const pda1 = getMetadataPDA(mint);
      const pda2 = getMetadataPDA(mint2);
      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('getMasterEditionPDA', () => {
    it('should derive a valid PDA', () => {
      const pda = getMasterEditionPDA(mint);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should differ from metadata PDA for same mint', () => {
      const metaPda = getMetadataPDA(mint);
      const editionPda = getMasterEditionPDA(mint);
      expect(metaPda.equals(editionPda)).toBe(false);
    });

    it('should be deterministic', () => {
      expect(getMasterEditionPDA(mint).equals(getMasterEditionPDA(mint))).toBe(true);
    });
  });

  describe('getCollectionAuthorityPDA', () => {
    it('should derive a valid PDA', () => {
      const pda = getCollectionAuthorityPDA(programId);
      expect(pda).toBeInstanceOf(PublicKey);
    });

    it('should differ for different program IDs', () => {
      const pda1 = getCollectionAuthorityPDA(programId);
      const pda2 = getCollectionAuthorityPDA(TOKEN_METADATA_PROGRAM_ID);
      expect(pda1.equals(pda2)).toBe(false);
    });

    it('should be deterministic', () => {
      expect(getCollectionAuthorityPDA(programId).equals(getCollectionAuthorityPDA(programId))).toBe(true);
    });
  });
});
