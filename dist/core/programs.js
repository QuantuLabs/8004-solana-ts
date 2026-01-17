/**
 * Solana program IDs and configuration for ERC-8004
 * v0.2.0 - Consolidated single program architecture
 */
import { PublicKey } from '@solana/web3.js';
/**
 * Consolidated AgentRegistry8004 Program ID
 * Single program containing Identity, Reputation, and Validation modules
 */
export const PROGRAM_ID = new PublicKey('6MuHv4dY4p9E4hSCEPr9dgbCSpMhq8x1vrUexbMVjfw1');
/**
 * Metaplex Core Program ID
 * Used for NFT asset creation and management
 */
export const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
/**
 * ATOM Engine Program ID
 * Agent Trust On-chain Model - reputation computation engine
 * v0.4.0 - Cross-program invocation for feedback/revoke operations
 */
export const ATOM_ENGINE_PROGRAM_ID = new PublicKey('6Mu7qj6tRDrqchxJJPjr9V1H2XQjCerVKixFEEMwC1Tf');
/**
 * @deprecated Use PROGRAM_ID instead - kept for backwards compatibility
 * Program IDs for devnet deployment (legacy 3-program architecture)
 */
export const PROGRAM_IDS = {
    identityRegistry: PROGRAM_ID,
    reputationRegistry: PROGRAM_ID,
    validationRegistry: PROGRAM_ID,
    // Consolidated program
    agentRegistry: PROGRAM_ID,
    // ATOM Engine (v0.4.0)
    atomEngine: ATOM_ENGINE_PROGRAM_ID,
};
/**
 * Get program ID
 */
export function getProgramId() {
    return PROGRAM_ID;
}
/**
 * @deprecated Use getProgramId() instead
 */
export function getProgramIds() {
    return PROGRAM_IDS;
}
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
 * Rent cost per byte (lamports)
 * Standard Solana rent-exempt rate
 */
export const LAMPORTS_PER_BYTE_YEAR = 6965;
/**
 * Calculate rent-exempt minimum for an account
 */
export function calculateRentExempt(accountSize) {
    return accountSize * LAMPORTS_PER_BYTE_YEAR;
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