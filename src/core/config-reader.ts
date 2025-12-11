/**
 * Registry Config Reader
 * Fetches and deserializes the RegistryConfig account from on-chain
 */

import { Connection } from '@solana/web3.js';
import { RegistryConfig } from './borsh-schemas.js';
import { PDAHelpers } from './pda-helpers.js';

/**
 * Fetch the Registry Config from on-chain
 * @param connection - Solana RPC connection
 * @returns RegistryConfig or null if not initialized
 */
export async function fetchRegistryConfig(
  connection: Connection
): Promise<RegistryConfig | null> {
  try {
    const [configPda] = PDAHelpers.getRegistryConfigPDA();
    const accountInfo = await connection.getAccountInfo(configPda);

    if (!accountInfo || accountInfo.data.length === 0) {
      return null;
    }

    return RegistryConfig.deserialize(accountInfo.data);
  } catch (error) {
    console.error('Error fetching registry config:', error);
    return null;
  }
}

/**
 * Check if the Registry has been initialized
 * @param connection - Solana RPC connection
 * @returns true if initialized, false otherwise
 */
export async function isRegistryInitialized(
  connection: Connection
): Promise<boolean> {
  const config = await fetchRegistryConfig(connection);
  return config !== null;
}
