/**
 * Solana SDK for Agent0 - ERC-8004 implementation
 * Provides read and write access to Solana-based agent registries
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
import { fetchRegistryConfig } from './config-reader.js';
/**
 * Main SDK class for Solana ERC-8004 implementation
 * Provides read and write access to agent registries on Solana
 */
export class SolanaSDK {
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
     * Get a specific metadata entry for an agent
     * @param agentId - Agent ID (number or bigint)
     * @param key - Metadata key
     * @returns Metadata value as string, or null if not found
     */
    async getMetadata(agentId, key) {
        try {
            const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
            // Initialize resolver if needed
            await this.initializeMintResolver();
            // Resolve agentId → asset
            const asset = await this.mintResolver.resolve(id);
            // Get the agent account to retrieve the on-chain agent_id
            const [agentPDA] = PDAHelpers.getAgentPDA(asset);
            const agentData = await this.client.getAccount(agentPDA);
            if (!agentData) {
                return null;
            }
            // Read agent_id (u64 at offset 8 after discriminator)
            const onChainAgentId = agentData.readBigUInt64LE(8);
            // Compute key hash (SHA256(key)[0..8])
            const keyHash = createHash('sha256').update(key).digest().slice(0, 8);
            // Derive metadata entry PDA
            const [metadataEntry] = PDAHelpers.getMetadataEntryPDA(onChainAgentId, keyHash);
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
            console.error(`Error getting metadata for agent ${agentId}, key "${key}":`, error);
            return null;
        }
    }
    /**
     * Get agents by owner with on-chain metadata
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
            const agentAccounts = await this.client.getProgramAccounts(programId, [
                {
                    memcmp: {
                        offset: 0,
                        bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.AgentAccount),
                    },
                },
                {
                    memcmp: {
                        offset: 16,
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
            // Build metadata map: agentId -> [{key, value}]
            const metadataMap = new Map();
            for (const acc of metadataAccounts) {
                try {
                    const entry = MetadataEntryPda.deserialize(acc.data);
                    const agentIdStr = entry.agent_id.toString();
                    if (!metadataMap.has(agentIdStr))
                        metadataMap.set(agentIdStr, []);
                    metadataMap.get(agentIdStr).push({
                        key: entry.metadata_key,
                        value: entry.getValueString(),
                    });
                }
                catch {
                    // Skip malformed MetadataEntryPda (corrupted or legacy format)
                }
            }
            // 3. Optionally fetch feedbacks (2 RPC calls)
            let feedbacksMap = null;
            if (options?.includeFeedbacks) {
                feedbacksMap = await this.feedbackManager.fetchAllFeedbacks(options.includeRevoked ?? false);
            }
            // 4. Combine results (feedbacks = [] if not requested)
            return agents.map((account) => {
                const agentIdStr = account.agent_id.toString();
                const agentIdBigInt = BigInt(agentIdStr);
                return {
                    account,
                    metadata: metadataMap.get(agentIdStr) || [],
                    feedbacks: feedbacksMap ? feedbacksMap.get(agentIdBigInt) || [] : [],
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
     * Get all registered agents with their on-chain metadata
     * @param options - Optional settings for additional data fetching
     * @returns Array of agents with metadata extensions (and optionally feedbacks)
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
     */
    async getAllAgents(options) {
        // This operation requires getProgramAccounts which is limited on public devnet
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
            // Build metadata map by agent_id
            const metadataMap = new Map();
            for (const acc of metadataAccounts) {
                try {
                    const entry = MetadataEntryPda.deserialize(acc.data);
                    const agentIdStr = entry.agent_id.toString();
                    if (!metadataMap.has(agentIdStr))
                        metadataMap.set(agentIdStr, []);
                    metadataMap.get(agentIdStr).push({
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
                    const agentIdStr = agent.agent_id.toString();
                    agents.push({
                        account: agent,
                        metadata: metadataMap.get(agentIdStr) || [],
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
                // Attach feedbacks to each agent (convert agent_id to BigInt for Map lookup)
                for (const agent of agents) {
                    const agentId = BigInt(agent.account.agent_id.toString());
                    agent.feedbacks = allFeedbacks.get(agentId) || [];
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
     * Fetch ALL feedbacks for ALL agents in 2 RPC calls
     * More efficient than calling readAllFeedback() per agent
     * @param includeRevoked - Include revoked feedbacks? Default: false
     * @returns Map of agentId -> SolanaFeedback[]
     * @throws UnsupportedRpcError if using default devnet RPC
     */
    async getAllFeedbacks(includeRevoked = false) {
        this.client.requireAdvancedQueries('getAllFeedbacks');
        return await this.feedbackManager.fetchAllFeedbacks(includeRevoked);
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
    async getResponseCount(agentId, clientOrFeedbackIndex, feedbackIndex) {
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        // Handle both old (agentId, client, feedbackIndex) and new (agentId, feedbackIndex) signatures
        let actualFeedbackIndex;
        if (feedbackIndex !== undefined) {
            // Old signature: (agentId, client, feedbackIndex)
            actualFeedbackIndex =
                typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
        }
        else {
            // New signature: (agentId, feedbackIndex)
            actualFeedbackIndex =
                typeof clientOrFeedbackIndex === 'number'
                    ? BigInt(clientOrFeedbackIndex)
                    : clientOrFeedbackIndex;
        }
        return await this.feedbackManager.getResponseCount(id, actualFeedbackIndex);
    }
    async readResponses(agentId, clientOrFeedbackIndex, feedbackIndex) {
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        // Handle both old (agentId, client, feedbackIndex) and new (agentId, feedbackIndex) signatures
        let actualFeedbackIndex;
        if (feedbackIndex !== undefined) {
            // Old signature: (agentId, client, feedbackIndex)
            actualFeedbackIndex =
                typeof feedbackIndex === 'number' ? BigInt(feedbackIndex) : feedbackIndex;
        }
        else {
            // New signature: (agentId, feedbackIndex)
            actualFeedbackIndex =
                typeof clientOrFeedbackIndex === 'number'
                    ? BigInt(clientOrFeedbackIndex)
                    : clientOrFeedbackIndex;
        }
        return await this.feedbackManager.readResponses(id, actualFeedbackIndex);
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
     * Delete a metadata entry for an agent (write operation)
     * Only works if metadata is not immutable
     * @param agentId - Agent ID (number or bigint)
     * @param key - Metadata key to delete
     * @param options - Write options (skipSend, signer)
     */
    async deleteMetadata(agentId, key, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        // Resolve agentId → asset (v0.2.0: Core asset)
        await this.initializeMintResolver();
        const asset = await this.mintResolver.resolve(id);
        return await this.identityTxBuilder.deleteMetadata(asset, key, options);
    }
    /**
     * Give feedback to an agent (write operation)
     * Aligned with agent0-ts SDK interface
     * @param agentId - Agent ID (number or bigint)
     * @param feedbackFile - Feedback data object
     * @param options - Write options (skipSend, signer)
     */
    async giveFeedback(agentId, feedbackFile, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        const id = typeof agentId === 'number' ? BigInt(agentId) : agentId;
        // Resolve agentId → asset (v0.2.0: Core asset)
        await this.initializeMintResolver();
        const asset = await this.mintResolver.resolve(id);
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