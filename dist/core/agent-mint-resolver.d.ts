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
import { Connection, PublicKey } from '@solana/web3.js';
import { AgentAccount } from './borsh-schemas.js';
/**
 * Agent Resolver
 * v0.3.0 - Validates assets and loads agent accounts
 *
 * @deprecated In v0.3.0, agents are identified by their asset pubkey directly.
 * Use asset pubkeys instead of agent_id numbers.
 *
 * Note: Cache is not thread-safe. This is acceptable for Node.js single-threaded
 * event loop, but should be reviewed if used with Worker Threads.
 */
export declare class AgentMintResolver {
    private assetCache;
    private connection;
    private cacheLoaded;
    private loadingPromise;
    constructor(connection: Connection, _collectionMint?: PublicKey);
    /**
     * @deprecated Use asset pubkey directly. In v0.3.0, agents are identified by asset, not agent_id.
     *
     * For backwards compatibility, this method now throws an error.
     * Use getAgentByAsset() instead.
     */
    resolve(_agentId: bigint): Promise<PublicKey>;
    /**
     * Get AgentAccount by asset pubkey - v0.3.0
     * @param asset - Metaplex Core asset pubkey
     * @returns AgentAccount or null if not found
     */
    getAgentByAsset(asset: PublicKey): Promise<AgentAccount | null>;
    /**
     * Check if an asset is a registered agent
     * @param asset - Metaplex Core asset pubkey
     * @returns true if the asset is a registered agent
     */
    isRegisteredAgent(asset: PublicKey): Promise<boolean>;
    /**
     * Load all agents from Identity Registry - v0.3.0
     * Returns a map of asset pubkey → AgentAccount
     */
    loadAllAgents(): Promise<Map<string, AgentAccount>>;
    private doLoadAllAgents;
    /**
     * @deprecated Use asset pubkey directly. No need to cache agent_id → asset mapping.
     */
    addToCache(_agentId: bigint, _mint: PublicKey): void;
    /**
     * Clear the cache (useful for testing or forcing refresh)
     */
    clearCache(): void;
    /**
     * Force reload all agents from chain
     */
    refresh(): Promise<void>;
    /**
     * @deprecated Use loadAllAgents() instead. Agent IDs no longer exist.
     */
    batchResolve(_agentIds: bigint[]): Promise<Map<bigint, PublicKey>>;
    /**
     * Get cache size (number of loaded agents)
     */
    get size(): number;
}
//# sourceMappingURL=agent-mint-resolver.d.ts.map