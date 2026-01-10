/**
 * Validation utilities
 */
/**
 * Validate AgentId format
 * Format: "chainId:tokenId" where both are positive integers
 */
export declare function isValidAgentId(agentId: string): boolean;
/**
 * Validate URI format (basic validation)
 */
export declare function isValidURI(uri: string): boolean;
/**
 * Validate feedback score (0-100)
 */
export declare function isValidScore(score: number): boolean;
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
export declare function validateByteLength(str: string, maxBytes: number, fieldName: string): void;
/**
 * Validate nonce is within u32 range
 * Security: Prevents integer overflow on-chain
 *
 * @param nonce - Nonce value to validate
 * @throws Error if nonce is out of u32 range (0 to 4294967295)
 */
export declare function validateNonce(nonce: number): void;
//# sourceMappingURL=validation.d.ts.map