/**
 * Solana program IDs and configuration for ERC-8004
 * v0.2.0 - Consolidated single program architecture
 */
import { PublicKey } from '@solana/web3.js';
/**
 * Consolidated AgentRegistry8004 Program ID
 * Single program containing Identity, Reputation, and Validation modules
 */
export declare const PROGRAM_ID: PublicKey;
/**
 * Metaplex Core Program ID
 * Used for NFT asset creation and management
 */
export declare const MPL_CORE_PROGRAM_ID: PublicKey;
/**
 * ATOM Engine Program ID
 * Agent Trust On-chain Model - reputation computation engine
 * v0.4.0 - Cross-program invocation for feedback/revoke operations
 */
export declare const ATOM_ENGINE_PROGRAM_ID: PublicKey;
/**
 * @deprecated Use PROGRAM_ID instead - kept for backwards compatibility
 * Program IDs for devnet deployment (legacy 3-program architecture)
 */
export declare const PROGRAM_IDS: {
    readonly identityRegistry: PublicKey;
    readonly reputationRegistry: PublicKey;
    readonly validationRegistry: PublicKey;
    readonly agentRegistry: PublicKey;
    readonly atomEngine: PublicKey;
};
/**
 * Get program ID
 */
export declare function getProgramId(): PublicKey;
/**
 * @deprecated Use getProgramId() instead
 */
export declare function getProgramIds(): {
    readonly identityRegistry: PublicKey;
    readonly reputationRegistry: PublicKey;
    readonly validationRegistry: PublicKey;
    readonly agentRegistry: PublicKey;
    readonly atomEngine: PublicKey;
};
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
 * Rent cost per byte (lamports)
 * Standard Solana rent-exempt rate
 */
export declare const LAMPORTS_PER_BYTE_YEAR = 6965;
/**
 * Calculate rent-exempt minimum for an account
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