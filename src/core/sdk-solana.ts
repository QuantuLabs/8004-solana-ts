/**
 * Solana SDK for Agent0 - ERC-8004 implementation
 * Provides read and write access to Solana-based agent registries
 */

import { PublicKey, Keypair } from '@solana/web3.js';
import { SolanaClient, Cluster, createDevnetClient } from './client.js';
import { SolanaFeedbackManager } from './feedback-manager-solana.js';
import type { IPFSClient } from './ipfs-client.js';
import { PDAHelpers } from './pda-helpers.js';
import { getProgramIds } from './programs.js';
import { AgentAccount } from './borsh-schemas.js';
import {
  IdentityTransactionBuilder,
  ReputationTransactionBuilder,
  ValidationTransactionBuilder,
} from './transaction-builder.js';
import { AgentMintResolver } from './agent-mint-resolver.js';
import { fetchRegistryConfig } from './config-reader.js';

export interface SolanaSDKConfig {
  cluster?: Cluster;
  rpcUrl?: string;
  // Signer for write operations (optional - read-only if not provided)
  signer?: Keypair;
  // Storage configuration
  ipfsClient?: IPFSClient;

}

/**
 * Main SDK class for Solana ERC-8004 implementation
 * Provides read and write access to agent registries on Solana
 */
export class SolanaSDK {
  private readonly client: SolanaClient;
  private readonly feedbackManager: SolanaFeedbackManager;
  private readonly cluster: Cluster;
  private readonly programIds: ReturnType<typeof getProgramIds>;
  private readonly signer?: Keypair;
  private readonly identityTxBuilder?: IdentityTransactionBuilder;
  private readonly reputationTxBuilder?: ReputationTransactionBuilder;
  private readonly validationTxBuilder?: ValidationTransactionBuilder;
  private mintResolver?: AgentMintResolver;
  private collectionMint?: PublicKey;

  constructor(config: SolanaSDKConfig) {
    this.cluster = config.cluster || 'devnet';
    this.programIds = getProgramIds();
    this.signer = config.signer;

    // Initialize Solana client (devnet only)
    this.client = config.rpcUrl
      ? new SolanaClient({
          cluster: this.cluster,
          rpcUrl: config.rpcUrl,
        })
      : createDevnetClient();

    // Initialize feedback manager
    this.feedbackManager = new SolanaFeedbackManager(this.client, config.ipfsClient);

    // Initialize transaction builders if signer provided (write operations)
    if (this.signer) {
      const connection = this.client.getConnection();
      this.identityTxBuilder = new IdentityTransactionBuilder(
        connection,
        this.cluster,
        this.signer
      );
      this.reputationTxBuilder = new ReputationTransactionBuilder(
        connection,
        this.cluster,
        this.signer
      );
      this.validationTxBuilder = new ValidationTransactionBuilder(
        connection,
        this.cluster,
        this.signer
      );
    }

    // Initialize mint resolver (lazy - will be created on first use)
    // This avoids blocking the constructor with async operations
  }

  /**
   * Initialize the agent mint resolver (lazy initialization)
   * Fetches registry config and creates resolver
   */
  private async initializeMintResolver(): Promise<void> {
    if (this.mintResolver) {
      return; // Already initialized
    }

    try {
      const connection = this.client.getConnection();
      const configData = await fetchRegistryConfig(connection);

      if (!configData) {
        throw new Error('Registry config not found. Registry may not be initialized.');
      }

      this.collectionMint = configData.getCollectionMintPublicKey();
      this.mintResolver = new AgentMintResolver(connection, this.collectionMint);
    } catch (error) {
      throw new Error(`Failed to initialize agent mint resolver: ${error}`);
    }
  }

  // ==================== Agent Methods ====================

