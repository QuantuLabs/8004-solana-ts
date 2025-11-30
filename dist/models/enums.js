/**
 * Enums for Agent0 SDK
 */
/**
 * Types of endpoints that agents can advertise
 */
export var EndpointType;
(function (EndpointType) {
    EndpointType["MCP"] = "MCP";
    EndpointType["A2A"] = "A2A";
    EndpointType["ENS"] = "ENS";
    EndpointType["DID"] = "DID";
    EndpointType["WALLET"] = "wallet";
    EndpointType["OASF"] = "OASF";
})(EndpointType || (EndpointType = {}));
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