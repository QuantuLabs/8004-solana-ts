import { PublicKey, SystemProgram, TransactionInstruction, } from '@solana/web3.js';
import { MAINNET_AGENT_REGISTRY_PROGRAM_ID, MAINNET_ATOM_ENGINE_PROGRAM_ID, } from '../core/programs.js';
import { PDAHelpers } from '../core/pda-helpers.js';
import { getAtomConfigPDAWithProgram, getAtomStatsPDAWithProgram, } from '../core/atom-pda.js';
import { serializeString, writeBigUInt64LE } from '../utils/buffer-utils.js';
import { PROOFPASS_BLIND_COMMITMENT_DOMAIN, PROOFPASS_BYTES32_LEN, PROOFPASS_MODE_8004, computeProofPassBlindCommitment, computeProofPassSessionBlindCommitment as computeProofPassSessionBlindCommitmentInternal, createProofPassBlindNonce, createProofPassNonce, hashProofPassContextRef, normalizeProofPassPayload, resolveProofPassExpirySlot as resolveProofPassExpirySlotInternal, } from './internal/proofpass-internals.js';
export { PROOFPASS_BLIND_COMMITMENT_DOMAIN, PROOFPASS_BYTES32_LEN, PROOFPASS_MODE_8004, computeProofPassBlindCommitment, createProofPassBlindNonce, createProofPassNonce, hashProofPassContextRef, normalizeProofPassPayload, resolveProofPassExpirySlotInternal as resolveProofPassExpirySlot, };
export const PROOFPASS_PROGRAM_ID = new PublicKey('9Znyj5x92Pr5LhUmGTLk2uKEhyoZyTzW85mim9cZam4h');
export const PROOFPASS_CONFIG_SEED = 'proofpass_config';
export const PROOFPASS_SESSION_SEED = 'proofpass_session';
export const DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS = 25000n;
export const DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS = 25000n;
export const DEFAULT_PROOFPASS_TTL_SLOTS = 512n;
const PROOFPASS_UPGRADEABLE_LOADER_PROGRAM_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const PROOFPASS_IX_INITIALIZE_CONFIG = 0;
const PROOFPASS_IX_OPEN_SESSION = 1;
const PROOFPASS_IX_ACCEPT_SESSION = 2;
const PROOFPASS_IX_CANCEL_BEFORE_ACCEPT = 3;
const PROOFPASS_IX_CANCEL_EXPIRED = 4;
const PROOFPASS_IX_FINALIZE_AND_GIVE_FEEDBACK = 5;
const PROOFPASS_IX_UPDATE_TREASURY = 6;
const I128_MIN = -(1n << 127n);
const I128_MAX = (1n << 127n) - 1n;
export function resolveProofPassFeeConfig(feeConfig) {
    return {
        openFeeLamports: toNonNegativeBigInt(feeConfig?.openFeeLamports ?? DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS, 'openFeeLamports'),
        finalizeFeeLamports: toNonNegativeBigInt(feeConfig?.finalizeFeeLamports ?? DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS, 'finalizeFeeLamports'),
    };
}
export function resolveProofPassIntentTiming(params = {}) {
    const currentSlot = params.currentSlot === undefined
        ? null
        : toNonNegativeBigInt(params.currentSlot, 'currentSlot');
    const explicitExpirySlot = params.expirySlot === undefined
        ? null
        : toNonNegativeBigInt(params.expirySlot, 'expirySlot');
    const explicitTtlSlots = params.ttlSlots === undefined
        ? null
        : toPositiveBigInt(params.ttlSlots, 'ttlSlots');
    if (explicitExpirySlot !== null && explicitTtlSlots !== null) {
        throw new Error('Provide either expirySlot or ttlSlots, not both');
    }
    if (explicitExpirySlot !== null) {
        if (currentSlot === null) {
            return {
                ttlSlots: null,
                expirySlot: explicitExpirySlot,
            };
        }
        if (explicitExpirySlot <= currentSlot) {
            throw new Error('expirySlot must be greater than currentSlot');
        }
        return {
            ttlSlots: explicitExpirySlot - currentSlot,
            expirySlot: explicitExpirySlot,
        };
    }
    if (explicitTtlSlots !== null) {
        return {
            ttlSlots: explicitTtlSlots,
            expirySlot: currentSlot === null ? null : currentSlot + explicitTtlSlots,
        };
    }
    if (currentSlot === null) {
        return {
            ttlSlots: null,
            expirySlot: null,
        };
    }
    return {
        ttlSlots: DEFAULT_PROOFPASS_TTL_SLOTS,
        expirySlot: currentSlot + DEFAULT_PROOFPASS_TTL_SLOTS,
    };
}
export function getProofPassSessionBinding(intent) {
    return {
        client: intent.client,
        asset: intent.asset,
        contextType: intent.contextType,
        contextRefHash: Buffer.from(intent.contextRefHash),
    };
}
export function computeProofPassSessionBlindCommitment(binding, contentHash, blindNonce, domain = PROOFPASS_BLIND_COMMITMENT_DOMAIN) {
    return computeProofPassSessionBlindCommitmentInternal({
        reviewer: binding.client,
        asset: binding.asset,
        contextType: binding.contextType,
        contextRefHash: binding.contextRefHash,
    }, contentHash, blindNonce, domain);
}
export function buildProofPassIntent(params) {
    if (params.contextRef === undefined && params.contextRefHash === undefined) {
        throw new Error('ProofPass intent requires contextRef or contextRefHash');
    }
    const feedback = normalizeProofPassPayload(params.feedback);
    const contentHash = Buffer.from(feedback.sealHashPreview);
    const contextType = normalizeContextType(params.contextType);
    const contextRefHash = resolveContextRefHash(params.contextRef, params.contextRefHash);
    const client = normalizePublicKey(params.client, 'client');
    const asset = normalizePublicKey(params.asset, 'asset');
    const blindNonce = params.advanced?.blindNonce === undefined
        ? createProofPassBlindNonce()
        : ensureFixedBytes(params.advanced.blindNonce, PROOFPASS_BYTES32_LEN, 'blindNonce');
    const nonce = params.advanced?.nonce === undefined
        ? createProofPassNonce()
        : ensureFixedBytes(params.advanced.nonce, PROOFPASS_BYTES32_LEN, 'nonce');
    const timing = resolveProofPassIntentTiming({
        currentSlot: params.currentSlot,
        ttlSlots: params.ttlSlots,
        expirySlot: params.expirySlot,
    });
    return {
        mode: PROOFPASS_MODE_8004,
        asset,
        client,
        contextType,
        contextRefHash,
        sessionBinding: {
            client,
            asset,
            contextType,
            contextRefHash: Buffer.from(contextRefHash),
        },
        feedback,
        contentHash,
        sealHashPreview: Buffer.from(feedback.sealHashPreview),
        blindNonce,
        blindCommitment: computeProofPassSessionBlindCommitment({
            client,
            asset,
            contextType,
            contextRefHash,
        }, contentHash, blindNonce, params.advanced?.blindCommitmentDomain),
        nonce,
        issuedAt: normalizeIssuedAt(params.issuedAt),
        ttlSlots: timing.ttlSlots,
        expirySlot: timing.expirySlot,
        feeConfig: resolveProofPassFeeConfig(params.feeConfig),
    };
}
export function getProofPassConfigPda(proofPassProgramId = PROOFPASS_PROGRAM_ID) {
    return PublicKey.findProgramAddressSync([Buffer.from(PROOFPASS_CONFIG_SEED)], toPublicKey(proofPassProgramId, 'proofPassProgramId'));
}
export function getProofPassSessionPda(reviewer, revieweeAsset, nonce, proofPassProgramId = PROOFPASS_PROGRAM_ID) {
    return PublicKey.findProgramAddressSync([
        Buffer.from(PROOFPASS_SESSION_SEED),
        toPublicKey(reviewer, 'reviewer').toBuffer(),
        toPublicKey(revieweeAsset, 'revieweeAsset').toBuffer(),
        ensureFixedBytes(nonce, PROOFPASS_BYTES32_LEN, 'nonce'),
    ], toPublicKey(proofPassProgramId, 'proofPassProgramId'));
}
export function getProofPassProgramDataPda(proofPassProgramId = PROOFPASS_PROGRAM_ID) {
    return PublicKey.findProgramAddressSync([toPublicKey(proofPassProgramId, 'proofPassProgramId').toBuffer()], PROOFPASS_UPGRADEABLE_LOADER_PROGRAM_ID);
}
export function buildInitializeProofPassConfigInstruction(params) {
    const programId = toPublicKey(params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID, 'proofPassProgramId');
    const authority = toPublicKey(params.authority, 'authority');
    const treasury = toPublicKey(params.treasury, 'treasury');
    const registryProgram = toPublicKey(params.registryProgramId ?? MAINNET_AGENT_REGISTRY_PROGRAM_ID, 'registryProgramId');
    const [config] = getProofPassConfigPda(programId);
    const [programData] = getProofPassProgramDataPda(programId);
    const data = Buffer.concat([
        Buffer.from([PROOFPASS_IX_INITIALIZE_CONFIG]),
        registryProgram.toBuffer(),
        u64ToBuffer(params.openFeeLamports ?? DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS, 'openFeeLamports'),
        u64ToBuffer(params.finalizeFeeLamports ?? DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS, 'finalizeFeeLamports'),
        u64ToBuffer(params.maxExpirySlots, 'maxExpirySlots'),
    ]);
    return new TransactionInstruction({
        programId,
        keys: [
            { pubkey: authority, isSigner: true, isWritable: true },
            { pubkey: config, isSigner: false, isWritable: true },
            { pubkey: treasury, isSigner: false, isWritable: false },
            { pubkey: programData, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
    });
}
export function buildProofPassOpenSessionInstruction(params) {
    const programId = toPublicKey(params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID, 'proofPassProgramId');
    const reviewer = new PublicKey(params.intent.client);
    const revieweeAsset = new PublicKey(params.intent.asset);
    const treasury = toPublicKey(params.treasury, 'treasury');
    const [config] = getProofPassConfigPda(programId);
    const [session] = getProofPassSessionPda(reviewer, revieweeAsset, params.intent.blindNonce, programId);
    const ttlSlots = resolveOpenSessionTtlSlots(params.intent, params.ttlSlots);
    const data = Buffer.concat([
        Buffer.from([PROOFPASS_IX_OPEN_SESSION]),
        Buffer.from([params.intent.contextType]),
        Buffer.from(params.intent.contextRefHash),
        Buffer.from(params.intent.blindCommitment),
        Buffer.from(params.intent.blindNonce),
        u64ToBuffer(ttlSlots, 'ttlSlots'),
    ]);
    return new TransactionInstruction({
        programId,
        keys: [
            { pubkey: reviewer, isSigner: true, isWritable: true },
            { pubkey: config, isSigner: false, isWritable: false },
            { pubkey: treasury, isSigner: false, isWritable: true },
            { pubkey: session, isSigner: false, isWritable: true },
            { pubkey: revieweeAsset, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
    });
}
export function buildProofPassAcceptSessionInstruction(params) {
    const programId = toPublicKey(params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID, 'proofPassProgramId');
    const revieweeApprover = toPublicKey(params.revieweeApprover, 'revieweeApprover');
    const revieweeAsset = new PublicKey(params.intent.asset);
    const [session] = getProofPassSessionPda(params.intent.client, params.intent.asset, params.intent.blindNonce, programId);
    return new TransactionInstruction({
        programId,
        keys: [
            { pubkey: revieweeApprover, isSigner: true, isWritable: false },
            { pubkey: session, isSigner: false, isWritable: true },
            { pubkey: revieweeAsset, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([PROOFPASS_IX_ACCEPT_SESSION]),
    });
}
export function buildProofPassCancelBeforeAcceptInstruction(params) {
    const programId = toPublicKey(params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID, 'proofPassProgramId');
    const reviewer = new PublicKey(params.intent.client);
    const [session] = getProofPassSessionPda(params.intent.client, params.intent.asset, params.intent.blindNonce, programId);
    return new TransactionInstruction({
        programId,
        keys: [
            { pubkey: reviewer, isSigner: true, isWritable: true },
            { pubkey: session, isSigner: false, isWritable: true },
        ],
        data: Buffer.from([PROOFPASS_IX_CANCEL_BEFORE_ACCEPT]),
    });
}
export function buildProofPassCancelExpiredInstruction(params) {
    const programId = toPublicKey(params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID, 'proofPassProgramId');
    const reviewer = new PublicKey(params.intent.client);
    const [session] = getProofPassSessionPda(params.intent.client, params.intent.asset, params.intent.blindNonce, programId);
    return new TransactionInstruction({
        programId,
        keys: [
            { pubkey: reviewer, isSigner: false, isWritable: true },
            { pubkey: session, isSigner: false, isWritable: true },
        ],
        data: Buffer.from([PROOFPASS_IX_CANCEL_EXPIRED]),
    });
}
export function buildProofPassFinalizeAndGiveFeedbackInstruction(params) {
    const programId = toPublicKey(params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID, 'proofPassProgramId');
    const registryProgram = toPublicKey(params.registryProgramId ?? MAINNET_AGENT_REGISTRY_PROGRAM_ID, 'registryProgramId');
    const atomEngineProgram = toPublicKey(params.atomEngineProgramId ?? MAINNET_ATOM_ENGINE_PROGRAM_ID, 'atomEngineProgramId');
    const reviewer = new PublicKey(params.intent.client);
    const asset = new PublicKey(params.intent.asset);
    const treasury = toPublicKey(params.treasury, 'treasury');
    const agentAccount = toPublicKey(params.agentAccount, 'agentAccount');
    const collection = toPublicKey(params.collection, 'collection');
    const [config] = getProofPassConfigPda(programId);
    const [session] = getProofPassSessionPda(reviewer, asset, params.intent.blindNonce, programId);
    // These are ABI-compat trailing accounts for the current 8004 giveFeedback CPI surface.
    // Callers can ignore them conceptually and rely on defaults/overrides here.
    const atomConfig = params.atomConfig === undefined
        ? getAtomConfigPDAWithProgram(atomEngineProgram)[0]
        : toPublicKey(params.atomConfig, 'atomConfig');
    const atomStats = params.atomStats === undefined
        ? getAtomStatsPDAWithProgram(asset, atomEngineProgram)[0]
        : toPublicKey(params.atomStats, 'atomStats');
    const registryAuthority = params.registryAuthority === undefined
        ? PDAHelpers.getAtomCpiAuthorityPDA(registryProgram)[0]
        : toPublicKey(params.registryAuthority, 'registryAuthority');
    const data = Buffer.concat([
        Buffer.from([PROOFPASS_IX_FINALIZE_AND_GIVE_FEEDBACK]),
        Buffer.from(params.intent.contentHash),
        Buffer.from(params.intent.blindNonce),
        serializeProofPassGiveFeedbackArgs(params.intent.feedback),
    ]);
    return new TransactionInstruction({
        programId,
        keys: [
            { pubkey: reviewer, isSigner: true, isWritable: true },
            { pubkey: config, isSigner: false, isWritable: false },
            { pubkey: treasury, isSigner: false, isWritable: true },
            { pubkey: session, isSigner: false, isWritable: true },
            { pubkey: agentAccount, isSigner: false, isWritable: true },
            { pubkey: asset, isSigner: false, isWritable: false },
            { pubkey: collection, isSigner: false, isWritable: false },
            { pubkey: registryProgram, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: atomConfig, isSigner: false, isWritable: false },
            { pubkey: atomStats, isSigner: false, isWritable: true },
            { pubkey: atomEngineProgram, isSigner: false, isWritable: false },
            { pubkey: registryAuthority, isSigner: false, isWritable: false },
        ],
        data,
    });
}
export function buildProofPassUpdateTreasuryInstruction(params) {
    const programId = toPublicKey(params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID, 'proofPassProgramId');
    const authority = toPublicKey(params.authority, 'authority');
    const newTreasury = toPublicKey(params.newTreasury, 'newTreasury');
    const [config] = getProofPassConfigPda(programId);
    return new TransactionInstruction({
        programId,
        keys: [
            { pubkey: authority, isSigner: true, isWritable: false },
            { pubkey: config, isSigner: false, isWritable: true },
            { pubkey: newTreasury, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([PROOFPASS_IX_UPDATE_TREASURY]),
    });
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
    throw new Error('contextRef or contextRefHash is required');
}
function normalizePublicKey(value, fieldName) {
    return toPublicKey(value, fieldName).toBase58();
}
function toPublicKey(value, fieldName) {
    try {
        return typeof value === 'string' ? new PublicKey(value) : value;
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
function normalizeContextType(contextType) {
    const resolved = contextType ?? 0;
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
function resolveOpenSessionTtlSlots(intent, ttlSlots) {
    if (ttlSlots !== undefined) {
        return toPositiveBigInt(ttlSlots, 'ttlSlots');
    }
    if (intent.ttlSlots === null) {
        throw new Error('ttlSlots is required to build open_session when intent has no resolved TTL');
    }
    return intent.ttlSlots;
}
function serializeProofPassGiveFeedbackArgs(payload) {
    return Buffer.concat([
        serializeI128(payload.value),
        Buffer.from([payload.valueDecimals]),
        serializeOptionU8(payload.score),
        serializeOption32Bytes(payload.feedbackFileHash),
        serializeString(payload.tag1),
        serializeString(payload.tag2),
        serializeString(payload.endpoint),
        serializeString(payload.feedbackUri),
    ]);
}
function serializeI128(value) {
    if (value < I128_MIN || value > I128_MAX) {
        throw new Error(`value ${value} exceeds i128 range`);
    }
    let encoded = value;
    if (encoded < 0n) {
        encoded = (1n << 128n) + encoded;
    }
    const out = Buffer.alloc(16);
    for (let i = 0; i < 16; i += 1) {
        out[i] = Number((encoded >> BigInt(i * 8)) & 0xffn);
    }
    return out;
}
function serializeOptionU8(value) {
    if (value === null) {
        return Buffer.from([0]);
    }
    return Buffer.from([1, value]);
}
function serializeOption32Bytes(value) {
    if (value === null) {
        return Buffer.from([0]);
    }
    const bytes = ensureFixedBytes(value, PROOFPASS_BYTES32_LEN, 'feedbackFileHash');
    return Buffer.concat([Buffer.from([1]), bytes]);
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
function toPositiveBigInt(value, fieldName) {
    const normalized = toNonNegativeBigInt(value, fieldName);
    if (normalized === 0n) {
        throw new Error(`${fieldName} must be > 0`);
    }
    return normalized;
}
function u64ToBuffer(value, fieldName) {
    const normalized = toNonNegativeBigInt(value, fieldName);
    return Buffer.from(writeBigUInt64LE(normalized));
}
//# sourceMappingURL=proofpass.js.map