  /**
   * Load agent by ID
   * @param agentId - Agent ID (number or bigint)
   * @returns Agent account data or null if not found
   */
  async loadAgent(agentId: number | bigint): Promise<AgentAccount | null> {
    try {
      // Convert to bigint if needed
      const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;

      // Initialize resolver if needed
      await this.initializeMintResolver();

      // Resolve agentId → mint via NFT metadata
      const agentMint = await this.mintResolver!.resolve(id);

      // Derive PDA from mint
      const [agentPDA] = await PDAHelpers.getAgentPDA(agentMint);

      // Fetch account data
      const data = await this.client.getAccount(agentPDA);

      if (!data) {
        return null;
      }

      const agentAccount = AgentAccount.deserialize(data);

      // Load MetadataExtension PDAs (try getProgramAccounts first, fallback to sequential)
      const extendedMetadata = await this.loadMetadataExtensions(id, agentMint);

      // Merge inline + extended metadata
      if (extendedMetadata.length > 0) {
        agentAccount.metadata = [...agentAccount.metadata, ...extendedMetadata];
      }

      return agentAccount;
    } catch (error) {
      console.error(`Error loading agent ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Private helper: Load metadata extensions for an agent
   * Uses getProgramAccounts with memcmp filter, falls back to sequential if not supported
   */
  private async loadMetadataExtensions(
    agentId: bigint,
    agentMint: PublicKey
  ): Promise<Array<{ key: string; value: Uint8Array }>> {
    const connection = this.client.getConnection();
    const programId = this.programIds.identityRegistry;

    try {
      // Try getProgramAccounts with memcmp filter (fast)
      // Filter by agent_id at offset 8 (after 8-byte discriminator)
      const agentIdBuffer = Buffer.alloc(8);
      agentIdBuffer.writeBigUInt64LE(agentId);

      const accounts = await connection.getProgramAccounts(programId, {
        filters: [
          { dataSize: 307 }, // MetadataExtensionAccount size
          {
            memcmp: {
              offset: 8, // Skip discriminator
              bytes: agentIdBuffer.toString('base64'),
            },
          },
        ],
      });

      // Parse and extract metadata from extensions
      const extensions: Array<{ key: string; value: Uint8Array }> = [];

      for (const account of accounts) {
        try {
          // MetadataExtensionAccount structure (from borsh-schemas.ts)
          // discriminator: 8 bytes (skipped)
          // agent_id: u64 (8 bytes)
          // key: [u8; 32] (32 bytes)
          // value: String (4 bytes length + data)
          // bump: u8 (1 byte)
          // created_at: u64 (8 bytes)

          const accountData = account.account.data;
          let offset = 8; // Skip discriminator

          // Skip agent_id (8 bytes)
          offset += 8;

          // Read key ([u8; 32])
          const keyBytes = accountData.slice(offset, offset + 32);
          offset += 32;
          const nullIndex = keyBytes.indexOf(0);
          const key = keyBytes.slice(0, nullIndex >= 0 ? nullIndex : 32).toString('utf8');

          // Read value (String = u32 length + bytes)
          const valueLen = accountData.readUInt32LE(offset);
          offset += 4;
          const value = accountData.slice(offset, offset + valueLen);

          extensions.push({ key, value });
        } catch (parseError) {
          console.warn('Failed to parse metadata extension:', parseError);
        }
      }

      return extensions;
    } catch (error) {
      // Fallback: sequential loading (slower but always works)
      console.warn('getProgramAccounts with memcmp failed, using sequential fallback:', error);

      const extensions: Array<{ key: string; value: Uint8Array }> = [];

      // Try indices 0-255 sequentially
      for (let i = 0; i < 256; i++) {
        try {
          const [extPDA] = await PDAHelpers.getMetadataExtensionPDA(agentMint, i);
          const extData = await this.client.getAccount(extPDA);

          if (!extData) {
            // Assume extensions are sequential, stop at first gap
            break;
          }

          // Parse extension data
          let offset = 8; // Skip discriminator
          offset += 8; // Skip agent_id

          const keyBytes = extData.slice(offset, offset + 32);
          offset += 32;
          const nullIndex = keyBytes.indexOf(0);
          const key = keyBytes.slice(0, nullIndex >= 0 ? nullIndex : 32).toString('utf8');

          const valueLen = extData.readUInt32LE(offset);
          offset += 4;
          const value = extData.slice(offset, offset + valueLen);

          extensions.push({ key, value });
        } catch {
          // Stop at first failed extension
          break;
        }
      }

      return extensions;
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
   * @param agentId - Agent ID (number or bigint)
   * @returns True if agent exists
   */
  async agentExists(agentId: number | bigint): Promise<boolean> {
    const agent = await this.loadAgent(agentId);
    return agent !== null;
  }

  // ==================== Reputation Methods (6 ERC-8004 Read Functions) ====================

  /**
   * 1. Get agent reputation summary
   * @param agentId - Agent ID (number or bigint)
   * @param minScore - Optional minimum score filter
   * @param clientFilter - Optional client filter
   * @returns Reputation summary with average score and total feedbacks
   */
  async getSummary(agentId: number | bigint, minScore?: number, clientFilter?: PublicKey) {
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    return await this.feedbackManager.getSummary(id, minScore, clientFilter);
  }

  /**
   * 2. Read single feedback
   * @param agentId - Agent ID (number or bigint)
   * @param client - Client public key
   * @param feedbackIndex - Feedback index (number or bigint)
   * @returns Feedback object or null
   */
  async readFeedback(agentId: number | bigint, client: PublicKey, feedbackIndex: number | bigint) {
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
    return await this.feedbackManager.readFeedback(id, client, idx);
  }

  /**
   * 3. Read all feedbacks for an agent
   * @param agentId - Agent ID (number or bigint)
   * @param includeRevoked - Include revoked feedbacks
   * @returns Array of feedback objects
   */
  async readAllFeedback(agentId: number | bigint, includeRevoked: boolean = false) {
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    return await this.feedbackManager.readAllFeedback(id, includeRevoked);
  }

  /**
   * 4. Get last feedback index for a client
   * @param agentId - Agent ID (number or bigint)
   * @param client - Client public key
   * @returns Last feedback index
   */
  async getLastIndex(agentId: number | bigint, client: PublicKey) {
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    return await this.feedbackManager.getLastIndex(id, client);
  }

  /**
   * 5. Get all clients who gave feedback
   * @param agentId - Agent ID (number or bigint)
   * @returns Array of client public keys
   */
  async getClients(agentId: number | bigint) {
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    return await this.feedbackManager.getClients(id);
  }

  /**
   * 6. Get response count for a feedback
   * @param agentId - Agent ID (number or bigint)
   * @param client - Client public key
   * @param feedbackIndex - Feedback index (number or bigint)
   * @returns Number of responses
   */
  async getResponseCount(agentId: number | bigint, client: PublicKey, feedbackIndex: number | bigint) {
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
    return await this.feedbackManager.getResponseCount(id, client, idx);
  }

  /**
   * Bonus: Read all responses for a feedback
   * @param agentId - Agent ID (number or bigint)
   * @param client - Client public key
   * @param feedbackIndex - Feedback index (number or bigint)
   * @returns Array of response objects
   */
  async readResponses(agentId: number | bigint, client: PublicKey, feedbackIndex: number | bigint) {
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
    return await this.feedbackManager.readResponses(id, client, idx);
  }

  // ==================== Write Methods (require signer) ====================

  /**
   * Check if SDK has write permissions
   */
  get canWrite(): boolean {
    return this.signer !== undefined;
  }

  /**
   * Register a new agent (write operation)
   * @param tokenUri - Optional token URI
   * @param metadata - Optional metadata entries (key-value pairs)
   * @returns Transaction result with agent ID
   */
  async registerAgent(
    tokenUri?: string,
    metadata?: Array<{ key: string; value: string }>
  ) {
    if (!this.identityTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }

    // Initialize resolver to cache the mint after registration
    await this.initializeMintResolver();

    const result = await this.identityTxBuilder.registerAgent(tokenUri, metadata);

    // Cache the agentId → mint mapping for instant lookup
    if (result.success && result.agentId !== undefined && result.agentMint) {
      this.mintResolver!.addToCache(result.agentId, result.agentMint);
    }

    return result;
  }

  /**
   * Set agent URI (write operation)
   * @param agentId - Agent ID (number or bigint)
   * @param newUri - New URI
   */
  async setAgentUri(agentId: number | bigint, newUri: string) {
    if (!this.identityTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    return await this.identityTxBuilder.setAgentUri(id, newUri);
  }

  /**
   * Set agent metadata (write operation)
   * @param agentId - Agent ID (number or bigint)
   * @param key - Metadata key
   * @param value - Metadata value
   */
  async setMetadata(agentId: number | bigint, key: string, value: string) {
    if (!this.identityTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    return await this.identityTxBuilder.setMetadata(id, key, value);
  }

  /**
   * Give feedback to an agent (write operation)
   * @param agentId - Agent ID (number or bigint)
   * @param score - Score 0-100
   * @param fileUri - IPFS/Arweave URI
   * @param fileHash - File hash
   */
  async giveFeedback(
    agentId: number | bigint,
    score: number,
    fileUri: string,
    fileHash: Buffer
  ) {
    if (!this.reputationTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    return await this.reputationTxBuilder.giveFeedback(
      id,
      score,
      fileUri,
      fileHash
    );
  }

  /**
   * Revoke feedback (write operation)
   * @param agentId - Agent ID (number or bigint)
   * @param feedbackIndex - Feedback index to revoke (number or bigint)
   */
  async revokeFeedback(agentId: number | bigint, feedbackIndex: number | bigint) {
    if (!this.reputationTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
    return await this.reputationTxBuilder.revokeFeedback(id, idx);
  }

  /**
   * Append response to feedback (write operation)
   * @param agentId - Agent ID (number or bigint)
   * @param client - Client who gave feedback
   * @param feedbackIndex - Feedback index (number or bigint)
   * @param responseUri - Response URI
   * @param responseHash - Response hash
   */
  async appendResponse(
    agentId: number | bigint,
    client: PublicKey,
    feedbackIndex: number | bigint,
    responseUri: string,
    responseHash: Buffer
  ) {
    if (!this.reputationTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
    return await this.reputationTxBuilder.appendResponse(
      id,
      client,
      idx,
      responseUri,
      responseHash
    );
  }

  /**
   * Request validation (write operation)
   * @param agentId - Agent ID (number or bigint)
   * @param validator - Validator public key
   * @param requestHash - Request hash
   */
  async requestValidation(
    agentId: number | bigint,
    validator: PublicKey,
    requestHash: Buffer
  ) {
    if (!this.validationTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    return await this.validationTxBuilder.requestValidation(
      id,
      validator,
      requestHash
    );
  }

  /**
   * Respond to validation request (write operation)
   * @param agentId - Agent ID (number or bigint)
   * @param requester - Requester public key
   * @param nonce - Request nonce
   * @param response - Response (0=rejected, 1=approved)
   * @param responseHash - Response hash
   */
  async respondToValidation(
    agentId: number | bigint,
    requester: PublicKey,
    nonce: number,
    response: number,
    responseHash: Buffer
  ) {
    if (!this.validationTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
    return await this.validationTxBuilder.respondToValidation(
      id,
      requester,
      nonce,
      response,
      responseHash
    );
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
