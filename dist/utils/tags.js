/**
 * 8004 Standardized Tag helpers for feedback
 *
 * Usage:
 *   import { Tag } from '8004-solana';
 *
 *   // Using predefined tags (recommended)
 *   await sdk.giveFeedback(asset, {
 *     value: '99.77',
 *     tag1: Tag.uptime,      // 'uptime'
 *     tag2: Tag.day,         // 'day'
 *   });
 *
 *   // Custom tags also supported (free text)
 *   await sdk.giveFeedback(asset, {
 *     value: '150.5',
 *     tag1: 'custom-metric',  // Any string up to 32 bytes
 *     tag2: 'hourly',
 *   });
 *
 * @see https://github.com/erc-8004/erc-8004-contracts/blob/master/ERC8004SPEC.md
 */
/**
 * 8004 Standardized tags for feedback categorization
 *
 * These are example tags from the 8004 specification. Tags are left to
 * developers' discretion, but using standard tags improves interoperability.
 *
 * tag1 (Category) - What metric is being measured
 * tag2 (Period) - Time period of measurement
 */
export const Tag = {
    // ══════════════════════════════════════════════════════════
    // Category tags (tag1) - 8004 standard examples
    // ══════════════════════════════════════════════════════════
    /** Quality rating measurement (0-100) */
    starred: 'starred',
    /** Endpoint availability verification (binary: 0 or 1) */
    reachable: 'reachable',
    /** Domain ownership confirmation (binary: 0 or 1) */
    ownerVerified: 'ownerVerified',
    /** Endpoint availability percentage (e.g., 99.77%) */
    uptime: 'uptime',
    /** Task completion success percentage */
    successRate: 'successRate',
    /** Response latency in milliseconds */
    responseTime: 'responseTime',
    /** Average block delay metric */
    blocktimeFreshness: 'blocktimeFreshness',
    /** Cumulative revenue tracking */
    revenues: 'revenues',
    /** Performance yield/APY (paired with period tag2) */
    tradingYield: 'tradingYield',
    // ══════════════════════════════════════════════════════════
    // Period tags (tag2) - Time window of measurement
    // ══════════════════════════════════════════════════════════
    /** Daily measurement */
    day: 'day',
    /** Weekly measurement */
    week: 'week',
    /** Monthly measurement */
    month: 'month',
    /** Yearly measurement */
    year: 'year',
    // ══════════════════════════════════════════════════════════
    // x402 Protocol tags (8004 extension)
    // @see https://github.com/coinbase/x402/issues/931
    // ══════════════════════════════════════════════════════════
    // Client → Agent feedback (tag1)
    /** x402: Resource delivered successfully */
    x402ResourceDelivered: 'x402-resource-delivered',
    /** x402: Resource delivery failed */
    x402DeliveryFailed: 'x402-delivery-failed',
    /** x402: Resource delivery timed out */
    x402DeliveryTimeout: 'x402-delivery-timeout',
    /** x402: Resource quality below expectations */
    x402QualityIssue: 'x402-quality-issue',
    // Agent → Client feedback (tag1)
    /** x402: Client paid successfully */
    x402GoodPayer: 'x402-good-payer',
    /** x402: Client's payment failed to settle */
    x402PaymentFailed: 'x402-payment-failed',
    /** x402: Client had insufficient funds */
    x402InsufficientFunds: 'x402-insufficient-funds',
    /** x402: Client provided invalid signature */
    x402InvalidSignature: 'x402-invalid-signature',
    // Network identifier (tag2)
    /** x402: EVM network settlement (Base, Ethereum, etc.) */
    x402Evm: 'exact-evm',
    /** x402: Solana network settlement */
    x402Svm: 'exact-svm',
};
/**
 * Check if a string is a known 8004 standardized tag
 */
export function isKnownTag(tag) {
    return Object.values(Tag).includes(tag);
}
/**
 * Get tag description for documentation
 */
export function getTagDescription(tag) {
    const descriptions = {
        // 8004 category tags (tag1)
        starred: 'Quality rating measurement (0-100)',
        reachable: 'Endpoint availability verification (binary)',
        ownerVerified: 'Domain ownership confirmation (binary)',
        uptime: 'Endpoint availability percentage',
        successRate: 'Task completion success percentage',
        responseTime: 'Response latency in milliseconds',
        blocktimeFreshness: 'Average block delay metric',
        revenues: 'Cumulative revenue tracking',
        tradingYield: 'Performance yield/APY',
        // Period tags (tag2)
        day: 'Daily measurement window',
        week: 'Weekly measurement window',
        month: 'Monthly measurement window',
        year: 'Yearly measurement window',
        // x402 client → agent tags
        'x402-resource-delivered': 'x402: Resource delivered successfully',
        'x402-delivery-failed': 'x402: Resource delivery failed',
        'x402-delivery-timeout': 'x402: Resource delivery timed out',
        'x402-quality-issue': 'x402: Resource quality below expectations',
        // x402 agent → client tags
        'x402-good-payer': 'x402: Client paid successfully',
        'x402-payment-failed': 'x402: Payment failed to settle',
        'x402-insufficient-funds': 'x402: Insufficient funds',
        'x402-invalid-signature': 'x402: Invalid signature',
        // x402 network tags (tag2)
        'exact-evm': 'x402: EVM network settlement',
        'exact-svm': 'x402: Solana network settlement',
    };
    return descriptions[tag];
}
//# sourceMappingURL=tags.js.map