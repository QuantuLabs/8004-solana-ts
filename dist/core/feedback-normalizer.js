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
        // Binary flags (0 or 1) → 0 or 100
        case 'reachable':
        case 'ownerverified':
            return value === 0n ? 0 : 100;
        // Response time: lower is better (0ms=100, 1000ms+=0)
        case 'responsetime':
            return Math.max(0, Math.min(100, Math.round(100 - raw / 10)));
        // Block freshness: lower is better (0 blocks=100, 10+ blocks=0)
        case 'blocktimefreshness':
            return Math.max(0, Math.min(100, Math.round(100 - raw * 10)));
        // Yield: percentage, capped at 100
        case 'tradingyield':
            return Math.min(100, Math.max(0, Math.round(raw)));
        // Revenues: positive = good, map logarithmically
        // $0=50, $100=70, $1000=80, $10000=90, $100000+=100
        case 'revenues':
            if (raw <= 0)
                return 50;
            const logScore = 50 + Math.log10(raw) * 12.5;
            return Math.min(100, Math.max(50, Math.round(logScore)));
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