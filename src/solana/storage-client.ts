/**
 * Unified storage client supporting both IPFS and Arweave
 * Provides a common interface for decentralized storage
 */

import type { IPFSClient } from './ipfs-client.js';
import type { ArweaveClient } from './arweave-client.js';

export type StorageProvider = 'ipfs' | 'arweave';

/**
 * Unified storage adapter interface
 */
export interface StorageAdapter {
  upload(data: string | Buffer): Promise<string>;
  download(uri: string): Promise<string>;
}

/**
 * IPFS storage adapter
 */
export class IPFSStorageAdapter implements StorageAdapter {
  constructor(private ipfsClient: IPFSClient) {}

  async upload(data: string | Buffer): Promise<string> {
    const dataString = typeof data === 'string' ? data : data.toString('utf8');
    return await this.ipfsClient.pin(dataString);
  }

  async download(uri: string): Promise<string> {
    return await this.ipfsClient.cat(uri);
  }
}

/**
 * Arweave storage adapter
 */
export class ArweaveStorageAdapter implements StorageAdapter {
  constructor(private arweaveClient: ArweaveClient) {}

  async upload(data: string | Buffer): Promise<string> {
    return await this.arweaveClient.upload(data);
  }

  async download(uri: string): Promise<string> {
    return await this.arweaveClient.download(uri);
  }
}

/**
 * Unified storage client
 * Automatically routes to appropriate provider based on URI
 */
export class StorageClient {
  private adapters: Map<StorageProvider, StorageAdapter> = new Map();
  private defaultProvider: StorageProvider;

  constructor(
    ipfsClient?: IPFSClient,
    arweaveClient?: ArweaveClient,
    defaultProvider: StorageProvider = 'ipfs'
  ) {
    if (ipfsClient) {
      this.adapters.set('ipfs', new IPFSStorageAdapter(ipfsClient));
    }

    if (arweaveClient) {
      this.adapters.set('arweave', new ArweaveStorageAdapter(arweaveClient));
    }

    // Validate default provider exists
    if (!this.adapters.has(defaultProvider)) {
      if (ipfsClient) {
        this.defaultProvider = 'ipfs';
      } else if (arweaveClient) {
        this.defaultProvider = 'arweave';
      } else {
        throw new Error('At least one storage provider (IPFS or Arweave) must be configured');
      }
    } else {
      this.defaultProvider = defaultProvider;
    }
  }

  /**
   * Upload data using default provider
   * @param data - Data to upload
   * @returns URI (ipfs://<cid> or ar://<txId>)
   */
  async upload(data: string | Buffer): Promise<string> {
    const adapter = this.adapters.get(this.defaultProvider);
    if (!adapter) {
      throw new Error(`Default storage provider ${this.defaultProvider} not configured`);
    }

    return await adapter.upload(data);
  }

  /**
   * Upload to specific provider
   * @param data - Data to upload
   * @param provider - Storage provider to use
   * @returns URI
   */
  async uploadTo(data: string | Buffer, provider: StorageProvider): Promise<string> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Storage provider ${provider} not configured`);
    }

    return await adapter.upload(data);
  }

  /**
   * Download data (automatically detects provider from URI)
   * @param uri - Storage URI (ipfs://<cid> or ar://<txId>)
   * @returns Downloaded data
   */
  async download(uri: string): Promise<string> {
    const provider = this.detectProvider(uri);
    const adapter = this.adapters.get(provider);

    if (!adapter) {
      throw new Error(
        `Storage provider ${provider} not configured but URI ${uri} requires it`
      );
    }

    return await adapter.download(uri);
  }

  /**
   * Detect storage provider from URI
   * @param uri - Storage URI
   * @returns Detected provider
   */
  private detectProvider(uri: string): StorageProvider {
    if (uri.startsWith('ipfs://') || uri.startsWith('Qm') || uri.startsWith('/ipfs/')) {
      return 'ipfs';
    } else if (uri.startsWith('ar://')) {
      return 'arweave';
    } else {
      // Default to IPFS for unknown URIs
      return 'ipfs';
    }
  }

  /**
   * Upload JSON object
   * @param obj - JavaScript object to upload
   * @returns URI
   */
  async uploadJSON(obj: any): Promise<string> {
    const json = JSON.stringify(obj, null, 2);
    return await this.upload(json);
  }

  /**
   * Upload JSON to specific provider
   * @param obj - JavaScript object to upload
   * @param provider - Storage provider
   * @returns URI
   */
  async uploadJSONTo(obj: any, provider: StorageProvider): Promise<string> {
    const json = JSON.stringify(obj, null, 2);
    return await this.uploadTo(json, provider);
  }

  /**
   * Download and parse JSON
   * @param uri - Storage URI
   * @returns Parsed JSON object
   */
  async downloadJSON(uri: string): Promise<any> {
    const data = await this.download(uri);
    return JSON.parse(data);
  }

  /**
   * Check if a provider is configured
   * @param provider - Storage provider
   * @returns True if configured
   */
  hasProvider(provider: StorageProvider): boolean {
    return this.adapters.has(provider);
  }

  /**
   * Get default provider
   */
  getDefaultProvider(): StorageProvider {
    return this.defaultProvider;
  }

  /**
   * Set default provider
   * @param provider - Storage provider
   */
  setDefaultProvider(provider: StorageProvider): void {
    if (!this.adapters.has(provider)) {
      throw new Error(`Cannot set default to unconfigured provider: ${provider}`);
    }
    this.defaultProvider = provider;
  }
}

/**
 * Create storage client with IPFS only
 */
export function createIPFSStorageClient(ipfsClient: IPFSClient): StorageClient {
  return new StorageClient(ipfsClient, undefined, 'ipfs');
}

/**
 * Create storage client with Arweave only
 */
export function createArweaveStorageClient(arweaveClient: ArweaveClient): StorageClient {
  return new StorageClient(undefined, arweaveClient, 'arweave');
}

/**
 * Create storage client with both IPFS and Arweave
 */
export function createDualStorageClient(
  ipfsClient: IPFSClient,
  arweaveClient: ArweaveClient,
  defaultProvider: StorageProvider = 'ipfs'
): StorageClient {
  return new StorageClient(ipfsClient, arweaveClient, defaultProvider);
}
