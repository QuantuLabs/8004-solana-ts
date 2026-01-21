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
export function matchesDiscriminator(data, expected) {
    if (data.length < 8)
        return false;
    return data.slice(0, 8).equals(expected);
}
/**
 * Identity Registry instruction discriminators
 * Hardcoded from IDL - SHA256("global:instruction_name")[0..8]
 * v0.3.0 - Added multi-collection and wallet instructions
 */
export const IDENTITY_DISCRIMINATORS = {
    initialize: Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]),
    register: Buffer.from([211, 124, 67, 15, 211, 194, 178, 240]),
    registerWithOptions: Buffer.from([177, 175, 96, 41, 59, 166, 13, 6]),
    enableAtom: Buffer.from([202, 27, 88, 88, 150, 1, 240, 97]),
    registerEmpty: Buffer.from([89, 129, 72, 185, 119, 80, 140, 126]),
    setMetadata: Buffer.from([236, 60, 23, 48, 138, 69, 196, 153]),
    deleteMetadata: Buffer.from([228, 190, 195, 255, 61, 221, 26, 152]),
    setAgentUri: Buffer.from([43, 254, 168, 104, 192, 51, 39, 46]),
    syncOwner: Buffer.from([46, 5, 232, 198, 59, 158, 160, 119]),
    transferAgent: Buffer.from([137, 80, 56, 147, 107, 99, 39, 192]),
    ownerOf: Buffer.from([165, 85, 46, 249, 100, 61, 249, 112]),
    // v0.3.0 - Multi-collection instructions
    createBaseRegistry: Buffer.from([150, 191, 7, 52, 251, 227, 60, 23]),
    rotateBaseRegistry: Buffer.from([106, 216, 250, 57, 65, 122, 221, 109]),
    createUserRegistry: Buffer.from([244, 141, 67, 250, 234, 104, 58, 135]),
    updateUserRegistryMetadata: Buffer.from([121, 57, 38, 142, 118, 18, 204, 28]),
    setAgentWallet: Buffer.from([154, 87, 251, 23, 51, 12, 4, 150]),
};
/**
 * Reputation Registry instruction discriminators
 * Hardcoded from IDL - SHA256("global:instruction_name")[0..8]
 */
export const REPUTATION_DISCRIMINATORS = {
    giveFeedback: Buffer.from([145, 136, 123, 3, 215, 165, 98, 41]),
    revokeFeedback: Buffer.from([211, 37, 230, 82, 118, 216, 137, 206]),
    appendResponse: Buffer.from([162, 210, 186, 50, 180, 4, 47, 104]),
    setFeedbackTags: Buffer.from([154, 15, 246, 207, 174, 114, 255, 7]),
};
/**
 * ATOM Engine instruction discriminators
 * v0.4.0 - For atom-engine program CPI and direct calls
 */
export const ATOM_ENGINE_DISCRIMINATORS = {
    initializeConfig: Buffer.from([208, 127, 21, 1, 194, 190, 196, 70]),
    updateConfig: Buffer.from([29, 158, 252, 191, 10, 83, 219, 99]),
    initializeStats: Buffer.from([144, 201, 117, 76, 127, 118, 176, 16]),
    updateStats: Buffer.from([145, 138, 9, 150, 178, 31, 158, 244]),
    revokeStats: Buffer.from([86, 178, 106, 195, 51, 236, 38, 104]),
    getSummary: Buffer.from([159, 2, 226, 186, 90, 59, 255, 104]),
};
/**
 * Validation Registry instruction discriminators
 * Hardcoded from IDL - SHA256("global:instruction_name")[0..8]
 */
export const VALIDATION_DISCRIMINATORS = {
    initializeValidationConfig: Buffer.from([138, 209, 223, 183, 48, 227, 146, 152]),
    requestValidation: Buffer.from([72, 26, 53, 67, 228, 30, 144, 53]),
    respondToValidation: Buffer.from([64, 212, 244, 6, 65, 134, 212, 122]),
    updateValidation: Buffer.from([226, 29, 107, 7, 213, 48, 146, 149]),
    closeValidation: Buffer.from([107, 119, 249, 35, 5, 54, 9, 15]),
};
/**
 * Account discriminators for identifying account types
 * Hardcoded from IDL - SHA256("account:StructName")[0..8]
 * v0.3.0 - Added RootConfig, removed ValidationStats
 */
export const ACCOUNT_DISCRIMINATORS = {
    // Identity Registry accounts
    RootConfig: Buffer.from([42, 216, 8, 82, 19, 209, 223, 246]),
    RegistryConfig: Buffer.from([23, 118, 10, 246, 173, 231, 243, 156]),
    AgentAccount: Buffer.from([241, 119, 69, 140, 233, 9, 112, 50]),
    MetadataEntryPda: Buffer.from([48, 145, 12, 249, 176, 141, 197, 187]),
    // Reputation Registry accounts
    AgentReputationMetadata: Buffer.from([36, 5, 84, 173, 138, 224, 67, 147]),
    FeedbackAccount: Buffer.from([152, 72, 187, 86, 92, 83, 63, 83]),
    FeedbackTagsPda: Buffer.from([146, 71, 130, 126, 94, 143, 108, 190]),
    ResponseIndexAccount: Buffer.from([140, 144, 220, 22, 67, 28, 170, 200]),
    ResponseAccount: Buffer.from([136, 150, 125, 240, 7, 27, 61, 60]),
    // Validation Registry accounts
    ValidationRequest: Buffer.from([130, 174, 153, 111, 74, 241, 40, 140]),
    // ATOM Engine accounts
    AtomStats: Buffer.from([56, 69, 179, 48, 35, 229, 171, 236]),
    AtomConfig: Buffer.from([156, 210, 241, 155, 72, 182, 4, 63]),
};
//# sourceMappingURL=instruction-discriminators.js.map