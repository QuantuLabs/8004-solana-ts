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
import { AgentAccount } from './borsh-schemas.js';
import { ACCOUNT_DISCRIMINATORS } from './instruction-discriminators.js';
import { IDENTITY_PROGRAM_ID } from './pda-helpers.js';
import bs58 from 'bs58';

/**
 * Agent Mint Resolver
 * Maps agent_id → agent_mint using Identity Registry accounts
 */
export class AgentMintResolver {
  private cache: Map<string, PublicKey> = new Map();
  private connection: Connection;
  private cacheLoaded: boolean = false;

  constructor(connection: Connection, _collectionMint?: PublicKey) {
    this.connection = connection;
    // collectionMint is no longer needed (was for Metaplex filtering)
  }

  /**
   * Resolve agent_id to agent_mint PublicKey
   * @param agentId - Sequential agent ID (0, 1, 2...)
   * @returns agent_mint PublicKey
   * @throws Error if agent not found
   */
  async resolve(agentId: bigint): Promise<PublicKey> {
    const cacheKey = agentId.toString();

    // Check cache first (O(1))
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // If cache not loaded, load all agents from Identity Registry
    if (!this.cacheLoaded) {
      await this.loadAllAgents();
    }

    // Now check cache again
    const mint = this.cache.get(cacheKey);
    if (!mint) {
      throw new Error(
        `Agent #${agentId} not found. The agent may not exist.`
      );
    }

    return mint;
  }

  /**
   * Load all agents from Identity Registry and populate cache
   * This is much faster than scanning Metaplex (one RPC call vs millions of accounts)
   */
  private async loadAllAgents(): Promise<void> {
    try {
      // Get AgentAccount discriminator bytes for filtering
      const discriminatorBytes = bs58.encode(ACCOUNT_DISCRIMINATORS.AgentAccount);

      // Fetch ALL AgentAccount PDAs from Identity Registry (single RPC call)
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

      // Parse each account and populate cache
      for (const { account } of accounts) {
        try {
          const agentAccount = AgentAccount.deserialize(Buffer.from(account.data));
          const agentId = agentAccount.agent_id.toString();
          const agentMint = agentAccount.getMintPublicKey();

          this.cache.set(agentId, agentMint);
        } catch {
          // Skip malformed accounts
          continue;
        }
      }

      this.cacheLoaded = true;
      console.log(`AgentMintResolver: Loaded ${this.cache.size} agents from Identity Registry`);
    } catch (error) {
      console.error(`Error loading agents from Identity Registry: ${error}`);
      throw new Error(`Failed to load agents: ${error}`);
    }
  }

  /**
   * Manually add a mapping to cache (used after registration)
   * @param agentId - Agent ID
   * @param mint - Agent mint address
   */
  addToCache(agentId: bigint, mint: PublicKey): void {
    this.cache.set(agentId.toString(), mint);
  }

  /**
   * Clear the cache (useful for testing or forcing refresh)
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheLoaded = false;
  }

  /**
   * Force reload all agents from chain
   */
  async refresh(): Promise<void> {
    this.clearCache();
    await this.loadAllAgents();
  }

  /**
   * Batch resolve multiple agent IDs
   * More efficient than resolving one at a time
   * @param agentIds - Array of agent IDs to resolve
   * @returns Map of agent_id → agent_mint
   */
  async batchResolve(agentIds: bigint[]): Promise<Map<bigint, PublicKey>> {
    // Ensure cache is loaded
    if (!this.cacheLoaded) {
      await this.loadAllAgents();
    }

    const results = new Map<bigint, PublicKey>();
    for (const agentId of agentIds) {
      const mint = this.cache.get(agentId.toString());
      if (mint) {
        results.set(agentId, mint);
      }
    }

    return results;
  }

  /**
   * Get cache size (number of loaded agents)
   */
  get size(): number {
    return this.cache.size;
  }
}
