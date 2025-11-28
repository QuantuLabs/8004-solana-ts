/**
 * Solana SDK for Agent0 - ERC-8004 implementation
 * Provides read and write access to Solana-based agent registries
 */

import { PublicKey, Keypair } from '@solana/web3.js';
import { SolanaClient, Cluster, createDevnetClient, UnsupportedRpcError } from './client.js';
import { SolanaFeedbackManager } from './feedback-manager-solana.js';
import type { IPFSClient } from './ipfs-client.js';
import { PDAHelpers } from './pda-helpers.js';
import { getProgramIds } from './programs.js';
import { AgentAccount, MetadataEntry } from './borsh-schemas.js';
import {
  IdentityTransactionBuilder,
  ReputationTransactionBuilder,
  ValidationTransactionBuilder,
  TransactionResult,
} from './transaction-builder.js';
import { AgentMintResolver } from './agent-mint-resolver.js';
import { fetchRegistryConfig } from './config-reader.js';
import type { FeedbackAuth } from '../models/interfaces.js';

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
  ): Promise<MetadataEntry[]> {
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
      const extensions: MetadataEntry[] = [];

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

          extensions.push(new MetadataEntry({ metadata_key: key, metadata_value: value }));
        } catch (parseError) {
          console.warn('Failed to parse metadata extension:', parseError);
        }
      }

      return extensions;
    } catch (error) {
      // Fallback: sequential loading (slower but always works)
      console.warn('getProgramAccounts with memcmp failed, using sequential fallback:', error);

      const extensions: MetadataEntry[] = [];

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

          extensions.push(new MetadataEntry({ metadata_key: key, metadata_value: value }));
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
   * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
   */
  async getAgentsByOwner(owner: PublicKey): Promise<AgentAccount[]> {
    // This operation requires getProgramAccounts which is limited on public devnet
    this.client.requireAdvancedQueries('getAgentsByOwner');

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
      if (error instanceof UnsupportedRpcError) throw error;
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

  /**
   * Get agent (alias for loadAgent, for parity with agent0-ts)
   * @param agentId - Agent ID (number or bigint)
   * @returns Agent account data or null if not found
   */
  async getAgent(agentId: number | bigint): Promise<AgentAccount | null> {
    return this.loadAgent(agentId);
  }

  /**
   * Check if address is agent owner
   * @param agentId - Agent ID (number or bigint)
   * @param address - Address to check
   * @returns True if address is the owner
   */
  async isAgentOwner(agentId: number | bigint, address: PublicKey): Promise<boolean> {
    const agent = await this.loadAgent(agentId);
    if (!agent) return false;
    return agent.getOwnerPublicKey().equals(address);
  }

  /**
   * Get agent owner
   * @param agentId - Agent ID (number or bigint)
   * @returns Owner public key or null if agent not found
   */
  async getAgentOwner(agentId: number | bigint): Promise<PublicKey | null> {
    const agent = await this.loadAgent(agentId);
    if (!agent) return null;
    return agent.getOwnerPublicKey();
  }

  /**
   * Get reputation summary (alias for getSummary, for parity with agent0-ts)
   * @param agentId - Agent ID (number or bigint)
   * @returns Reputation summary with count and average score
   */
  async getReputationSummary(agentId: number | bigint): Promise<{ count: number; averageScore: number }> {
    const summary = await this.getSummary(agentId);
    return {
      count: summary.totalFeedbacks,
      averageScore: summary.averageScore,
    };
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
   * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts with memcmp)
   */
  async readAllFeedback(agentId: number | bigint, includeRevoked: boolean = false) {
    // This operation requires getProgramAccounts with memcmp
    this.client.requireAdvancedQueries('readAllFeedback');

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
   * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts with memcmp)
   */
  async getClients(agentId: number | bigint) {
    // This operation requires getProgramAccounts with memcmp
    this.client.requireAdvancedQueries('getClients');

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
  async setAgentUri(agentId: number | bigint, newUri: string): Promise<TransactionResult> {
    if (!this.identityTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;

    // Resolve agentId → agentMint
    await this.initializeMintResolver();
    const agentMint = await this.mintResolver!.resolve(id);

    return await this.identityTxBuilder.setAgentUri(agentMint, newUri);
  }

  /**
   * Set agent metadata (write operation)
   * @param agentId - Agent ID (number or bigint)
   * @param key - Metadata key
   * @param value - Metadata value
   */
  async setMetadata(agentId: number | bigint, key: string, value: string): Promise<TransactionResult> {
    if (!this.identityTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;

    // Resolve agentId → agentMint
    await this.initializeMintResolver();
    const agentMint = await this.mintResolver!.resolve(id);

    return await this.identityTxBuilder.setMetadataByMint(agentMint, key, value);
  }

  /**
   * Give feedback to an agent (write operation)
   * Aligned with agent0-ts SDK interface
   * @param agentId - Agent ID (number or bigint)
   * @param feedbackFile - Feedback data object
   * @param feedbackAuth - Optional feedback authorization (not yet implemented)
   */
  async giveFeedback(
    agentId: number | bigint,
    feedbackFile: {
      score: number;
      tag1?: string;
      tag2?: string;
      fileUri: string;
      fileHash: Buffer;
    },
    feedbackAuth?: FeedbackAuth
  ): Promise<TransactionResult & { feedbackIndex?: bigint }> {
    if (!this.reputationTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;

    // Resolve agentId → agentMint
    await this.initializeMintResolver();
    const agentMint = await this.mintResolver!.resolve(id);

    // TODO: Handle feedbackAuth when signature verification is implemented
    if (feedbackAuth) {
      console.warn('feedbackAuth is not yet implemented for Solana - ignoring');
    }

    return await this.reputationTxBuilder.giveFeedback(
      agentMint,
      id,
      feedbackFile.score,
      feedbackFile.tag1 || '',
      feedbackFile.tag2 || '',
      feedbackFile.fileUri,
      feedbackFile.fileHash
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
   * @param nonce - Request nonce (unique per agent-validator pair)
   * @param requestUri - Request URI (IPFS/Arweave)
   * @param requestHash - Request hash (32 bytes)
   */
  async requestValidation(
    agentId: number | bigint,
    validator: PublicKey,
    nonce: number,
    requestUri: string,
    requestHash: Buffer
  ): Promise<TransactionResult> {
    if (!this.validationTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;

    // Resolve agentId → agentMint
    await this.initializeMintResolver();
    const agentMint = await this.mintResolver!.resolve(id);

    return await this.validationTxBuilder.requestValidation(
      agentMint,
      id,
      validator,
      nonce,
      requestUri,
      requestHash
    );
  }

  /**
   * Respond to validation request (write operation)
   * @param agentId - Agent ID (number or bigint)
   * @param nonce - Request nonce
   * @param response - Response score (0-100)
   * @param responseUri - Response URI (IPFS/Arweave)
   * @param responseHash - Response hash (32 bytes)
   * @param tag - Response tag (max 32 bytes)
   */
  async respondToValidation(
    agentId: number | bigint,
    nonce: number,
    response: number,
    responseUri: string,
    responseHash: Buffer,
    tag: string = ''
  ): Promise<TransactionResult> {
    if (!this.validationTxBuilder) {
      throw new Error('No signer configured - SDK is read-only');
    }
    const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;

    return await this.validationTxBuilder.respondToValidation(
      id,
      nonce,
      response,
      responseUri,
      responseHash,
      tag
    );
  }

  // ==================== Utility Methods ====================

  /**
   * Check if SDK is in read-only mode (no signer configured)
   * Aligned with agent0-ts SDK interface
   */
  get isReadOnly(): boolean {
    return this.signer === undefined;
  }

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
   * Get registry addresses (for parity with agent0-ts)
   */
  registries(): Record<string, string> {
    return {
      IDENTITY: this.programIds.identityRegistry.toBase58(),
      REPUTATION: this.programIds.reputationRegistry.toBase58(),
      VALIDATION: this.programIds.validationRegistry.toBase58(),
    };
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
   * Check if SDK is using the default public Solana devnet RPC
   * Some operations are not supported on the public RPC
   */
  isUsingDefaultDevnetRpc(): boolean {
    return this.client.isDefaultDevnetRpc;
  }

  /**
   * Check if SDK supports advanced queries (getProgramAccounts with memcmp)
   * Returns false when using default Solana devnet RPC
   */
  supportsAdvancedQueries(): boolean {
    return this.client.supportsAdvancedQueries();
  }

  /**
   * Get the current RPC URL being used
   */
  getRpcUrl(): string {
    return this.client.rpcUrl;
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
