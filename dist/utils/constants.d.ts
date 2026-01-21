/**
 * Shared constants for Agent0 SDK
 * v0.2.0 - Updated for consolidated program
 */
/**
 * IPFS gateway URLs for fallback retrieval
 */
export declare const IPFS_GATEWAYS: readonly ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"];
/**
 * Timeout values in milliseconds
 */
export declare const TIMEOUTS: {
    readonly IPFS_GATEWAY: 10000;
    readonly PINATA_UPLOAD: 80000;
    readonly TRANSACTION_WAIT: 30000;
    readonly ENDPOINT_CRAWLER_DEFAULT: 5000;
};
/**
 * Security: Maximum response sizes to prevent OOM attacks
 */
export declare const MAX_SIZES: {
    readonly IPFS_RESPONSE: number;
};
/**
 * Default values
 */
export declare const DEFAULTS: {
    readonly FEEDBACK_EXPIRY_HOURS: 24;
    readonly SEARCH_PAGE_SIZE: 50;
};
/**
 * On-chain limits - v0.2.0 consolidated program
 */
export declare const LIMITS: {
    readonly MAX_URI_LENGTH: 250;
    readonly MAX_NFT_NAME_LENGTH: 32;
    readonly MAX_NFT_SYMBOL_LENGTH: 10;
    readonly MAX_METADATA_KEY_LENGTH: 32;
    readonly MAX_METADATA_VALUE_LENGTH: 250;
    readonly MAX_METADATA_ENTRIES_IN_BASE: 1;
    readonly MAX_METADATA_ENTRIES_IN_EXTENSION: 10;
    readonly MAX_EXTENSIONS: 255;
    readonly MIN_FEEDBACK_SCORE: 0;
    readonly MAX_FEEDBACK_SCORE: 100;
    readonly MAX_TAG_LENGTH: 32;
    readonly MAX_RESPONSE_VALUE: 100;
    readonly HASH_SIZE: 32;
};
//# sourceMappingURL=constants.d.ts.map