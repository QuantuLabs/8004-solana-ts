/**
 * Feedback Normalizer for ATOM score calculation
 * Converts raw metric values to 0-100 scores based on tag semantics
 */
export const ATOM_ENABLED_TAGS = [
    'starred',
    'uptime',
    'responsetime',
    'successrate',
    'reliability',
];
/**
 * Check if tag is ATOM-enabled (case-insensitive)
 */
export function isAtomEnabledTag(tag) {
    return ATOM_ENABLED_TAGS.includes(tag.toLowerCase());
}
/**
 * Normalize a raw metric value to 0-100 score based on tag semantics
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
        case 'starred':
        case 'successrate':
        case 'reliability':
            return Math.min(100, Math.max(0, Math.round(raw)));
        case 'uptime':
            return Math.min(100, Math.max(0, Math.round(raw)));
        case 'responsetime':
            return Math.max(0, Math.min(100, Math.round(100 - raw / 10)));
        default:
            return null;
    }
}
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
export function resolveScore(params) {
    if (params.score !== undefined && params.score >= 0 && params.score <= 100) {
        return Math.round(params.score);
    }
    const valueBigInt = typeof params.value === 'bigint'
        ? params.value
        : BigInt(Math.trunc(params.value));
    if (params.tag1 && isAtomEnabledTag(params.tag1)) {
        return normalizeToScore(params.tag1, valueBigInt, params.valueDecimals);
    }
    return null;
}
//# sourceMappingURL=feedback-normalizer.js.map