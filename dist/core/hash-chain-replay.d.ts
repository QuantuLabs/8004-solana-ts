/**
 * Hash-Chain Replay & Verification
 *
 * Pure functions that mirror on-chain hash computation for trustless
 * verification of feedback, response, and revoke event chains.
 *
 * Uses the same keccak256 and binary formats as the Rust programs in
 * `programs/agent-registry-8004/src/reputation/chain.rs` and `seal.rs`.
 */
export { computeSealHash, computeFeedbackLeafV1 } from './seal.js';
export type { SealParams } from './seal.js';
/** 16 bytes — chain.rs DOMAIN_FEEDBACK */
export declare const DOMAIN_FEEDBACK: Buffer<ArrayBuffer>;
/** 16 bytes — chain.rs DOMAIN_RESPONSE */
export declare const DOMAIN_RESPONSE: Buffer<ArrayBuffer>;
/** 14 bytes — chain.rs DOMAIN_REVOKE (NOT 16!) */
export declare const DOMAIN_REVOKE: Buffer<ArrayBuffer>;
/** 16 bytes — seal.rs DOMAIN_SEAL_V1 */
export declare const DOMAIN_SEAL_V1: Buffer<ArrayBuffer>;
/** 16 bytes — seal.rs DOMAIN_LEAF_V1 */
export declare const DOMAIN_LEAF_V1: Buffer<ArrayBuffer>;
/** 16 bytes — chain.rs DOMAIN_RESPONSE_LEAF_V1 */
export declare const DOMAIN_RESPONSE_LEAF_V1: Buffer<ArrayBuffer>;
/** 16 bytes — chain.rs DOMAIN_REVOKE_LEAF_V1 */
export declare const DOMAIN_REVOKE_LEAF_V1: Buffer<ArrayBuffer>;
/**
 * Chain hash: `keccak256(prevDigest || domain || leaf)`
 *
 * Mirrors `chain_hash()` in chain.rs.
 */
export declare function chainHash(prevDigest: Buffer, domain: Buffer, leaf: Buffer): Buffer;
/**
 * Compute response leaf (with response-leaf domain prefix).
 *
 * Format: `keccak256(asset || client || feedbackIndex(u64 LE) || responder || responseHash || feedbackHash || slot(u64 LE))`
 *
 * Mirrors `compute_response_leaf()` in chain.rs.
 */
export declare function computeResponseLeaf(asset: Buffer, client: Buffer, feedbackIndex: bigint, responder: Buffer, responseHash: Buffer, feedbackHash: Buffer, slot: bigint): Buffer;
/**
 * Compute revoke leaf (with revoke-leaf domain prefix).
 *
 * Format: `keccak256(asset || client || feedbackIndex(u64 LE) || feedbackHash || slot(u64 LE))`
 *
 * Mirrors `compute_revoke_leaf()` in chain.rs.
 */
export declare function computeRevokeLeaf(asset: Buffer, client: Buffer, feedbackIndex: bigint, feedbackHash: Buffer, slot: bigint): Buffer;
export interface ReplayResult {
    finalDigest: Buffer;
    count: number;
    valid: boolean;
    mismatchAt?: number;
    mismatchExpected?: string;
    mismatchComputed?: string;
}
export interface FeedbackReplayEvent {
    asset: Buffer;
    client: Buffer;
    feedbackIndex: bigint;
    sealHash: Buffer;
    slot: bigint;
    storedDigest?: Buffer;
}
export interface ResponseReplayEvent {
    asset: Buffer;
    client: Buffer;
    feedbackIndex: bigint;
    responder: Buffer;
    responseHash: Buffer;
    feedbackHash: Buffer;
    slot: bigint;
    storedDigest?: Buffer;
}
export interface RevokeReplayEvent {
    asset: Buffer;
    client: Buffer;
    feedbackIndex: bigint;
    feedbackHash: Buffer;
    slot: bigint;
    storedDigest?: Buffer;
}
/**
 * Replay a feedback hash chain from scratch (or from a checkpoint).
 *
 * For each event:
 *   1. Compute leaf via `computeFeedbackLeafV1`
 *   2. Update digest via `chainHash(prev, DOMAIN_FEEDBACK, leaf)`
 *   3. If the event carries `storedDigest`, cross-validate
 */
export declare function replayFeedbackChain(events: FeedbackReplayEvent[], startDigest?: Buffer, startCount?: number): ReplayResult;
/**
 * Replay a response hash chain from scratch (or from a checkpoint).
 */
export declare function replayResponseChain(events: ResponseReplayEvent[], startDigest?: Buffer, startCount?: number): ReplayResult;
/**
 * Replay a revoke hash chain from scratch (or from a checkpoint).
 */
export declare function replayRevokeChain(events: RevokeReplayEvent[], startDigest?: Buffer, startCount?: number): ReplayResult;
//# sourceMappingURL=hash-chain-replay.d.ts.map