/**
 * Anchor instruction and account discriminators
 * Hardcoded from IDL: target/idl/agent_registry_8004.json
 * These are the first 8 bytes of SHA256("global:instruction_name") or SHA256("account:StructName")
 */
/**
 * Check if account data matches expected discriminator
 * @param data - Account data buffer
 * @param expected - Expected discriminator buffer
 * @returns true if first 8 bytes match
 */
export declare function matchesDiscriminator(data: Buffer, expected: Buffer): boolean;
/**
 * Identity Registry instruction discriminators
 * Hardcoded from IDL - SHA256("global:instruction_name")[0..8]
 * v0.3.0 - Added multi-collection and wallet instructions
 */
export declare const IDENTITY_DISCRIMINATORS: {
    readonly initialize: Buffer<ArrayBuffer>;
    readonly register: Buffer<ArrayBuffer>;
    readonly registerWithOptions: Buffer<ArrayBuffer>;
    readonly enableAtom: Buffer<ArrayBuffer>;
    readonly registerEmpty: Buffer<ArrayBuffer>;
    readonly setMetadata: Buffer<ArrayBuffer>;
    readonly deleteMetadata: Buffer<ArrayBuffer>;
    readonly setAgentUri: Buffer<ArrayBuffer>;
    readonly syncOwner: Buffer<ArrayBuffer>;
    readonly transferAgent: Buffer<ArrayBuffer>;
    readonly ownerOf: Buffer<ArrayBuffer>;
    readonly createBaseRegistry: Buffer<ArrayBuffer>;
    readonly rotateBaseRegistry: Buffer<ArrayBuffer>;
    readonly createUserRegistry: Buffer<ArrayBuffer>;
    readonly updateUserRegistryMetadata: Buffer<ArrayBuffer>;
    readonly setAgentWallet: Buffer<ArrayBuffer>;
};
/**
 * Reputation Registry instruction discriminators
 * Hardcoded from IDL - SHA256("global:instruction_name")[0..8]
 */
export declare const REPUTATION_DISCRIMINATORS: {
    readonly giveFeedback: Buffer<ArrayBuffer>;
    readonly revokeFeedback: Buffer<ArrayBuffer>;
    readonly appendResponse: Buffer<ArrayBuffer>;
    readonly setFeedbackTags: Buffer<ArrayBuffer>;
};
/**
 * ATOM Engine instruction discriminators
 * v0.4.0 - For atom-engine program CPI and direct calls
 */
export declare const ATOM_ENGINE_DISCRIMINATORS: {
    readonly initializeConfig: Buffer<ArrayBuffer>;
    readonly updateConfig: Buffer<ArrayBuffer>;
    readonly initializeStats: Buffer<ArrayBuffer>;
    readonly updateStats: Buffer<ArrayBuffer>;
    readonly revokeStats: Buffer<ArrayBuffer>;
    readonly getSummary: Buffer<ArrayBuffer>;
};
/**
 * Validation Registry instruction discriminators
 * Hardcoded from IDL - SHA256("global:instruction_name")[0..8]
 */
export declare const VALIDATION_DISCRIMINATORS: {
    readonly initializeValidationConfig: Buffer<ArrayBuffer>;
    readonly requestValidation: Buffer<ArrayBuffer>;
    readonly respondToValidation: Buffer<ArrayBuffer>;
    readonly updateValidation: Buffer<ArrayBuffer>;
    readonly closeValidation: Buffer<ArrayBuffer>;
};
/**
 * Account discriminators for identifying account types
 * Hardcoded from IDL - SHA256("account:StructName")[0..8]
 * v0.3.0 - Added RootConfig, removed ValidationStats
 */
export declare const ACCOUNT_DISCRIMINATORS: {
    readonly RootConfig: Buffer<ArrayBuffer>;
    readonly RegistryConfig: Buffer<ArrayBuffer>;
    readonly AgentAccount: Buffer<ArrayBuffer>;
    readonly MetadataEntryPda: Buffer<ArrayBuffer>;
    readonly AgentReputationMetadata: Buffer<ArrayBuffer>;
    readonly FeedbackAccount: Buffer<ArrayBuffer>;
    readonly FeedbackTagsPda: Buffer<ArrayBuffer>;
    readonly ResponseIndexAccount: Buffer<ArrayBuffer>;
    readonly ResponseAccount: Buffer<ArrayBuffer>;
    readonly ValidationRequest: Buffer<ArrayBuffer>;
    readonly AtomStats: Buffer<ArrayBuffer>;
    readonly AtomConfig: Buffer<ArrayBuffer>;
};
//# sourceMappingURL=instruction-discriminators.d.ts.map