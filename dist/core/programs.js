/**
 * Solana program IDs and configuration for 8004
 * v0.2.0 - Consolidated single program architecture
 */
import { PublicKey } from '@solana/web3.js';
/**
 * Consolidated AgentRegistry8004 Program ID (devnet default)
 * Single program containing Identity, Reputation, and Validation modules
 */
export const DEVNET_AGENT_REGISTRY_PROGRAM_ID = new PublicKey('8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C');
/**
 * Backward-compatible alias for devnet default Agent Registry ID.
 * Override in SDK config for localnet/mainnet deployments.
 */
export const PROGRAM_ID = DEVNET_AGENT_REGISTRY_PROGRAM_ID;
/**
 * Metaplex Core Program ID
 * Used for NFT asset creation and management
 */
export const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
/**
 * ATOM Engine Program ID (devnet default)
 * Agent Trust On-chain Model - reputation computation engine
 * v0.4.0 - Cross-program invocation for feedback/revoke operations
 */
export const DEVNET_ATOM_ENGINE_PROGRAM_ID = new PublicKey('AToMufS4QD6hEXvcvBDg9m1AHeCLpmZQsyfYa5h9MwAF');
/**
 * Backward-compatible alias for devnet default ATOM Engine ID.
 * Override in SDK config for localnet/mainnet deployments.
 */
export const ATOM_ENGINE_PROGRAM_ID = DEVNET_ATOM_ENGINE_PROGRAM_ID;
function toPublicKey(value) {
    if (!value)
        return undefined;
    return value instanceof PublicKey ? value : new PublicKey(value);
}
/**
 * Resolve program IDs.
 * Defaults target devnet and can be overridden per SDK instance.
 */
export function getProgramIds(overrides = {}) {
    const agentRegistry = toPublicKey(overrides.agentRegistry) ?? PROGRAM_ID;
    const identityRegistry = toPublicKey(overrides.identityRegistry) ?? agentRegistry;
    const reputationRegistry = toPublicKey(overrides.reputationRegistry) ?? agentRegistry;
    const validationRegistry = toPublicKey(overrides.validationRegistry) ?? agentRegistry;
    const atomEngine = toPublicKey(overrides.atomEngine) ?? ATOM_ENGINE_PROGRAM_ID;
    const mplCore = toPublicKey(overrides.mplCore) ?? MPL_CORE_PROGRAM_ID;
    return {
        identityRegistry,
        reputationRegistry,
        validationRegistry,
        agentRegistry,
        atomEngine,
        mplCore,
    };
}
/**
 * @deprecated Use PROGRAM_ID instead - kept for backwards compatibility
 * Program IDs resolved to devnet defaults (legacy 3-program naming)
 */
export const PROGRAM_IDS = getProgramIds();
/**
 * Get program ID
 */
export function getProgramId() {
    return PROGRAM_ID;
}
/**
 * @deprecated Use getProgramId() instead
 */
// getProgramIds(overrides?) is defined above for backward compatibility and overrides.
/**
 * Account discriminators (first 8 bytes of account data)
 * Used for account type identification
 */
export const DISCRIMINATORS = {
    // Identity Registry
    agentAccount: Buffer.from([0x0d, 0x9a, 0x3d, 0x7d, 0x0c, 0x1f, 0x8e, 0x9b]), // agent_account
    metadataEntry: Buffer.from([0x1a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f, 0x7a, 0x8b]), // metadata_entry
    registryConfig: Buffer.from([0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0xa7, 0xb8]), // registry_config
    // Reputation Registry
    feedbackAccount: Buffer.from([0x1f, 0x2e, 0x3d, 0x4c, 0x5b, 0x6a, 0x79, 0x88]), // feedback_account
    agentReputation: Buffer.from([0x2a, 0x3b, 0x4c, 0x5d, 0x6e, 0x7f, 0x8a, 0x9b]), // agent_reputation
    clientIndex: Buffer.from([0x3b, 0x4c, 0x5d, 0x6e, 0x7f, 0x8a, 0x9b, 0xac]), // client_index
    responseAccount: Buffer.from([0x4c, 0x5d, 0x6e, 0x7f, 0x8a, 0x9b, 0xac, 0xbd]), // response_account
    responseIndex: Buffer.from([0x5d, 0x6e, 0x7f, 0x8a, 0x9b, 0xac, 0xbd, 0xce]), // response_index
    // Validation Registry
    validationRequest: Buffer.from([0x6e, 0x7f, 0x8a, 0x9b, 0xac, 0xbd, 0xce, 0xdf]), // validation_request
};
/**
 * Account sizes (in bytes) for rent calculation
 */
export const ACCOUNT_SIZES = {
    agentAccount: 297,
    metadataEntry: 307,
    feedbackAccount: 526,
    agentReputation: 64, // Estimated
    clientIndex: 64, // Estimated
    responseAccount: 322,
    responseIndex: 32, // Estimated
    validationRequest: 147,
};
/**
 * Calculate rent-exempt minimum for an account (approximation).
 * Uses the standard Solana formula: (accountSize + 128) * 3480 * 2
 * For exact values, use connection.getMinimumBalanceForRentExemption().
 */
export function calculateRentExempt(accountSize) {
    return (accountSize + 128) * 3480 * 2;
}
/**
 * PDA seeds for deterministic address derivation
 * v0.2.0 - Consolidated program seeds
 */
export const PDA_SEEDS = {
    // Identity Module
    config: 'config',
    agent: 'agent', // ["agent", asset] - Core asset, not mint
    metadataExt: 'metadata_ext', // ["metadata_ext", asset, index]
    // Reputation Module
    feedback: 'feedback', // ["feedback", agent_id, feedback_index] - Global index
    agentReputation: 'agent_reputation',
    response: 'response', // ["response", agent_id, feedback_index, response_index]
    responseIndex: 'response_index', // ["response_index", agent_id, feedback_index]
    // Validation Module
    validationConfig: 'validation_config',
    validation: 'validation', // ["validation", agent_id, validator, nonce]
};
/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
    commitment: 'confirmed',
    maxRetries: 3,
    timeout: 30000, // 30 seconds
    confirmTimeout: 60000, // 60 seconds
};
//# sourceMappingURL=programs.js.map