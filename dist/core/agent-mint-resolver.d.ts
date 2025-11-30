/**
 * Agent Mint Resolver
 * Resolves agent_id (bigint) to agent_mint (PublicKey) using Agent PDA accounts
 *
 * Strategy:
 * - Each agent has a PDA account derived from: [b"agent", agent_mint, program_id]
 * - We iterate through possible sequential agent IDs
 * - For each ID, we try to find an agent PDA that matches
 * - Cache results for O(1) subsequent lookups
 *
 * NOTE: This approach requires scanning agent PDAs, not Metaplex metadata,
 * because the collection filter doesn't work (agents don't have collection set).
 */
import { Connection, PublicKey } from '@solana/web3.js';
/**
 * Agent Mint Resolver
 * Maps agent_id → agent_mint using NFT metadata
 */
export declare class AgentMintResolver {
    private cache;
    private connection;
    private collectionMint;
    constructor(connection: Connection, collectionMint: PublicKey);
    /**
     * Resolve agent_id to agent_mint PublicKey
     * @param agentId - Sequential agent ID (0, 1, 2...)
     * @returns agent_mint PublicKey
     * @throws Error if agent not found
     */
    resolve(agentId: bigint): Promise<PublicKey>;
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
     * Find agent mint by NFT name using Metaplex metadata
     * @param targetName - NFT name to search for (e.g., "Agent #5")
     * @returns mint PublicKey or null if not found
     */
    private findMintByName;
    /**
     * Parse Metaplex metadata account data
     * Simplified parser for extracting mint and name
     *
     * Metadata account layout:
     * - offset 0: key (1 byte)
     * - offset 1: update_authority (32 bytes)
     * - offset 33: mint (32 bytes)
     * - offset 65: name_length (4 bytes u32 LE)
     * - offset 69: name (string)
     * - offset 69 + name_length: symbol_length (4 bytes u32 LE)
     * - offset 73 + name_length: symbol (string)
     * - offset 73 + name_length + symbol_length: uri_length (4 bytes u32 LE)
     * - offset 77 + name_length + symbol_length: uri (string)
     *
     * @param data - Raw account data buffer
     * @returns Parsed metadata
     */
    private parseMetadataAccount;
    /**
     * Batch resolve multiple agent IDs
     * More efficient than resolving one at a time
     * @param agentIds - Array of agent IDs to resolve
     * @returns Map of agent_id → agent_mint
     */
    batchResolve(agentIds: bigint[]): Promise<Map<bigint, PublicKey>>;
}
//# sourceMappingURL=agent-mint-resolver.d.ts.map