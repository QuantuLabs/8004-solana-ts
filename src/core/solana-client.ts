/**
 * Solana RPC client wrapper
 * Provides lightweight interface for querying Solana accounts
 * No Anchor dependency - uses @solana/web3.js only
 */

import {
  Connection,
  PublicKey,
  GetProgramAccountsFilter,
  AccountInfo,
  Commitment,
} from '@solana/web3.js';

export type Cluster = 'devnet' | 'mainnet-beta' | 'testnet' | 'localnet';

export interface SolanaClientConfig {
  cluster: Cluster;
  rpcUrl?: string;
  commitment?: Commitment;
}

/**
 * Lightweight Solana client for ERC-8004 read operations
 * Avoids Anchor dependency for smaller package size
 */
export class SolanaClient {
  private connection: Connection;
  public readonly cluster: Cluster;

  constructor(config: SolanaClientConfig) {
    this.cluster = config.cluster;
    const rpcUrl = config.rpcUrl || this.getDefaultRpcUrl(config.cluster);
    this.connection = new Connection(rpcUrl, config.commitment || 'confirmed');
  }

  /**
   * Get default RPC URL for cluster
   */
  private getDefaultRpcUrl(cluster: Cluster): string {
    switch (cluster) {
      case 'mainnet-beta':
        return 'https://api.mainnet-beta.solana.com';
      case 'devnet':
        return 'https://api.devnet.solana.com';
      case 'testnet':
        return 'https://api.testnet.solana.com';
      case 'localnet':
        return 'http://localhost:8899';
    }
  }

  /**
   * Get single account data
   * Returns null if account doesn't exist
   */
  async getAccount(address: PublicKey): Promise<Buffer | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(address);
      return accountInfo?.data ?? null;
    } catch (error) {
      console.error(`Error fetching account ${address.toBase58()}:`, error);
      return null;
    }
  }

  /**
   * Get multiple accounts in a single RPC call
   * More efficient than individual getAccount calls
   */
  async getMultipleAccounts(addresses: PublicKey[]): Promise<(Buffer | null)[]> {
    try {
      const accounts = await this.connection.getMultipleAccountsInfo(addresses);
      return accounts.map((acc) => acc?.data ?? null);
    } catch (error) {
      console.error('Error fetching multiple accounts:', error);
      return addresses.map(() => null);
    }
  }

  /**
   * Get all program accounts with optional filters
   * Used for queries like "get all feedbacks for agent X"
   */
  async getProgramAccounts(
    programId: PublicKey,
    filters?: GetProgramAccountsFilter[]
  ): Promise<{ pubkey: PublicKey; data: Buffer }[]> {
    try {
      const accounts = await this.connection.getProgramAccounts(programId, {
        filters: filters ?? [],
      });

      return accounts.map((acc) => ({
        pubkey: acc.pubkey,
        data: acc.account.data,
      }));
    } catch (error) {
      console.error(`Error fetching program accounts for ${programId.toBase58()}:`, error);
      return [];
    }
  }

  /**
   * Get all program accounts with memcmp filter
   * More convenient for common pattern of filtering by offset/bytes
   */
  async getProgramAccountsWithMemcmp(
    programId: PublicKey,
    offset: number,
    bytes: string
  ): Promise<{ pubkey: PublicKey; data: Buffer }[]> {
    return this.getProgramAccounts(programId, [
      {
        memcmp: {
          offset,
          bytes,
        },
      },
    ]);
  }

  /**
   * Get all program accounts with dataSize filter
   * Useful for filtering by account type
   */
  async getProgramAccountsBySize(
    programId: PublicKey,
    dataSize: number
  ): Promise<{ pubkey: PublicKey; data: Buffer }[]> {
    return this.getProgramAccounts(programId, [
      {
        dataSize,
      },
    ]);
  }

  /**
   * Get account info with full metadata
   */
  async getAccountInfo(address: PublicKey): Promise<AccountInfo<Buffer> | null> {
    try {
      return await this.connection.getAccountInfo(address);
    } catch (error) {
      console.error(`Error fetching account info for ${address.toBase58()}:`, error);
      return null;
    }
  }

  /**
   * Check if account exists
   */
  async accountExists(address: PublicKey): Promise<boolean> {
    const accountInfo = await this.getAccountInfo(address);
    return accountInfo !== null;
  }

  /**
   * Get raw Connection for advanced usage
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get current slot
   */
  async getSlot(): Promise<number> {
    return await this.connection.getSlot();
  }

  /**
   * Get block time for a slot
   */
  async getBlockTime(slot: number): Promise<number | null> {
    return await this.connection.getBlockTime(slot);
  }
}

/**
 * Create a Solana client for devnet
 */
export function createDevnetClient(rpcUrl?: string): SolanaClient {
  return new SolanaClient({
    cluster: 'devnet',
    rpcUrl,
    commitment: 'confirmed',
  });
}

/**
 * Create a Solana client for mainnet
 */
export function createMainnetClient(rpcUrl?: string): SolanaClient {
  return new SolanaClient({
    cluster: 'mainnet-beta',
    rpcUrl,
    commitment: 'confirmed',
  });
}

/**
 * Create a Solana client for localnet
 */
export function createLocalnetClient(rpcUrl?: string): SolanaClient {
  return new SolanaClient({
    cluster: 'localnet',
    rpcUrl: rpcUrl || 'http://localhost:8899',
    commitment: 'confirmed',
  });
}
