/**
 * Registry Config Reader
 * v0.6.0 - Single-collection architecture
 * Fetches and deserializes RootConfig and RegistryConfig accounts from on-chain
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { RootConfig, RegistryConfig } from './borsh-schemas.js';
/**
 * Fetch the Root Config from on-chain - v0.3.0
 * @param connection - Solana RPC connection
 * @param programId - Optional agent-registry program ID override
 * @returns RootConfig or null if not initialized
 */
export declare function fetchRootConfig(connection: Connection, programId?: PublicKey): Promise<RootConfig | null>;
/**
 * Fetch a Registry Config from on-chain - v0.3.0
 * @param connection - Solana RPC connection
 * @param collection - Base registry collection pubkey
 * @param programId - Optional agent-registry program ID override
 * @returns RegistryConfig or null if not initialized
 */
export declare function fetchRegistryConfig(connection: Connection, collection: PublicKey, programId?: PublicKey): Promise<RegistryConfig | null>;
/**
 * Fetch a Registry Config directly by its PDA address - v0.3.0
 * Use this when you have the RegistryConfig PDA (e.g., from RootConfig.base_registry)
 * @param connection - Solana RPC connection
 * @param registryConfigPda - The RegistryConfig PDA address
 * @returns RegistryConfig or null if not found
 */
export declare function fetchRegistryConfigByPda(connection: Connection, registryConfigPda: PublicKey): Promise<RegistryConfig | null>;
/**
 * Check if the Root Registry has been initialized - v0.3.0
 * @param connection - Solana RPC connection
 * @param programId - Optional agent-registry program ID override
 * @returns true if initialized, false otherwise
 */
export declare function isRegistryInitialized(connection: Connection, programId?: PublicKey): Promise<boolean>;
/**
 * Get the base collection from root config - v0.6.0
 * Single-collection architecture: RootConfig.base_collection IS the collection directly
 * @param connection - Solana RPC connection
 * @param programId - Optional agent-registry program ID override
 * @returns Base registry collection pubkey or null if not initialized
 */
export declare function getBaseCollection(connection: Connection, programId?: PublicKey): Promise<PublicKey | null>;
/**
 * @deprecated Removed in v0.6.0 - single-collection architecture stores collection directly in RootConfig
 * Use getBaseCollection() instead
 */
export declare function getBaseRegistryPda(connection: Connection, programId?: PublicKey): Promise<PublicKey | null>;
//# sourceMappingURL=config-reader.d.ts.map