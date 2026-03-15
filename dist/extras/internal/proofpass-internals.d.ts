import { PublicKey } from '@solana/web3.js';
import type { GiveFeedbackParams } from '../../models/interfaces.js';
export declare const PROOFPASS_MODE_8004: "8004";
export declare const PROOFPASS_BYTES32_LEN = 32;
export declare const DEFAULT_PROOFPASS_CONTEXT_TYPE = 0;
export declare const PROOFPASS_BLIND_COMMITMENT_DOMAIN: Buffer<ArrayBuffer>;
export type ProofPassMode = typeof PROOFPASS_MODE_8004;
export type ProofPassPublicKeyInput = PublicKey | string;
export type ProofPassBytesInput = Buffer | Uint8Array;
export type ProofPassContextRefInput = ProofPassBytesInput | string;
export interface ProofPassSessionBinding {
    reviewer: ProofPassPublicKeyInput;
    asset: ProofPassPublicKeyInput;
    contextType: number;
    contextRefHash: ProofPassBytesInput;
}
export interface NormalizedProofPassPayload {
    value: bigint;
    valueDecimals: number;
    normalizedValue: string;
    score: number | null;
    tag1: string;
    tag2: string;
    endpoint: string;
    feedbackUri: string;
    feedbackFileHash: Buffer | null;
    sealHashPreview: Buffer;
}
export interface ProofPassFeeConfig {
    openFeeLamports?: bigint | number;
    finalizeFeeLamports?: bigint | number;
}
export interface ResolvedProofPassFeeConfig {
    openFeeLamports: bigint;
    finalizeFeeLamports: bigint;
}
export interface ProofPassTtlConfig {
    currentSlot?: bigint | number;
    defaultExpirySlots?: bigint | number;
    minExpirySlots?: bigint | number;
    maxExpirySlots?: bigint | number;
}
export interface BuildProofPassIntentParams {
    asset: ProofPassPublicKeyInput;
    client: ProofPassPublicKeyInput;
    feedback: GiveFeedbackParams;
    contextType?: number;
    contextRef?: ProofPassContextRefInput;
    contextRefHash?: ProofPassBytesInput;
    blindNonce?: ProofPassBytesInput;
    nonce?: ProofPassBytesInput;
    issuedAt?: number | Date;
    expirySlot?: bigint | number;
    ttlConfig?: ProofPassTtlConfig;
    feeConfig?: ProofPassFeeConfig;
    blindCommitmentDomain?: ProofPassBytesInput | string;
}
export interface ProofPassIntent {
    mode: ProofPassMode;
    asset: string;
    client: string;
    contextType: number;
    contextRefHash: Buffer;
    feedback: NormalizedProofPassPayload;
    contentHash: Buffer;
    sealHashPreview: Buffer;
    blindNonce: Buffer;
    blindCommitment: Buffer;
    nonce: Buffer;
    issuedAt: number;
    expirySlot: bigint | null;
    feeConfig: ResolvedProofPassFeeConfig;
}
export declare function normalizeProofPassPayload(params: GiveFeedbackParams): NormalizedProofPassPayload;
export declare function createProofPassBlindNonce(): Buffer;
export declare function createProofPassNonce(): Buffer;
export declare function hashProofPassContextRef(input: ProofPassContextRefInput): Buffer;
export declare function computeProofPassBlindCommitment(contentHash: ProofPassBytesInput, blindNonce: ProofPassBytesInput, domain?: ProofPassBytesInput | string): Buffer;
export declare function computeProofPassSessionBlindCommitment(binding: ProofPassSessionBinding, contentHash: ProofPassBytesInput, blindNonce: ProofPassBytesInput, domain?: ProofPassBytesInput | string): Buffer;
export declare function resolveProofPassFeeConfig(feeConfig?: ProofPassFeeConfig): ResolvedProofPassFeeConfig;
export declare function resolveProofPassExpirySlot(ttlConfig?: ProofPassTtlConfig, expirySlot?: bigint | number): bigint | null;
export declare function buildProofPassIntent(params: BuildProofPassIntentParams): ProofPassIntent;
//# sourceMappingURL=proofpass-internals.d.ts.map