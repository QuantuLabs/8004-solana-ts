/**
 * Cross-platform crypto utilities for browser compatibility
 * Uses WebCrypto API with Node.js fallback
 */
/**
 * Generate cryptographically secure random bytes
 * Uses WebCrypto API (browser) with Node.js crypto fallback
 */
export function getRandomBytes(size) {
    // Browser / modern Node.js with global crypto
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(new Uint8Array(size));
    }
    // Node.js fallback (synchronous)
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const { randomBytes } = require('crypto');
    return new Uint8Array(randomBytes(size));
}
/**
 * Compute SHA-256 hash (async for WebCrypto compatibility)
 * Uses WebCrypto API (browser) with Node.js crypto fallback
 */
export async function sha256(data) {
    const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    // Browser / modern Node.js with global crypto.subtle
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
        const hash = await globalThis.crypto.subtle.digest('SHA-256', input);
        return new Uint8Array(hash);
    }
    // Node.js fallback
    const { createHash } = await import('crypto');
    return new Uint8Array(createHash('sha256').update(input).digest());
}
/**
 * Compute SHA-256 hash (synchronous - Node.js only)
 * For browser, use the async sha256() function instead
 * @throws Error if called in browser without Node.js crypto
 */
export function sha256Sync(data) {
    const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    // Node.js only - synchronous version
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const { createHash } = require('crypto');
    return new Uint8Array(createHash('sha256').update(input).digest());
}
/**
 * Check if running in a browser environment
 */
export function isBrowser() {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return typeof globalThis !== 'undefined' &&
        typeof globalThis.window !== 'undefined' &&
        typeof globalThis.window.document !== 'undefined';
    /* eslint-enable @typescript-eslint/no-explicit-any */
}
/**
 * Check if WebCrypto API is available
 */
export function hasWebCrypto() {
    return typeof globalThis !== 'undefined' &&
        globalThis.crypto !== undefined &&
        globalThis.crypto.subtle !== undefined;
}
//# sourceMappingURL=crypto-utils.js.map