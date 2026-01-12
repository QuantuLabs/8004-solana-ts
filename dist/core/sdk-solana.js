/**
 * Solana SDK for Agent0 - ERC-8004 implementation
 * v0.4.0 - ATOM Engine integration + Indexer support
 * Provides read and write access to Solana-based agent registries
 *
 * BREAKING CHANGES from v0.3.0:
 * - GiveFeedback/RevokeFeedback now use ATOM Engine for reputation tracking
 * - New ATOM methods: getAtomStats, getTrustTier, getEnrichedSummary
 * - Optional indexer integration for fast queries
 */
import bs58 from 'bs58';
import { SolanaClient, createDevnetClient, UnsupportedRpcError } from './client.js';
import { SolanaFeedbackManager } from './feedback-manager-solana.js';
import { PDAHelpers } from './pda-helpers.js';
import { getProgramIds } from './programs.js';
import { createHash } from 'crypto';
import { ACCOUNT_DISCRIMINATORS } from './instruction-discriminators.js';
import { AgentAccount, MetadataEntryPda } from './borsh-schemas.js';
import { IdentityTransactionBuilder, ReputationTransactionBuilder, ValidationTransactionBuilder, AtomTransactionBuilder, } from './transaction-builder.js';
import { AgentMintResolver } from './agent-mint-resolver.js';
import { getCurrentBaseCollection, fetchRegistryConfig } from './config-reader.js';
import { RegistryConfig } from './borsh-schemas.js';
import { logger } from '../utils/logger.js';
// ATOM Engine imports (v0.4.0)
import { AtomStats, TrustTier } from './atom-schemas.js';
import { getAtomStatsPDA } from './atom-pda.js';
// Indexer imports (v0.4.0)
import { IndexerClient, } from './indexer-client.js';
import { indexedFeedbackToSolanaFeedback } from './indexer-types.js';
// Indexer defaults (v0.4.1)
import { DEFAULT_INDEXER_URL, DEFAULT_INDEXER_API_KEY, DEFAULT_FORCE_ON_CHAIN, SMALL_QUERY_OPERATIONS, } from './indexer-defaults.js';
/**
 * Main SDK class for Solana ERC-8004 implementation
 * v0.4.0 - ATOM Engine + Indexer support
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
    atomTxBuilder;
    mintResolver;
    baseCollection;
    // Indexer (v0.4.0)
    indexerClient;
    useIndexer;
    indexerFallback;
    forceOnChain;
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
        // Initialize transaction builders (v0.4.0)
        const connection = this.client.getConnection();
        this.identityTxBuilder = new IdentityTransactionBuilder(connection, this.signer);
        this.reputationTxBuilder = new ReputationTransactionBuilder(connection, this.signer);
        this.validationTxBuilder = new ValidationTransactionBuilder(connection, this.signer);
        this.atomTxBuilder = new AtomTransactionBuilder(connection, this.signer);
        // Initialize indexer client (v0.4.1) - always created with defaults
        const indexerUrl = config.indexerUrl ?? DEFAULT_INDEXER_URL;
        const indexerApiKey = config.indexerApiKey ?? DEFAULT_INDEXER_API_KEY;
        this.indexerClient = new IndexerClient({
            baseUrl: indexerUrl,
            apiKey: indexerApiKey,
        });
        this.useIndexer = config.useIndexer ?? true;
        this.indexerFallback = config.indexerFallback ?? true;
        // Force on-chain mode (bypass indexer)
        this.forceOnChain = config.forceOnChain ?? DEFAULT_FORCE_ON_CHAIN;
    }
    /**
     * Check if operation is a "small query" that prefers RPC in 'auto' mode
     */
    isSmallQuery(operation) {
        return SMALL_QUERY_OPERATIONS.includes(operation);
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
            logger.error('Error loading agent', error);
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
            // Compute key hash (SHA256(key)[0..16]) - v1.9 security update
            const keyHash = createHash('sha256').update(key).digest().slice(0, 16);
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
            logger.error(`Error getting metadata for key "${key}"`, error);
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
            // AgentAccount layout: discriminator (8) + collection (32) + owner (32)
            // Owner is at offset 8 + 32 = 40
            const agentAccounts = await this.client.getProgramAccounts(programId, [
                {
                    memcmp: {
                        offset: 0,
                        bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.AgentAccount),
                    },
                },
                {
                    memcmp: {
                        offset: 40, // owner is after discriminator (8) + collection (32)
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
            logger.error('Error getting agents for owner', error);
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
            logger.error('Error getting all agents', error);
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
    // ==================== Collection Methods (v0.4.0) ====================
    /**
     * Get collection details by collection pubkey - v0.4.0
     * @param collection - Collection (Metaplex Core collection) public key
     * @returns Collection info or null if not registered
     */
    async getCollection(collection) {
        try {
            const connection = this.client.getConnection();
            const registryConfig = await fetchRegistryConfig(connection, collection);
            if (!registryConfig) {
                return null;
            }
            return {
                collection: registryConfig.getCollectionPublicKey(),
                registryType: registryConfig.isBaseRegistry() ? 'BASE' : 'USER',
                authority: registryConfig.getAuthorityPublicKey(),
                baseIndex: registryConfig.base_index,
            };
        }
        catch (error) {
            logger.error('Error getting collection', error);
            return null;
        }
    }
    /**
     * Get all registered collections - v0.4.0
     * Note: This always uses on-chain queries because indexer doesn't have
     * registryType/authority/baseIndex. Use getCollectionStats() for indexed stats.
     * @returns Array of all collection infos
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
     */
    async getCollections() {
        this.client.requireAdvancedQueries('getCollections');
        try {
            const programId = this.programIds.identityRegistry;
            // Fetch all RegistryConfig accounts
            const registryAccounts = await this.client.getProgramAccounts(programId, [
                {
                    memcmp: {
                        offset: 0,
                        bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.RegistryConfig),
                    },
                },
            ]);
            return registryAccounts.map((acc) => {
                const config = RegistryConfig.deserialize(acc.data);
                return {
                    collection: config.getCollectionPublicKey(),
                    registryType: config.isBaseRegistry() ? 'BASE' : 'USER',
                    authority: config.getAuthorityPublicKey(),
                    baseIndex: config.base_index,
                };
            });
        }
        catch (error) {
            logger.error('Error getting collections', error);
            return [];
        }
    }
    /**
     * Get all agents in a collection (on-chain) - v0.4.0
     * Returns full AgentAccount data with metadata extensions.
     *
     * For faster queries, use `getLeaderboard({ collection: 'xxx' })` which uses the indexer.
     *
     * @param collection - Collection public key
     * @param options - Optional settings for additional data fetching
     * @returns Array of agents with metadata (and optionally feedbacks)
     * @throws UnsupportedRpcError if using default devnet RPC (requires getProgramAccounts)
     */
    async getCollectionAgents(collection, options) {
        // Skip on-chain if indexer preferred and user doesn't need full account data
        // Note: For indexed queries, use getLeaderboard({ collection }) instead
        this.client.requireAdvancedQueries('getCollectionAgents');
        try {
            const programId = this.programIds.identityRegistry;
            // 1. Fetch agent accounts filtered by collection (1 RPC call)
            // AgentAccount layout: discriminator (8) + collection (32)
            // Collection is at offset 8
            const agentAccounts = await this.client.getProgramAccounts(programId, [
                {
                    memcmp: {
                        offset: 0,
                        bytes: bs58.encode(ACCOUNT_DISCRIMINATORS.AgentAccount),
                    },
                },
                {
                    memcmp: {
                        offset: 8, // collection is right after discriminator
                        bytes: collection.toBase58(),
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
            // Map metadata to agents (by asset)
            const metadataMap = new Map();
            for (const acc of metadataAccounts) {
                try {
                    const entry = MetadataEntryPda.deserialize(acc.data);
                    const assetKey = entry.getAssetPublicKey().toBase58();
                    if (!metadataMap.has(assetKey)) {
                        metadataMap.set(assetKey, []);
                    }
                    metadataMap.get(assetKey).push({
                        key: entry.key,
                        value: entry.value,
                    });
                }
                catch {
                    // Skip invalid metadata entries
                }
            }
            // Build result
            const result = agents.map((agent) => ({
                account: agent,
                metadata: metadataMap.get(agent.getAssetPublicKey().toBase58()) || [],
                feedbacks: [],
            }));
            // 3. Optionally fetch feedbacks
            if (options?.includeFeedbacks) {
                // getAllFeedbacks returns Map<assetKey, SolanaFeedback[]>
                const feedbackMap = await this.getAllFeedbacks(options.includeRevoked);
                for (const agent of result) {
                    agent.feedbacks = feedbackMap.get(agent.account.getAssetPublicKey().toBase58()) || [];
                }
            }
            return result;
        }
        catch (error) {
            logger.error('Error getting collection agents', error);
            return [];
        }
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
    // ==================== ATOM Engine Methods (v0.4.0) ====================
    /**
     * Get ATOM stats for an agent
     * @param asset - Agent Core asset pubkey
     * @returns AtomStats account data or null if not found
     */
    async getAtomStats(asset) {
        try {
            const [atomStatsPDA] = getAtomStatsPDA(asset);
            const connection = this.client.getConnection();
            const accountInfo = await connection.getAccountInfo(atomStatsPDA);
            if (!accountInfo || !accountInfo.data) {
                return null;
            }
            // AtomStats.deserialize handles the 8-byte discriminator internally
            return AtomStats.deserialize(Buffer.from(accountInfo.data));
        }
        catch (error) {
            logger.error('Error fetching ATOM stats', error);
            return null;
        }
    }
    /**
     * Initialize ATOM stats for an agent (write operation) - v0.4.0
     * Must be called by the agent owner before any feedback can be given
     * @param asset - Agent Core asset pubkey
     * @param options - Write options (skipSend, signer)
     */
    async initializeAtomStats(asset, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        return await this.atomTxBuilder.initializeStats(asset, options);
    }
    /**
     * Get trust tier for an agent
     * @param asset - Agent Core asset pubkey
     * @returns TrustTier enum value (0-4)
     */
    async getTrustTier(asset) {
        const stats = await this.getAtomStats(asset);
        if (!stats) {
            return TrustTier.Unrated;
        }
        return stats.trust_tier;
    }
    /**
     * Get enriched summary combining agent data with ATOM metrics
     * @param asset - Agent Core asset pubkey
     * @returns EnrichedSummary with full reputation data
     */
    async getEnrichedSummary(asset) {
        // Fetch agent, ATOM stats, and base collection in parallel
        const [agent, atomStats, baseCollection] = await Promise.all([
            this.loadAgent(asset),
            this.getAtomStats(asset),
            this.getBaseCollection(),
        ]);
        if (!agent) {
            return null;
        }
        // Get basic summary from feedback manager
        const summary = await this.feedbackManager.getSummary(asset);
        // Get collection from AtomStats if available, otherwise use base collection
        const collection = atomStats
            ? atomStats.getCollectionPublicKey()
            : (baseCollection || asset); // fallback to asset if no collection found
        return {
            asset,
            owner: agent.getOwnerPublicKey(),
            collection,
            // Basic reputation metrics
            totalFeedbacks: summary.totalFeedbacks,
            averageScore: summary.averageScore,
            positiveCount: summary.positiveCount,
            negativeCount: summary.negativeCount,
            // ATOM metrics (from AtomStats or defaults)
            trustTier: atomStats ? atomStats.trust_tier : TrustTier.Unrated,
            qualityScore: atomStats?.quality_score ?? 0,
            confidence: atomStats?.confidence ?? 0,
            riskScore: atomStats?.risk_score ?? 0,
            diversityRatio: atomStats?.diversity_ratio ?? 0,
            uniqueCallers: atomStats?.getUniqueCallersEstimate() ?? 0,
            emaScoreFast: atomStats?.ema_score_fast ?? 0,
            emaScoreSlow: atomStats?.ema_score_slow ?? 0,
            volatility: atomStats?.ema_volatility ?? 0,
        };
    }
    // ==================== Indexer Methods (v0.4.0) ====================
    /**
     * Helper: Execute with indexer fallback to on-chain
     * Used internally when forceRpc='false' (force indexer mode)
     */
    async withIndexerFallback(indexerFn, onChainFn, operationName) {
        if (!this.useIndexer) {
            return onChainFn();
        }
        try {
            return await indexerFn();
        }
        catch (error) {
            if (this.indexerFallback) {
                const errMsg = error instanceof Error ? error.message : String(error);
                logger.warn(`Indexer failed for ${operationName}, falling back to on-chain: ${errMsg}`);
                return onChainFn();
            }
            throw error;
        }
    }
    /**
     * Smart routing helper: Chooses between indexer and RPC
     * - forceOnChain=true: All on-chain
     * - forceOnChain=false: Smart routing (RPC for small queries, indexer for large)
     */
    async withSmartRouting(operation, indexerFn, onChainFn) {
        // Force on-chain mode
        if (this.forceOnChain) {
            logger.debug(`[${operation}] Forcing on-chain (forceOnChain=true)`);
            return onChainFn();
        }
        // Smart routing: RPC for small queries, indexer for large
        if (this.isSmallQuery(operation)) {
            logger.debug(`[${operation}] Small query → RPC`);
            try {
                return await onChainFn();
            }
            catch (error) {
                // Fallback to indexer if RPC fails and indexer is enabled
                if (this.useIndexer) {
                    logger.debug(`[${operation}] RPC failed, falling back to indexer`);
                    return indexerFn();
                }
                throw error;
            }
        }
        // Large query → indexer with fallback
        logger.debug(`[${operation}] Large query → indexer`);
        return this.withIndexerFallback(indexerFn, onChainFn, operation);
    }
    /**
     * Check if indexer is available
     */
    async isIndexerAvailable() {
        return this.indexerClient.isAvailable();
    }
    /**
     * Get the indexer client for direct access
     */
    getIndexerClient() {
        return this.indexerClient;
    }
    /**
     * Helper: Throws if forceOnChain=true for indexer-only methods
     */
    requireIndexer(methodName) {
        if (this.forceOnChain) {
            throw new Error(`${methodName} requires indexer (no on-chain equivalent). ` +
                `Set forceOnChain=false or remove FORCE_ON_CHAIN env var.`);
        }
    }
    /**
     * Search agents with filters (indexer only)
     * @param params - Search parameters
     * @returns Array of indexed agents
     */
    async searchAgents(params) {
        this.requireIndexer('searchAgents');
        // Build query based on params
        if (params.owner) {
            return this.indexerClient.getAgentsByOwner(params.owner);
        }
        if (params.collection) {
            return this.indexerClient.getAgentsByCollection(params.collection);
        }
        if (params.wallet) {
            const agent = await this.indexerClient.getAgentByWallet(params.wallet);
            return agent ? [agent] : [];
        }
        // General query with pagination
        return this.indexerClient.getAgents({
            limit: params.limit,
            offset: params.offset,
            order: params.orderBy,
        });
    }
    /**
     * Get leaderboard (top agents by sort_key) - indexer only
     * Uses keyset pagination for scale (millions of agents)
     * @param options.collection - Optional collection filter
     * @param options.minTier - Minimum trust tier (0-4)
     * @param options.limit - Number of results (default: 50)
     * @param options.cursorSortKey - Cursor for keyset pagination
     * @returns Array of agents sorted by sort_key DESC
     */
    async getLeaderboard(options) {
        this.requireIndexer('getLeaderboard');
        return this.indexerClient.getLeaderboard(options);
    }
    /**
     * Get global statistics - indexer only
     * @returns Global stats (total agents, feedbacks, etc.)
     */
    async getGlobalStats() {
        this.requireIndexer('getGlobalStats');
        return this.indexerClient.getGlobalStats();
    }
    /**
     * Get collection statistics - indexer only
     * @param collection - Collection pubkey string
     * @returns Collection stats or null if not found
     */
    async getCollectionStats(collection) {
        this.requireIndexer('getCollectionStats');
        return this.indexerClient.getCollectionStats(collection);
    }
    /**
     * Get feedbacks by endpoint - indexer only
     * @param endpoint - Endpoint string (e.g., '/api/chat')
     * @returns Array of feedbacks for this endpoint
     */
    async getFeedbacksByEndpoint(endpoint) {
        this.requireIndexer('getFeedbacksByEndpoint');
        return this.indexerClient.getFeedbacksByEndpoint(endpoint);
    }
    /**
     * Get feedbacks by tag - indexer only
     * @param tag - Tag to search for (in tag1 or tag2)
     * @returns Array of feedbacks with this tag
     */
    async getFeedbacksByTag(tag) {
        this.requireIndexer('getFeedbacksByTag');
        return this.indexerClient.getFeedbacksByTag(tag);
    }
    /**
     * Get agent by operational wallet - indexer only
     * @param wallet - Agent wallet pubkey string
     * @returns Indexed agent or null
     */
    async getAgentByWallet(wallet) {
        this.requireIndexer('getAgentByWallet');
        return this.indexerClient.getAgentByWallet(wallet);
    }
    /**
     * Get pending validations for a validator - indexer only
     * @param validator - Validator pubkey string
     * @returns Array of pending validation requests
     */
    async getPendingValidations(validator) {
        this.requireIndexer('getPendingValidations');
        return this.indexerClient.getPendingValidations(validator);
    }
    /**
     * Get agent reputation from indexer (with on-chain fallback)
     * @param asset - Agent asset pubkey
     * @returns Indexed reputation data
     */
    async getAgentReputationFromIndexer(asset) {
        return this.withIndexerFallback(async () => {
            if (!this.indexerClient)
                throw new Error('No indexer');
            return this.indexerClient.getAgentReputation(asset.toBase58());
        }, async () => {
            // Fallback: build from on-chain data
            const [summary, agent, baseCollection] = await Promise.all([
                this.feedbackManager.getSummary(asset),
                this.loadAgent(asset),
                this.getBaseCollection(),
            ]);
            if (!agent)
                return null;
            // v0.4.0: Collection not stored in AgentAccount, use base collection
            const collectionStr = baseCollection?.toBase58() || '';
            return {
                asset: asset.toBase58(),
                owner: agent.getOwnerPublicKey().toBase58(),
                collection: collectionStr,
                nft_name: agent.nft_name || null,
                agent_uri: agent.agent_uri || null,
                feedback_count: summary.totalFeedbacks,
                avg_score: summary.averageScore || null,
                positive_count: summary.positiveCount,
                negative_count: summary.negativeCount,
                validation_count: 0, // Not available on-chain easily
            };
        }, 'getAgentReputation');
    }
    /**
     * Get feedbacks from indexer (with on-chain fallback)
     * @param asset - Agent asset pubkey
     * @param options - Query options
     * @returns Array of feedbacks (SolanaFeedback format)
     */
    async getFeedbacksFromIndexer(asset, options) {
        return this.withIndexerFallback(async () => {
            if (!this.indexerClient)
                throw new Error('No indexer');
            const indexed = await this.indexerClient.getFeedbacks(asset.toBase58(), options);
            return indexed.map(indexedFeedbackToSolanaFeedback);
        }, async () => {
            return this.feedbackManager.readAllFeedback(asset, options?.includeRevoked ?? false);
        }, 'getFeedbacks');
    }
    // ==================== Write Methods (require signer) - v0.4.0 ====================
    /**
     * Check if SDK has write permissions
     */
    get canWrite() {
        return this.signer !== undefined;
    }
    /**
     * Create a new user collection (write operation) - v0.4.1
     * Users can create their own collections to organize agents.
     * Agents registered to user collections still use the same reputation system.
     *
     * @param name - Collection name (max 32 bytes)
     * @param uri - Collection metadata URI (max 200 bytes)
     * @param options - Write options (skipSend, signer, collectionPubkey)
     * @returns Transaction result with collection pubkey, or PreparedTransaction if skipSend
     *
     * @example
     * ```typescript
     * // Create a new collection
     * const result = await sdk.createCollection('MyAgents', 'ipfs://Qm...');
     * console.log('Collection:', result.collection?.toBase58());
     *
     * // Register agent in user collection
     * await sdk.registerAgent('ipfs://agent-uri', result.collection);
     * ```
     */
    async createCollection(name, uri, options) {
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        return await this.identityTxBuilder.createCollection(name, uri, options);
    }
    /**
     * Register a new agent (write operation) - v0.3.0
     * @param tokenUri - Token URI pointing to agent metadata JSON
     * @param collection - Optional collection pubkey (defaults to base registry, only creator can register)
     * @param options - Write options (skipSend, signer, assetPubkey)
     * @returns Transaction result with asset, or PreparedTransaction if skipSend
     */
    async registerAgent(tokenUri, collection, options) {
        // For non-skipSend operations, require signer
        if (!options?.skipSend && !this.signer) {
            throw new Error('No signer configured - SDK is read-only. Use skipSend: true with a signer option for server mode.');
        }
        return await this.identityTxBuilder.registerAgent(tokenUri, collection, options);
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