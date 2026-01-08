/**
 * Validation utilities
 */
/**
 * Validate Ethereum address format
 */
export function isValidAddress(address) {
    if (!address || typeof address !== 'string') {
        return false;
    }
    // Ethereum address: 0x followed by 40 hex characters
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
/**
 * Validate AgentId format
 * Format: "chainId:tokenId" where both are positive integers
 */
export function isValidAgentId(agentId) {
    if (!agentId || typeof agentId !== 'string') {
        return false;
    }
    const parts = agentId.split(':');
    if (parts.length !== 2) {
        return false;
    }
    const chainId = parseInt(parts[0], 10);
    const tokenId = parseInt(parts[1], 10);
    return !isNaN(chainId) && !isNaN(tokenId) && chainId > 0 && tokenId >= 0;
}
/**
 * Validate URI format (basic validation)
 */
export function isValidURI(uri) {
    if (!uri || typeof uri !== 'string') {
        return false;
    }
    try {
        const url = new URL(uri);
        return url.protocol === 'http:' || url.protocol === 'https:' || uri.startsWith('ipfs://');
    }
    catch {
        // If URL parsing fails, it might still be a valid IPFS URI
        return uri.startsWith('ipfs://') || uri.startsWith('/ipfs/');
    }
}
/**
 * Validate feedback score (0-100)
 */
export function isValidScore(score) {
    return Number.isInteger(score) && score >= 0 && score <= 100;
}
/**
 * Normalize address to lowercase for consistent storage and comparison
 */
export function normalizeAddress(address) {
    if (address.startsWith('0x') || address.startsWith('0X')) {
        return '0x' + address.slice(2).toLowerCase();
    }
    return address.toLowerCase();
}
/**
 * Validate string byte length in UTF-8 encoding
 * Security: Prevents bypassing on-chain byte limits with multi-byte Unicode characters
 *
 * @param str - String to validate
 * @param maxBytes - Maximum allowed bytes in UTF-8 encoding
 * @param fieldName - Field name for error messages
 * @throws Error if byte length exceeds maxBytes
 *
 * @example
 * validateByteLength('hello', 32, 'tag1'); // OK - 5 bytes
 * validateByteLength('❤️'.repeat(10), 32, 'tag1'); // Error - ~60 bytes
 */
export function validateByteLength(str, maxBytes, fieldName) {
    const byteLength = Buffer.byteLength(str, 'utf8');
    if (byteLength > maxBytes) {
        throw new Error(`${fieldName} must be <= ${maxBytes} bytes (got ${byteLength} bytes)`);
    }
}
/**
 * Validate nonce is within u32 range
 * Security: Prevents integer overflow on-chain
 *
 * @param nonce - Nonce value to validate
 * @throws Error if nonce is out of u32 range (0 to 4294967295)
 */
export function validateNonce(nonce) {
    if (!Number.isInteger(nonce) || nonce < 0 || nonce > 4294967295) {
        throw new Error(`nonce must be a u32 integer (0 to 4294967295), got ${nonce}`);
    }
}
//# sourceMappingURL=validation.js.map