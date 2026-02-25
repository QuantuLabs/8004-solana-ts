/**
 * SEAL v1 - Solana Event Authenticity Layer
 * Client-side hash computation mirroring on-chain algorithm EXACTLY
 *
 * This module provides deterministic hash computation that matches the
 * Rust on-chain implementation byte-for-byte, enabling trustless verification.
 *
 * @module seal
 * @version 0.6.0
 */
import { keccak256 } from '../utils/crypto-utils.js';
// Domain separators (exactly 16 bytes each - must match Rust)
const DOMAIN_SEAL_V1 = Buffer.from('8004_SEAL_V1____', 'ascii'); // 16 chars
const DOMAIN_LEAF_V1 = Buffer.from('8004_LEAF_V1____', 'ascii'); // 16 chars
// Max lengths (must match on-chain constants in state.rs)
export const MAX_TAG_LEN = 32;
export const MAX_ENDPOINT_LEN = 250;
export const MAX_URI_LEN = 250;
/**
 * Validate SEAL inputs before hashing (mirrors on-chain validation)
 * @throws Error if any input exceeds max length
 */
export function validateSealInputs(params) {
    const tag1Bytes = Buffer.from(params.tag1, 'utf-8');
    const tag2Bytes = Buffer.from(params.tag2, 'utf-8');
    const endpointBytes = Buffer.from(params.endpoint, 'utf-8');
    const uriBytes = Buffer.from(params.feedbackUri, 'utf-8');
    if (tag1Bytes.length > MAX_TAG_LEN) {
        throw new Error(`tag1 exceeds ${MAX_TAG_LEN} bytes (got ${tag1Bytes.length})`);
    }
    if (tag2Bytes.length > MAX_TAG_LEN) {
        throw new Error(`tag2 exceeds ${MAX_TAG_LEN} bytes (got ${tag2Bytes.length})`);
    }
    if (endpointBytes.length > MAX_ENDPOINT_LEN) {
        throw new Error(`endpoint exceeds ${MAX_ENDPOINT_LEN} bytes (got ${endpointBytes.length})`);
    }
    if (uriBytes.length > MAX_URI_LEN) {
        throw new Error(`feedbackUri exceeds ${MAX_URI_LEN} bytes (got ${uriBytes.length})`);
    }
    if (params.valueDecimals < 0 || params.valueDecimals > 18) {
        throw new Error(`valueDecimals must be 0-18 (got ${params.valueDecimals})`);
    }
    if (params.score !== null && (params.score < 0 || params.score > 100)) {
        throw new Error(`score must be 0-100 or null (got ${params.score})`);
    }
}
/**
 * Compute SEAL hash (mirrors on-chain computation EXACTLY)
 * CRITICAL: Must produce identical output to Rust compute_seal_hash()
 *
 * Binary format: FIXED FIELDS (36 bytes) then DYNAMIC FIELDS
 *
 * FIXED (offset known):
 * - DOMAIN_SEAL_V1 (16 bytes)         offset 0
 * - value (16 bytes, i128 LE)         offset 16
 * - value_decimals (1 byte)           offset 32
 * - score_flag (1 byte: 0=None, 1=Some) offset 33
 * - score_value (1 byte)              offset 34
 * - file_hash_flag (1 byte)           offset 35
 *
 * DYNAMIC (after offset 36):
 * - file_hash (32 bytes, only if flag=1)
 * - tag1_len (2 bytes, u16 LE) + tag1_bytes
 * - tag2_len (2 bytes, u16 LE) + tag2_bytes
 * - endpoint_len (2 bytes, u16 LE) + endpoint_bytes
 * - feedback_uri_len (2 bytes, u16 LE) + feedback_uri_bytes
 *
 * @param params SEAL parameters
 * @returns 32-byte Keccak256 hash
 */
