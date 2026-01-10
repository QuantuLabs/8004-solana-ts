/**
 * Registry Config Reader
 * v0.3.0 - Multi-collection support
 * Fetches and deserializes RootConfig and RegistryConfig accounts from on-chain
 */
import { RootConfig, RegistryConfig } from './borsh-schemas.js';
import { PDAHelpers } from './pda-helpers.js';
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
        console.error('Error fetching root config:', error);
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
        console.error('Error fetching registry config:', error);
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
 * @param connection - Solana RPC connection
 * @returns Base collection pubkey or null if not initialized
 */
export async function getCurrentBaseCollection(connection) {
    const rootConfig = await fetchRootConfig(connection);
    if (!rootConfig) {
        return null;
    }
    return rootConfig.getCurrentBaseRegistryPublicKey();
}
//# sourceMappingURL=config-reader.js.map