/**
 * Solana SDK for Agent0 - ERC-8004 implementation
 * Provides read-only access to Solana-based agent registries
 */

import { PublicKey } from '@solana/web3.js';
import { SolanaClient, Cluster, createDevnetClient, createMainnetClient } from './solana-client.js';
import { SolanaFeedbackManager } from './solana-feedback-manager.js';
import type { IPFSClient } from './ipfs-client.js';
import type { ArweaveClient } from './arweave-client.js';
import { StorageClient } from './storage-client.js';
import { PDAHelpers } from './pda-helpers.js';
import { getProgramIds } from './programs.js';
import { AgentAccount } from '../models/borsh-schemas.js';

export interface SolanaSDKConfig {
  cluster: Cluster;
  rpcUrl?: string;
  // Storage configuration
  ipfsClient?: IPFSClient;
  arweaveClient?: ArweaveClient;
  defaultStorage?: 'ipfs' | 'arweave';
}

/**
 * Main SDK class for Solana ERC-8004 implementation
 * Provides read-only access to agent registries on Solana
 */
export class SolanaSDK {
  private readonly client: SolanaClient;
  private readonly feedbackManager: SolanaFeedbackManager;
  private readonly storageClient?: StorageClient;
  private readonly cluster: Cluster;
  private readonly programIds: ReturnType<typeof getProgramIds>;

  constructor(config: SolanaSDKConfig) {
    this.cluster = config.cluster;
    this.programIds = getProgramIds(config.cluster);

    // Initialize Solana client
    if (config.rpcUrl) {
      this.client = new SolanaClient({
        cluster: config.cluster,
        rpcUrl: config.rpcUrl,
      });
    } else {
      // Use default RPC URLs
      this.client =
        config.cluster === 'mainnet-beta'
          ? createMainnetClient()
          : createDevnetClient();
    }

    // Initialize storage client if providers configured
    if (config.ipfsClient || config.arweaveClient) {
      this.storageClient = new StorageClient(
        config.ipfsClient,
        config.arweaveClient,
        config.defaultStorage || 'ipfs'
      );
    }

    // Initialize feedback manager
    this.feedbackManager = new SolanaFeedbackManager(this.client, config.ipfsClient);
  }

  // ==================== Agent Methods ====================

