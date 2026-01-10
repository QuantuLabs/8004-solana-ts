/**
 * Solana SDK for Agent0 - ERC-8004 implementation
 * v0.3.0 - Asset-based identification
 * Provides read and write access to Solana-based agent registries
 *
 * BREAKING CHANGES from v0.2.0:
 * - All methods now use asset (PublicKey) instead of agentId (bigint)
 * - Multi-collection support via RootConfig and RegistryConfig
 */
import bs58 from 'bs58';
import { SolanaClient, createDevnetClient, UnsupportedRpcError } from './client.js';
import { SolanaFeedbackManager } from './feedback-manager-solana.js';
import { PDAHelpers } from './pda-helpers.js';
import { getProgramIds } from './programs.js';
import { createHash } from 'crypto';
import { ACCOUNT_DISCRIMINATORS } from './instruction-discriminators.js';
import { AgentAccount, MetadataEntryPda } from './borsh-schemas.js';
import { IdentityTransactionBuilder, ReputationTransactionBuilder, ValidationTransactionBuilder, } from './transaction-builder.js';
import { AgentMintResolver } from './agent-mint-resolver.js';
import { getCurrentBaseCollection } from './config-reader.js';
/**
 * Main SDK class for Solana ERC-8004 implementation
 * v0.3.0 - Asset-based identification
 * Provides read and write access to agent registries on Solana
 */
