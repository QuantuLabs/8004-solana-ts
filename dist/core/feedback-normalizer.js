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
export const ATOM_ENABLED_TAGS = [
    'starred', // Quality rating (0-100)
    'reachable', // Endpoint reachable (binary 0/1)
    'ownerverified', // Endpoint owned by agent owner (binary 0/1)
    'uptime', // Endpoint uptime (%)
    'successrate', // Endpoint success rate (%)
    'responsetime', // Response time (ms) - lower is better
    'blocktimefreshness', // Avg block delay (blocks) - lower is better
    'revenues', // Cumulative revenues (USD)
    'tradingyield', // Yield/APY (%)
];
/**
 * Check if tag is ATOM-enabled (case-insensitive)
 */
export function isAtomEnabledTag(tag) {
    return ATOM_ENABLED_TAGS.includes(tag.toLowerCase());
}
/**
 * Normalize a raw metric value to 0-100 score based on ERC-8004 tag semantics
 * Uses BigInt arithmetic to avoid precision loss
 */
export function normalizeToScore(tag, value, decimals) {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
        throw new Error(`Invalid decimals: ${decimals} (must be integer 0-6)`);
    }
    const normalizedTag = tag.toLowerCase();
    const divisor = 10n ** BigInt(decimals);
    const raw = Number(value * 100n / divisor) / 100;
    switch (normalizedTag) {
        // Direct percentage scores (0-100)
        case 'starred':
        case 'uptime':
        case 'successrate':
            return Math.min(100, Math.max(0, Math.round(raw)));
        // Binary/context-dependent tags: caller provides explicit score
        case 'ownerverified':
        case 'reachable':
        case 'responsetime':
        case 'blocktimefreshness':
        case 'revenues':
        case 'tradingyield':
            return null;
        default:
            return null;
    }
}
/**
 * Resolve final score for ATOM:
 * 1. Explicit score provided (0-100) → use directly
 * 2. Known ERC-8004 tag → normalize from value
 * 3. Otherwise → null (skip ATOM)
 */
export function resolveScore(params) {
    // Explicit score takes priority (unless null)
    if (params.score !== undefined && params.score !== null && params.score >= 0 && params.score <= 100) {
        return Math.round(params.score);
    }
    // Convert value to bigint
    const valueBigInt = typeof params.value === 'bigint'
        ? params.value
        : BigInt(Math.trunc(params.value));
    // Try to normalize from tag
    if (params.tag1 && isAtomEnabledTag(params.tag1)) {
        return normalizeToScore(params.tag1, valueBigInt, params.valueDecimals);
    }
    // Unknown tag, no explicit score → skip ATOM
    return null;
}
//# sourceMappingURL=feedback-normalizer.js.map