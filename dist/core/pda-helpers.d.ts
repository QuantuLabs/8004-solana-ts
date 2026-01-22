/**
 * PDA (Program Derived Address) helpers for ERC-8004 Solana programs
 * v0.3.0 - Asset-based identification
 * Browser-compatible - uses cross-platform buffer utilities
 *
 * BREAKING CHANGES from v0.2.0:
 * - agent_id (u64) replaced by asset (Pubkey) in all PDA seeds
 * - New RootConfig and RegistryConfig PDAs for multi-collection support
 * - ValidationStats removed (counters moved off-chain)
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
 * v0.3.0 - All PDAs now use asset (Pubkey) instead of agent_id (u64)
 * All methods return [PublicKey, bump] tuple
 */
export declare class PDAHelpers {
    /**
     * Get Root Config PDA - v0.3.0
     * Global pointer to current base registry
     * Seeds: ["root_config"]
     */
    static getRootConfigPDA(programId?: PublicKey): [PublicKey, number];
    /**
     * Get Registry Config PDA - v0.3.0
     * Per-collection configuration
     * Seeds: ["registry_config", collection]
     */
    static getRegistryConfigPDA(collection: PublicKey, programId?: PublicKey): [PublicKey, number];
    /**
     * @deprecated Use getRegistryConfigPDA instead for v0.3.0
     * Get Config PDA (legacy)
     * Seeds: ["config"]
     */
    static getConfigPDA(programId?: PublicKey): [PublicKey, number];
    /**
     * Get Agent Account PDA - v0.3.0
     * Seeds: ["agent", asset]
     */
    static getAgentPDA(asset: PublicKey, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Metadata Entry PDA - v0.3.0
     * Seeds: ["agent_meta", asset, key_hash[0..8]]
     * key_hash = SHA256(key)[0..8]
     */
    static getMetadataEntryPDA(asset: PublicKey, keyHash: Buffer, programId?: PublicKey): [PublicKey, number];
    /**
     * Get ATOM CPI Authority PDA - v0.4.0
     * Used by agent-registry to sign CPI calls to atom-engine
     * Seeds: ["atom_cpi_authority"]
     */
    static getAtomCpiAuthorityPDA(programId?: PublicKey): [PublicKey, number];
    /**
     * Get Feedback Account PDA - v0.3.0
     * Seeds: ["feedback", asset, feedback_index]
     */
    static getFeedbackPDA(asset: PublicKey, feedbackIndex: bigint | number, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Feedback Tags PDA - v0.3.0
     * Seeds: ["feedback_tags", asset, feedback_index]
     */
    static getFeedbackTagsPDA(asset: PublicKey, feedbackIndex: bigint | number, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Agent Reputation Metadata PDA - v0.3.0
     * Seeds: ["agent_reputation", asset]
     */
    static getAgentReputationPDA(asset: PublicKey, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Response PDA - v0.3.0
     * Seeds: ["response", asset, feedback_index, response_index]
     */
    static getResponsePDA(asset: PublicKey, feedbackIndex: bigint | number, responseIndex: bigint | number, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Response Index PDA - v0.3.0
     * Seeds: ["response_index", asset, feedback_index]
     */
    static getResponseIndexPDA(asset: PublicKey, feedbackIndex: bigint | number, programId?: PublicKey): [PublicKey, number];
    /**
     * Get Client Index PDA - v0.3.0
     * Seeds: ["client_index", asset, client]
     */
    static getClientIndexPDA(asset: PublicKey, client: PublicKey, programId?: PublicKey): [PublicKey, number];
    /**
     * Get ValidationConfig PDA (global validation registry state)
     * Seeds: ["validation_config"]
     */
    static getValidationConfigPDA(programId?: PublicKey): [PublicKey, number];
    /**
     * Get Validation Request PDA - v0.3.0
     * Seeds: ["validation", asset, validator, nonce]
     */
    static getValidationRequestPDA(asset: PublicKey, validator: PublicKey, nonce: number | bigint, programId?: PublicKey): [PublicKey, number];
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