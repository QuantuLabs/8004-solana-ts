/**
 * Cross-platform crypto utilities for browser compatibility
 * Uses WebCrypto API with Node.js fallback
 */
/**
 * Generate cryptographically secure random bytes
 * Uses WebCrypto API (browser) with Node.js crypto fallback
 */
export declare function getRandomBytes(size: number): Uint8Array;
/**
 * Compute SHA-256 hash (async for WebCrypto compatibility)
 * Uses WebCrypto API (browser) with Node.js crypto fallback
 */
export declare function sha256(data: Uint8Array | string): Promise<Uint8Array>;
/**
 * Compute SHA-256 hash (synchronous - Node.js only)
 * For browser, use the async sha256() function instead
 * @throws Error if called in browser without Node.js crypto
 */
export declare function sha256Sync(data: Uint8Array | string): Uint8Array;
/**
 * Check if running in a browser environment
 */
export declare function isBrowser(): boolean;
/**
 * Check if WebCrypto API is available
 */
export declare function hasWebCrypto(): boolean;
//# sourceMappingURL=crypto-utils.d.ts.map