export class SolanaSDK {
    client;
    feedbackManager;
    cluster;
    programIds;
    signer;
    identityTxBuilder;
    reputationTxBuilder;
    validationTxBuilder;
    mintResolver;
    baseCollection;
    constructor(config = {}) {
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
        // Initialize transaction builders (v0.3.0 - no cluster argument)
        const connection = this.client.getConnection();
        this.identityTxBuilder = new IdentityTransactionBuilder(connection, this.signer);
        this.reputationTxBuilder = new ReputationTransactionBuilder(connection, this.signer);
        this.validationTxBuilder = new ValidationTransactionBuilder(connection, this.signer);
    }
    /**
     * Initialize the agent mint resolver and base collection (lazy initialization)
     */
    async initializeMintResolver() {
        if (this.mintResolver) {
            return; // Already initialized
        }
        try {
            const connection = this.client.getConnection();
            // v0.3.0: Get base collection from RootConfig
            this.baseCollection = await getCurrentBaseCollection(connection) || undefined;
            if (!this.baseCollection) {
                throw new Error('Registry not initialized. Root config not found.');
            }
            this.mintResolver = new AgentMintResolver(connection);
        }
        catch (error) {
            throw new Error(`Failed to initialize SDK: ${error}`);
        }
    }
    /**
     * Get the current base collection pubkey
     */
    async getBaseCollection() {
        await this.initializeMintResolver();
        return this.baseCollection || null;
    }
    // ==================== Agent Methods (v0.3.0 - asset-based) ====================
    /**
     * Load agent by asset pubkey - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns Agent account data or null if not found
     */
    async loadAgent(asset) {
        try {
            // Derive PDA from asset
            const [agentPDA] = PDAHelpers.getAgentPDA(asset);
            // Fetch account data
            const data = await this.client.getAccount(agentPDA);
            if (!data) {
                return null;
            }
            return AgentAccount.deserialize(data);
        }
        catch (error) {
            console.error(`Error loading agent ${asset.toBase58()}:`, error);
            return null;
        }
    }
    /**
     * Get a specific metadata entry for an agent - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param key - Metadata key
     * @returns Metadata value as string, or null if not found
     */
    async getMetadata(asset, key) {
        try {
            // Compute key hash (SHA256(key)[0..8])
            const keyHash = createHash('sha256').update(key).digest().slice(0, 8);
            // Derive metadata entry PDA (v0.3.0 - uses asset)
            const [metadataEntry] = PDAHelpers.getMetadataEntryPDA(asset, keyHash);
            // Fetch metadata account
            const metadataData = await this.client.getAccount(metadataEntry);
            if (!metadataData) {
                return null; // Metadata entry does not exist
            }
            // Deserialize and return value
            const entry = MetadataEntryPda.deserialize(metadataData);
            return entry.getValueString();
        }
        catch (error) {
            console.error(`Error getting metadata for agent ${asset.toBase58()}, key "${key}":`, error);
            return null;
        }
    }
    /**
     * Get agents by owner with on-chain metadata - v0.3.0
     * @param owner - Owner public key
     * @param options - Optional settings for additional data fetching
     * @returns Array of agents with metadata (and optionally feedbacks)
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
     */
    async getAgentsByOwner(owner, options) {
        this.client.requireAdvancedQueries('getAgentsByOwner');
        try {
            const programId = this.programIds.identityRegistry;
            // 1. Fetch agent accounts filtered by owner (1 RPC call)
            // v0.3.0: owner is at offset 8 (after discriminator)
            const agentAccounts = await this.client.getProgramAccounts(programId, [
                {
                    memcmp: {
                        offset: 0,
                        bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.AgentAccount),
                    },
                },
                {
                    memcmp: {
                        offset: 8, // owner is first field after discriminator
                        bytes: owner.toBase58(),
                    },
                },
            ]);
            const agents = agentAccounts.map((acc) => AgentAccount.deserialize(acc.data));
            // 2. Fetch ALL metadata entries (1 RPC call)
            const metadataAccounts = await this.client.getProgramAccounts(programId, [
                {
                    memcmp: {
                        offset: 0,
                        bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.MetadataEntryPda),
                    },
                },
            ]);
            // Build metadata map: asset → [{key, value}]
            const metadataMap = new Map();
            for (const acc of metadataAccounts) {
                try {
                    const entry = MetadataEntryPda.deserialize(acc.data);
                    const assetStr = entry.getAssetPublicKey().toBase58();
                    if (!metadataMap.has(assetStr))
                        metadataMap.set(assetStr, []);
                    metadataMap.get(assetStr).push({
                        key: entry.metadata_key,
                        value: entry.getValueString(),
                    });
                }
                catch {
                    // Skip malformed MetadataEntryPda
                }
            }
            // 3. Optionally fetch feedbacks (2 RPC calls)
            let feedbacksMap = null;
            if (options?.includeFeedbacks) {
                feedbacksMap = await this.feedbackManager.fetchAllFeedbacks(options.includeRevoked ?? false);
            }
            // 4. Combine results
            return agents.map((account) => {
                const assetStr = account.getAssetPublicKey().toBase58();
                return {
                    account,
                    metadata: metadataMap.get(assetStr) || [],
                    feedbacks: feedbacksMap ? feedbacksMap.get(assetStr) || [] : [],
                };
            });
        }
        catch (error) {
            if (error instanceof UnsupportedRpcError)
                throw error;
            console.error(`Error getting agents for owner ${owner.toBase58()}:`, error);
            return [];
        }
    }
    /**
     * Get all registered agents with their on-chain metadata - v0.3.0
     * @param options - Optional settings for additional data fetching
     * @returns Array of agents with metadata extensions (and optionally feedbacks)
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
     */
    async getAllAgents(options) {
        this.client.requireAdvancedQueries('getAllAgents');
        try {
            const programId = this.programIds.identityRegistry;
            // Fetch AgentAccounts and MetadataExtensions in parallel
            const [agentAccounts, metadataAccounts] = await Promise.all([
                this.client.getProgramAccounts(programId, [
                    {
                        memcmp: {
                            offset: 0,
                            bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.AgentAccount),
                        },
                    },
                ]),
                this.client.getProgramAccounts(programId, [
                    {
                        memcmp: {
                            offset: 0,
                            bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.MetadataEntryPda),
                        },
                    },
                ]),
            ]);
            // Build metadata map by asset (v0.3.0)
            const metadataMap = new Map();
            for (const acc of metadataAccounts) {
                try {
                    const entry = MetadataEntryPda.deserialize(acc.data);
                    const assetStr = entry.getAssetPublicKey().toBase58();
                    if (!metadataMap.has(assetStr))
                        metadataMap.set(assetStr, []);
                    metadataMap.get(assetStr).push({
                        key: entry.metadata_key,
                        value: entry.getValueString(),
                    });
                }
                catch {
                    // Skip malformed accounts
                }
            }
            // Combine agents with their metadata
            const agents = [];
            for (const acc of agentAccounts) {
                try {
                    const agent = AgentAccount.deserialize(acc.data);
                    const assetStr = agent.getAssetPublicKey().toBase58();
                    agents.push({
                        account: agent,
                        metadata: metadataMap.get(assetStr) || [],
                        feedbacks: [], // Always initialize as empty array
                    });
                }
                catch {
                    // Skip malformed accounts
                }
            }
            // Optionally fetch all feedbacks (2 additional RPC calls)
            if (options?.includeFeedbacks) {
                const allFeedbacks = await this.feedbackManager.fetchAllFeedbacks(options.includeRevoked ?? false);
                // Attach feedbacks to each agent
                for (const agent of agents) {
                    const assetStr = agent.account.getAssetPublicKey().toBase58();
                    agent.feedbacks = allFeedbacks.get(assetStr) || [];
                }
            }
            return agents;
        }
        catch (error) {
            if (error instanceof UnsupportedRpcError)
                throw error;
            console.error('Error getting all agents:', error);
            return [];
        }
    }
    /**
     * Fetch ALL feedbacks for ALL agents in 2 RPC calls - v0.3.0
     * More efficient than calling readAllFeedback() per agent
     * @param includeRevoked - Include revoked feedbacks? Default: false
     * @returns Map of asset (base58) -> SolanaFeedback[]
     * @throws UnsupportedRpcError if using default devnet RPC
     */
    async getAllFeedbacks(includeRevoked = false) {
        this.client.requireAdvancedQueries('getAllFeedbacks');
        return await this.feedbackManager.fetchAllFeedbacks(includeRevoked);
    }
    /**
     * Check if agent exists - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns True if agent exists
     */
    async agentExists(asset) {
        const agent = await this.loadAgent(asset);
        return agent !== null;
    }
    /**
     * Get agent (alias for loadAgent) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns Agent account data or null if not found
     */
    async getAgent(asset) {
        return this.loadAgent(asset);
    }
    /**
     * Check if address is agent owner - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param address - Address to check
     * @returns True if address is the owner
     */
    async isAgentOwner(asset, address) {
        const agent = await this.loadAgent(asset);
        if (!agent)
            return false;
        return agent.getOwnerPublicKey().equals(address);
    }
    /**
     * Get agent owner - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns Owner public key or null if agent not found
     */
    async getAgentOwner(asset) {
        const agent = await this.loadAgent(asset);
        if (!agent)
            return null;
        return agent.getOwnerPublicKey();
    }
    /**
     * Get reputation summary - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns Reputation summary with count and average score
     */
    async getReputationSummary(asset) {
        const summary = await this.getSummary(asset);
        return {
            count: summary.totalFeedbacks,
            averageScore: summary.averageScore,
        };
    }
    // ==================== Reputation Methods (v0.3.0 - asset-based) ====================
    /**
     * 1. Get agent reputation summary - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param minScore - Optional minimum score filter
     * @param clientFilter - Optional client filter
     * @returns Reputation summary with average score and total feedbacks
     */
    async getSummary(asset, minScore, clientFilter) {
        return await this.feedbackManager.getSummary(asset, minScore, clientFilter);
    }
    /**
     * 2. Read single feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Feedback object or null
     */
    async readFeedback(asset, client, feedbackIndex) {
        const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
        return await this.feedbackManager.readFeedback(asset, client, idx);
    }
    /**
     * Get feedback (alias for readFeedback) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param clientAddress - Client public key
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Feedback object or null
     */
    async getFeedback(asset, clientAddress, feedbackIndex) {
        return this.readFeedback(asset, clientAddress, feedbackIndex);
    }
    /**
     * 3. Read all feedbacks for an agent - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param includeRevoked - Include revoked feedbacks
     * @returns Array of feedback objects
     * @throws UnsupportedRpcError if using default devnet RPC
     */
    async readAllFeedback(asset, includeRevoked = false) {
        this.client.requireAdvancedQueries('readAllFeedback');
        return await this.feedbackManager.readAllFeedback(asset, includeRevoked);
    }
    /**
     * 4. Get last feedback index for a client - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param client - Client public key
     * @returns Last feedback index
     */
    async getLastIndex(asset, client) {
        return await this.feedbackManager.getLastIndex(asset, client);
    }
    /**
     * 5. Get all clients who gave feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @returns Array of client public keys
     * @throws UnsupportedRpcError if using default devnet RPC
     */
    async getClients(asset) {
        this.client.requireAdvancedQueries('getClients');
        return await this.feedbackManager.getClients(asset);
    }
    /**
     * 6. Get response count for a feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Number of responses
     */
    async getResponseCount(asset, feedbackIndex) {
        const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
        return await this.feedbackManager.getResponseCount(asset, idx);
    }
    /**
     * Bonus: Read all responses for a feedback - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Array of response objects
     */
    async readResponses(asset, feedbackIndex) {
        const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
        return await this.feedbackManager.readResponses(asset, idx);
    }
    // ==================== Write Methods (require signer) - v0.3.0 ====================
    /**
     * Check if SDK has write permissions
     */
    get canWrite() {
        return this.signer !== undefined;
    }
    /**
     * Register a new agent (write operation) - v0.3.0
     * @param tokenUri - Optional token URI
     * @param metadata - Optional metadata entries (key-value pairs)
     * @param collection - Optional collection pubkey (defaults to base registry)
     * @param options - Write options (skipSend, signer, assetPubkey)
     * @returns Transaction result with asset, or PreparedTransaction if skipSend
     */
    async registerAgent(tokenUri, metadata, collection, options) {
        // For non-skipSend operations, require signer
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        return await this.identityTxBuilder.registerAgent(tokenUri, metadata, collection, options);
    }
    /**
     * Set agent URI (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param collection - Collection pubkey for the agent
     * @param newUri - New URI
     * @param options - Write options (skipSend, signer)
     */
    async setAgentUri(asset, collection, newUri, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        return await this.identityTxBuilder.setAgentUri(asset, collection, newUri, options);
    }
    /**
     * Set agent metadata (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param key - Metadata key
     * @param value - Metadata value
     * @param immutable - If true, metadata cannot be modified or deleted (default: false)
     * @param options - Write options (skipSend, signer)
     */
    async setMetadata(asset, key, value, immutable = false, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        return await this.identityTxBuilder.setMetadata(asset, key, value, immutable, options);
    }
    /**
     * Delete a metadata entry for an agent (write operation) - v0.3.0
     * Only works if metadata is not immutable
     * @param asset - Agent Core asset pubkey
     * @param key - Metadata key to delete
     * @param options - Write options (skipSend, signer)
     */
    async deleteMetadata(asset, key, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        return await this.identityTxBuilder.deleteMetadata(asset, key, options);
    }
    /**
     * Give feedback to an agent (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackFile - Feedback data object
     * @param options - Write options (skipSend, signer)
     */
    async giveFeedback(asset, feedbackFile, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        return await this.reputationTxBuilder.giveFeedback(asset, feedbackFile.score, feedbackFile.tag1 || '', feedbackFile.tag2 || '', feedbackFile.endpoint || '', feedbackFile.feedbackUri, feedbackFile.feedbackHash, options);
    }
    /**
     * Revoke feedback (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index to revoke (number or bigint)
     * @param options - Write options (skipSend, signer)
     */
    async revokeFeedback(asset, feedbackIndex, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
        return await this.reputationTxBuilder.revokeFeedback(asset, idx, options);
    }
    /**
     * Append response to feedback (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param feedbackIndex - Feedback index (number or bigint)
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param options - Write options (skipSend, signer)
     */
    async appendResponse(asset, feedbackIndex, responseUri, responseHash, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
        return await this.reputationTxBuilder.appendResponse(asset, idx, responseUri, responseHash, options);
    }
    /**
     * Request validation (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param validator - Validator public key
     * @param nonce - Request nonce (unique per agent-validator pair)
     * @param requestUri - Request URI (IPFS/Arweave)
     * @param requestHash - Request hash (32 bytes)
     * @param options - Write options (skipSend, signer)
     */
    async requestValidation(asset, validator, nonce, requestUri, requestHash, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        return await this.validationTxBuilder.requestValidation(asset, validator, nonce, requestUri, requestHash, options);
    }
    /**
     * Respond to validation request (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param nonce - Request nonce
     * @param response - Response score (0-100)
     * @param responseUri - Response URI (IPFS/Arweave)
     * @param responseHash - Response hash (32 bytes)
     * @param tag - Response tag (max 32 bytes)
     * @param options - Write options (skipSend, signer)
     */
    async respondToValidation(asset, nonce, response, responseUri, responseHash, tag = '', options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        return await this.validationTxBuilder.respondToValidation(asset, nonce, response, responseUri, responseHash, tag, options);
    }
    /**
     * Transfer agent ownership (write operation) - v0.3.0
     * @param asset - Agent Core asset pubkey
     * @param collection - Collection pubkey for the agent
     * @param newOwner - New owner public key
     * @param options - Write options (skipSend, signer)
     */
    async transferAgent(asset, collection, newOwner, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        return await this.identityTxBuilder.transferAgent(asset, collection, newOwner, options);
    }
    // ==================== Utility Methods ====================
    /**
     * Check if SDK is in read-only mode (no signer configured)
     */
    get isReadOnly() {
        return this.signer === undefined;
    }
    /**
     * Get chain ID (for parity with agent0-ts)
     * Returns a string identifier for Solana cluster
     */
    async chainId() {
        return `solana-${this.cluster}`;
    }
    /**
     * Get current cluster
     */
    getCluster() {
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
    registries() {
        return {
            IDENTITY: this.programIds.identityRegistry.toBase58(),
            REPUTATION: this.programIds.reputationRegistry.toBase58(),
            VALIDATION: this.programIds.validationRegistry.toBase58(),
        };
    }
    /**
     * Get Solana client for advanced usage
     */
    getSolanaClient() {
        return this.client;
    }
    /**
     * Get feedback manager for advanced usage
     */
    getFeedbackManager() {
        return this.feedbackManager;
    }
    /**
     * Check if SDK is using the default public Solana devnet RPC
     * Some operations are not supported on the public RPC
     */
    isUsingDefaultDevnetRpc() {
        return this.client.isDefaultDevnetRpc;
    }
    /**
     * Check if SDK supports advanced queries (getProgramAccounts with memcmp)
     * Returns false when using default Solana devnet RPC
     */
    supportsAdvancedQueries() {
        return this.client.supportsAdvancedQueries();
    }
    /**
     * Get the current RPC URL being used
     */
    getRpcUrl() {
        return this.client.rpcUrl;
    }
}
//# sourceMappingURL=sdk-solana.js.map