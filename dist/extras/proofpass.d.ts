import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { PROOFPASS_BLIND_COMMITMENT_DOMAIN, PROOFPASS_BYTES32_LEN, PROOFPASS_MODE_8004, computeProofPassBlindCommitment, createProofPassBlindNonce, createProofPassNonce, hashProofPassContextRef, normalizeProofPassPayload, resolveProofPassExpirySlot as resolveProofPassExpirySlotInternal, type NormalizedProofPassPayload as NormalizedProofPassPayloadInternal, type ProofPassBytesInput as ProofPassBytesInputInternal, type ProofPassContextRefInput as ProofPassContextRefInputInternal, type ProofPassFeeConfig as ProofPassFeeConfigInternal, type ProofPassPublicKeyInput as ProofPassPublicKeyInputInternal } from './internal/proofpass-internals.js';
import type { GiveFeedbackParams } from '../models/interfaces.js';
export { PROOFPASS_BLIND_COMMITMENT_DOMAIN, PROOFPASS_BYTES32_LEN, PROOFPASS_MODE_8004, computeProofPassBlindCommitment, createProofPassBlindNonce, createProofPassNonce, hashProofPassContextRef, normalizeProofPassPayload, resolveProofPassExpirySlotInternal as resolveProofPassExpirySlot, };
export declare const PROOFPASS_PROGRAM_ID: PublicKey;
export declare const PROOFPASS_CONFIG_SEED = "proofpass_config";
export declare const PROOFPASS_SESSION_SEED = "proofpass_session";
export declare const DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS = 25000n;
export declare const DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS = 25000n;
export declare const DEFAULT_PROOFPASS_TTL_SLOTS = 512n;
export type ProofPassPublicKeyInput = ProofPassPublicKeyInputInternal;
export type ProofPassBytesInput = ProofPassBytesInputInternal;
export type ProofPassContextRefInput = ProofPassContextRefInputInternal;
export type ProofPassFeeConfig = ProofPassFeeConfigInternal;
export type NormalizedProofPassPayload = NormalizedProofPassPayloadInternal;
export interface ResolvedProofPassFeeConfig {
    openFeeLamports: bigint;
    finalizeFeeLamports: bigint;
}
export interface ProofPassSessionBinding {
    client: ProofPassPublicKeyInput;
    asset: ProofPassPublicKeyInput;
    contextType: number;
    contextRefHash: ProofPassBytesInput;
}
export interface BuildProofPassIntentParams {
    asset: ProofPassPublicKeyInput;
    client: ProofPassPublicKeyInput;
    feedback: GiveFeedbackParams;
    contextType?: number;
    contextRef?: ProofPassContextRefInput;
    contextRefHash?: ProofPassBytesInput;
    currentSlot?: bigint | number;
    ttlSlots?: bigint | number;
    expirySlot?: bigint | number;
    issuedAt?: number | Date;
    feeConfig?: ProofPassFeeConfig;
    advanced?: {
        blindNonce?: ProofPassBytesInput;
        nonce?: ProofPassBytesInput;
        blindCommitmentDomain?: ProofPassBytesInput | string;
    };
}
export interface ProofPassIntentTiming {
    ttlSlots: bigint | null;
    expirySlot: bigint | null;
}
export interface ProofPassIntent {
    mode: typeof PROOFPASS_MODE_8004;
    asset: string;
    client: string;
    contextType: number;
    contextRefHash: Buffer;
    sessionBinding: {
        client: string;
        asset: string;
        contextType: number;
        contextRefHash: Buffer;
    };
    feedback: NormalizedProofPassPayload;
    contentHash: Buffer;
    sealHashPreview: Buffer;
    blindNonce: Buffer;
    blindCommitment: Buffer;
    nonce: Buffer;
    issuedAt: number;
    ttlSlots: bigint | null;
    expirySlot: bigint | null;
    feeConfig: ResolvedProofPassFeeConfig;
}
export interface InitializeProofPassConfigParams {
    authority: ProofPassPublicKeyInput;
    treasury: ProofPassPublicKeyInput;
    maxExpirySlots: bigint | number;
    openFeeLamports?: bigint | number;
    finalizeFeeLamports?: bigint | number;
    registryProgramId?: ProofPassPublicKeyInput;
    proofPassProgramId?: ProofPassPublicKeyInput;
}
export interface BuildProofPassOpenSessionInstructionParams {
    intent: ProofPassIntent;
    treasury: ProofPassPublicKeyInput;
    ttlSlots?: bigint | number;
    proofPassProgramId?: ProofPassPublicKeyInput;
}
export interface BuildProofPassAcceptSessionInstructionParams {
    intent: ProofPassIntent;
    revieweeApprover: ProofPassPublicKeyInput;
    proofPassProgramId?: ProofPassPublicKeyInput;
}
export interface BuildProofPassCancelInstructionParams {
    intent: ProofPassIntent;
    proofPassProgramId?: ProofPassPublicKeyInput;
}
export interface BuildProofPassFinalizeInstructionParams {
    intent: ProofPassIntent;
    treasury: ProofPassPublicKeyInput;
    agentAccount: ProofPassPublicKeyInput;
    collection: ProofPassPublicKeyInput;
    proofPassProgramId?: ProofPassPublicKeyInput;
    registryProgramId?: ProofPassPublicKeyInput;
    atomEngineProgramId?: ProofPassPublicKeyInput;
    atomConfig?: ProofPassPublicKeyInput;
    atomStats?: ProofPassPublicKeyInput;
    registryAuthority?: ProofPassPublicKeyInput;
}
export interface BuildProofPassUpdateTreasuryInstructionParams {
    authority: ProofPassPublicKeyInput;
    newTreasury: ProofPassPublicKeyInput;
    proofPassProgramId?: ProofPassPublicKeyInput;
}
export declare function resolveProofPassFeeConfig(feeConfig?: ProofPassFeeConfig): ResolvedProofPassFeeConfig;
export declare function resolveProofPassIntentTiming(params?: {
    currentSlot?: bigint | number;
    ttlSlots?: bigint | number;
    expirySlot?: bigint | number;
}): ProofPassIntentTiming;
export declare function getProofPassSessionBinding(intent: Pick<ProofPassIntent, 'client' | 'asset' | 'contextType' | 'contextRefHash'>): ProofPassIntent['sessionBinding'];
export declare function computeProofPassSessionBlindCommitment(binding: ProofPassSessionBinding, contentHash: ProofPassBytesInput, blindNonce: ProofPassBytesInput, domain?: ProofPassBytesInput | string): Buffer;
export declare function buildProofPassIntent(params: BuildProofPassIntentParams): ProofPassIntent;
export declare function getProofPassConfigPda(proofPassProgramId?: ProofPassPublicKeyInput): [PublicKey, number];
export declare function getProofPassSessionPda(reviewer: ProofPassPublicKeyInput, revieweeAsset: ProofPassPublicKeyInput, nonce: ProofPassBytesInput, proofPassProgramId?: ProofPassPublicKeyInput): [PublicKey, number];
export declare function getProofPassProgramDataPda(proofPassProgramId?: ProofPassPublicKeyInput): [PublicKey, number];
export declare function buildInitializeProofPassConfigInstruction(params: InitializeProofPassConfigParams): TransactionInstruction;
export declare function buildProofPassOpenSessionInstruction(params: BuildProofPassOpenSessionInstructionParams): TransactionInstruction;
export declare function buildProofPassAcceptSessionInstruction(params: BuildProofPassAcceptSessionInstructionParams): TransactionInstruction;
export declare function buildProofPassCancelBeforeAcceptInstruction(params: BuildProofPassCancelInstructionParams): TransactionInstruction;
export declare function buildProofPassCancelExpiredInstruction(params: BuildProofPassCancelInstructionParams): TransactionInstruction;
export declare function buildProofPassFinalizeAndGiveFeedbackInstruction(params: BuildProofPassFinalizeInstructionParams): TransactionInstruction;
export declare function buildProofPassUpdateTreasuryInstruction(params: BuildProofPassUpdateTreasuryInstructionParams): TransactionInstruction;
//# sourceMappingURL=proofpass.d.ts.map