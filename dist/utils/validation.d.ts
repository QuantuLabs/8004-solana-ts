/**
 * Validation utilities - Security-hardened v0.3.0
 */
/**
 * Check if a hostname is a private/internal IP address
 * Used for SSRF protection
 */
export declare function isPrivateHost(hostname: string): boolean;
export interface URIValidationOptions {
    allowHttp?: boolean;
}
export declare function isValidAgentId(agentId: string): boolean;
export declare function isValidURI(uri: string, options?: URIValidationOptions): boolean;
export declare function validateURI(uri: string, fieldName?: string, options?: URIValidationOptions): void;
export declare function isValidScore(score: number): boolean;
export declare function validateByteLength(str: string, maxBytes: number, fieldName: string): void;
export declare function validateNonce(nonce: number): void;
//# sourceMappingURL=validation.d.ts.map