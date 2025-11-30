/**
 * PDA (Program Derived Address) helpers for ERC-8004 Solana programs
 * Provides deterministic address derivation for all account types
 */
import { PublicKey } from '@solana/web3.js';
export declare const IDENTITY_PROGRAM_ID: PublicKey;
export declare const REPUTATION_PROGRAM_ID: PublicKey;
export declare const VALIDATION_PROGRAM_ID: PublicKey;
/**
 * PDA derivation helpers
 * All methods return [PublicKey, bump] tuple
 */
export declare class PDAHelpers {
    /**
     * Get Agent Account PDA (Identity Registry)
     * Seeds: ["agent", agent_mint]
     */
    static getAgentPDA(agentMint: PublicKey): Promise<[PublicKey, number]>;
    /**
     * Get Metadata Entry PDA (Identity Registry)
     * Seeds: ["metadata", agent_id, key]
     */
    static getMetadataPDA(agentId: bigint, key: Buffer): Promise<[PublicKey, number]>;
    /**
     * Get Metadata Extension PDA (Identity Registry)
     * Seeds: ["metadata_ext", agent_mint, extension_index]
     * Used for storing additional metadata beyond the 10 inline entries
     */
    static getMetadataExtensionPDA(agentMint: PublicKey, extensionIndex: number): Promise<[PublicKey, number]>;
    /**
     * Get Registry Config PDA (Identity Registry)
     * Seeds: ["config"]
     */
    static getRegistryConfigPDA(): Promise<[PublicKey, number]>;
    /**
     * Get Feedback Account PDA (Reputation Registry)
     * Seeds: ["feedback", agent_id, client, feedback_index]
     */
    static getFeedbackPDA(agentId: bigint, client: PublicKey, feedbackIndex: bigint): Promise<[PublicKey, number]>;
    /**
     * Get Agent Reputation PDA (Reputation Registry)
     * Seeds: ["agent_reputation", agent_id]
     * Stores cached aggregates for O(1) queries
     */
    static getAgentReputationPDA(agentId: bigint): Promise<[PublicKey, number]>;
    /**
     * Get Client Index PDA (Reputation Registry)
     * Seeds: ["client_index", agent_id, client]
     * Tracks last feedback index for a client
     */
    static getClientIndexPDA(agentId: bigint, client: PublicKey): Promise<[PublicKey, number]>;
    /**
     * Get Response PDA (Reputation Registry)
     * Seeds: ["response", agent_id, client, feedback_index, response_index]
     */
    static getResponsePDA(agentId: bigint, client: PublicKey, feedbackIndex: bigint, responseIndex: bigint): Promise<[PublicKey, number]>;
    /**
     * Get Response Index PDA (Reputation Registry)
     * Seeds: ["response_index", agent_id, client, feedback_index]
     * Tracks number of responses for a feedback
     */
    static getResponseIndexPDA(agentId: bigint, client: PublicKey, feedbackIndex: bigint): Promise<[PublicKey, number]>;
    /**
     * Get Validation Request PDA (Validation Registry)
     * Seeds: ["validation", agent_id, validator_address, nonce]
     * Note: Seed is "validation", not "validation_request"
     */
    static getValidationRequestPDA(agentId: bigint, validator: PublicKey, nonce: number): Promise<[PublicKey, number]>;
    /**
     * Get Validation Config PDA (Validation Registry)
     * Seeds: ["config"]
     */
    static getValidationConfigPDA(): Promise<[PublicKey, number]>;
}
/**
 * Helper to convert bytes32 to string
 * Used for metadata keys
 */
export declare function bytes32ToString(bytes: Uint8Array): string;
/**
 * Helper to convert string to bytes32
 * Used for metadata keys
 */
export declare function stringToBytes32(str: string): Buffer;
//# sourceMappingURL=pda-helpers.d.ts.map