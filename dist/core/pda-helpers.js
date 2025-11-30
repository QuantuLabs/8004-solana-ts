/**
 * PDA (Program Derived Address) helpers for ERC-8004 Solana programs
 * Provides deterministic address derivation for all account types
 */
import { PublicKey } from '@solana/web3.js';
// Program IDs for Devnet - Must match 8004-solana Anchor.toml values
export const IDENTITY_PROGRAM_ID = new PublicKey('CAHKQ2amAyKGzPhSE1mJx5qgxn1nJoNToDaiU6Kmacss');
export const REPUTATION_PROGRAM_ID = new PublicKey('Ejb8DaxZCb9Yh4ZYHLFKG5dj46YFyRm4kZpGz2rz6Ajr');
export const VALIDATION_PROGRAM_ID = new PublicKey('2y87PVXuBoCTi9b6p44BJREVz14Te2pukQPSwqfPwhhw');
/**
 * PDA derivation helpers
 * All methods return [PublicKey, bump] tuple
 */
export class PDAHelpers {
    /**
     * Get Agent Account PDA (Identity Registry)
     * Seeds: ["agent", agent_mint]
     */
    static async getAgentPDA(agentMint) {
        return await PublicKey.findProgramAddress([Buffer.from('agent'), agentMint.toBuffer()], IDENTITY_PROGRAM_ID);
    }
    /**
     * Get Metadata Entry PDA (Identity Registry)
     * Seeds: ["metadata", agent_id, key]
     */
    static async getMetadataPDA(agentId, key) {
        const agentIdBuffer = Buffer.alloc(8);
        agentIdBuffer.writeBigUInt64LE(agentId);
        return await PublicKey.findProgramAddress([Buffer.from('metadata'), agentIdBuffer, key], IDENTITY_PROGRAM_ID);
    }
    /**
     * Get Metadata Extension PDA (Identity Registry)
     * Seeds: ["metadata_ext", agent_mint, extension_index]
     * Used for storing additional metadata beyond the 10 inline entries
     */
    static async getMetadataExtensionPDA(agentMint, extensionIndex) {
        const indexBuffer = Buffer.alloc(1);
        indexBuffer.writeUInt8(extensionIndex);
        return await PublicKey.findProgramAddress([Buffer.from('metadata_ext'), agentMint.toBuffer(), indexBuffer], IDENTITY_PROGRAM_ID);
    }
    /**
     * Get Registry Config PDA (Identity Registry)
     * Seeds: ["config"]
     */
    static async getRegistryConfigPDA() {
        return await PublicKey.findProgramAddress([Buffer.from('config')], IDENTITY_PROGRAM_ID);
    }
    /**
     * Get Feedback Account PDA (Reputation Registry)
     * Seeds: ["feedback", agent_id, client, feedback_index]
     */
    static async getFeedbackPDA(agentId, client, feedbackIndex) {
        const agentIdBuffer = Buffer.alloc(8);
        agentIdBuffer.writeBigUInt64LE(agentId);
        const feedbackIndexBuffer = Buffer.alloc(8);
        feedbackIndexBuffer.writeBigUInt64LE(feedbackIndex);
        return await PublicKey.findProgramAddress([
            Buffer.from('feedback'),
            agentIdBuffer,
            client.toBuffer(),
            feedbackIndexBuffer,
        ], REPUTATION_PROGRAM_ID);
    }
    /**
     * Get Agent Reputation PDA (Reputation Registry)
     * Seeds: ["agent_reputation", agent_id]
     * Stores cached aggregates for O(1) queries
     */
    static async getAgentReputationPDA(agentId) {
        const agentIdBuffer = Buffer.alloc(8);
        agentIdBuffer.writeBigUInt64LE(agentId);
        return await PublicKey.findProgramAddress([Buffer.from('agent_reputation'), agentIdBuffer], REPUTATION_PROGRAM_ID);
    }
    /**
     * Get Client Index PDA (Reputation Registry)
     * Seeds: ["client_index", agent_id, client]
     * Tracks last feedback index for a client
     */
    static async getClientIndexPDA(agentId, client) {
        const agentIdBuffer = Buffer.alloc(8);
        agentIdBuffer.writeBigUInt64LE(agentId);
        return await PublicKey.findProgramAddress([Buffer.from('client_index'), agentIdBuffer, client.toBuffer()], REPUTATION_PROGRAM_ID);
    }
    /**
     * Get Response PDA (Reputation Registry)
     * Seeds: ["response", agent_id, client, feedback_index, response_index]
     */
    static async getResponsePDA(agentId, client, feedbackIndex, responseIndex) {
        const agentIdBuffer = Buffer.alloc(8);
        agentIdBuffer.writeBigUInt64LE(agentId);
        const feedbackIndexBuffer = Buffer.alloc(8);
        feedbackIndexBuffer.writeBigUInt64LE(feedbackIndex);
        const responseIndexBuffer = Buffer.alloc(8);
        responseIndexBuffer.writeBigUInt64LE(responseIndex);
        return await PublicKey.findProgramAddress([
            Buffer.from('response'),
            agentIdBuffer,
            client.toBuffer(),
            feedbackIndexBuffer,
            responseIndexBuffer,
        ], REPUTATION_PROGRAM_ID);
    }
    /**
     * Get Response Index PDA (Reputation Registry)
     * Seeds: ["response_index", agent_id, client, feedback_index]
     * Tracks number of responses for a feedback
     */
    static async getResponseIndexPDA(agentId, client, feedbackIndex) {
        const agentIdBuffer = Buffer.alloc(8);
        agentIdBuffer.writeBigUInt64LE(agentId);
        const feedbackIndexBuffer = Buffer.alloc(8);
        feedbackIndexBuffer.writeBigUInt64LE(feedbackIndex);
        return await PublicKey.findProgramAddress([
            Buffer.from('response_index'),
            agentIdBuffer,
            client.toBuffer(),
            feedbackIndexBuffer,
        ], REPUTATION_PROGRAM_ID);
    }
    /**
     * Get Validation Request PDA (Validation Registry)
     * Seeds: ["validation", agent_id, validator_address, nonce]
     * Note: Seed is "validation", not "validation_request"
     */
    static async getValidationRequestPDA(agentId, validator, nonce) {
        const agentIdBuffer = Buffer.alloc(8);
        agentIdBuffer.writeBigUInt64LE(agentId);
        const nonceBuffer = Buffer.alloc(4);
        nonceBuffer.writeUInt32LE(nonce);
        return await PublicKey.findProgramAddress([
            Buffer.from('validation'),
            agentIdBuffer,
            validator.toBuffer(),
            nonceBuffer,
        ], VALIDATION_PROGRAM_ID);
    }
    /**
     * Get Validation Config PDA (Validation Registry)
     * Seeds: ["config"]
     */
    static async getValidationConfigPDA() {
        return await PublicKey.findProgramAddress([Buffer.from('config')], VALIDATION_PROGRAM_ID);
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