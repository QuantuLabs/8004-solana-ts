/**
 * Validation utilities
 */
/**
 * Validate Ethereum address format
 */
export declare function isValidAddress(address: string): boolean;
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
 * Normalize address to lowercase for consistent storage and comparison
 */
export declare function normalizeAddress(address: string): string;
//# sourceMappingURL=validation.d.ts.map