  /**
   * Load agent by ID
   * @param agentId - Agent ID (bigint)
   * @returns Agent account data or null if not found
   */
  async loadAgent(agentId: bigint): Promise<AgentAccount | null> {
    try {
      const [agentPDA] = await PDAHelpers.getAgentPDA(agentId);
      const data = await this.client.getAccount(agentPDA);

      if (!data) {
        return null;
      }

      return AgentAccount.deserialize(data);
    } catch (error) {
      console.error(`Error loading agent ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Get agent by owner
   * @param owner - Owner public key
   * @returns Array of agent accounts owned by this address
   */
  async getAgentsByOwner(owner: PublicKey): Promise<AgentAccount[]> {
    try {
      const programId = this.programIds.identityRegistry;

      // Fetch all agent accounts
      const accounts = await this.client.getProgramAccounts(programId, [
        {
          dataSize: 297, // AgentAccount size
        },
      ]);

      // Filter by owner and deserialize
      const agents = accounts
        .map((acc) => AgentAccount.deserialize(acc.data))
        .filter((agent) => agent.getOwnerPublicKey().equals(owner));

      return agents;
    } catch (error) {
      console.error(`Error getting agents for owner ${owner.toBase58()}:`, error);
      return [];
    }
  }

  /**
   * Check if agent exists
   * @param agentId - Agent ID
   * @returns True if agent exists
   */
  async agentExists(agentId: bigint): Promise<boolean> {
    const agent = await this.loadAgent(agentId);
    return agent !== null;
  }

  // ==================== Reputation Methods (6 ERC-8004 Read Functions) ====================

  /**
   * 1. Get agent reputation summary
   * @param agentId - Agent ID
   * @param minScore - Optional minimum score filter
   * @param clientFilter - Optional client filter
   * @returns Reputation summary with average score and total feedbacks
   */
  async getSummary(agentId: bigint, minScore?: number, clientFilter?: PublicKey) {
    return await this.feedbackManager.getSummary(agentId, minScore, clientFilter);
  }

  /**
   * 2. Read single feedback
   * @param agentId - Agent ID
   * @param client - Client public key
   * @param feedbackIndex - Feedback index
   * @returns Feedback object or null
   */
  async readFeedback(agentId: bigint, client: PublicKey, feedbackIndex: bigint) {
    return await this.feedbackManager.readFeedback(agentId, client, feedbackIndex);
  }

  /**
   * 3. Read all feedbacks for an agent
   * @param agentId - Agent ID
   * @param includeRevoked - Include revoked feedbacks
   * @returns Array of feedback objects
   */
  async readAllFeedback(agentId: bigint, includeRevoked: boolean = false) {
    return await this.feedbackManager.readAllFeedback(agentId, includeRevoked);
  }

  /**
   * 4. Get last feedback index for a client
   * @param agentId - Agent ID
   * @param client - Client public key
   * @returns Last feedback index
   */
  async getLastIndex(agentId: bigint, client: PublicKey) {
    return await this.feedbackManager.getLastIndex(agentId, client);
  }

  /**
   * 5. Get all clients who gave feedback
   * @param agentId - Agent ID
   * @returns Array of client public keys
   */
  async getClients(agentId: bigint) {
    return await this.feedbackManager.getClients(agentId);
  }

  /**
   * 6. Get response count for a feedback
   * @param agentId - Agent ID
   * @param client - Client public key
   * @param feedbackIndex - Feedback index
   * @returns Number of responses
   */
  async getResponseCount(agentId: bigint, client: PublicKey, feedbackIndex: bigint) {
    return await this.feedbackManager.getResponseCount(agentId, client, feedbackIndex);
  }

  /**
   * Bonus: Read all responses for a feedback
   * @param agentId - Agent ID
   * @param client - Client public key
   * @param feedbackIndex - Feedback index
   * @returns Array of response objects
   */
  async readResponses(agentId: bigint, client: PublicKey, feedbackIndex: bigint) {
    return await this.feedbackManager.readResponses(agentId, client, feedbackIndex);
  }

  // ==================== Storage Methods ====================

  /**
   * Upload data to configured storage
   * @param data - Data to upload
   * @returns Storage URI (ipfs:// or ar://)
   */
  async uploadToStorage(data: string | Buffer): Promise<string> {
    if (!this.storageClient) {
      throw new Error('No storage client configured');
    }
    return await this.storageClient.upload(data);
  }

  /**
   * Upload JSON to configured storage
   * @param obj - Object to upload
   * @returns Storage URI
   */
  async uploadJSON(obj: any): Promise<string> {
    if (!this.storageClient) {
      throw new Error('No storage client configured');
    }
    return await this.storageClient.uploadJSON(obj);
  }

  /**
   * Download data from storage
   * @param uri - Storage URI (ipfs:// or ar://)
   * @returns Downloaded data
   */
  async downloadFromStorage(uri: string): Promise<string> {
    if (!this.storageClient) {
      throw new Error('No storage client configured');
    }
    return await this.storageClient.download(uri);
  }

  /**
   * Download and parse JSON from storage
   * @param uri - Storage URI
   * @returns Parsed JSON object
   */
  async downloadJSON(uri: string): Promise<any> {
    if (!this.storageClient) {
      throw new Error('No storage client configured');
    }
    return await this.storageClient.downloadJSON(uri);
  }

  // ==================== Utility Methods ====================

  /**
   * Get current cluster
   */
  getCluster(): Cluster {
    return this.cluster;
  }

  /**
   * Get program IDs for current cluster
   */
  getProgramIds() {
    return this.programIds;
  }

  /**
   * Get Solana client for advanced usage
   */
  getSolanaClient(): SolanaClient {
    return this.client;
  }

  /**
   * Get feedback manager for advanced usage
   */
  getFeedbackManager(): SolanaFeedbackManager {
    return this.feedbackManager;
  }

  /**
   * Get storage client for advanced usage
   */
  getStorageClient(): StorageClient | undefined {
    return this.storageClient;
  }
}

/**
 * Create SDK instance for Solana devnet
 */
export function createDevnetSDK(config?: Omit<SolanaSDKConfig, 'cluster'>): SolanaSDK {
  return new SolanaSDK({
    cluster: 'devnet',
    ...config,
  });
}

/**
 * Create SDK instance for Solana mainnet
 */
export function createMainnetSDK(config?: Omit<SolanaSDKConfig, 'cluster'>): SolanaSDK {
  return new SolanaSDK({
    cluster: 'mainnet-beta',
    ...config,
  });
}

/**
 * Create SDK instance for localnet
 */
export function createLocalnetSDK(config?: Omit<SolanaSDKConfig, 'cluster'>): SolanaSDK {
  return new SolanaSDK({
    cluster: 'localnet',
    rpcUrl: config?.rpcUrl || 'http://localhost:8899',
    ...config,
  });
}
