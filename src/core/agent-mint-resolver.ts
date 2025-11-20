/**
 * Agent Mint Resolver
 * Resolves agent_id (bigint) to agent_mint (PublicKey) using Metaplex NFT metadata
 *
 * Strategy:
 * - Agent NFTs are named "Agent #{agent_id}" (e.g., "Agent #0", "Agent #5")
 * - All agents are part of a Metaplex verified collection
 * - Query Metaplex metadata accounts to find mint by name
 * - Cache results for O(1) subsequent lookups
 */

import { Connection, PublicKey } from '@solana/web3.js';

// Metaplex Token Metadata Program ID
const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/**
 * Simplified Metaplex Metadata structure
 */
interface MetadataAccount {
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}

/**
 * Agent Mint Resolver
 * Maps agent_id → agent_mint using NFT metadata
 */
export class AgentMintResolver {
  private cache: Map<string, PublicKey> = new Map();
  private connection: Connection;
  private collectionMint: PublicKey;

  constructor(connection: Connection, collectionMint: PublicKey) {
    this.connection = connection;
    this.collectionMint = collectionMint;
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

    // Query Metaplex metadata by NFT name
    const targetName = `Agent #${agentId}`;
    const mint = await this.findMintByName(targetName);

    if (!mint) {
      throw new Error(
        `Agent #${agentId} not found. The agent may not exist or metadata may not be indexed yet.`
      );
    }

    // Cache for future lookups
    this.cache.set(cacheKey, mint);
    return mint;
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
  }

  /**
   * Find agent mint by NFT name using Metaplex metadata
   * @param targetName - NFT name to search for (e.g., "Agent #5")
   * @returns mint PublicKey or null if not found
   */
  private async findMintByName(targetName: string): Promise<PublicKey | null> {
    try {
      // Query all Metaplex metadata accounts in the collection
      // Note: This uses getProgramAccounts which can be expensive
      // In production, consider using:
      // - Helius DAS API
      // - Metaplex Digital Asset Standard API
      // - Custom indexer
      const accounts = await this.connection.getProgramAccounts(METAPLEX_PROGRAM_ID, {
        filters: [
          {
            // Standard Metaplex metadata account size
            dataSize: 679,
          },
          {
            // Filter by collection mint
            // Collection field is at offset 326 in metadata account
            memcmp: {
              offset: 326,
              bytes: this.collectionMint.toBase58(),
            },
          },
        ],
      });

      // Parse each metadata account and find matching name
      for (const account of accounts) {
        try {
          const metadata = this.parseMetadataAccount(account.account.data);

          // Trim whitespace and compare names
          if (metadata.name.trim() === targetName) {
            return metadata.mint;
          }
        } catch (parseError) {
          // Skip accounts that fail to parse
          console.warn(`Failed to parse metadata account: ${parseError}`);
          continue;
        }
      }

      return null;
    } catch (error) {
      console.error(`Error querying Metaplex metadata: ${error}`);
      throw new Error(`Failed to query agent metadata: ${error}`);
    }
  }

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
  private parseMetadataAccount(data: Buffer): MetadataAccount {
    try {
      // Extract mint (offset 33, 32 bytes)
      const mint = new PublicKey(data.slice(33, 65));

      // Extract name
      const nameLength = data.readUInt32LE(65);
      const nameBytes = data.slice(69, 69 + nameLength);
      const name = nameBytes.toString('utf8');

      // Extract symbol
      const symbolOffset = 69 + nameLength;
      const symbolLength = data.readUInt32LE(symbolOffset);
      const symbolBytes = data.slice(symbolOffset + 4, symbolOffset + 4 + symbolLength);
      const symbol = symbolBytes.toString('utf8');

      // Extract URI
      const uriOffset = symbolOffset + 4 + symbolLength;
      const uriLength = data.readUInt32LE(uriOffset);
      const uriBytes = data.slice(uriOffset + 4, uriOffset + 4 + uriLength);
      const uri = uriBytes.toString('utf8');

      return {
        mint,
        name,
        symbol,
        uri,
      };
    } catch (error) {
      throw new Error(`Failed to parse metadata account: ${error}`);
    }
  }

  /**
   * Batch resolve multiple agent IDs
   * More efficient than resolving one at a time
   * @param agentIds - Array of agent IDs to resolve
   * @returns Map of agent_id → agent_mint
   */
  async batchResolve(agentIds: bigint[]): Promise<Map<bigint, PublicKey>> {
    const results = new Map<bigint, PublicKey>();

    // Check cache first
    const uncachedIds: bigint[] = [];
    for (const agentId of agentIds) {
      const cached = this.cache.get(agentId.toString());
      if (cached) {
        results.set(agentId, cached);
      } else {
        uncachedIds.push(agentId);
      }
    }

    // If all were cached, return early
    if (uncachedIds.length === 0) {
      return results;
    }

    // Build target names for uncached IDs
    const targetNames = new Set(uncachedIds.map(id => `Agent #${id}`));

    // Query all metadata accounts once
    const accounts = await this.connection.getProgramAccounts(METAPLEX_PROGRAM_ID, {
      filters: [
        { dataSize: 679 },
        {
          memcmp: {
            offset: 326,
            bytes: this.collectionMint.toBase58(),
          },
        },
      ],
    });

    // Parse and match
    for (const account of accounts) {
      try {
        const metadata = this.parseMetadataAccount(account.account.data);
        const trimmedName = metadata.name.trim();

        if (targetNames.has(trimmedName)) {
          // Extract agent_id from name "Agent #5" → 5
          const match = trimmedName.match(/^Agent #(\d+)$/);
          if (match) {
            const agentId = BigInt(match[1]);
            results.set(agentId, metadata.mint);
            this.cache.set(agentId.toString(), metadata.mint);
          }
        }
      } catch (error) {
        // Skip invalid accounts
        continue;
      }
    }

    return results;
  }
}
