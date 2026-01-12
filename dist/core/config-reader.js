/**
 * Registry Config Reader
 * v0.3.0 - Multi-collection support
 * Fetches and deserializes RootConfig and RegistryConfig accounts from on-chain
 */
import { RootConfig, RegistryConfig } from './borsh-schemas.js';
import { PDAHelpers } from './pda-helpers.js';
import { logger } from '../utils/logger.js';
/**
 * Fetch the Root Config from on-chain - v0.3.0
 * @param connection - Solana RPC connection
 * @returns RootConfig or null if not initialized
 */
export async function fetchRootConfig(connection) {
    try {
        const [rootConfigPda] = PDAHelpers.getRootConfigPDA();
        const accountInfo = await connection.getAccountInfo(rootConfigPda);
        if (!accountInfo || accountInfo.data.length === 0) {
            return null;
        }
        return RootConfig.deserialize(accountInfo.data);
    }
    catch (error) {
        logger.error('Error fetching root config', error);
        return null;
    }
}
/**
 * Fetch a Registry Config from on-chain - v0.3.0
 * @param connection - Solana RPC connection
 * @param collection - Collection pubkey for the registry
 * @returns RegistryConfig or null if not initialized
 */
export async function fetchRegistryConfig(connection, collection) {
    try {
        const [configPda] = PDAHelpers.getRegistryConfigPDA(collection);
        const accountInfo = await connection.getAccountInfo(configPda);
        if (!accountInfo || accountInfo.data.length === 0) {
            return null;
        }
        return RegistryConfig.deserialize(accountInfo.data);
    }
    catch (error) {
        logger.error('Error fetching registry config', error);
        return null;
    }
}
/**
 * Fetch a Registry Config directly by its PDA address - v0.3.0
 * Use this when you have the RegistryConfig PDA (e.g., from RootConfig.current_base_registry)
 * @param connection - Solana RPC connection
 * @param registryConfigPda - The RegistryConfig PDA address
 * @returns RegistryConfig or null if not found
 */
export async function fetchRegistryConfigByPda(connection, registryConfigPda) {
    try {
        const accountInfo = await connection.getAccountInfo(registryConfigPda);
        if (!accountInfo || accountInfo.data.length === 0) {
            return null;
        }
        return RegistryConfig.deserialize(accountInfo.data);
    }
    catch (error) {
        logger.error('Error fetching registry config by PDA', error);
        return null;
    }
}
/**
 * Check if the Root Registry has been initialized - v0.3.0
 * @param connection - Solana RPC connection
 * @returns true if initialized, false otherwise
 */
export async function isRegistryInitialized(connection) {
    const rootConfig = await fetchRootConfig(connection);
    return rootConfig !== null;
}
/**
 * Get the current base collection from root config - v0.3.0
 * Note: RootConfig.current_base_registry stores the RegistryConfig PDA, not the collection.
 * This function fetches the RegistryConfig and returns the actual collection.
 * @param connection - Solana RPC connection
 * @returns Base collection pubkey or null if not initialized
 */
export async function getCurrentBaseCollection(connection) {
    const rootConfig = await fetchRootConfig(connection);
    if (!rootConfig) {
        return null;
    }
    // current_base_registry is the RegistryConfig PDA, not the collection
    const registryConfigPda = rootConfig.getCurrentBaseRegistryPublicKey();
    const registryConfig = await fetchRegistryConfigByPda(connection, registryConfigPda);
    if (!registryConfig) {
        return null;
    }
    return registryConfig.getCollectionPublicKey();
}
/**
 * Get the current base registry config PDA from root config - v0.3.0
 * @param connection - Solana RPC connection
 * @returns Base RegistryConfig PDA or null if not initialized
 */
export async function getCurrentBaseRegistryPda(connection) {
    const rootConfig = await fetchRootConfig(connection);
    if (!rootConfig) {
        return null;
    }
    return rootConfig.getCurrentBaseRegistryPublicKey();
}
//# sourceMappingURL=config-reader.js.map