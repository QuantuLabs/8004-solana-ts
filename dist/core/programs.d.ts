/**
 * Solana program IDs and configuration for 8004
 * v0.2.0 - Consolidated single program architecture
 */
import { PublicKey } from '@solana/web3.js';
/**
 * Consolidated AgentRegistry8004 Program ID (devnet default)
 * Single program containing Identity, Reputation, and Validation modules
 */
export declare const DEVNET_AGENT_REGISTRY_PROGRAM_ID: PublicKey;
/**
 * Backward-compatible alias for devnet default Agent Registry ID.
 * Override in SDK config for localnet/mainnet deployments.
 */
export declare const PROGRAM_ID: PublicKey;
/**
 * Metaplex Core Program ID
 * Used for NFT asset creation and management
 */
export declare const MPL_CORE_PROGRAM_ID: PublicKey;
/**
 * ATOM Engine Program ID (devnet default)
 * Agent Trust On-chain Model - reputation computation engine
 * v0.4.0 - Cross-program invocation for feedback/revoke operations
 */
export declare const DEVNET_ATOM_ENGINE_PROGRAM_ID: PublicKey;
/**
 * Backward-compatible alias for devnet default ATOM Engine ID.
 * Override in SDK config for localnet/mainnet deployments.
 */
export declare const ATOM_ENGINE_PROGRAM_ID: PublicKey;
export type ProgramIdInput = PublicKey | string;
export interface ProgramIdOverrides {
    identityRegistry?: ProgramIdInput;
    reputationRegistry?: ProgramIdInput;
    validationRegistry?: ProgramIdInput;
    agentRegistry?: ProgramIdInput;
    atomEngine?: ProgramIdInput;
    mplCore?: ProgramIdInput;
}
export interface ProgramIdSet {
    identityRegistry: PublicKey;
    reputationRegistry: PublicKey;
    validationRegistry: PublicKey;
    agentRegistry: PublicKey;
    atomEngine: PublicKey;
    mplCore: PublicKey;
}
/**
 * Resolve program IDs.
 * Defaults target devnet and can be overridden per SDK instance.
 */
export declare function getProgramIds(overrides?: ProgramIdOverrides): ProgramIdSet;
/**
 * @deprecated Use PROGRAM_ID instead - kept for backwards compatibility
 * Program IDs resolved to devnet defaults (legacy 3-program naming)
 */
export declare const PROGRAM_IDS: ProgramIdSet;
/**
 * Get program ID
 */
export declare function getProgramId(): PublicKey;
/**
 * @deprecated Use getProgramId() instead
 */
/**
 * Account discriminators (first 8 bytes of account data)
 * Used for account type identification
 */
export declare const DISCRIMINATORS: {
    readonly agentAccount: Buffer<ArrayBuffer>;
    readonly metadataEntry: Buffer<ArrayBuffer>;
    readonly registryConfig: Buffer<ArrayBuffer>;
    readonly feedbackAccount: Buffer<ArrayBuffer>;
    readonly agentReputation: Buffer<ArrayBuffer>;
    readonly clientIndex: Buffer<ArrayBuffer>;
    readonly responseAccount: Buffer<ArrayBuffer>;
    readonly responseIndex: Buffer<ArrayBuffer>;
    readonly validationRequest: Buffer<ArrayBuffer>;
};
/**
 * Account sizes (in bytes) for rent calculation
 */
export declare const ACCOUNT_SIZES: {
    readonly agentAccount: 297;
    readonly metadataEntry: 307;
    readonly feedbackAccount: 526;
    readonly agentReputation: 64;
    readonly clientIndex: 64;
    readonly responseAccount: 322;
    readonly responseIndex: 32;
    readonly validationRequest: 147;
};
/**
 * Calculate rent-exempt minimum for an account (approximation).
 * Uses the standard Solana formula: (accountSize + 128) * 3480 * 2
 * For exact values, use connection.getMinimumBalanceForRentExemption().
 */
export declare function calculateRentExempt(accountSize: number): number;
/**
 * PDA seeds for deterministic address derivation
 * v0.2.0 - Consolidated program seeds
 */
export declare const PDA_SEEDS: {
    readonly config: "config";
    readonly agent: "agent";
    readonly metadataExt: "metadata_ext";
    readonly feedback: "feedback";
    readonly agentReputation: "agent_reputation";
    readonly response: "response";
    readonly responseIndex: "response_index";
    readonly validationConfig: "validation_config";
    readonly validation: "validation";
};
/**
 * Default configuration values
 */
export declare const DEFAULT_CONFIG: {
    readonly commitment: "confirmed";
    readonly maxRetries: 3;
    readonly timeout: 30000;
    readonly confirmTimeout: 60000;
};
//# sourceMappingURL=programs.d.ts.map