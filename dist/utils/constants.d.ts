/**
 * Shared constants for Agent0 SDK
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
 * Default values
 */
export declare const DEFAULTS: {
    readonly FEEDBACK_EXPIRY_HOURS: 24;
    readonly SEARCH_PAGE_SIZE: 50;
};
//# sourceMappingURL=constants.d.ts.map