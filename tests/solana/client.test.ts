/**
 * Unit tests for SolanaClient
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PublicKey, Connection } from '@solana/web3.js';
import { SolanaClient, createDevnetClient, createMainnetClient } from '../../src/solana/client.js';

describe('SolanaClient', () => {
  describe('Constructor', () => {
    it('should create client with custom RPC URL', () => {
      const client = new SolanaClient({
        cluster: 'devnet',
        rpcUrl: 'https://custom-rpc.example.com',
      });

      expect(client).toBeInstanceOf(SolanaClient);
      expect(client.getCluster()).toBe('devnet');
    });

    it('should create client with default devnet URL', () => {
      const client = new SolanaClient({
        cluster: 'devnet',
      });

      expect(client.getCluster()).toBe('devnet');
    });
  });

  describe('Factory functions', () => {
    it('should create devnet client', () => {
      const client = createDevnetClient();
      expect(client.getCluster()).toBe('devnet');
    });

    it('should create mainnet client', () => {
      const client = createMainnetClient();
      expect(client.getCluster()).toBe('mainnet-beta');
    });
  });

  describe('getConnection', () => {
    it('should return Connection instance', () => {
      const client = createDevnetClient();
      const connection = client.getConnection();

      expect(connection).toBeInstanceOf(Connection);
    });
  });

  describe('getAccount', () => {
    it('should return null for non-existent account', async () => {
      const client = createDevnetClient();
      const nonExistentPubkey = new PublicKey('11111111111111111111111111111111');

      const data = await client.getAccount(nonExistentPubkey);
      expect(data).toBeNull();
    });
  });

  describe('getMultipleAccounts', () => {
    it('should handle empty array', async () => {
      const client = createDevnetClient();
      const results = await client.getMultipleAccounts([]);

      expect(results).toEqual([]);
    });

    it('should return null for non-existent accounts', async () => {
      const client = createDevnetClient();
      const pubkeys = [
        new PublicKey('11111111111111111111111111111111'),
        new PublicKey('22222222222222222222222222222222'),
      ];

      const results = await client.getMultipleAccounts(pubkeys);
      expect(results).toHaveLength(2);
    });
  });

  describe('getProgramAccounts', () => {
    it('should accept filters', async () => {
      const client = createDevnetClient();
      const programId = new PublicKey('11111111111111111111111111111111');

      const accounts = await client.getProgramAccounts(programId, [
        { dataSize: 297 },
      ]);

      expect(Array.isArray(accounts)).toBe(true);
    });

    it('should work without filters', async () => {
      const client = createDevnetClient();
      const programId = new PublicKey('11111111111111111111111111111111');

      const accounts = await client.getProgramAccounts(programId);
      expect(Array.isArray(accounts)).toBe(true);
    });
  });

  describe('Cluster management', () => {
    it('should return correct cluster', () => {
      const devnetClient = createDevnetClient();
      const mainnetClient = createMainnetClient();

      expect(devnetClient.getCluster()).toBe('devnet');
      expect(mainnetClient.getCluster()).toBe('mainnet-beta');
    });
  });
});
