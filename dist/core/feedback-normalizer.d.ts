/**
 * Feedback Normalizer for ATOM score calculation
 * Converts raw metric values to 0-100 scores based on tag semantics
 */
export declare const ATOM_ENABLED_TAGS: readonly ["starred", "uptime", "responsetime", "successrate", "reliability"];
export type AtomEnabledTag = typeof ATOM_ENABLED_TAGS[number];
/**
 * Check if tag is ATOM-enabled (case-insensitive)
 */
export declare function isAtomEnabledTag(tag: string): boolean;
/**
 * Normalize a raw metric value to 0-100 score based on tag semantics
 * Uses BigInt arithmetic to avoid precision loss
 */
export declare function normalizeToScore(tag: string, value: bigint, decimals: number): number | null;
/**
 * Resolve final score for ATOM:
 * 1. Explicit score provided (0-100) → use directly
 * 2. Known tag → normalize from value
 * 3. Otherwise → null (skip ATOM)
 *
 * @warning For external use: if passing number for value, ensure it's within
 * Number.MAX_SAFE_INTEGER. Large numbers lose precision before conversion.
 * Prefer bigint or use validateValue() from transaction-builder.
 */
export declare function resolveScore(params: {
    tag1?: string;
    value: number | bigint;
    valueDecimals: number;
    score?: number;
}): number | null;
//# sourceMappingURL=feedback-normalizer.d.ts.map