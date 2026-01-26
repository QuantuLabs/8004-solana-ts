/**
 * Feedback Normalizer for ATOM score calculation
 * Converts raw metric values to 0-100 scores based on ERC-8004 tag semantics
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */
/**
 * ERC-8004 standardized tags that are ATOM-enabled
 * These tags have defined semantics for score calculation
 */
export declare const ATOM_ENABLED_TAGS: readonly ["starred", "reachable", "ownerverified", "uptime", "successrate", "responsetime", "blocktimefreshness", "revenues", "tradingyield"];
export type AtomEnabledTag = typeof ATOM_ENABLED_TAGS[number];
/**
 * Check if tag is ATOM-enabled (case-insensitive)
 */
export declare function isAtomEnabledTag(tag: string): boolean;
/**
 * Normalize a raw metric value to 0-100 score based on ERC-8004 tag semantics
 * Uses BigInt arithmetic to avoid precision loss
 */
export declare function normalizeToScore(tag: string, value: bigint, decimals: number): number | null;
/**
 * Resolve final score for ATOM:
 * 1. Explicit score provided (0-100) → use directly
 * 2. Known ERC-8004 tag → normalize from value
 * 3. Otherwise → null (skip ATOM)
 */
export declare function resolveScore(params: {
    tag1?: string;
    value: number | bigint;
    valueDecimals: number;
    score?: number | null;
}): number | null;
//# sourceMappingURL=feedback-normalizer.d.ts.map