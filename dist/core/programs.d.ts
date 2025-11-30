/**
 * Solana program IDs and configuration for ERC-8004
 * Equivalent to contracts.ts for Ethereum
 */
import { PublicKey } from '@solana/web3.js';
/**
 * Program IDs for devnet deployment
 * These are the deployed program addresses on Solana devnet
 */
export declare const PROGRAM_IDS: {
    readonly identityRegistry: PublicKey;
    readonly reputationRegistry: PublicKey;
    readonly validationRegistry: PublicKey;
};
/**
 * Get program IDs (devnet only)
 */
export declare function getProgramIds(): {
    readonly identityRegistry: PublicKey;
    readonly reputationRegistry: PublicKey;
    readonly validationRegistry: PublicKey;
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
 */
export declare const PDA_SEEDS: {
    readonly agent: "agent";
    readonly metadata: "metadata";
    readonly config: "config";
    readonly feedback: "feedback";
    readonly agentReputation: "agent_reputation";
    readonly clientIndex: "client_index";
    readonly response: "response";
    readonly responseIndex: "response_index";
    readonly validationRequest: "validation_request";
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