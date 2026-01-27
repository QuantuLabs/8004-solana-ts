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
export declare const Tag: {
    /** Quality rating measurement (0-100) */
    readonly starred: "starred";
    /** Endpoint availability verification (binary: 0 or 1) */
    readonly reachable: "reachable";
    /** Domain ownership confirmation (binary: 0 or 1) */
    readonly ownerVerified: "ownerVerified";
    /** Endpoint availability percentage (e.g., 99.77%) */
    readonly uptime: "uptime";
    /** Task completion success percentage */
    readonly successRate: "successRate";
    /** Response latency in milliseconds */
    readonly responseTime: "responseTime";
    /** Average block delay metric */
    readonly blocktimeFreshness: "blocktimeFreshness";
    /** Cumulative revenue tracking */
    readonly revenues: "revenues";
    /** Performance yield/APY (paired with period tag2) */
    readonly tradingYield: "tradingYield";
    /** Daily measurement */
    readonly day: "day";
    /** Weekly measurement */
    readonly week: "week";
    /** Monthly measurement */
    readonly month: "month";
    /** Yearly measurement */
    readonly year: "year";
    /** x402: Resource delivered successfully */
    readonly x402ResourceDelivered: "x402-resource-delivered";
    /** x402: Resource delivery failed */
    readonly x402DeliveryFailed: "x402-delivery-failed";
    /** x402: Resource delivery timed out */
    readonly x402DeliveryTimeout: "x402-delivery-timeout";
    /** x402: Resource quality below expectations */
    readonly x402QualityIssue: "x402-quality-issue";
    /** x402: Client paid successfully */
    readonly x402GoodPayer: "x402-good-payer";
    /** x402: Client's payment failed to settle */
    readonly x402PaymentFailed: "x402-payment-failed";
    /** x402: Client had insufficient funds */
    readonly x402InsufficientFunds: "x402-insufficient-funds";
    /** x402: Client provided invalid signature */
    readonly x402InvalidSignature: "x402-invalid-signature";
    /** x402: EVM network settlement (Base, Ethereum, etc.) */
    readonly x402Evm: "exact-evm";
    /** x402: Solana network settlement */
    readonly x402Svm: "exact-svm";
};
/** Type for predefined tag values */
export type TagValue = (typeof Tag)[keyof typeof Tag];
/**
 * Check if a string is a known 8004 standardized tag
 */
export declare function isKnownTag(tag: string): tag is TagValue;
/**
 * Get tag description for documentation
 */
export declare function getTagDescription(tag: string): string | undefined;
//# sourceMappingURL=tags.d.ts.map