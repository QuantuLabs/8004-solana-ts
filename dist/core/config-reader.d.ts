/**
 * Registry Config Reader
 * v0.3.0 - Multi-collection support
 * Fetches and deserializes RootConfig and RegistryConfig accounts from on-chain
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { RootConfig, RegistryConfig } from './borsh-schemas.js';
/**
 * Fetch the Root Config from on-chain - v0.3.0
 * @param connection - Solana RPC connection
 * @returns RootConfig or null if not initialized
 */
export declare function fetchRootConfig(connection: Connection): Promise<RootConfig | null>;
/**
 * Fetch a Registry Config from on-chain - v0.3.0
 * @param connection - Solana RPC connection
 * @param collection - Collection pubkey for the registry
 * @returns RegistryConfig or null if not initialized
 */
export declare function fetchRegistryConfig(connection: Connection, collection: PublicKey): Promise<RegistryConfig | null>;
/**
 * Fetch a Registry Config directly by its PDA address - v0.3.0
 * Use this when you have the RegistryConfig PDA (e.g., from RootConfig.current_base_registry)
 * @param connection - Solana RPC connection
 * @param registryConfigPda - The RegistryConfig PDA address
 * @returns RegistryConfig or null if not found
 */
export declare function fetchRegistryConfigByPda(connection: Connection, registryConfigPda: PublicKey): Promise<RegistryConfig | null>;
/**
 * Check if the Root Registry has been initialized - v0.3.0
 * @param connection - Solana RPC connection
 * @returns true if initialized, false otherwise
 */
export declare function isRegistryInitialized(connection: Connection): Promise<boolean>;
/**
 * Get the current base collection from root config - v0.3.0
 * Note: RootConfig.current_base_registry stores the RegistryConfig PDA, not the collection.
 * This function fetches the RegistryConfig and returns the actual collection.
 * @param connection - Solana RPC connection
 * @returns Base collection pubkey or null if not initialized
 */
export declare function getCurrentBaseCollection(connection: Connection): Promise<PublicKey | null>;
/**
 * Get the current base registry config PDA from root config - v0.3.0
 * @param connection - Solana RPC connection
 * @returns Base RegistryConfig PDA or null if not initialized
 */
export declare function getCurrentBaseRegistryPda(connection: Connection): Promise<PublicKey | null>;
//# sourceMappingURL=config-reader.d.ts.map