/**
 * Enums for Agent0 SDK
 */
/**
 * Types of services that agents can advertise
 */
export var ServiceType;
(function (ServiceType) {
    ServiceType["MCP"] = "MCP";
    ServiceType["A2A"] = "A2A";
    ServiceType["ENS"] = "ENS";
    ServiceType["DID"] = "DID";
    ServiceType["WALLET"] = "wallet";
    ServiceType["OASF"] = "OASF";
})(ServiceType || (ServiceType = {}));
/** @deprecated Use ServiceType instead */
export const EndpointType = ServiceType;
/**
 * Trust models supported by the SDK
 */
export var TrustModel;
(function (TrustModel) {
    TrustModel["REPUTATION"] = "reputation";
    TrustModel["CRYPTO_ECONOMIC"] = "crypto-economic";
    TrustModel["TEE_ATTESTATION"] = "tee-attestation";
})(TrustModel || (TrustModel = {}));
//# sourceMappingURL=enums.js.map