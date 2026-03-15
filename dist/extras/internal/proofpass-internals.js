import { PublicKey } from '@solana/web3.js';
import { getRandomBytes, keccak256 } from '../../utils/crypto-utils.js';
import { validateByteLength } from '../../utils/validation.js';
import { encodeReputationValue } from '../../utils/value-encoding.js';
import { resolveScore } from '../../core/feedback-normalizer.js';
import { computeSealHash, MAX_ENDPOINT_LEN, MAX_TAG_LEN, MAX_URI_LEN, } from '../../core/seal.js';
export const PROOFPASS_MODE_8004 = '8004';
export const PROOFPASS_BYTES32_LEN = 32;
export const DEFAULT_PROOFPASS_CONTEXT_TYPE = 0;
export const PROOFPASS_BLIND_COMMITMENT_DOMAIN = Buffer.from('8004_PPASS_V1___', 'ascii');
const ZERO_BYTES32 = Buffer.alloc(PROOFPASS_BYTES32_LEN, 0);
export function normalizeProofPassPayload(params) {
    const encoded = encodeReputationValue(params.value, params.valueDecimals);
    const value = encoded.value;
    const valueDecimals = encoded.valueDecimals;
    if (params.score !== undefined &&
        (!Number.isInteger(params.score) || params.score < 0 || params.score > 100)) {
        throw new Error('score must be integer 0-100');
    }
    const score = resolveScore({
        tag1: params.tag1,
        value,
        valueDecimals,
        score: params.score,
    });
    const tag1 = params.tag1 ?? '';
    const tag2 = params.tag2 ?? '';
    const endpoint = params.endpoint ?? '';
    const feedbackUri = params.feedbackUri ?? '';
    validateByteLength(tag1, MAX_TAG_LEN, 'tag1');
    validateByteLength(tag2, MAX_TAG_LEN, 'tag2');
    validateByteLength(endpoint, MAX_ENDPOINT_LEN, 'endpoint');
    validateByteLength(feedbackUri, MAX_URI_LEN, 'feedbackUri');
    const feedbackFileHash = params.feedbackFileHash === undefined ? null : ensureFixedBytes(params.feedbackFileHash, PROOFPASS_BYTES32_LEN, 'feedbackFileHash');
    const sealHashPreview = computeSealHash({
        value,
        valueDecimals,
        score,
        tag1,
        tag2,
        endpoint,
        feedbackUri,
        feedbackFileHash,
    });
    return {
        value,
        valueDecimals,
        normalizedValue: encoded.normalized,
        score,
        tag1,
        tag2,
        endpoint,
        feedbackUri,
        feedbackFileHash,
        sealHashPreview,
    };
}
export function createProofPassBlindNonce() {
    return Buffer.from(getRandomBytes(PROOFPASS_BYTES32_LEN));
}
export function createProofPassNonce() {
    return Buffer.from(getRandomBytes(PROOFPASS_BYTES32_LEN));
}
export function hashProofPassContextRef(input) {
    if (typeof input === 'string') {
        return keccak256(Buffer.from(input, 'utf8'));
    }
    return keccak256(Buffer.from(input));
}
export function computeProofPassBlindCommitment(contentHash, blindNonce, domain = PROOFPASS_BLIND_COMMITMENT_DOMAIN) {
    const contentHashBytes = ensureFixedBytes(contentHash, PROOFPASS_BYTES32_LEN, 'contentHash');
    const blindNonceBytes = ensureFixedBytes(blindNonce, PROOFPASS_BYTES32_LEN, 'blindNonce');
    const domainBytes = normalizeBlindCommitmentDomain(domain);
    return keccak256(Buffer.concat([domainBytes, contentHashBytes, blindNonceBytes]));
}
export function computeProofPassSessionBlindCommitment(binding, contentHash, blindNonce, domain = PROOFPASS_BLIND_COMMITMENT_DOMAIN) {
    const contentHashBytes = ensureFixedBytes(contentHash, PROOFPASS_BYTES32_LEN, 'contentHash');
    const blindNonceBytes = ensureFixedBytes(blindNonce, PROOFPASS_BYTES32_LEN, 'blindNonce');
    const contextRefHashBytes = ensureFixedBytes(binding.contextRefHash, PROOFPASS_BYTES32_LEN, 'contextRefHash');
    const reviewer = Buffer.from(new PublicKey(normalizePublicKey(binding.reviewer, 'reviewer')).toBytes());
    const asset = Buffer.from(new PublicKey(normalizePublicKey(binding.asset, 'asset')).toBytes());
    const contextType = normalizeContextType(binding.contextType);
    const domainBytes = normalizeBlindCommitmentDomain(domain);
    return keccak256(Buffer.concat([
        domainBytes,
        reviewer,
        asset,
        Buffer.from([contextType]),
        contextRefHashBytes,
        contentHashBytes,
        blindNonceBytes,
    ]));
}
export function resolveProofPassFeeConfig(feeConfig) {
    return {
        openFeeLamports: toNonNegativeBigInt(feeConfig?.openFeeLamports ?? 0, 'openFeeLamports'),
        finalizeFeeLamports: toNonNegativeBigInt(feeConfig?.finalizeFeeLamports ?? 0, 'finalizeFeeLamports'),
    };
}
export function resolveProofPassExpirySlot(ttlConfig, expirySlot) {
    const currentSlot = ttlConfig?.currentSlot === undefined
        ? undefined
        : toNonNegativeBigInt(ttlConfig.currentSlot, 'currentSlot');
    const minExpirySlots = ttlConfig?.minExpirySlots === undefined
        ? undefined
        : toNonNegativeBigInt(ttlConfig.minExpirySlots, 'minExpirySlots');
    const maxExpirySlots = ttlConfig?.maxExpirySlots === undefined
        ? undefined
        : toNonNegativeBigInt(ttlConfig.maxExpirySlots, 'maxExpirySlots');
    if (minExpirySlots !== undefined &&
        maxExpirySlots !== undefined &&
        minExpirySlots > maxExpirySlots) {
        throw new Error('minExpirySlots must be <= maxExpirySlots');
    }
    if (expirySlot !== undefined) {
        const resolvedExpirySlot = toNonNegativeBigInt(expirySlot, 'expirySlot');
        validateResolvedExpiryWindow(resolvedExpirySlot, currentSlot, minExpirySlots, maxExpirySlots);
        return resolvedExpirySlot;
    }
    if (ttlConfig === undefined) {
        return null;
    }
    if (currentSlot === undefined) {
        throw new Error('ttlConfig.currentSlot is required when deriving expirySlot');
    }
    const defaultExpirySlots = ttlConfig.defaultExpirySlots === undefined
        ? 0n
        : toNonNegativeBigInt(ttlConfig.defaultExpirySlots, 'defaultExpirySlots');
    if (minExpirySlots !== undefined && defaultExpirySlots < minExpirySlots) {
        throw new Error('defaultExpirySlots must be >= minExpirySlots');
    }
    if (maxExpirySlots !== undefined && defaultExpirySlots > maxExpirySlots) {
        throw new Error('defaultExpirySlots must be <= maxExpirySlots');
    }
    return currentSlot + defaultExpirySlots;
}
export function buildProofPassIntent(params) {
    const feedback = normalizeProofPassPayload(params.feedback);
    const sealHashPreview = Buffer.from(feedback.sealHashPreview);
    const contentHash = Buffer.from(sealHashPreview);
    const blindNonce = params.blindNonce === undefined
        ? createProofPassBlindNonce()
        : ensureFixedBytes(params.blindNonce, PROOFPASS_BYTES32_LEN, 'blindNonce');
    const nonce = params.nonce === undefined
        ? createProofPassNonce()
        : ensureFixedBytes(params.nonce, PROOFPASS_BYTES32_LEN, 'nonce');
    const contextType = normalizeContextType(params.contextType);
    const contextRefHash = resolveContextRefHash(params.contextRef, params.contextRefHash);
    return {
        mode: PROOFPASS_MODE_8004,
        asset: normalizePublicKey(params.asset, 'asset'),
        client: normalizePublicKey(params.client, 'client'),
        contextType,
        contextRefHash,
        feedback,
        contentHash,
        sealHashPreview,
        blindNonce,
        blindCommitment: computeProofPassSessionBlindCommitment({
            reviewer: params.client,
            asset: params.asset,
            contextType,
            contextRefHash,
        }, contentHash, blindNonce, params.blindCommitmentDomain),
        nonce,
        issuedAt: normalizeIssuedAt(params.issuedAt),
        expirySlot: resolveProofPassExpirySlot(params.ttlConfig, params.expirySlot),
        feeConfig: resolveProofPassFeeConfig(params.feeConfig),
    };
}
function normalizePublicKey(value, fieldName) {
    try {
        return (typeof value === 'string' ? new PublicKey(value) : value).toBase58();
    }
    catch {
        throw new Error(`${fieldName} must be a valid Solana public key`);
    }
}
function ensureFixedBytes(value, expectedLength, fieldName) {
    const bytes = Buffer.from(value);
    if (bytes.length !== expectedLength) {
        throw new Error(`${fieldName} must be ${expectedLength} bytes (got ${bytes.length})`);
    }
    return bytes;
}
function normalizeBlindCommitmentDomain(domain) {
    const bytes = typeof domain === 'string'
        ? Buffer.from(domain, 'utf8')
        : Buffer.from(domain);
    if (bytes.length === 0) {
        throw new Error('blindCommitmentDomain must not be empty');
    }
    return bytes;
}
function resolveContextRefHash(contextRef, contextRefHash) {
    if (contextRef !== undefined && contextRefHash !== undefined) {
        throw new Error('Provide either contextRef or contextRefHash, not both');
    }
    if (contextRefHash !== undefined) {
        return ensureFixedBytes(contextRefHash, PROOFPASS_BYTES32_LEN, 'contextRefHash');
    }
    if (contextRef !== undefined) {
        return hashProofPassContextRef(contextRef);
    }
    return Buffer.from(ZERO_BYTES32);
}
function normalizeContextType(contextType) {
    const resolved = contextType ?? DEFAULT_PROOFPASS_CONTEXT_TYPE;
    if (!Number.isInteger(resolved) || resolved < 0 || resolved > 255) {
        throw new Error(`contextType must be a u8 integer (0-255), got ${resolved}`);
    }
    return resolved;
}
function normalizeIssuedAt(issuedAt) {
    if (issuedAt === undefined) {
        return Date.now();
    }
    if (issuedAt instanceof Date) {
        const value = issuedAt.getTime();
        if (!Number.isFinite(value)) {
            throw new Error('issuedAt must be a valid timestamp');
        }
        return value;
    }
    if (!Number.isFinite(issuedAt)) {
        throw new Error('issuedAt must be a finite timestamp');
    }
    return issuedAt;
}
function toNonNegativeBigInt(value, fieldName) {
    if (typeof value === 'bigint') {
        if (value < 0n) {
            throw new Error(`${fieldName} must be >= 0`);
        }
        return value;
    }
    if (!Number.isInteger(value) || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${fieldName} must be a non-negative safe integer or bigint`);
    }
    return BigInt(value);
}
function validateResolvedExpiryWindow(expirySlot, currentSlot, minExpirySlots, maxExpirySlots) {
    if (currentSlot === undefined) {
        return;
    }
    if (expirySlot < currentSlot) {
        throw new Error('expirySlot must be >= currentSlot');
    }
    const ttlWindow = expirySlot - currentSlot;
    if (minExpirySlots !== undefined && ttlWindow < minExpirySlots) {
        throw new Error('expirySlot window must be >= minExpirySlots');
    }
    if (maxExpirySlots !== undefined && ttlWindow > maxExpirySlots) {
        throw new Error('expirySlot window must be <= maxExpirySlots');
    }
}
//# sourceMappingURL=proofpass-internals.js.map