/**
 * PDA (Program Derived Address) helpers for ERC-8004 Solana programs
 * v0.2.0 - Consolidated single program architecture
 *
 * BREAKING CHANGES from v0.1.0:
 * - Single PROGRAM_ID instead of 3 separate program IDs
 * - Agent PDA uses Core asset address, not mint
 * - Feedback PDA uses global index (no client address in seeds)
 * - Response PDA uses global feedback index (no client address in seeds)
 */
import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, MPL_CORE_PROGRAM_ID } from './programs.js';
export { PROGRAM_ID, MPL_CORE_PROGRAM_ID };
/**
 * @deprecated Use PROGRAM_ID instead
 */
export declare const IDENTITY_PROGRAM_ID: PublicKey;
export declare const REPUTATION_PROGRAM_ID: PublicKey;
export declare const VALIDATION_PROGRAM_ID: PublicKey;
/**
 * PDA derivation helpers
 * v0.2.0 - All PDAs now use single PROGRAM_ID
 * All methods return [PublicKey, bump] tuple
 */
export declare class PDAHelpers {
    /**
     * Get Registry Config PDA
     * Seeds: ["config"]
     */
    static getConfigPDA(programId?: PublicKey): [PublicKey, number];
    /**
     * Get Agent Account PDA
     * Seeds: ["agent", asset]
     * BREAKING: v0.2.0 uses Core asset address, not mint
     */
    static getAgentPDA(asset: PublicKey, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Metadata Extension PDA
     * Seeds: ["metadata_ext", asset, extension_index]
     */
    static getMetadataExtensionPDA(asset: PublicKey, extensionIndex: number, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Feedback Account PDA
     * Seeds: ["feedback", agent_id, feedback_index]
     * BREAKING: v0.2.0 uses global feedback index (no client address)
     */
    static getFeedbackPDA(agentId: bigint, feedbackIndex: bigint, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Feedback Tags PDA (optional tags for feedback)
     * Seeds: ["feedback_tags", agent_id, feedback_index]
     * Created only when tags are provided via set_feedback_tags
     */
    static getFeedbackTagsPDA(agentId: bigint, feedbackIndex: bigint, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Agent Reputation PDA
     * Seeds: ["agent_reputation", agent_id]
     */
    static getAgentReputationPDA(agentId: bigint, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Response PDA
     * Seeds: ["response", agent_id, feedback_index, response_index]
     * BREAKING: v0.2.0 removed client from seeds
     */
    static getResponsePDA(agentId: bigint, feedbackIndex: bigint, responseIndex: bigint, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Response Index PDA
     * Seeds: ["response_index", agent_id, feedback_index]
     * BREAKING: v0.2.0 removed client from seeds
     */
    static getResponseIndexPDA(agentId: bigint, feedbackIndex: bigint, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Validation Stats PDA
     * Seeds: ["validation_config"]
     */
    static getValidationStatsPDA(programId?: PublicKey): [PublicKey, number];
    /**
     * Get Validation Request PDA
     * Seeds: ["validation", agent_id, validator, nonce]
     */
    static getValidationRequestPDA(agentId: bigint, validator: PublicKey, nonce: number, programId?: PublicKey): [PublicKey, number];
    /** Alias for getConfigPDA */
    static getRegistryConfigPDA(): [PublicKey, number];
    /** Alias for getValidationStatsPDA */
    static getValidationConfigPDA(): [PublicKey, number];
    /**
     * Get Client Index PDA
     * Seeds: ["client_index", agent_id, client]
     * Used to track per-client feedback count
     */
    static getClientIndexPDA(agentId: bigint, client: PublicKey, programId?: PublicKey): [PublicKey, number];
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