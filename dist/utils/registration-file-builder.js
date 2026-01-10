import { validateSkill, validateDomain } from '../core/oasf-validator.js';
/**
 * Build ERC-8004 compliant JSON from RegistrationFile
 * Validates OASF skills/domains if provided
 * Does NOT upload - just returns the JSON object
 */
export function buildRegistrationFileJson(registrationFile, options) {
    const { chainId, identityRegistryAddress } = options || {};
    // Validate skills if provided
    if (registrationFile.skills?.length) {
        const invalidSkills = registrationFile.skills.filter((s) => !validateSkill(s));
        if (invalidSkills.length > 0) {
            throw new Error(`Invalid OASF skills: ${invalidSkills.join(', ')}. Use getAllSkills() to list valid slugs.`);
        }
    }
    // Validate domains if provided
    if (registrationFile.domains?.length) {
        const invalidDomains = registrationFile.domains.filter((d) => !validateDomain(d));
        if (invalidDomains.length > 0) {
            throw new Error(`Invalid OASF domains: ${invalidDomains.join(', ')}. Use getAllDomains() to list valid slugs.`);
        }
    }
    // Convert from internal format { type, value, meta } to ERC-8004 format { name, endpoint, version }
    const endpoints = [];
    for (const ep of registrationFile.endpoints) {
        const endpointDict = {
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
    const registrations = [];
    if (registrationFile.agentId) {
        // Validate agentId format: "eip155:chainId:tokenId" or "chainId:tokenId"
        const parts = registrationFile.agentId.split(':');
        if (parts.length < 2) {
            throw new Error(`Invalid agentId format: "${registrationFile.agentId}". Expected "chainId:tokenId" or "eip155:chainId:tokenId"`);
        }
        // Extract tokenId from last part
        const tokenIdStr = parts[parts.length - 1];
        const tokenId = parseInt(tokenIdStr, 10);
        if (isNaN(tokenId) || tokenId < 0) {
            throw new Error(`Invalid tokenId in agentId: "${tokenIdStr}" is not a valid positive integer`);
        }
        const agentRegistry = chainId && identityRegistryAddress
            ? `eip155:${chainId}:${identityRegistryAddress}`
            : `eip155:1:{identityRegistry}`;
        registrations.push({
            agentId: tokenId,
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
        ...(registrationFile.trustModels?.length && {
            supportedTrusts: registrationFile.trustModels,
        }),
        active: registrationFile.active ?? true,
        x402support: registrationFile.x402support ?? false,
        ...(registrationFile.skills?.length && { skills: registrationFile.skills }),
        ...(registrationFile.domains?.length && { domains: registrationFile.domains }),
    };
}
//# sourceMappingURL=registration-file-builder.js.map