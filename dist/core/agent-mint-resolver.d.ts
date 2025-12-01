/**
 * Agent Mint Resolver
 * Resolves agent_id (bigint) to agent_mint (PublicKey) using Identity Registry accounts
 *
 * Strategy:
 * - Scan the Identity Registry program (not Metaplex!) for AgentAccount PDAs
 * - Each AgentAccount contains agent_id and agent_mint
 * - Load all agents once and cache for O(1) subsequent lookups
 *
 * This is MUCH faster than scanning Metaplex (millions of NFTs) because:
 * - Identity Registry has only ~27 agents vs millions of Metaplex metadata accounts
 * - Single getProgramAccounts call fetches all mappings
 */
import { Connection, PublicKey } from '@solana/web3.js';
/**
 * Agent Mint Resolver
 * Maps agent_id → agent_mint using Identity Registry accounts
 */
export declare class AgentMintResolver {
    private cache;
    private connection;
    private cacheLoaded;
    constructor(connection: Connection, _collectionMint?: PublicKey);
    /**
     * Resolve agent_id to agent_mint PublicKey
     * @param agentId - Sequential agent ID (0, 1, 2...)
     * @returns agent_mint PublicKey
     * @throws Error if agent not found
     */
    resolve(agentId: bigint): Promise<PublicKey>;
    /**
     * Load all agents from Identity Registry and populate cache
     * This is much faster than scanning Metaplex (one RPC call vs millions of accounts)
     */
    private loadAllAgents;
    /**
     * Manually add a mapping to cache (used after registration)
     * @param agentId - Agent ID
     * @param mint - Agent mint address
     */
    addToCache(agentId: bigint, mint: PublicKey): void;
    /**
     * Clear the cache (useful for testing or forcing refresh)
     */
    clearCache(): void;
    /**
     * Force reload all agents from chain
     */
    refresh(): Promise<void>;
    /**
     * Batch resolve multiple agent IDs
     * More efficient than resolving one at a time
     * @param agentIds - Array of agent IDs to resolve
     * @returns Map of agent_id → agent_mint
     */
    batchResolve(agentIds: bigint[]): Promise<Map<bigint, PublicKey>>;
    /**
     * Get cache size (number of loaded agents)
     */
    get size(): number;
}
//# sourceMappingURL=agent-mint-resolver.d.ts.map