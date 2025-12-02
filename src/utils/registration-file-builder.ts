/**
 * Build ERC-8004 compliant registration file JSON
 * Extracted from IPFSClient.addRegistrationFile for frontend use
 */
import type { RegistrationFile } from '../models/interfaces.js';

export interface RegistrationFileJsonOptions {
  chainId?: number;
  identityRegistryAddress?: string;
}

/**
 * Build ERC-8004 compliant JSON from RegistrationFile
 * Does NOT upload - just returns the JSON object
 */
export function buildRegistrationFileJson(
  registrationFile: RegistrationFile,
  options?: RegistrationFileJsonOptions
): Record<string, unknown> {
  const { chainId, identityRegistryAddress } = options || {};

  // Convert from internal format { type, value, meta } to ERC-8004 format { name, endpoint, version }
  const endpoints: Array<Record<string, unknown>> = [];
  for (const ep of registrationFile.endpoints) {
    const endpointDict: Record<string, unknown> = {
      name: ep.type,
      endpoint: ep.value,
    };
    if (ep.meta) {
      Object.assign(endpointDict, ep.meta);
    }
    endpoints.push(endpointDict);
  }

  // Add walletAddress as an endpoint if present
  if (registrationFile.walletAddress) {
    const walletChainId = registrationFile.walletChainId || chainId || 1;
    endpoints.push({
      name: 'agentWallet',
      endpoint: `eip155:${walletChainId}:${registrationFile.walletAddress}`,
    });
  }

  // Build registrations array
  const registrations: Array<Record<string, unknown>> = [];
  if (registrationFile.agentId) {
    const [, , tokenId] = registrationFile.agentId.split(':');
    const agentRegistry = chainId && identityRegistryAddress
      ? `eip155:${chainId}:${identityRegistryAddress}`
      : `eip155:1:{identityRegistry}`;
    registrations.push({
      agentId: parseInt(tokenId, 10),
      agentRegistry,
    });
  }

  // Build ERC-8004 compliant registration file
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: registrationFile.name,
    description: registrationFile.description,
    ...(registrationFile.image && { image: registrationFile.image }),
    endpoints,
    ...(registrations.length > 0 && { registrations }),
    ...(registrationFile.trustModels.length > 0 && {
      supportedTrusts: registrationFile.trustModels,
    }),
    active: registrationFile.active,
    x402support: registrationFile.x402support,
  };
}
