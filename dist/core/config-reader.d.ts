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
 * Check if the Root Registry has been initialized - v0.3.0
 * @param connection - Solana RPC connection
 * @returns true if initialized, false otherwise
 */
export declare function isRegistryInitialized(connection: Connection): Promise<boolean>;
/**
 * Get the current base collection from root config - v0.3.0
 * @param connection - Solana RPC connection
 * @returns Base collection pubkey or null if not initialized
 */
export declare function getCurrentBaseCollection(connection: Connection): Promise<PublicKey | null>;
//# sourceMappingURL=config-reader.d.ts.map