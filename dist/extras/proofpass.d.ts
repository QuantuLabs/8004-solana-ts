import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import type { IndexerReadClient } from '../core/indexer-client.js';
import { type ProofPassBytesInput, type ProofPassContextRefInput, type ProofPassPublicKeyInput } from './internal/proofpass-internals.js';
import type { GiveFeedbackParams } from '../models/interfaces.js';
export declare const PROOFPASS_PROGRAM_ID: PublicKey;
export declare const PROOFPASS_CONFIG_SEED = "proofpass_config";
export declare const PROOFPASS_SESSION_SEED = "proofpass_session";
export declare const DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS = 0n;
export declare const DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS = 10000n;
export declare const DEFAULT_PROOFPASS_TTL_SLOTS = 512n;
export type ProofPassLiveStatus = 'open';
export type ProofPassFeeMode = 'creator_pays_all' | 'reviewer_pays_finalize';
export type ProofPassTargetAgentInput = ProofPassPublicKeyInput | string | number | bigint;
export interface InitializeProofPassConfigParams {
    authority: ProofPassPublicKeyInput;
    treasury: ProofPassPublicKeyInput;
    maxExpirySlots: bigint | number;
    openFeeLamports?: bigint | number;
    finalizeFeeLamports?: bigint | number;
    registryProgramId: ProofPassPublicKeyInput;
    proofPassProgramId?: ProofPassPublicKeyInput;
}
export interface BuildProofPassOpenSessionInstructionParams {
    creator: ProofPassPublicKeyInput;
    reviewer: ProofPassPublicKeyInput;
    targetAgent: ProofPassPublicKeyInput;
    treasury: ProofPassPublicKeyInput;
    contextType?: number;
    contextRef?: ProofPassContextRefInput;
    contextRefHash?: ProofPassBytesInput;
    ttlSlots?: bigint | number;
    feeMode?: ProofPassFeeMode;
    endpoint?: string;
    nonce?: ProofPassBytesInput;
    feedbackUri?: string;
    feedbackFileHashHint?: ProofPassBytesInput | null;
    proofPassProgramId?: ProofPassPublicKeyInput;
}
export interface OpenProofPassParams {
    connection: Pick<Connection, 'getAccountInfo'>;
    creator: ProofPassPublicKeyInput;
    reviewer: ProofPassPublicKeyInput;
    targetAgent: ProofPassTargetAgentInput;
    contextType?: number;
    contextRef?: ProofPassContextRefInput;
    contextRefHash?: ProofPassBytesInput;
    ttlSlots?: bigint | number;
    feeMode?: ProofPassFeeMode;
    endpoint?: string;
    feedbackUri?: string;
    feedbackFileHash?: ProofPassBytesInput | null;
    indexerClient?: Pick<IndexerReadClient, 'getAgentByAgentId'>;
    indexerGraphqlUrl?: string | string[];
}
export interface ProofPassRequest {
    creator: string;
    reviewer: string;
    targetAsset: string;
    contextType: number;
    contextRefHash: Buffer;
    endpoint: string;
    feedbackUri: string;
    feedbackFileHash: Buffer | null;
    nonce: Buffer;
    ttlSlots: bigint;
    feeMode: ProofPassFeeMode;
}
export interface ProofPassFlow extends ProofPassRequest {
    targetAgent: string;
    configPda: PublicKey;
    sessionPda: PublicKey;
    sessionAddress: string;
    treasury: PublicKey;
    openInstruction: TransactionInstruction;
}
export interface BuildProofPassFinalizeAndGiveFeedbackInstructionParams {
    session: ProofPassPublicKeyInput;
    creator: ProofPassPublicKeyInput;
    reviewer: ProofPassPublicKeyInput;
    asset: ProofPassPublicKeyInput;
    treasury: ProofPassPublicKeyInput;
    agentAccount: ProofPassPublicKeyInput;
    collection: ProofPassPublicKeyInput;
    feedback: GiveFeedbackParams;
    proofPassProgramId?: ProofPassPublicKeyInput;
    registryProgramId?: ProofPassPublicKeyInput;
    atomEngineProgramId?: ProofPassPublicKeyInput;
    atomConfig?: ProofPassPublicKeyInput;
    atomStats?: ProofPassPublicKeyInput;
    registryAuthority?: ProofPassPublicKeyInput;
}
export interface GiveFeedbackWithProofParams {
    connection: Pick<Connection, 'getAccountInfo'> & Partial<Pick<Connection, 'getSlot'>>;
    session: ProofPassPublicKeyInput;
    reviewer: ProofPassPublicKeyInput;
    feedback: GiveFeedbackParams;
    atomEngineProgramId?: ProofPassPublicKeyInput;
    currentSlot?: bigint | number;
}
export interface BuildProofPassCloseInstructionParams {
    creator: ProofPassPublicKeyInput;
    session: ProofPassPublicKeyInput;
    proofPassProgramId?: ProofPassPublicKeyInput;
}
export interface GetLiveProofPassParams {
    connection: Pick<Connection, 'getAccountInfo'>;
    session: ProofPassPublicKeyInput;
}
export interface GetLiveProofPassesByCreatorParams {
    connection: Pick<Connection, 'getProgramAccounts'>;
    creator: ProofPassPublicKeyInput;
}
export interface CloseProofPassParams {
    connection: Pick<Connection, 'getAccountInfo'> & Partial<Pick<Connection, 'getSlot'>>;
    session: ProofPassPublicKeyInput;
    currentSlot?: bigint | number;
}
export interface CloseProofPassResult {
    request: ProofPassLive;
    closeMode: 'open' | 'expired';
    instruction: TransactionInstruction;
}
export interface ProofPassLive {
    session: PublicKey;
    sessionAddress: string;
    creator: string;
    reviewer: string;
    targetAsset: string;
    targetAgent: string;
    version: number;
    status: ProofPassLiveStatus;
    statusCode: number;
    contextType: number;
    openedSlot: bigint;
    answeredSlot: bigint | null;
    feeMode: ProofPassFeeMode;
    lockedFinalizeFeeLamports: bigint;
    expirySlot: bigint;
    contextRefHash: Buffer;
    feedbackFileHashHint: Buffer | null;
    feedbackUriHint: string;
    endpointHint: string;
    nonce: Buffer;
}
export interface BuildProofPassUpdateTreasuryInstructionParams {
    authority: ProofPassPublicKeyInput;
    newTreasury?: ProofPassPublicKeyInput;
    newAuthority?: ProofPassPublicKeyInput;
    registryProgramId?: ProofPassPublicKeyInput;
    paused?: boolean;
    openFeeLamports?: bigint | number;
    finalizeFeeLamports?: bigint | number;
    maxExpirySlots?: bigint | number;
    proofPassProgramId?: ProofPassPublicKeyInput;
}
export declare function getProofPassConfigPda(proofPassProgramId?: ProofPassPublicKeyInput): [PublicKey, number];
export declare function getProofPassSessionPda(creator: ProofPassPublicKeyInput, reviewer: ProofPassPublicKeyInput, targetAsset: ProofPassPublicKeyInput, nonce: ProofPassBytesInput, proofPassProgramId?: ProofPassPublicKeyInput): [PublicKey, number];
export declare function getProofPassProgramDataPda(proofPassProgramId?: ProofPassPublicKeyInput): [PublicKey, number];
export declare function buildInitializeProofPassConfigInstruction(params: InitializeProofPassConfigParams): TransactionInstruction;
export declare function buildProofPassOpenSessionInstruction(params: BuildProofPassOpenSessionInstructionParams & {
    targetAsset?: ProofPassPublicKeyInput;
}): TransactionInstruction;
export declare function buildProofPassFinalizeAndGiveFeedbackInstruction(params: BuildProofPassFinalizeAndGiveFeedbackInstructionParams): TransactionInstruction;
export declare function buildProofPassCloseOpenInstruction(params: BuildProofPassCloseInstructionParams): TransactionInstruction;
export declare function buildProofPassCloseExpiredInstruction(params: BuildProofPassCloseInstructionParams): TransactionInstruction;
export declare function buildProofPassUpdateTreasuryInstruction(params: BuildProofPassUpdateTreasuryInstructionParams): TransactionInstruction;
export declare function openProofPass(params: OpenProofPassParams & {
    targetAsset?: ProofPassPublicKeyInput;
}): Promise<ProofPassFlow>;
export declare function giveFeedbackWithProof(params: GiveFeedbackWithProofParams): Promise<TransactionInstruction>;
export declare function getLiveProofPass(params: GetLiveProofPassParams): Promise<ProofPassLive | null>;
export declare function getLiveProofPassesByCreator(params: GetLiveProofPassesByCreatorParams): Promise<ProofPassLive[]>;
export declare function closeProofPass(params: CloseProofPassParams): Promise<CloseProofPassResult>;
//# sourceMappingURL=proofpass.d.ts.map