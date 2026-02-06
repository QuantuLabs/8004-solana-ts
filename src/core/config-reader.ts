/**
 * Registry Config Reader
 * v0.6.0 - Single-collection architecture
 * Fetches and deserializes RootConfig and RegistryConfig accounts from on-chain
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { RootConfig, RegistryConfig } from './borsh-schemas.js';
import { PDAHelpers } from './pda-helpers.js';
import { logger } from '../utils/logger.js';

/**
 * Fetch the Root Config from on-chain - v0.3.0
 * @param connection - Solana RPC connection
 * @returns RootConfig or null if not initialized
 */
export async function fetchRootConfig(
  connection: Connection
): Promise<RootConfig | null> {
  try {
    const [rootConfigPda] = PDAHelpers.getRootConfigPDA();
    const accountInfo = await connection.getAccountInfo(rootConfigPda);

    if (!accountInfo || accountInfo.data.length === 0) {
      return null;
    }

    return RootConfig.deserialize(accountInfo.data);
  } catch (error) {
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
export async function fetchRegistryConfig(
  connection: Connection,
  collection: PublicKey
): Promise<RegistryConfig | null> {
  try {
    const [configPda] = PDAHelpers.getRegistryConfigPDA(collection);
    const accountInfo = await connection.getAccountInfo(configPda);

    if (!accountInfo || accountInfo.data.length === 0) {
      return null;
    }

    return RegistryConfig.deserialize(accountInfo.data);
  } catch (error) {
    logger.error('Error fetching registry config', error);
    return null;
  }
}

/**
 * Fetch a Registry Config directly by its PDA address - v0.3.0
 * Use this when you have the RegistryConfig PDA (e.g., from RootConfig.base_registry)
 * @param connection - Solana RPC connection
 * @param registryConfigPda - The RegistryConfig PDA address
 * @returns RegistryConfig or null if not found
 */
export async function fetchRegistryConfigByPda(
  connection: Connection,
  registryConfigPda: PublicKey
): Promise<RegistryConfig | null> {
  try {
    const accountInfo = await connection.getAccountInfo(registryConfigPda);

    if (!accountInfo || accountInfo.data.length === 0) {
      return null;
    }

    return RegistryConfig.deserialize(accountInfo.data);
  } catch (error) {
    logger.error('Error fetching registry config by PDA', error);
    return null;
  }
}

/**
 * Check if the Root Registry has been initialized - v0.3.0
 * @param connection - Solana RPC connection
 * @returns true if initialized, false otherwise
 */
export async function isRegistryInitialized(
  connection: Connection
): Promise<boolean> {
  const rootConfig = await fetchRootConfig(connection);
  return rootConfig !== null;
}

/**
 * Get the base collection from root config - v0.6.0
 * Single-collection architecture: RootConfig.base_collection IS the collection directly
 * @param connection - Solana RPC connection
 * @returns Base collection pubkey or null if not initialized
 */
export async function getBaseCollection(
  connection: Connection
): Promise<PublicKey | null> {
  const rootConfig = await fetchRootConfig(connection);
  if (!rootConfig) {
    return null;
  }

  return rootConfig.getBaseCollectionPublicKey();
}

/**
 * @deprecated Removed in v0.6.0 - single-collection architecture stores collection directly in RootConfig
 * Use getBaseCollection() instead
 */
export async function getBaseRegistryPda(
  connection: Connection
): Promise<PublicKey | null> {
  return getBaseCollection(connection);
}
