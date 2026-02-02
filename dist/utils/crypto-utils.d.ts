/**
 * Cross-platform crypto utilities for browser compatibility
 * Uses WebCrypto API with Node.js fallback
 *
 * v0.6.0: Added keccak256 for SEAL v1 support
 */
/**
 * Compute Keccak-256 hash (synchronous)
 * Used for SEAL v1 on-chain hash computation parity with Solana's keccak::hash()
 *
 * Uses @noble/hashes which is a well-audited, pure JS implementation
 */
export declare function keccak256(data: Uint8Array | Buffer): Buffer;
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