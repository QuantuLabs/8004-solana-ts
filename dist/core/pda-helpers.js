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
 * v0.2.0 - All PDAs now use single PROGRAM_ID
 * All methods return [PublicKey, bump] tuple
 */
export class PDAHelpers {
    // ============================================================================
    // Identity Module PDAs
    // ============================================================================
    /**
     * Get Registry Config PDA
     * Seeds: ["config"]
     */
    static getConfigPDA(programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
    }
    /**
     * Get Agent Account PDA
     * Seeds: ["agent", asset]
     * BREAKING: v0.2.0 uses Core asset address, not mint
     */
    static getAgentPDA(asset, programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('agent'), asset.toBuffer()], programId);
    }
    /**
     * @deprecated Use getAgentPDA with asset parameter
     */
    static async getAgentPDALegacy(agentMint) {
        return PDAHelpers.getAgentPDA(agentMint);
    }
    /**
     * Get Metadata Extension PDA
     * Seeds: ["metadata_ext", asset, extension_index]
     */
    static getMetadataExtensionPDA(asset, extensionIndex, programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('metadata_ext'), asset.toBuffer(), Buffer.from([extensionIndex])], programId);
    }
    // ============================================================================
    // Reputation Module PDAs
    // ============================================================================
    /**
     * Get Feedback Account PDA
     * Seeds: ["feedback", agent_id, feedback_index]
     * BREAKING: v0.2.0 uses global feedback index (no client address)
     */
    static getFeedbackPDA(agentId, feedbackIndex, programId = PROGRAM_ID) {
        const agentIdBuffer = Buffer.alloc(8);
        agentIdBuffer.writeBigUInt64LE(agentId);
        const feedbackIndexBuffer = Buffer.alloc(8);
        feedbackIndexBuffer.writeBigUInt64LE(feedbackIndex);
        return PublicKey.findProgramAddressSync([Buffer.from('feedback'), agentIdBuffer, feedbackIndexBuffer], programId);
    }
    /**
     * @deprecated Use getFeedbackPDA without client parameter
     */
    static async getFeedbackPDALegacy(agentId, _client, feedbackIndex) {
        return PDAHelpers.getFeedbackPDA(agentId, feedbackIndex);
    }
    /**
     * Get Agent Reputation PDA
     * Seeds: ["agent_reputation", agent_id]
     */
    static getAgentReputationPDA(agentId, programId = PROGRAM_ID) {
        const agentIdBuffer = Buffer.alloc(8);
        agentIdBuffer.writeBigUInt64LE(agentId);
        return PublicKey.findProgramAddressSync([Buffer.from('agent_reputation'), agentIdBuffer], programId);
    }
    /**
     * Get Response PDA
     * Seeds: ["response", agent_id, feedback_index, response_index]
     * BREAKING: v0.2.0 removed client from seeds
     */
    static getResponsePDA(agentId, feedbackIndex, responseIndex, programId = PROGRAM_ID) {
        const agentIdBuffer = Buffer.alloc(8);
        agentIdBuffer.writeBigUInt64LE(agentId);
        const feedbackIndexBuffer = Buffer.alloc(8);
        feedbackIndexBuffer.writeBigUInt64LE(feedbackIndex);
        const responseIndexBuffer = Buffer.alloc(8);
        responseIndexBuffer.writeBigUInt64LE(responseIndex);
        return PublicKey.findProgramAddressSync([Buffer.from('response'), agentIdBuffer, feedbackIndexBuffer, responseIndexBuffer], programId);
    }
    /**
     * Get Response Index PDA
     * Seeds: ["response_index", agent_id, feedback_index]
     * BREAKING: v0.2.0 removed client from seeds
     */
    static getResponseIndexPDA(agentId, feedbackIndex, programId = PROGRAM_ID) {
        const agentIdBuffer = Buffer.alloc(8);
        agentIdBuffer.writeBigUInt64LE(agentId);
        const feedbackIndexBuffer = Buffer.alloc(8);
        feedbackIndexBuffer.writeBigUInt64LE(feedbackIndex);
        return PublicKey.findProgramAddressSync([Buffer.from('response_index'), agentIdBuffer, feedbackIndexBuffer], programId);
    }
    // ============================================================================
    // Validation Module PDAs
    // ============================================================================
    /**
     * Get Validation Stats PDA
     * Seeds: ["validation_config"]
     */
    static getValidationStatsPDA(programId = PROGRAM_ID) {
        return PublicKey.findProgramAddressSync([Buffer.from('validation_config')], programId);
    }
    /**
     * Get Validation Request PDA
     * Seeds: ["validation", agent_id, validator, nonce]
     */
    static getValidationRequestPDA(agentId, validator, nonce, programId = PROGRAM_ID) {
        const agentIdBuffer = Buffer.alloc(8);
        agentIdBuffer.writeBigUInt64LE(agentId);
        const nonceBuffer = Buffer.alloc(4);
        nonceBuffer.writeUInt32LE(nonce);
        return PublicKey.findProgramAddressSync([Buffer.from('validation'), agentIdBuffer, validator.toBuffer(), nonceBuffer], programId);
    }
    // ============================================================================
    // Deprecated Legacy Methods (for backwards compatibility)
    // ============================================================================
    /** @deprecated Use getConfigPDA */
    static async getRegistryConfigPDA() {
        return PDAHelpers.getConfigPDA();
    }
    /** @deprecated Use getValidationStatsPDA */
    static async getValidationConfigPDA() {
        return PDAHelpers.getValidationStatsPDA();
    }
    /** @deprecated Client index no longer used in v0.2.0 */
    static async getClientIndexPDA(agentId, _client) {
        // Return agent reputation PDA as fallback
        return PDAHelpers.getAgentReputationPDA(agentId);
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