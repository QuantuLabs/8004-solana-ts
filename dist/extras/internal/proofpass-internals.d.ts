import { PublicKey } from '@solana/web3.js';
import type { GiveFeedbackParams } from '../../models/interfaces.js';
export declare const PROOFPASS_BYTES32_LEN = 32;
export type ProofPassPublicKeyInput = PublicKey | string;
export type ProofPassBytesInput = Buffer | Uint8Array;
export type ProofPassContextRefInput = ProofPassBytesInput | string;
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
export declare function normalizeProofPassPayload(params: GiveFeedbackParams): NormalizedProofPassPayload;
export declare function hashProofPassContextRef(input: ProofPassContextRefInput): Buffer;
//# sourceMappingURL=proofpass-internals.d.ts.map