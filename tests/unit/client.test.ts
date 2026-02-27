/**
 * Comprehensive tests for src/core/client.ts
 * Tests SolanaClient, UnsupportedRpcError, RpcNetworkError, createDevnetClient
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PublicKey, Connection } from '@solana/web3.js';

// We test the module directly without mocking @solana/web3.js Connection
// since the constructor is synchronous and we can mock individual Connection methods
import {
  SolanaClient,
  UnsupportedRpcError,
  RpcNetworkError,
  SOLANA_DEVNET_RPC,
  SOLANA_TESTNET_RPC,
  SOLANA_MAINNET_RPC,
  SOLANA_LOCALNET_RPC,
  RECOMMENDED_RPC_PROVIDERS,
  createDevnetClient,
} from '../../src/core/client.js';

describe('UnsupportedRpcError', () => {
  it('should create error with operation name', () => {
    const error = new UnsupportedRpcError('getAllAgents');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('UnsupportedRpcError');
    expect(error.operation).toBe('getAllAgents');
    expect(error.message).toContain('getAllAgents');
    expect(error.message).toContain('not supported');
  });

  it('should include RPC provider recommendations', () => {
    const error = new UnsupportedRpcError('test');
    for (const provider of RECOMMENDED_RPC_PROVIDERS) {
      expect(error.message).toContain(provider);
    }
  });

  it('should include example usage', () => {
    const error = new UnsupportedRpcError('test');
    expect(error.message).toContain('SolanaSDK');
    expect(error.message).toContain('rpcUrl');
  });
});

describe('RpcNetworkError', () => {
  it('should create error with operation and cause', () => {
    const cause = new Error('Connection timeout');
    const error = new RpcNetworkError('getAccount', cause);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RpcNetworkError');
    expect(error.operation).toBe('getAccount');
    expect(error.cause).toBe(cause);
    expect(error.message).toContain('getAccount');
    expect(error.message).toContain('Connection timeout');
  });

  it('should handle non-Error cause', () => {
    const error = new RpcNetworkError('getAccount', 'string error');
    expect(error.cause).toBe('string error');
    expect(error.message).toContain('string error');
  });

  it('should handle undefined cause', () => {
    const error = new RpcNetworkError('getAccount', undefined);
    expect(error.message).toContain('undefined');
  });
});

describe('SolanaClient', () => {
  describe('constructor', () => {
    it('should use default devnet RPC when no rpcUrl provided', () => {
      const client = new SolanaClient({});
      expect(client.rpcUrl).toBe(SOLANA_DEVNET_RPC);
      expect(client.cluster).toBe('devnet');
      expect(client.isDefaultDevnetRpc).toBe(true);
    });

    it('should use provided rpcUrl', () => {
      const customUrl = 'https://custom-rpc.example.com';
      const client = new SolanaClient({ rpcUrl: customUrl });
      expect(client.rpcUrl).toBe(customUrl);
      expect(client.isDefaultDevnetRpc).toBe(false);
    });

    it('should detect default devnet RPC URL explicitly passed', () => {
      const client = new SolanaClient({ rpcUrl: SOLANA_DEVNET_RPC });
      expect(client.isDefaultDevnetRpc).toBe(true);
    });

    it('should default to devnet cluster', () => {
      const client = new SolanaClient({});
      expect(client.cluster).toBe('devnet');
    });

    it('should accept explicit cluster', () => {
      const client = new SolanaClient({ cluster: 'devnet' });
      expect(client.cluster).toBe('devnet');
    });

    it('should map mainnet-beta cluster to mainnet RPC by default', () => {
      const client = new SolanaClient({ cluster: 'mainnet-beta' });
      expect(client.cluster).toBe('mainnet-beta');
      expect(client.rpcUrl).toBe(SOLANA_MAINNET_RPC);
      expect(client.isDefaultDevnetRpc).toBe(false);
    });

    it('should map testnet cluster to testnet RPC by default', () => {
      const client = new SolanaClient({ cluster: 'testnet' });
      expect(client.cluster).toBe('testnet');
      expect(client.rpcUrl).toBe(SOLANA_TESTNET_RPC);
      expect(client.isDefaultDevnetRpc).toBe(false);
    });

    it('should map localnet cluster to localhost RPC by default', () => {
      const client = new SolanaClient({ cluster: 'localnet' });
      expect(client.cluster).toBe('localnet');
      expect(client.rpcUrl).toBe(SOLANA_LOCALNET_RPC);
      expect(client.isDefaultDevnetRpc).toBe(false);
    });
  });

  describe('supportsAdvancedQueries', () => {
    it('should return false for default devnet RPC', () => {
      const client = new SolanaClient({});
      expect(client.supportsAdvancedQueries()).toBe(false);
    });

    it('should return true for custom RPC', () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      expect(client.supportsAdvancedQueries()).toBe(true);
    });
  });

  describe('requireAdvancedQueries', () => {
    it('should throw UnsupportedRpcError for default devnet RPC', () => {
      const client = new SolanaClient({});
      expect(() => client.requireAdvancedQueries('getAllAgents')).toThrow(UnsupportedRpcError);
    });

    it('should not throw for custom RPC', () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      expect(() => client.requireAdvancedQueries('getAllAgents')).not.toThrow();
    });

    it('should include operation name in thrown error', () => {
      const client = new SolanaClient({});
      try {
        client.requireAdvancedQueries('getCollections');
        fail('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(UnsupportedRpcError);
        expect((error as UnsupportedRpcError).operation).toBe('getCollections');
      }
    });
  });

  describe('getConnection', () => {
    it('should return Connection instance', () => {
      const client = new SolanaClient({});
      const connection = client.getConnection();
      expect(connection).toBeInstanceOf(Connection);
    });
  });

  describe('getAccount', () => {
    it('should return buffer when account exists', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const mockData = Buffer.from([1, 2, 3, 4]);
      const mockAddress = PublicKey.default;

      // Mock the connection's getAccountInfo
      const conn = client.getConnection();
      jest.spyOn(conn, 'getAccountInfo').mockResolvedValue({
        data: mockData,
        executable: false,
        lamports: 1000000,
        owner: PublicKey.default,
        rentEpoch: 0,
      } as any);

      const result = await client.getAccount(mockAddress);
      expect(result).toEqual(mockData);
    });

    it('should return null when account does not exist', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getAccountInfo').mockResolvedValue(null);

      const result = await client.getAccount(PublicKey.default);
      expect(result).toBeNull();
    });

    it('should return null for "account not found" errors', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getAccountInfo').mockRejectedValue(new Error('account not found'));

      const result = await client.getAccount(PublicKey.default);
      expect(result).toBeNull();
    });

    it('should return null for "could not find" errors', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getAccountInfo').mockRejectedValue(new Error('could not find account'));

      const result = await client.getAccount(PublicKey.default);
      expect(result).toBeNull();
    });

    it('should return null for "invalid account" errors', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getAccountInfo').mockRejectedValue(new Error('invalid account'));

      const result = await client.getAccount(PublicKey.default);
      expect(result).toBeNull();
    });

    it('should throw RpcNetworkError for network errors', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getAccountInfo').mockRejectedValue(new Error('Connection refused'));

      await expect(client.getAccount(PublicKey.default)).rejects.toThrow(RpcNetworkError);
    });

    it('should include operation name in RpcNetworkError', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getAccountInfo').mockRejectedValue(new Error('timeout'));

      try {
        await client.getAccount(PublicKey.default);
        fail('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(RpcNetworkError);
        expect((error as RpcNetworkError).operation).toBe('getAccount');
      }
    });
  });

  describe('getMultipleAccounts', () => {
    it('should return array of buffers', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      const data1 = Buffer.from([1, 2]);
      const data2 = Buffer.from([3, 4]);

      jest.spyOn(conn, 'getMultipleAccountsInfo').mockResolvedValue([
        { data: data1, executable: false, lamports: 1000000, owner: PublicKey.default, rentEpoch: 0 } as any,
        { data: data2, executable: false, lamports: 1000000, owner: PublicKey.default, rentEpoch: 0 } as any,
      ]);

      const result = await client.getMultipleAccounts([PublicKey.default, PublicKey.default]);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(data1);
      expect(result[1]).toEqual(data2);
    });

    it('should return null for missing accounts', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();

      jest.spyOn(conn, 'getMultipleAccountsInfo').mockResolvedValue([
        { data: Buffer.from([1]), executable: false, lamports: 1000000, owner: PublicKey.default, rentEpoch: 0 } as any,
        null,
      ]);

      const result = await client.getMultipleAccounts([PublicKey.default, PublicKey.default]);
      expect(result[0]).toEqual(Buffer.from([1]));
      expect(result[1]).toBeNull();
    });

    it('should throw RpcNetworkError on failure', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getMultipleAccountsInfo').mockRejectedValue(new Error('RPC error'));

      await expect(client.getMultipleAccounts([PublicKey.default])).rejects.toThrow(RpcNetworkError);
    });
  });

  describe('getProgramAccounts', () => {
    it('should return array of pubkey/data objects', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      const pubkey = PublicKey.default;
      const data = Buffer.from([1, 2, 3]);

      jest.spyOn(conn, 'getProgramAccounts').mockResolvedValue([
        { pubkey, account: { data, executable: false, lamports: 1000000, owner: pubkey, rentEpoch: 0 } } as any,
      ]);

      const result = await client.getProgramAccounts(pubkey);
      expect(result).toHaveLength(1);
      expect(result[0].pubkey).toEqual(pubkey);
      expect(result[0].data).toEqual(data);
    });

    it('should pass filters to connection', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      const spy = jest.spyOn(conn, 'getProgramAccounts').mockResolvedValue([]);

      const filters = [{ dataSize: 100 }];
      await client.getProgramAccounts(PublicKey.default, filters);

      expect(spy).toHaveBeenCalledWith(PublicKey.default, { filters });
    });

    it('should use empty array when no filters provided', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      const spy = jest.spyOn(conn, 'getProgramAccounts').mockResolvedValue([]);

      await client.getProgramAccounts(PublicKey.default);

      expect(spy).toHaveBeenCalledWith(PublicKey.default, { filters: [] });
    });

    it('should throw RpcNetworkError on failure', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getProgramAccounts').mockRejectedValue(new Error('RPC error'));

      await expect(client.getProgramAccounts(PublicKey.default)).rejects.toThrow(RpcNetworkError);
    });
  });

  describe('getProgramAccountsWithMemcmp', () => {
    it('should delegate to getProgramAccounts with memcmp filter', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      const spy = jest.spyOn(conn, 'getProgramAccounts').mockResolvedValue([]);

      await client.getProgramAccountsWithMemcmp(PublicKey.default, 8, 'abc123');

      expect(spy).toHaveBeenCalledWith(PublicKey.default, {
        filters: [{ memcmp: { offset: 8, bytes: 'abc123' } }],
      });
    });
  });

  describe('getProgramAccountsBySize', () => {
    it('should delegate to getProgramAccounts with dataSize filter', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      const spy = jest.spyOn(conn, 'getProgramAccounts').mockResolvedValue([]);

      await client.getProgramAccountsBySize(PublicKey.default, 256);

      expect(spy).toHaveBeenCalledWith(PublicKey.default, {
        filters: [{ dataSize: 256 }],
      });
    });
  });

  describe('getAccountInfo', () => {
    it('should return account info when account exists', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      const mockInfo = {
        data: Buffer.from([1, 2, 3]),
        executable: false,
        lamports: 1000000,
        owner: PublicKey.default,
        rentEpoch: 0,
      };

      jest.spyOn(conn, 'getAccountInfo').mockResolvedValue(mockInfo as any);

      const result = await client.getAccountInfo(PublicKey.default);
      expect(result).toEqual(mockInfo);
    });

    it('should return null when account not found', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getAccountInfo').mockResolvedValue(null);

      const result = await client.getAccountInfo(PublicKey.default);
      expect(result).toBeNull();
    });

    it('should return null for "account not found" errors', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getAccountInfo').mockRejectedValue(new Error('account not found'));

      const result = await client.getAccountInfo(PublicKey.default);
      expect(result).toBeNull();
    });

    it('should throw RpcNetworkError for network errors', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getAccountInfo').mockRejectedValue(new Error('Network error'));

      await expect(client.getAccountInfo(PublicKey.default)).rejects.toThrow(RpcNetworkError);
    });
  });

  describe('accountExists', () => {
    it('should return true when account exists', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getAccountInfo').mockResolvedValue({
        data: Buffer.from([1]),
        executable: false,
        lamports: 1000,
        owner: PublicKey.default,
        rentEpoch: 0,
      } as any);

      const result = await client.accountExists(PublicKey.default);
      expect(result).toBe(true);
    });

    it('should return false when account does not exist', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getAccountInfo').mockResolvedValue(null);

      const result = await client.accountExists(PublicKey.default);
      expect(result).toBe(false);
    });
  });

  describe('getSlot', () => {
    it('should return current slot', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getSlot').mockResolvedValue(12345);

      const result = await client.getSlot();
      expect(result).toBe(12345);
    });
  });

  describe('getBlockTime', () => {
    it('should return block time for a slot', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getBlockTime').mockResolvedValue(1700000000);

      const result = await client.getBlockTime(12345);
      expect(result).toBe(1700000000);
    });

    it('should return null when block time unavailable', async () => {
      const client = new SolanaClient({ rpcUrl: 'https://custom.example.com' });
      const conn = client.getConnection();
      jest.spyOn(conn, 'getBlockTime').mockResolvedValue(null);

      const result = await client.getBlockTime(12345);
      expect(result).toBeNull();
    });
  });
});

describe('createDevnetClient', () => {
  it('should create a client with devnet cluster', () => {
    const client = createDevnetClient();
    expect(client.cluster).toBe('devnet');
    expect(client.rpcUrl).toBe(SOLANA_DEVNET_RPC);
    expect(client.isDefaultDevnetRpc).toBe(true);
  });

  it('should accept custom RPC URL', () => {
    const customUrl = 'https://my-rpc.example.com';
    const client = createDevnetClient(customUrl);
    expect(client.cluster).toBe('devnet');
    expect(client.rpcUrl).toBe(customUrl);
    expect(client.isDefaultDevnetRpc).toBe(false);
  });
});

describe('SOLANA_DEVNET_RPC', () => {
  it('should be the standard devnet URL', () => {
    expect(SOLANA_DEVNET_RPC).toBe('https://api.devnet.solana.com');
  });
});

describe('cluster default RPC constants', () => {
  it('should expose testnet/default URLs', () => {
    expect(SOLANA_TESTNET_RPC).toBe('https://api.testnet.solana.com');
    expect(SOLANA_MAINNET_RPC).toBe('https://api.mainnet-beta.solana.com');
    expect(SOLANA_LOCALNET_RPC).toBe('http://127.0.0.1:8899');
  });
});

describe('RECOMMENDED_RPC_PROVIDERS', () => {
  it('should contain at least one provider', () => {
    expect(RECOMMENDED_RPC_PROVIDERS.length).toBeGreaterThan(0);
  });

  it('should contain known providers', () => {
    const text = RECOMMENDED_RPC_PROVIDERS.join(' ');
    expect(text).toContain('Helius');
  });
});