export function computeSealHash(params) {
    validateSealInputs(params);
    const parts = [];
    // === FIXED FIELDS (36 bytes, known offsets) ===
    // offset 0: Domain (16 bytes)
    parts.push(DOMAIN_SEAL_V1);
    // offset 16: Value (16 bytes, i128 LE)
    parts.push(serializeI128LE(params.value));
    // offset 32: Decimals (1 byte)
    parts.push(Buffer.from([params.valueDecimals]));
    // offset 33-34: Score (2 bytes, fixed layout)
    if (params.score === null) {
        parts.push(Buffer.from([0, 0])); // flag=0, placeholder=0
    }
    else {
        parts.push(Buffer.from([1, params.score])); // flag=1, value
    }
    // offset 35: File hash flag (1 byte)
    parts.push(Buffer.from([params.feedbackFileHash === null ? 0 : 1]));
    // === DYNAMIC FIELDS (after offset 36) ===
    // File hash (32 bytes if present)
    if (params.feedbackFileHash !== null) {
        if (params.feedbackFileHash.length !== 32) {
            throw new Error(`feedbackFileHash must be 32 bytes (got ${params.feedbackFileHash.length})`);
        }
        parts.push(params.feedbackFileHash);
    }
    // Strings (u16 len LE + UTF-8 bytes)
    for (const str of [params.tag1, params.tag2, params.endpoint, params.feedbackUri]) {
        const bytes = Buffer.from(str, 'utf-8');
        const lenBuf = Buffer.alloc(2);
        lenBuf.writeUInt16LE(bytes.length);
        parts.push(lenBuf, bytes);
    }
    return keccak256(Buffer.concat(parts));
}
/**
 * Compute feedback leaf hash (mirrors on-chain compute_feedback_leaf_v1)
 *
 * Format:
 * - DOMAIN_LEAF_V1 (16 bytes)
 * - asset (32 bytes)
 * - client (32 bytes)
 * - feedback_index (8 bytes, u64 LE)
 * - seal_hash (32 bytes)
 * - slot (8 bytes, u64 LE)
 *
 * @param asset Agent asset public key (32 bytes)
 * @param client Client public key (32 bytes)
 * @param feedbackIndex Feedback index (u64)
 * @param sealHash SEAL hash from computeSealHash (32 bytes)
 * @param slot Solana slot number (u64)
 * @returns 32-byte Keccak256 hash
 */
export function computeFeedbackLeafV1(asset, client, feedbackIndex, sealHash, slot) {
    if (asset.length !== 32)
        throw new Error(`asset must be 32 bytes (got ${asset.length})`);
    if (client.length !== 32)
        throw new Error(`client must be 32 bytes (got ${client.length})`);
    if (sealHash.length !== 32)
        throw new Error(`sealHash must be 32 bytes (got ${sealHash.length})`);
    const parts = [];
    // Domain separator
    parts.push(DOMAIN_LEAF_V1); // 16 bytes
    // Context binding
    parts.push(asset); // 32 bytes
    parts.push(client); // 32 bytes
    // Feedback index (8 bytes, u64 LE)
    const indexBuf = Buffer.alloc(8);
    indexBuf.writeBigUInt64LE(BigInt(feedbackIndex));
    parts.push(indexBuf);
    // Seal hash
    parts.push(sealHash); // 32 bytes
    // Slot (8 bytes, u64 LE)
    const slotBuf = Buffer.alloc(8);
    slotBuf.writeBigUInt64LE(slot);
    parts.push(slotBuf);
    return keccak256(Buffer.concat(parts));
}
/**
 * Verify feedback integrity by recomputing SEAL hash
 * @param feedback Feedback data with sealHash to verify
 * @returns true if computed hash matches provided sealHash
 */
export function verifySealHash(feedback) {
    const computed = computeSealHash(feedback);
    return computed.equals(feedback.sealHash);
}
/**
 * Helper to create SealParams from common SDK types
 */
export function createSealParams(value, valueDecimals, score, tag1, tag2, endpoint, feedbackUri, feedbackFileHash) {
    return {
        value,
        valueDecimals,
        score,
        tag1,
        tag2,
        endpoint,
        feedbackUri,
        feedbackFileHash: feedbackFileHash ?? null,
    };
}
function serializeI128LE(value) {
    const min = -(1n << 127n);
    const max = (1n << 127n) - 1n;
    if (value < min || value > max) {
        throw new Error(`value exceeds i128 range (${min} to ${max})`);
    }
    let encoded = value;
    if (encoded < 0n) {
        encoded = (1n << 128n) + encoded;
    }
    const out = Buffer.alloc(16);
    for (let i = 0; i < 16; i++) {
        out[i] = Number((encoded >> BigInt(i * 8)) & 0xffn);
    }
    return out;
}
//# sourceMappingURL=seal.js.map