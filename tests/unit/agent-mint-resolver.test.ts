import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PublicKey, Connection } from '@solana/web3.js';

// Mock dependencies
jest.unstable_mockModule('../../src/core/borsh-schemas.js', () => ({
  AgentAccount: {
    deserialize: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/core/instruction-discriminators.js', () => ({
  ACCOUNT_DISCRIMINATORS: {
    AgentAccount: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
  },
}));

jest.unstable_mockModule('../../src/core/pda-helpers.js', () => ({
  PDAHelpers: {
    getAgentPDA: jest.fn().mockReturnValue([new PublicKey('11111111111111111111111111111111'), 255]),
  },
  IDENTITY_PROGRAM_ID: new PublicKey('8oo48pya1SZD23ZhzoNMhxR2UGb8BRa41Su4qP9EuaWm'),
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule('bs58', () => ({
  default: { encode: jest.fn().mockReturnValue('encoded') },
}));

const { AgentMintResolver } = await import('../../src/core/agent-mint-resolver.js');
const { AgentAccount } = await import('../../src/core/borsh-schemas.js');

describe('AgentMintResolver', () => {
  let mockConnection: Connection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      getAccountInfo: jest.fn(),
      getProgramAccounts: jest.fn(),
    } as unknown as Connection;
  });

  describe('constructor', () => {
    it('should create instance', () => {
      const resolver = new AgentMintResolver(mockConnection);
      expect(resolver).toBeDefined();
      expect(resolver.size).toBe(0);
    });

    it('should accept optional collection mint', () => {
      const resolver = new AgentMintResolver(
        mockConnection,
        new PublicKey('11111111111111111111111111111111')
      );
      expect(resolver).toBeDefined();
    });
  });

  describe('resolve (deprecated)', () => {
    it('should throw deprecation error', async () => {
      const resolver = new AgentMintResolver(mockConnection);
      await expect(resolver.resolve(1n)).rejects.toThrow('deprecated');
    });
  });

  describe('batchResolve (deprecated)', () => {
    it('should throw deprecation error', async () => {
      const resolver = new AgentMintResolver(mockConnection);
      await expect(resolver.batchResolve([1n, 2n])).rejects.toThrow('deprecated');
    });
  });

  describe('getAgentByAsset', () => {
    it('should return null when account not found', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue(null);
      const resolver = new AgentMintResolver(mockConnection);
      const result = await resolver.getAgentByAsset(new PublicKey('11111111111111111111111111111111'));
      expect(result).toBeNull();
    });

    it('should deserialize and cache found accounts', async () => {
      const mockAgent = {
        getAssetPublicKey: () => new PublicKey('So11111111111111111111111111111111111111112'),
      };
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(300) });
      (AgentAccount.deserialize as jest.Mock).mockReturnValue(mockAgent);

      const resolver = new AgentMintResolver(mockConnection);
      const asset = new PublicKey('So11111111111111111111111111111111111111112');
      const result = await resolver.getAgentByAsset(asset);
      expect(result).toBe(mockAgent);
      expect(resolver.size).toBe(1);

      // Second call should use cache
      const cached = await resolver.getAgentByAsset(asset);
      expect(cached).toBe(mockAgent);
      expect(mockConnection.getAccountInfo as jest.Mock).toHaveBeenCalledTimes(1);
    });

    it('should return null on deserialization error', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(300) });
      (AgentAccount.deserialize as jest.Mock).mockImplementation(() => { throw new Error('bad'); });
      const resolver = new AgentMintResolver(mockConnection);
      const result = await resolver.getAgentByAsset(new PublicKey('11111111111111111111111111111111'));
      expect(result).toBeNull();
    });
  });

  describe('isRegisteredAgent', () => {
    it('should return true when agent exists', async () => {
      const mockAgent = { getAssetPublicKey: () => new PublicKey('11111111111111111111111111111111') };
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(300) });
      (AgentAccount.deserialize as jest.Mock).mockReturnValue(mockAgent);
      const resolver = new AgentMintResolver(mockConnection);
      const result = await resolver.isRegisteredAgent(new PublicKey('11111111111111111111111111111111'));
      expect(result).toBe(true);
    });

    it('should return false when agent not found', async () => {
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue(null);
      const resolver = new AgentMintResolver(mockConnection);
      const result = await resolver.isRegisteredAgent(new PublicKey('11111111111111111111111111111111'));
      expect(result).toBe(false);
    });
  });

  describe('loadAllAgents', () => {
    it('should load agents from program accounts', async () => {
      const mockAgent = {
        getAssetPublicKey: () => new PublicKey('So11111111111111111111111111111111111111112'),
      };
      (mockConnection.getProgramAccounts as jest.Mock).mockResolvedValue([
        { pubkey: new PublicKey('11111111111111111111111111111111'), account: { data: Buffer.alloc(300) } },
      ]);
      (AgentAccount.deserialize as jest.Mock).mockReturnValue(mockAgent);

      const resolver = new AgentMintResolver(mockConnection);
      const agents = await resolver.loadAllAgents();
      expect(agents.size).toBe(1);
    });

    it('should limit results to maxAccounts', async () => {
      const accounts = Array.from({ length: 5 }, () => ({
        pubkey: new PublicKey('11111111111111111111111111111111'),
        account: { data: Buffer.alloc(300) },
      }));
      (mockConnection.getProgramAccounts as jest.Mock).mockResolvedValue(accounts);
      (AgentAccount.deserialize as jest.Mock).mockReturnValue({
        getAssetPublicKey: () => new PublicKey('So11111111111111111111111111111111111111112'),
      });

      const resolver = new AgentMintResolver(mockConnection);
      const agents = await resolver.loadAllAgents({ maxAccounts: 2 });
      // All 5 are returned by RPC, but only 2 are processed
      expect(agents.size).toBeLessThanOrEqual(2);
    });

    it('should skip malformed accounts by default', async () => {
      (mockConnection.getProgramAccounts as jest.Mock).mockResolvedValue([
        { pubkey: new PublicKey('11111111111111111111111111111111'), account: { data: Buffer.alloc(300) } },
      ]);
      (AgentAccount.deserialize as jest.Mock).mockImplementation(() => { throw new Error('bad'); });

      const resolver = new AgentMintResolver(mockConnection);
      const agents = await resolver.loadAllAgents();
      expect(agents.size).toBe(0);
    });

    it('should throw on malformed accounts with strictParsing', async () => {
      (mockConnection.getProgramAccounts as jest.Mock).mockResolvedValue([
        { pubkey: new PublicKey('11111111111111111111111111111111'), account: { data: Buffer.alloc(300) } },
      ]);
      (AgentAccount.deserialize as jest.Mock).mockImplementation(() => { throw new Error('bad'); });

      const resolver = new AgentMintResolver(mockConnection);
      await expect(resolver.loadAllAgents({ strictParsing: true })).rejects.toThrow('Failed to load agents');
    });

    it('should prevent concurrent loads', async () => {
      (mockConnection.getProgramAccounts as jest.Mock).mockResolvedValue([]);
      const resolver = new AgentMintResolver(mockConnection);
      const p1 = resolver.loadAllAgents();
      const p2 = resolver.loadAllAgents();
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(r2);
      expect(mockConnection.getProgramAccounts as jest.Mock).toHaveBeenCalledTimes(1);
    });

    it('should handle RPC errors', async () => {
      (mockConnection.getProgramAccounts as jest.Mock).mockRejectedValue(new Error('rpc fail'));
      const resolver = new AgentMintResolver(mockConnection);
      await expect(resolver.loadAllAgents()).rejects.toThrow('Failed to load agents');
    });
  });

  describe('clearCache', () => {
    it('should reset cache and loading state', async () => {
      const mockAgent = {
        getAssetPublicKey: () => new PublicKey('So11111111111111111111111111111111111111112'),
      };
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({ data: Buffer.alloc(300) });
      (AgentAccount.deserialize as jest.Mock).mockReturnValue(mockAgent);

      const resolver = new AgentMintResolver(mockConnection);
      await resolver.getAgentByAsset(new PublicKey('So11111111111111111111111111111111111111112'));
      expect(resolver.size).toBe(1);

      resolver.clearCache();
      expect(resolver.size).toBe(0);
    });
  });

  describe('refresh', () => {
    it('should clear cache and reload', async () => {
      (mockConnection.getProgramAccounts as jest.Mock).mockResolvedValue([]);
      const resolver = new AgentMintResolver(mockConnection);
      await resolver.refresh();
      expect(mockConnection.getProgramAccounts as jest.Mock).toHaveBeenCalled();
    });
  });

  describe('addToCache (deprecated)', () => {
    it('should be a no-op', () => {
      const resolver = new AgentMintResolver(mockConnection);
      resolver.addToCache(1n, new PublicKey('11111111111111111111111111111111'));
      expect(resolver.size).toBe(0);
    });
  });
});
