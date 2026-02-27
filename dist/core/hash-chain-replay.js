/**
 * Hash-Chain Replay & Verification
 *
 * Pure functions that mirror on-chain hash computation for trustless
 * verification of feedback, response, and revoke event chains.
 *
 * Uses the same keccak256 and binary formats as the Rust programs in
 * `programs/agent-registry-8004/src/reputation/chain.rs` and `seal.rs`.
 */
import { keccak256 } from '../utils/crypto-utils.js';
// Re-export seal functions used by the replay pipeline
export { computeSealHash, computeFeedbackLeafV1 } from './seal.js';
// ---------------------------------------------------------------------------
// Domain constants (must match on-chain exactly)
// ---------------------------------------------------------------------------
/** 16 bytes — chain.rs DOMAIN_FEEDBACK */
export const DOMAIN_FEEDBACK = Buffer.from('8004_FEEDBACK_V1');
/** 16 bytes — chain.rs DOMAIN_RESPONSE */
export const DOMAIN_RESPONSE = Buffer.from('8004_RESPONSE_V1');
/** 14 bytes — chain.rs DOMAIN_REVOKE (NOT 16!) */
export const DOMAIN_REVOKE = Buffer.from('8004_REVOKE_V1');
/** 16 bytes — seal.rs DOMAIN_SEAL_V1 */
export const DOMAIN_SEAL_V1 = Buffer.from('8004_SEAL_V1____');
/** 16 bytes — seal.rs DOMAIN_LEAF_V1 */
export const DOMAIN_LEAF_V1 = Buffer.from('8004_LEAF_V1____');
/** 16 bytes — chain.rs DOMAIN_RESPONSE_LEAF_V1 */
export const DOMAIN_RESPONSE_LEAF_V1 = Buffer.from('8004_RSP_LEAF_V1');
/** 16 bytes — chain.rs DOMAIN_REVOKE_LEAF_V1 */
export const DOMAIN_REVOKE_LEAF_V1 = Buffer.from('8004_RVK_LEAF_V1');
const VALID_CHAIN_DOMAIN_LENGTHS = new Set([
    DOMAIN_FEEDBACK.length,
    DOMAIN_REVOKE.length,
]);
// ---------------------------------------------------------------------------
// Primitive hash functions
// ---------------------------------------------------------------------------
/**
 * Chain hash: `keccak256(prevDigest || domain || leaf)`
 *
 * Mirrors `chain_hash()` in chain.rs.
 */
export function chainHash(prevDigest, domain, leaf) {
    assertBufferLength(prevDigest, 32, 'prevDigest');
    assertBufferLength(leaf, 32, 'leaf');
    if (!VALID_CHAIN_DOMAIN_LENGTHS.has(domain.length)) {
        throw new Error(`domain must be ${DOMAIN_FEEDBACK.length} or ${DOMAIN_REVOKE.length} bytes (got ${domain.length})`);
    }
    return keccak256(Buffer.concat([prevDigest, domain, leaf]));
}
/**
 * Compute response leaf (with response-leaf domain prefix).
 *
 * Format: `keccak256(asset || client || feedbackIndex(u64 LE) || responder || responseHash || feedbackHash || slot(u64 LE))`
 *
 * Mirrors `compute_response_leaf()` in chain.rs.
 */
export function computeResponseLeaf(asset, client, feedbackIndex, responder, responseHash, feedbackHash, slot) {
    if (asset.length !== 32)
        throw new Error(`asset must be 32 bytes (got ${asset.length})`);
    if (client.length !== 32)
        throw new Error(`client must be 32 bytes (got ${client.length})`);
    if (responder.length !== 32)
        throw new Error(`responder must be 32 bytes (got ${responder.length})`);
    if (responseHash.length !== 32)
        throw new Error(`responseHash must be 32 bytes (got ${responseHash.length})`);
    if (feedbackHash.length !== 32)
        throw new Error(`feedbackHash must be 32 bytes (got ${feedbackHash.length})`);
    const indexBuf = Buffer.alloc(8);
    indexBuf.writeBigUInt64LE(feedbackIndex);
    const slotBuf = Buffer.alloc(8);
    slotBuf.writeBigUInt64LE(slot);
    return keccak256(Buffer.concat([DOMAIN_RESPONSE_LEAF_V1, asset, client, indexBuf, responder, responseHash, feedbackHash, slotBuf]));
}
/**
 * Compute revoke leaf (with revoke-leaf domain prefix).
 *
 * Format: `keccak256(asset || client || feedbackIndex(u64 LE) || feedbackHash || slot(u64 LE))`
 *
 * Mirrors `compute_revoke_leaf()` in chain.rs.
 */
