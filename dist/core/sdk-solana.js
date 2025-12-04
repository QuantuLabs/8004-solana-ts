/**
 * Solana SDK for Agent0 - ERC-8004 implementation
 * Provides read and write access to Solana-based agent registries
 */
import bs58 from 'bs58';
import { SolanaClient, createDevnetClient, UnsupportedRpcError } from './client.js';
import { SolanaFeedbackManager } from './feedback-manager-solana.js';
import { PDAHelpers } from './pda-helpers.js';
import { getProgramIds } from './programs.js';
import { AgentAccount, MetadataEntry } from './borsh-schemas.js';
import { IdentityTransactionBuilder, ReputationTransactionBuilder, ValidationTransactionBuilder, } from './transaction-builder.js';
import { AgentMintResolver } from './agent-mint-resolver.js';
import { fetchRegistryConfig } from './config-reader.js';
/**
 * Main SDK class for Solana ERC-8004 implementation
 * Provides read and write access to agent registries on Solana
 */
export class SolanaSDK {
    constructor(config) {
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
        // Initialize transaction builders (v0.2.0 - no cluster argument)
        // They work with or without signer - skipSend mode allows building transactions
        // without a signer, the signer pubkey is provided in options instead
        const connection = this.client.getConnection();
        this.identityTxBuilder = new IdentityTransactionBuilder(connection, this.signer);
        this.reputationTxBuilder = new ReputationTransactionBuilder(connection, this.signer);
        this.validationTxBuilder = new ValidationTransactionBuilder(connection, this.signer);
        // Initialize mint resolver (lazy - will be created on first use)
        // This avoids blocking the constructor with async operations
    }
    /**
     * Initialize the agent mint resolver (lazy initialization)
     * Fetches registry config and creates resolver
     */
    async initializeMintResolver() {
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
        }
        catch (error) {
            throw new Error(`Failed to initialize agent mint resolver: ${error}`);
        }
    }
    // ==================== Agent Methods ====================
    /**
     * Load agent by ID
     * @param agentId - Agent ID (number or bigint)
     * @returns Agent account data or null if not found
     */
    async loadAgent(agentId) {
        try {
            // Convert to bigint if needed
            const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
            // Initialize resolver if needed
            await this.initializeMintResolver();
            // Resolve agentId → mint via NFT metadata
            const agentMint = await this.mintResolver.resolve(id);
            // Derive PDA from asset
            const [agentPDA] = PDAHelpers.getAgentPDA(agentMint);
            // Fetch account data
            const data = await this.client.getAccount(agentPDA);
            if (!data) {
                return null;
            }
            const agentAccount = AgentAccount.deserialize(data);
            // v0.2.0: Metadata is now stored in separate MetadataEntryPda accounts
            // Use getMetadata(agentId, key) to read individual entries
            return agentAccount;
        }
        catch (error) {
            console.error(`Error loading agent ${agentId}:`, error);
            return null;
        }
    }
    /**
     * Private helper: Load metadata extensions for an agent
     * Uses getProgramAccounts with memcmp filter, falls back to sequential if not supported
     */
    async loadMetadataExtensions(agentId, agentMint) {
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
                            bytes: bs58.encode(agentIdBuffer),
                        },
                    },
                ],
            });
            // Parse and extract metadata from extensions
            const extensions = [];
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
                }
                catch (parseError) {
                    console.warn('Failed to parse metadata extension:', parseError);
                }
            }
            return extensions;
        }
        catch (error) {
            // Fallback: sequential loading (slower but always works)
            console.warn('getProgramAccounts with memcmp failed, using sequential fallback:', error);
            const extensions = [];
            // Try indices 0-255 sequentially
            for (let i = 0; i < 256; i++) {
                try {
                    const [extPDA] = PDAHelpers.getMetadataExtensionPDA(agentMint, i);
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
                }
                catch {
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
    async getAgentsByOwner(owner) {
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
        }
        catch (error) {
            if (error instanceof UnsupportedRpcError)
                throw error;
            console.error(`Error getting agents for owner ${owner.toBase58()}:`, error);
            return [];
        }
    }
    /**
     * Check if agent exists
     * @param agentId - Agent ID (number or bigint)
     * @returns True if agent exists
     */
    async agentExists(agentId) {
        const agent = await this.loadAgent(agentId);
        return agent !== null;
    }
    /**
     * Get agent (alias for loadAgent, for parity with agent0-ts)
     * @param agentId - Agent ID (number or bigint)
     * @returns Agent account data or null if not found
     */
    async getAgent(agentId) {
        return this.loadAgent(agentId);
    }
    /**
     * Check if address is agent owner
     * @param agentId - Agent ID (number or bigint)
     * @param address - Address to check
     * @returns True if address is the owner
     */
    async isAgentOwner(agentId, address) {
        const agent = await this.loadAgent(agentId);
        if (!agent)
            return false;
        return agent.getOwnerPublicKey().equals(address);
    }
    /**
     * Get agent owner
     * @param agentId - Agent ID (number or bigint)
     * @returns Owner public key or null if agent not found
     */
    async getAgentOwner(agentId) {
        const agent = await this.loadAgent(agentId);
        if (!agent)
            return null;
        return agent.getOwnerPublicKey();
    }
    /**
     * Get reputation summary (alias for getSummary, for parity with agent0-ts)
     * @param agentId - Agent ID (number or bigint)
     * @returns Reputation summary with count and average score
     */
    async getReputationSummary(agentId) {
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
    async getSummary(agentId, minScore, clientFilter) {
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
    async readFeedback(agentId, client, feedbackIndex) {
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
        return await this.feedbackManager.readFeedback(id, client, idx);
    }
    /**
     * Get feedback (alias for readFeedback, for parity with agent0-ts)
     * @param agentId - Agent ID (number or bigint)
     * @param clientAddress - Client public key
     * @param feedbackIndex - Feedback index (number or bigint)
     * @returns Feedback object or null
     */
    async getFeedback(agentId, clientAddress, feedbackIndex) {
        return this.readFeedback(agentId, clientAddress, feedbackIndex);
    }
    /**
     * 3. Read all feedbacks for an agent
     * @param agentId - Agent ID (number or bigint)
     * @param includeRevoked - Include revoked feedbacks
     * @returns Array of feedback objects
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts with memcmp)
     */
    async readAllFeedback(agentId, includeRevoked = false) {
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
    async getLastIndex(agentId, client) {
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        return await this.feedbackManager.getLastIndex(id, client);
    }
    /**
     * 5. Get all clients who gave feedback
     * @param agentId - Agent ID (number or bigint)
     * @returns Array of client public keys
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts with memcmp)
     */
    async getClients(agentId) {
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
    async getResponseCount(agentId, client, feedbackIndex) {
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
    async readResponses(agentId, client, feedbackIndex) {
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
        return await this.feedbackManager.readResponses(id, client, idx);
    }
    // ==================== Write Methods (require signer) ====================
    /**
     * Check if SDK has write permissions
     */
    get canWrite() {
        return this.signer !== undefined;
    }
    /**
     * Register a new agent (write operation)
     * @param tokenUri - Optional token URI
     * @param metadata - Optional metadata entries (key-value pairs)
     * @param options - Write options (skipSend, signer, mintPubkey)
     * @returns Transaction result with agent ID, or PreparedTransaction if skipSend
     */
    async registerAgent(tokenUri, metadata, options) {
        // For non-skipSend operations, require signer
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        // Initialize resolver to cache the mint after registration
        await this.initializeMintResolver();
        const result = await this.identityTxBuilder.registerAgent(tokenUri, metadata, options);
        // Cache the agentId → asset mapping for instant lookup (only for successful sent transactions)
        // v0.2.0: Core asset replaces mint
        if ('success' in result && result.success && result.agentId !== undefined && result.asset) {
            this.mintResolver.addToCache(result.agentId, result.asset);
        }
        return result;
    }
    /**
     * Set agent URI (write operation)
     * @param agentId - Agent ID (number or bigint)
     * @param newUri - New URI
     * @param options - Write options (skipSend, signer)
     */
    async setAgentUri(agentId, newUri, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        // Resolve agentId → asset (v0.2.0: Core asset)
        await this.initializeMintResolver();
        const asset = await this.mintResolver.resolve(id);
        return await this.identityTxBuilder.setAgentUri(asset, newUri, options);
    }
    /**
     * Set agent metadata (write operation)
     * @param agentId - Agent ID (number or bigint)
     * @param key - Metadata key
     * @param value - Metadata value
     * @param immutable - If true, metadata cannot be modified or deleted (default: false)
     * @param options - Write options (skipSend, signer)
     */
    async setMetadata(agentId, key, value, immutable = false, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        // Resolve agentId → asset (v0.2.0: Core asset)
        await this.initializeMintResolver();
        const asset = await this.mintResolver.resolve(id);
        return await this.identityTxBuilder.setMetadata(asset, key, value, immutable, options);
    }
    /**
     * Give feedback to an agent (write operation)
     * Aligned with agent0-ts SDK interface
     * @param agentId - Agent ID (number or bigint)
     * @param feedbackFile - Feedback data object
     * @param feedbackAuth - Optional feedback authorization (not yet implemented)
     * @param options - Write options (skipSend, signer)
     */
    async giveFeedback(agentId, feedbackFile, feedbackAuth, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        // Resolve agentId → asset (v0.2.0: Core asset)
        await this.initializeMintResolver();
        const asset = await this.mintResolver.resolve(id);
        // TODO: Handle feedbackAuth when signature verification is implemented
        if (feedbackAuth) {
            console.warn('feedbackAuth is not yet implemented for Solana - ignoring');
        }
        return await this.reputationTxBuilder.giveFeedback(asset, id, feedbackFile.score, feedbackFile.tag1 || '', feedbackFile.tag2 || '', feedbackFile.fileUri, feedbackFile.fileHash, options);
    }
    /**
     * Revoke feedback (write operation)
     * @param agentId - Agent ID (number or bigint)
     * @param feedbackIndex - Feedback index to revoke (number or bigint)
     * @param options - Write options (skipSend, signer)
     */
    async revokeFeedback(agentId, feedbackIndex, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
        return await this.reputationTxBuilder.revokeFeedback(id, idx, options);
    }
    /**
     * Append response to feedback (write operation)
     * v0.2.0: client parameter removed (not needed for global feedback index)
     * @param agentId - Agent ID (number or bigint)
     * @param client - Client who gave feedback (kept for API compatibility, not used)
     * @param feedbackIndex - Feedback index (number or bigint)
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param options - Write options (skipSend, signer)
     */
    async appendResponse(agentId, _client, feedbackIndex, responseUri, responseHash, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        const idx = typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
        return await this.reputationTxBuilder.appendResponse(id, idx, responseUri, responseHash, options);
    }
    /**
     * Request validation (write operation)
     * @param agentId - Agent ID (number or bigint)
     * @param validator - Validator public key
     * @param nonce - Request nonce (unique per agent-validator pair)
     * @param requestUri - Request URI (IPFS/Arweave)
     * @param requestHash - Request hash (32 bytes)
     * @param options - Write options (skipSend, signer)
     */
    async requestValidation(agentId, validator, nonce, requestUri, requestHash, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        // Resolve agentId → asset (v0.2.0: Core asset)
        await this.initializeMintResolver();
        const asset = await this.mintResolver.resolve(id);
        return await this.validationTxBuilder.requestValidation(asset, id, validator, nonce, requestUri, requestHash, options);
    }
    /**
     * Respond to validation request (write operation)
     * @param agentId - Agent ID (number or bigint)
     * @param nonce - Request nonce
     * @param response - Response score (0-100)
     * @param responseUri - Response URI (IPFS/Arweave)
     * @param responseHash - Response hash (32 bytes)
     * @param tag - Response tag (max 32 bytes)
     * @param options - Write options (skipSend, signer)
     */
    async respondToValidation(agentId, nonce, response, responseUri, responseHash, tag = '', options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        return await this.validationTxBuilder.respondToValidation(id, nonce, response, responseUri, responseHash, tag, options);
    }
    /**
     * Transfer agent ownership (write operation)
     * Aligned with agent0-ts SDK interface
     * @param agentId - Agent ID (number or bigint)
     * @param newOwner - New owner public key
     * @param options - Write options (skipSend, signer)
     */
    async transferAgent(agentId, newOwner, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        // Resolve agentId → asset (v0.2.0: Core asset)
        await this.initializeMintResolver();
        const asset = await this.mintResolver.resolve(id);
        return await this.identityTxBuilder.transferAgent(asset, newOwner, options);
    }
    // ==================== Utility Methods ====================
    /**
     * Check if SDK is in read-only mode (no signer configured)
     * Aligned with agent0-ts SDK interface
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