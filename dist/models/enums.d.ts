/**
 * Enums for Agent0 SDK
 */
/**
 * Types of services that agents can advertise
 */
export declare enum ServiceType {
    MCP = "MCP",
    A2A = "A2A",
    ENS = "ENS",
    DID = "DID",
    WALLET = "wallet",
    OASF = "OASF"
}
/** @deprecated Use ServiceType instead */
export declare const EndpointType: typeof ServiceType;
/** @deprecated Use ServiceType instead */
export type EndpointType = ServiceType;
/**
 * Trust models supported by the SDK
 */
export declare enum TrustModel {
    REPUTATION = "reputation",
    CRYPTO_ECONOMIC = "crypto-economic",
    TEE_ATTESTATION = "tee-attestation"
}
//# sourceMappingURL=enums.d.ts.map