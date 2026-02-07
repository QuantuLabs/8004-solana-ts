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
export declare const MAX_TAG_LEN = 32;
export declare const MAX_ENDPOINT_LEN = 250;
export declare const MAX_URI_LEN = 250;
/**
 * Parameters for SEAL hash computation
 */
export interface SealParams {
    /** Metric value - MUST be bigint for correct i64 serialization */
    value: bigint;
    /** Decimal precision (0-6) */
    valueDecimals: number;
    /** Quality score (0-100) or null */
    score: number | null;
    /** Category tag 1 (max 32 UTF-8 bytes) */
    tag1: string;
    /** Category tag 2 (max 32 UTF-8 bytes) */
    tag2: string;
    /** Agent endpoint (max 250 UTF-8 bytes) */
    endpoint: string;
    /** Feedback URI (max 250 UTF-8 bytes) */
    feedbackUri: string;
    /** Optional hash of the feedback file content (32 bytes) */
    feedbackFileHash: Buffer | null;
}
/**
 * Validate SEAL inputs before hashing (mirrors on-chain validation)
 * @throws Error if any input exceeds max length
 */
export declare function validateSealInputs(params: SealParams): void;
/**
 * Compute SEAL hash (mirrors on-chain computation EXACTLY)
 * CRITICAL: Must produce identical output to Rust compute_seal_hash()
 *
 * Binary format: FIXED FIELDS (28 bytes) then DYNAMIC FIELDS
 *
 * FIXED (offset known):
 * - DOMAIN_SEAL_V1 (16 bytes)         offset 0
 * - value (8 bytes, i64 LE)           offset 16
 * - value_decimals (1 byte)           offset 24
 * - score_flag (1 byte: 0=None, 1=Some) offset 25
 * - score_value (1 byte)              offset 26
 * - file_hash_flag (1 byte)           offset 27
 *
 * DYNAMIC (after offset 28):
 * - file_hash (32 bytes, only if flag=1)
 * - tag1_len (2 bytes, u16 LE) + tag1_bytes
 * - tag2_len (2 bytes, u16 LE) + tag2_bytes
 * - endpoint_len (2 bytes, u16 LE) + endpoint_bytes
 * - feedback_uri_len (2 bytes, u16 LE) + feedback_uri_bytes
 *
 * @param params SEAL parameters
 * @returns 32-byte Keccak256 hash
 */
export declare function computeSealHash(params: SealParams): Buffer;
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
export declare function computeFeedbackLeafV1(asset: Buffer, client: Buffer, feedbackIndex: number | bigint, sealHash: Buffer, slot: bigint): Buffer;
/**
 * Verify feedback integrity by recomputing SEAL hash
 * @param feedback Feedback data with sealHash to verify
 * @returns true if computed hash matches provided sealHash
 */
export declare function verifySealHash(feedback: SealParams & {
    sealHash: Buffer;
}): boolean;
/**
 * Helper to create SealParams from common SDK types
 */
export declare function createSealParams(value: bigint, valueDecimals: number, score: number | null, tag1: string, tag2: string, endpoint: string, feedbackUri: string, feedbackFileHash?: Buffer | null): SealParams;
//# sourceMappingURL=seal.d.ts.map