export function computeRevokeLeaf(asset, client, feedbackIndex, feedbackHash, slot) {
    if (asset.length !== 32)
        throw new Error(`asset must be 32 bytes (got ${asset.length})`);
    if (client.length !== 32)
        throw new Error(`client must be 32 bytes (got ${client.length})`);
    if (feedbackHash.length !== 32)
        throw new Error(`feedbackHash must be 32 bytes (got ${feedbackHash.length})`);
    const indexBuf = Buffer.alloc(8);
    indexBuf.writeBigUInt64LE(feedbackIndex);
    const slotBuf = Buffer.alloc(8);
    slotBuf.writeBigUInt64LE(slot);
    return keccak256(Buffer.concat([DOMAIN_REVOKE_LEAF_V1, asset, client, indexBuf, feedbackHash, slotBuf]));
}
// ---------------------------------------------------------------------------
// Replay functions
// ---------------------------------------------------------------------------
// Avoid circular import: inline the leaf computation that already lives in seal.ts.
// We import computeFeedbackLeafV1 at the top via re-export, but we need the
// actual function reference here.
import { computeFeedbackLeafV1 as _computeFeedbackLeafV1 } from './seal.js';
/**
 * Replay a feedback hash chain from scratch (or from a checkpoint).
 *
 * For each event:
 *   1. Compute leaf via `computeFeedbackLeafV1`
 *   2. Update digest via `chainHash(prev, DOMAIN_FEEDBACK, leaf)`
 *   3. If the event carries `storedDigest`, cross-validate
 */
export function replayFeedbackChain(events, startDigest = Buffer.alloc(32), startCount = 0) {
    assertBufferLength(startDigest, 32, 'startDigest');
    let digest = startDigest;
    let count = startCount;
    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const leaf = _computeFeedbackLeafV1(e.asset, e.client, e.feedbackIndex, e.sealHash, e.slot);
        digest = chainHash(digest, DOMAIN_FEEDBACK, leaf);
        count++;
        if (e.storedDigest && !digest.equals(e.storedDigest)) {
            return {
                finalDigest: digest,
                count,
                valid: false,
                mismatchAt: i,
                mismatchExpected: e.storedDigest.toString('hex'),
                mismatchComputed: digest.toString('hex'),
            };
        }
    }
    return { finalDigest: digest, count, valid: true };
}
/**
 * Replay a response hash chain from scratch (or from a checkpoint).
 */
export function replayResponseChain(events, startDigest = Buffer.alloc(32), startCount = 0) {
    assertBufferLength(startDigest, 32, 'startDigest');
    let digest = startDigest;
    let count = startCount;
    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const leaf = computeResponseLeaf(e.asset, e.client, e.feedbackIndex, e.responder, e.responseHash, e.feedbackHash, e.slot);
        digest = chainHash(digest, DOMAIN_RESPONSE, leaf);
        count++;
        if (e.storedDigest && !digest.equals(e.storedDigest)) {
            return {
                finalDigest: digest,
                count,
                valid: false,
                mismatchAt: i,
                mismatchExpected: e.storedDigest.toString('hex'),
                mismatchComputed: digest.toString('hex'),
            };
        }
    }
    return { finalDigest: digest, count, valid: true };
}
/**
 * Replay a revoke hash chain from scratch (or from a checkpoint).
 */
export function replayRevokeChain(events, startDigest = Buffer.alloc(32), startCount = 0) {
    assertBufferLength(startDigest, 32, 'startDigest');
    let digest = startDigest;
    let count = startCount;
    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const leaf = computeRevokeLeaf(e.asset, e.client, e.feedbackIndex, e.feedbackHash, e.slot);
        digest = chainHash(digest, DOMAIN_REVOKE, leaf);
        count++;
        if (e.storedDigest && !digest.equals(e.storedDigest)) {
            return {
                finalDigest: digest,
                count,
                valid: false,
                mismatchAt: i,
                mismatchExpected: e.storedDigest.toString('hex'),
                mismatchComputed: digest.toString('hex'),
            };
        }
    }
    return { finalDigest: digest, count, valid: true };
}
function assertBufferLength(value, expectedLength, name) {
    if (!(value instanceof Buffer)) {
        throw new Error(`${name} must be a Buffer`);
    }
    if (value.length !== expectedLength) {
        throw new Error(`${name} must be ${expectedLength} bytes (got ${value.length})`);
    }
}
//# sourceMappingURL=hash-chain-replay.js.map