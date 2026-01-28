/**
 * Build 8004 compliant registration file JSON
 * Extracted from IPFSClient.addRegistrationFile for frontend use
 */
import type { RegistrationFile } from '../models/interfaces.js';
import { ServiceType } from '../models/enums.js';
import { validateSkill, validateDomain } from '../core/oasf-validator.js';

export interface RegistrationFileJsonOptions {
  chainId?: number;
  identityRegistryAddress?: string;
}

/**
 * Build 8004 compliant JSON from RegistrationFile
 * Validates OASF skills/domains if provided
 * Does NOT upload - just returns the JSON object
 */
export function buildRegistrationFileJson(
  registrationFile: RegistrationFile,
  options?: RegistrationFileJsonOptions
): Record<string, unknown> {
  const { chainId, identityRegistryAddress } = options || {};

  // Validate skills if provided
  if (registrationFile.skills?.length) {
    const invalidSkills = registrationFile.skills.filter((s) => !validateSkill(s));
    if (invalidSkills.length > 0) {
      throw new Error(
        `Invalid OASF skills: ${invalidSkills.join(', ')}. Use getAllSkills() to list valid slugs.`
      );
    }
  }

  // Validate domains if provided
  if (registrationFile.domains?.length) {
    const invalidDomains = registrationFile.domains.filter((d) => !validateDomain(d));
    if (invalidDomains.length > 0) {
      throw new Error(
        `Invalid OASF domains: ${invalidDomains.join(', ')}. Use getAllDomains() to list valid slugs.`
      );
    }
  }

  // Convert from internal format { type, value, meta } to ERC-8004 services format
  const services: Array<Record<string, unknown>> = [];
  for (const svc of registrationFile.services) {
    const serviceDict: Record<string, unknown> = {
      name: svc.type,
      endpoint: svc.value,
    };
    if (svc.meta) {
      Object.assign(serviceDict, svc.meta);
    }
    // Add skills/domains to OASF service type
    if (svc.type === ServiceType.OASF) {
      if (registrationFile.skills?.length) {
        serviceDict.skills = registrationFile.skills;
      }
      if (registrationFile.domains?.length) {
        serviceDict.domains = registrationFile.domains;
      }
    }
    services.push(serviceDict);
  }

  // Add walletAddress as a service if present
  if (registrationFile.walletAddress) {
    const walletChainId = registrationFile.walletChainId || chainId || 1;
    services.push({
      name: 'agentWallet',
      endpoint: `eip155:${walletChainId}:${registrationFile.walletAddress}`,
    });
  }

  // Build registrations array
  const registrations: Array<Record<string, unknown>> = [];
  if (registrationFile.agentId) {
    // Validate agentId format: "eip155:chainId:tokenId" or "chainId:tokenId"
    const parts = registrationFile.agentId.split(':');
    if (parts.length < 2) {
      throw new Error(
        `Invalid agentId format: "${registrationFile.agentId}". Expected "chainId:tokenId" or "eip155:chainId:tokenId"`
      );
    }
    // Extract tokenId from last part
    const tokenIdStr = parts[parts.length - 1];
    const tokenId = parseInt(tokenIdStr, 10);
    if (isNaN(tokenId) || tokenId < 0) {
      throw new Error(`Invalid tokenId in agentId: "${tokenIdStr}" is not a valid positive integer`);
    }
    const agentRegistry =
      chainId && identityRegistryAddress
        ? `eip155:${chainId}:${identityRegistryAddress}`
        : `eip155:1:{identityRegistry}`;
    registrations.push({
      agentId: tokenId,
      agentRegistry,
    });
  }

  // Build ERC-8004 compliant registration file v1
  // Ref: https://github.com/erc-8004/best-practices/blob/main/Registration.md
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: registrationFile.name,
    description: registrationFile.description,
    ...(registrationFile.image && { image: registrationFile.image }),
    services,
    ...(registrations.length > 0 && { registrations }),
    ...(registrationFile.trustModels?.length && {
      supportedTrust: registrationFile.trustModels, // Singular per spec
    }),
    active: registrationFile.active ?? true,
    x402Support: registrationFile.x402Support ?? false,
  };
}
