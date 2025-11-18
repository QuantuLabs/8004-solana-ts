/**
 * Arweave client for permanent decentralized storage
 * Supports Solana integration for ERC-8004 SDK
 */

import { TIMEOUTS } from '../utils/constants.js';

export interface ArweaveClientConfig {
  host?: string; // Arweave gateway (default: arweave.net)
  protocol?: string; // http or https (default: https)
  port?: number; // Port (default: 443)
  walletKey?: any; // Arweave JWK wallet for uploads (optional for read-only)
}

/**
 * Client for Arweave operations
 * Provides permanent storage as alternative to IPFS
 */
export class ArweaveClient {
  private config: ArweaveClientConfig;
  private arweave: any; // Arweave instance (lazy loaded)

  constructor(config: ArweaveClientConfig = {}) {
    this.config = {
      host: config.host || 'arweave.net',
      protocol: config.protocol || 'https',
      port: config.port || 443,
      walletKey: config.walletKey,
    };
  }

  /**
   * Initialize Arweave client (lazy, only when needed)
   */
  private async _ensureClient(): Promise<void> {
    if (!this.arweave) {
      const Arweave = await import('arweave');
      this.arweave = Arweave.default.init({
        host: this.config.host,
        protocol: this.config.protocol,
        port: this.config.port,
      });
    }
  }

  /**
   * Upload data to Arweave
   * @param data - Data to upload (string or Buffer)
   * @returns Transaction ID (ar://<txId>)
   */
  async upload(data: string | Buffer): Promise<string> {
    await this._ensureClient();

    if (!this.config.walletKey) {
      throw new Error('Arweave wallet key required for uploads');
    }

    try {
      const dataString = typeof data === 'string' ? data : data.toString('utf8');

      // Create transaction
      const transaction = await this.arweave.createTransaction(
        {
          data: dataString,
        },
        this.config.walletKey
      );

      // Add tags for metadata
      transaction.addTag('Content-Type', 'application/json');
      transaction.addTag('Application', 'agent0-sdk');
      transaction.addTag('Version', '1.0');

      // Sign transaction
      await this.arweave.transactions.sign(transaction, this.config.walletKey);

      // Post transaction
      const response = await this.arweave.transactions.post(transaction);

      if (response.status !== 200) {
        throw new Error(`Failed to upload to Arweave: HTTP ${response.status}`);
      }

      // Return ar:// URI
      return `ar://${transaction.id}`;
    } catch (error) {
      console.error('Error uploading to Arweave:', error);
      throw error;
    }
  }

  /**
   * Download data from Arweave
   * @param uri - Arweave URI (ar://<txId>) or transaction ID
   * @returns Downloaded data as string
   */
  async download(uri: string): Promise<string> {
    await this._ensureClient();

    try {
      // Extract transaction ID from URI
      const txId = uri.startsWith('ar://') ? uri.slice(5) : uri;

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.IPFS_FETCH || 30000);

      // Fetch data from gateway
      const url = `${this.config.protocol}://${this.config.host}:${this.config.port}/${txId}`;
      const response = await fetch(url, { signal: controller.signal });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to download from Arweave: HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      console.error(`Error downloading from Arweave (${uri}):`, error);
      throw error;
    }
  }

  /**
   * Get transaction status
   * @param txId - Transaction ID
   * @returns Transaction status object
   */
  async getStatus(txId: string): Promise<any> {
    await this._ensureClient();

    try {
      const status = await this.arweave.transactions.getStatus(txId);
      return status;
    } catch (error) {
      console.error(`Error getting Arweave transaction status for ${txId}:`, error);
      throw error;
    }
  }

  /**
   * Get wallet balance in AR
   * @param address - Arweave wallet address
   * @returns Balance in winston (smallest unit, divide by 1e12 for AR)
   */
  async getBalance(address: string): Promise<string> {
    await this._ensureClient();

    try {
      const winston = await this.arweave.wallets.getBalance(address);
      return winston;
    } catch (error) {
      console.error(`Error getting balance for ${address}:`, error);
      throw error;
    }
  }

  /**
   * Convert winston to AR
   * @param winston - Amount in winston
   * @returns Amount in AR
   */
  winstonToAr(winston: string): string {
    return (BigInt(winston) / BigInt(1e12)).toString();
  }

  /**
   * Convert AR to winston
   * @param ar - Amount in AR
   * @returns Amount in winston
   */
  arToWinston(ar: string): string {
    return (parseFloat(ar) * 1e12).toString();
  }
}

/**
 * Create Arweave client with default mainnet config
 */
export function createArweaveClient(walletKey?: any): ArweaveClient {
  return new ArweaveClient({ walletKey });
}

/**
 * Create Arweave client for testnet
 */
export function createArweaveTestnetClient(walletKey?: any): ArweaveClient {
  return new ArweaveClient({
    host: 'testnet.redstone.tools',
    protocol: 'https',
    port: 443,
    walletKey,
  });
}
