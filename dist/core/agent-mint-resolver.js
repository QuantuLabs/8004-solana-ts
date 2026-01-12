/**
 * Agent Resolver
 * v0.3.0 - Asset-based identification
 *
 * NOTE: This class is largely deprecated in v0.3.0 since agents are now
 * identified directly by their Metaplex Core asset pubkey, not by sequential IDs.
 *
 * The class is kept for backwards compatibility but most methods are deprecated.
 * Use the asset pubkey directly instead of resolving from agent_id.
 */
import { AgentAccount } from './borsh-schemas.js';
import { ACCOUNT_DISCRIMINATORS } from './instruction-discriminators.js';
import { IDENTITY_PROGRAM_ID, PDAHelpers } from './pda-helpers.js';
import { logger } from '../utils/logger.js';
import bs58 from 'bs58';
/**
 * Security: Default limit for getProgramAccounts to prevent OOM
 * For production with large agent registries, use an indexer instead.
 */
const DEFAULT_MAX_ACCOUNTS = 1000;
/**
 * Agent Resolver
 * v0.3.0 - Validates assets and loads agent accounts
 *
 * @deprecated In v0.3.0, agents are identified by their asset pubkey directly.
 * Use asset pubkeys instead of agent_id numbers.
 *
 * Security: Thread-safety protection added in v0.3.0 - cache updates are atomic.
 */
export class AgentMintResolver {
    assetCache = new Map();
    connection;
    cacheLoaded = false;
    loadingPromise = null;
    constructor(connection, _collectionMint) {
        this.connection = connection;
    }
    /**
     * @deprecated Use asset pubkey directly. In v0.3.0, agents are identified by asset, not agent_id.
     *
     * For backwards compatibility, this method now throws an error.
     * Use getAgentByAsset() instead.
     */
    async resolve(_agentId) {
        throw new Error('AgentMintResolver.resolve() is deprecated in v0.3.0. ' +
            'Agents are now identified by asset pubkey, not agent_id. ' +
            'Use asset pubkey directly or getAgentByAsset() to validate an asset.');
    }
    /**
     * Get AgentAccount by asset pubkey - v0.3.0
     * @param asset - Metaplex Core asset pubkey
     * @returns AgentAccount or null if not found
     */
    async getAgentByAsset(asset) {
        const cacheKey = asset.toBase58();
        // Check cache first
        if (this.assetCache.has(cacheKey)) {
            return this.assetCache.get(cacheKey);
        }
        // Derive AgentAccount PDA
        const [agentPda] = PDAHelpers.getAgentPDA(asset);
        try {
            const accountInfo = await this.connection.getAccountInfo(agentPda);
            if (!accountInfo) {
                return null;
            }
            const agentAccount = AgentAccount.deserialize(Buffer.from(accountInfo.data));
            this.assetCache.set(cacheKey, agentAccount);
            return agentAccount;
        }
        catch {
            return null;
        }
    }
    /**
     * Check if an asset is a registered agent
     * @param asset - Metaplex Core asset pubkey
     * @returns true if the asset is a registered agent
     */
    async isRegisteredAgent(asset) {
        const agent = await this.getAgentByAsset(asset);
        return agent !== null;
    }
    /**
     * Load all agents from Identity Registry
     * Security: Limited to maxAccounts (default 1000) to prevent OOM
     */
    async loadAllAgents(options = {}) {
        if (this.loadingPromise) {
            return await this.loadingPromise;
        }
        this.loadingPromise = this.doLoadAllAgents(options);
        return await this.loadingPromise;
    }
    async doLoadAllAgents(options) {
        const maxAccounts = options.maxAccounts ?? DEFAULT_MAX_ACCOUNTS;
        const strictParsing = options.strictParsing ?? false;
        try {
            const discriminatorBytes = bs58.encode(ACCOUNT_DISCRIMINATORS.AgentAccount);
            const accounts = await this.connection.getProgramAccounts(IDENTITY_PROGRAM_ID, {
                filters: [
                    {
                        memcmp: {
                            offset: 0,
                            bytes: discriminatorBytes,
                        },
                    },
                ],
            });
            // Security: Warn if limit reached - may indicate need for indexer
            const limitReached = accounts.length > maxAccounts;
            if (limitReached) {
                logger.warn(`getProgramAccounts returned ${accounts.length} agents, limiting to ${maxAccounts}. ` +
                    `Consider using an indexer for production.`);
            }
            // Security: Build in temp map, then atomic swap to prevent race conditions
            const tempCache = new Map();
            let skippedAccounts = 0;
            const accountsToProcess = accounts.slice(0, maxAccounts);
            for (const { account } of accountsToProcess) {
                try {
                    const agentAccount = AgentAccount.deserialize(Buffer.from(account.data));
                    const assetPubkey = agentAccount.getAssetPublicKey();
                    tempCache.set(assetPubkey.toBase58(), agentAccount);
                }
                catch (parseError) {
                    if (strictParsing) {
                        throw new Error(`Failed to parse AgentAccount: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
                    }
                    skippedAccounts++;
                }
            }
            // Security: Log warning if accounts were skipped (may indicate corruption)
            if (skippedAccounts > 0) {
                logger.warn(`Skipped ${skippedAccounts} malformed AgentAccount(s) during load. ` +
                    `Use strictParsing: true to fail on parse errors.`);
            }
            // Atomic swap - prevents race condition with concurrent reads
            this.assetCache = tempCache;
            this.cacheLoaded = true;
            this.loadingPromise = null;
            return this.assetCache;
        }
        catch (error) {
            this.loadingPromise = null;
            // Security: Don't leak internal error details
            logger.error('Failed to load agents from Identity Registry', error);
            throw new Error('Failed to load agents from Identity Registry');
        }
    }
    /**
     * @deprecated Use asset pubkey directly. No need to cache agent_id → asset mapping.
     */
    addToCache(_agentId, _mint) {
        // No-op in v0.3.0
    }
    /**
     * Clear the cache (useful for testing or forcing refresh)
     */
    clearCache() {
        this.assetCache.clear();
        this.cacheLoaded = false;
        this.loadingPromise = null;
    }
    /**
     * Force reload all agents from chain
     */
    async refresh() {
        this.clearCache();
        await this.loadAllAgents();
    }
    /**
     * @deprecated Use loadAllAgents() instead. Agent IDs no longer exist.
     */
    async batchResolve(_agentIds) {
        throw new Error('AgentMintResolver.batchResolve() is deprecated in v0.3.0. ' +
            'Use loadAllAgents() to get all registered agents.');
    }
    /**
     * Get cache size (number of loaded agents)
     */
    get size() {
        return this.assetCache.size;
    }
}
//# sourceMappingURL=agent-mint-resolver.js.map