import { describe, it, expect } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';
import {
  getAtomConfigPDA,
  getAtomStatsPDA,
  getAtomStatsPDAWithProgram,
  getAtomConfigPDAWithProgram,
} from '../../src/core/atom-pda.js';
import { DEVNET_ATOM_ENGINE_PROGRAM_ID, MAINNET_ATOM_ENGINE_PROGRAM_ID } from '../../src/core/programs.js';

describe('atom-pda', () => {
  describe('getAtomConfigPDA', () => {
    it('should return [PublicKey, number]', () => {
      const [pda, bump] = getAtomConfigPDA();
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('should be deterministic', () => {
      const [pda1] = getAtomConfigPDA();
      const [pda2] = getAtomConfigPDA();
      expect(pda1.equals(pda2)).toBe(true);
    });

    it('should default to mainnet while preserving explicit devnet derivation', () => {
      const [implicit] = getAtomConfigPDA();
      const [mainnet] = getAtomConfigPDAWithProgram(MAINNET_ATOM_ENGINE_PROGRAM_ID);
      const [devnet] = getAtomConfigPDAWithProgram(DEVNET_ATOM_ENGINE_PROGRAM_ID);
      expect(implicit.equals(mainnet)).toBe(true);
      expect(implicit.equals(devnet)).toBe(false);
    });
  });

  describe('getAtomStatsPDA', () => {
    it('should return [PublicKey, number] for given asset', () => {
      const asset = PublicKey.unique();
      const [pda, bump] = getAtomStatsPDA(asset);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    it('should return different PDAs for different assets', () => {
      const asset1 = PublicKey.unique();
      const asset2 = PublicKey.unique();
      const [pda1] = getAtomStatsPDA(asset1);
      const [pda2] = getAtomStatsPDA(asset2);
      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('getAtomStatsPDAWithProgram', () => {
    it('should derive PDA with explicit program ID', () => {
      const asset = PublicKey.unique();
      const programId = PublicKey.unique();
      const [pda, bump] = getAtomStatsPDAWithProgram(asset, programId);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    it('should produce different PDA for different program', () => {
      const asset = PublicKey.unique();
      const program1 = PublicKey.unique();
      const program2 = PublicKey.unique();
      const [pda1] = getAtomStatsPDAWithProgram(asset, program1);
      const [pda2] = getAtomStatsPDAWithProgram(asset, program2);
      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('getAtomConfigPDAWithProgram', () => {
    it('should derive config PDA with explicit program ID', () => {
      const programId = PublicKey.unique();
      const [pda, bump] = getAtomConfigPDAWithProgram(programId);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });
  });
});
