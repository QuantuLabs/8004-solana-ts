import { describe, it, expect } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';
import {
  PROGRAM_ID,
  DEVNET_AGENT_REGISTRY_PROGRAM_ID,
  MAINNET_AGENT_REGISTRY_PROGRAM_ID,
  MPL_CORE_PROGRAM_ID,
  ATOM_ENGINE_PROGRAM_ID,
  DEVNET_ATOM_ENGINE_PROGRAM_ID,
  MAINNET_ATOM_ENGINE_PROGRAM_ID,
  PROGRAM_IDS,
  getProgramId,
  getProgramIds,
  getProgramIdsForCluster,
  DISCRIMINATORS,
  ACCOUNT_SIZES,
  calculateRentExempt,
  PDA_SEEDS,
  DEFAULT_CONFIG,
} from '../../src/core/programs.js';

describe('programs', () => {
  describe('constants', () => {
    it('should have valid PROGRAM_ID', () => {
      expect(PROGRAM_ID.toBase58()).toBe('8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C');
    });

    it('should have valid mainnet agent registry default', () => {
      expect(MAINNET_AGENT_REGISTRY_PROGRAM_ID.toBase58()).toBe('8oo4dC4JvBLwy5tGgiH3WwK4B9PWxL9Z4XjA2jzkQMbQ');
    });

    it('should have valid MPL_CORE_PROGRAM_ID', () => {
      expect(MPL_CORE_PROGRAM_ID.toBase58()).toBe('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
    });

    it('should have valid ATOM_ENGINE_PROGRAM_ID', () => {
      expect(ATOM_ENGINE_PROGRAM_ID.toBase58()).toBe('AToMufS4QD6hEXvcvBDg9m1AHeCLpmZQsyfYa5h9MwAF');
    });

    it('should have valid mainnet atom engine default', () => {
      expect(MAINNET_ATOM_ENGINE_PROGRAM_ID.toBase58()).toBe('AToMw53aiPQ8j7iHVb4fGt6nzUNxUhcPc3tbPBZuzVVb');
    });

    it('should have PROGRAM_IDS pointing to consolidated program', () => {
      expect(PROGRAM_IDS.identityRegistry.equals(PROGRAM_ID)).toBe(true);
      expect(PROGRAM_IDS.reputationRegistry.equals(PROGRAM_ID)).toBe(true);
      expect(PROGRAM_IDS.validationRegistry.equals(PROGRAM_ID)).toBe(true);
      expect(PROGRAM_IDS.agentRegistry.equals(PROGRAM_ID)).toBe(true);
      expect(PROGRAM_IDS.atomEngine.equals(ATOM_ENGINE_PROGRAM_ID)).toBe(true);
      expect(PROGRAM_IDS.mplCore.equals(MPL_CORE_PROGRAM_ID)).toBe(true);
    });
  });

  describe('getProgramId', () => {
    it('should return PROGRAM_ID', () => {
      expect(getProgramId().equals(PROGRAM_ID)).toBe(true);
    });
  });

  describe('getProgramIds', () => {
    it('should return devnet PROGRAM_IDS by default', () => {
      const ids = getProgramIds();
      expect(ids.agentRegistry.equals(DEVNET_AGENT_REGISTRY_PROGRAM_ID)).toBe(true);
      expect(ids.atomEngine.equals(DEVNET_ATOM_ENGINE_PROGRAM_ID)).toBe(true);
      expect(ids.mplCore).toBeDefined();
    });

    it('should support runtime overrides for localnet/mainnet', () => {
      const customAgent = new PublicKey('11111111111111111111111111111111');
      const customAtom = new PublicKey('SysvarRent111111111111111111111111111111111');

      const ids = getProgramIds({
        agentRegistry: customAgent,
        atomEngine: customAtom,
      });

      expect(ids.agentRegistry.equals(customAgent)).toBe(true);
      expect(ids.identityRegistry.equals(customAgent)).toBe(true);
      expect(ids.reputationRegistry.equals(customAgent)).toBe(true);
      expect(ids.validationRegistry.equals(customAgent)).toBe(true);
      expect(ids.atomEngine.equals(customAtom)).toBe(true);
    });

    it('should resolve mainnet defaults when cluster=mainnet-beta', () => {
      const ids = getProgramIdsForCluster('mainnet-beta');
      expect(ids.agentRegistry.equals(MAINNET_AGENT_REGISTRY_PROGRAM_ID)).toBe(true);
      expect(ids.identityRegistry.equals(MAINNET_AGENT_REGISTRY_PROGRAM_ID)).toBe(true);
      expect(ids.reputationRegistry.equals(MAINNET_AGENT_REGISTRY_PROGRAM_ID)).toBe(true);
      expect(ids.validationRegistry.equals(MAINNET_AGENT_REGISTRY_PROGRAM_ID)).toBe(true);
      expect(ids.atomEngine.equals(MAINNET_ATOM_ENGINE_PROGRAM_ID)).toBe(true);
    });
  });

  describe('DISCRIMINATORS', () => {
    it('should have 8-byte buffers', () => {
      for (const [, buf] of Object.entries(DISCRIMINATORS)) {
        expect(buf.length).toBe(8);
      }
    });
  });

  describe('ACCOUNT_SIZES', () => {
    it('should have positive sizes', () => {
      for (const [, size] of Object.entries(ACCOUNT_SIZES)) {
        expect(size).toBeGreaterThan(0);
      }
    });
  });

  describe('calculateRentExempt', () => {
    it('should calculate rent for given account size', () => {
      const rent = calculateRentExempt(100);
      // (100 + 128) * 3480 * 2 = 228 * 6960 = 1_586_880
      expect(rent).toBe((100 + 128) * 3480 * 2);
    });

    it('should calculate rent for agent account', () => {
      const rent = calculateRentExempt(ACCOUNT_SIZES.agentAccount);
      expect(rent).toBeGreaterThan(0);
    });
  });

  describe('PDA_SEEDS', () => {
    it('should have expected seed strings', () => {
      expect(PDA_SEEDS.config).toBe('config');
      expect(PDA_SEEDS.agent).toBe('agent');
      expect(PDA_SEEDS.metadataExt).toBe('metadata_ext');
      expect(PDA_SEEDS.feedback).toBe('feedback');
      expect(PDA_SEEDS.validation).toBe('validation');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have expected defaults', () => {
      expect(DEFAULT_CONFIG.commitment).toBe('confirmed');
      expect(DEFAULT_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_CONFIG.timeout).toBe(30000);
      expect(DEFAULT_CONFIG.confirmTimeout).toBe(60000);
    });
  });
});
