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
import { writeBigUInt64LE, writeUInt32LE } from '../utils/buffer-utils.js';
// Re-export for convenience
export { PROGRAM_ID, MPL_CORE_PROGRAM_ID };
/**
 * @deprecated Use PROGRAM_ID instead
 */
export const IDENTITY_PROGRAM_ID = PROGRAM_ID;
export const REPUTATION_PROGRAM_ID = PROGRAM_ID;
export const VALIDATION_PROGRAM_ID = PROGRAM_ID;
/**
 * PDA derivation helpers
 * v0.3.0 - All PDAs now use asset (Pubkey) instead of agent_id (u64)
 * All methods return [PublicKey, bump] tuple
 */
export class PDAHelpers {
    // ============================================================================
    // Identity Module PDAs
    // ============================================================================
    /**
     * Get Root Config PDA - v0.3.0
     * Global pointer to current base registry
     * Seeds: ["root_config"]
     */
    static getRootConfigPDA(programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('root_config')], programId);
    }
    /**
     * Get Registry Config PDA - v0.3.0
     * Per-collection configuration
     * Seeds: ["registry_config", collection]
     */
    static getRegistryConfigPDA(collection, programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('registry_config'), collection.toBuffer()], programId);
    }
    /**
     * @deprecated Use getRegistryConfigPDA instead for v0.3.0
     * Get Config PDA (legacy)
     * Seeds: ["config"]
     */
    static getConfigPDA(programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
    }
    /**
     * Get Agent Account PDA - v0.3.0
     * Seeds: ["agent", asset]
     */
    static getAgentPDA(asset, programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('agent'), asset.toBuffer()], programId);
    }
    /**
     * Get Metadata Entry PDA - v0.3.0
     * Seeds: ["agent_meta", asset, key_hash[0..8]]
     * key_hash = SHA256(key)[0..8]
     */
    static getMetadataEntryPDA(asset, keyHash, programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('agent_meta'), asset.toBuffer(), keyHash.slice(0, 16)], programId);
    }
    // ============================================================================
    // Reputation Module PDAs
    // ============================================================================
    /**
     * Get ATOM CPI Authority PDA - v0.4.0
     * Used by agent-registry to sign CPI calls to atom-engine
     * Seeds: ["atom_cpi_authority"]
     */
    static getAtomCpiAuthorityPDA(programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('atom_cpi_authority')], programId);
    }
    /**
     * Get Feedback Account PDA - v0.3.0
     * Seeds: ["feedback", asset, feedback_index]
     */
    static getFeedbackPDA(asset, feedbackIndex, programId = PROGRAM_ID) {
        const feedbackIndexBuffer = writeBigUInt64LE(BigInt(feedbackIndex));
        return PublicKey.findProgramAddressSync([Buffer.from('feedback'), asset.toBuffer(), feedbackIndexBuffer], programId);
    }
    /**
     * Get Feedback Tags PDA - v0.3.0
     * Seeds: ["feedback_tags", asset, feedback_index]
     */
    static getFeedbackTagsPDA(asset, feedbackIndex, programId = PROGRAM_ID) {
        const feedbackIndexBuffer = writeBigUInt64LE(BigInt(feedbackIndex));
        return PublicKey.findProgramAddressSync([Buffer.from('feedback_tags'), asset.toBuffer(), feedbackIndexBuffer], programId);
    }
    /**
     * Get Agent Reputation Metadata PDA - v0.3.0
     * Seeds: ["agent_reputation", asset]
     */
    static getAgentReputationPDA(asset, programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('agent_reputation'), asset.toBuffer()], programId);
    }
    /**
     * Get Response PDA - v0.3.0
     * Seeds: ["response", asset, feedback_index, response_index]
     */
    static getResponsePDA(asset, feedbackIndex, responseIndex, programId = PROGRAM_ID) {
        const feedbackIndexBuffer = writeBigUInt64LE(BigInt(feedbackIndex));
        const responseIndexBuffer = writeBigUInt64LE(BigInt(responseIndex));
        return PublicKey.findProgramAddressSync([Buffer.from('response'), asset.toBuffer(), feedbackIndexBuffer, responseIndexBuffer], programId);
    }
    /**
     * Get Response Index PDA - v0.3.0
     * Seeds: ["response_index", asset, feedback_index]
     */
    static getResponseIndexPDA(asset, feedbackIndex, programId = PROGRAM_ID) {
        const feedbackIndexBuffer = writeBigUInt64LE(BigInt(feedbackIndex));
        return PublicKey.findProgramAddressSync([Buffer.from('response_index'), asset.toBuffer(), feedbackIndexBuffer], programId);
    }
    /**
     * Get Client Index PDA - v0.3.0
     * Seeds: ["client_index", asset, client]
     */
    static getClientIndexPDA(asset, client, programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('client_index'), asset.toBuffer(), client.toBuffer()], programId);
    }
    // ============================================================================
    // Validation Module PDAs
    // ============================================================================
    /**
     * Get ValidationConfig PDA (global validation registry state)
     * Seeds: ["validation_config"]
     */
    static getValidationConfigPDA(programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('validation_config')], programId);
    }
    /**
     * Get Validation Request PDA - v0.3.0
     * Seeds: ["validation", asset, validator, nonce]
     */
    static getValidationRequestPDA(asset, validator, nonce, programId = PROGRAM_ID) {
        // Convert bigint to number if needed (safe for u32 range)
        const nonceNum = typeof nonce === 'bigint' ? Number(nonce) : nonce;
        const nonceBuffer = writeUInt32LE(nonceNum);
        return PublicKey.findProgramAddressSync([Buffer.from('validation'), asset.toBuffer(), validator.toBuffer(), nonceBuffer], programId);
    }
}
/**
 * Helper to convert bytes32 to string
 * Used for metadata keys
 */
export function bytes32ToString(bytes) {
    const nullIndex = bytes.indexOf(0);
    const keyBytes = nullIndex >= 0 ? bytes.slice(0, nullIndex) : bytes;
    return Buffer.from(keyBytes).toString('utf8');
}
/**
 * Helper to convert string to bytes32
 * Used for metadata keys
 */
export function stringToBytes32(str) {
    const buffer = Buffer.alloc(32);
    buffer.write(str, 0, 'utf8');
    return buffer;
}
//# sourceMappingURL=pda-helpers.js.map