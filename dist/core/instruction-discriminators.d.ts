/**
 * Anchor instruction discriminators
 * These are the first 8 bytes of SHA256("global:instruction_name")
 * Generated to match the deployed 8004-solana programs
 */
/**
 * Calculate Anchor discriminator from instruction name
 * @param instructionName - The instruction name (e.g., "initialize", "give_feedback")
 * @returns 8-byte discriminator buffer
 */
export declare function anchorDiscriminator(instructionName: string): Buffer;
/**
 * Calculate Anchor account discriminator from account struct name
 * @param accountName - The account struct name (e.g., "AgentAccount", "RegistryConfig")
 * @returns 8-byte discriminator buffer
 */
export declare function anchorAccountDiscriminator(accountName: string): Buffer;
/**
 * Check if account data matches expected discriminator
 * @param data - Account data buffer
 * @param expected - Expected discriminator buffer
 * @returns true if first 8 bytes match
 */
export declare function matchesDiscriminator(data: Buffer, expected: Buffer): boolean;
/**
 * Identity Registry instruction discriminators
 * Program: 2dtvC4hyb7M6fKwNx1C6h4SrahYvor3xW11eH6uLNvSZ
 */
export declare const IDENTITY_DISCRIMINATORS: {
    readonly initialize: Buffer<ArrayBufferLike>;
    readonly registerEmpty: Buffer<ArrayBufferLike>;
    readonly register: Buffer<ArrayBufferLike>;
    readonly registerWithMetadata: Buffer<ArrayBufferLike>;
    readonly getMetadata: Buffer<ArrayBufferLike>;
    readonly setMetadata: Buffer<ArrayBufferLike>;
    readonly setAgentUri: Buffer<ArrayBufferLike>;
    readonly syncOwner: Buffer<ArrayBufferLike>;
    readonly ownerOf: Buffer<ArrayBufferLike>;
    readonly createMetadataExtension: Buffer<ArrayBufferLike>;
    readonly setMetadataExtended: Buffer<ArrayBufferLike>;
    readonly getMetadataExtended: Buffer<ArrayBufferLike>;
    readonly transferAgent: Buffer<ArrayBufferLike>;
};
/**
 * Reputation Registry instruction discriminators
 * Program: 9WcFLL3Fsqs96JxuewEt9iqRwULtCZEsPT717hPbsQAa
 */
export declare const REPUTATION_DISCRIMINATORS: {
    readonly initialize: Buffer<ArrayBufferLike>;
    readonly giveFeedback: Buffer<ArrayBufferLike>;
    readonly revokeFeedback: Buffer<ArrayBufferLike>;
    readonly appendResponse: Buffer<ArrayBufferLike>;
};
/**
 * Validation Registry instruction discriminators
 * Program: CXvuHNGWTHNqXmWr95wSpNGKR3kpcJUhzKofTF3zsoxW
 */
export declare const VALIDATION_DISCRIMINATORS: {
    readonly initialize: Buffer<ArrayBufferLike>;
    readonly requestValidation: Buffer<ArrayBufferLike>;
    readonly respondToValidation: Buffer<ArrayBufferLike>;
    readonly updateValidation: Buffer<ArrayBufferLike>;
    readonly closeValidation: Buffer<ArrayBufferLike>;
};
/**
 * Account discriminators for identifying account types
 * Each Anchor account has a unique 8-byte discriminator: SHA256("account:StructName")[0..8]
 */
export declare const ACCOUNT_DISCRIMINATORS: {
    readonly RegistryConfig: Buffer<ArrayBufferLike>;
    readonly AgentAccount: Buffer<ArrayBufferLike>;
    readonly MetadataExtension: Buffer<ArrayBufferLike>;
    readonly AgentReputationMetadata: Buffer<ArrayBufferLike>;
    readonly FeedbackAccount: Buffer<ArrayBufferLike>;
    readonly ClientIndexAccount: Buffer<ArrayBufferLike>;
    readonly ResponseIndexAccount: Buffer<ArrayBufferLike>;
    readonly ResponseAccount: Buffer<ArrayBufferLike>;
    readonly ValidationConfig: Buffer<ArrayBufferLike>;
    readonly ValidationRequest: Buffer<ArrayBufferLike>;
};
//# sourceMappingURL=instruction-discriminators.d.ts.map