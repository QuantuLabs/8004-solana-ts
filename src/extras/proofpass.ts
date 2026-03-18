import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import type { AccountInfo, Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import { getRandomBytes } from '../utils/crypto-utils.js';

import {
  DEVNET_AGENT_REGISTRY_PROGRAM_ID,
  DEVNET_ATOM_ENGINE_PROGRAM_ID,
  MAINNET_AGENT_REGISTRY_PROGRAM_ID,
  MAINNET_ATOM_ENGINE_PROGRAM_ID,
} from '../core/programs.js';
import { getBaseCollection } from '../core/config-reader.js';
import { getDefaultIndexerGraphqlUrls } from '../core/indexer-defaults.js';
import { IndexerGraphQLClient } from '../core/indexer-graphql-client.js';
import type { IndexerReadClient } from '../core/indexer-client.js';
import { PDAHelpers } from '../core/pda-helpers.js';
import {
  getAtomConfigPDAWithProgram,
  getAtomStatsPDAWithProgram,
} from '../core/atom-pda.js';
import { MAX_ENDPOINT_LEN, MAX_URI_LEN } from '../core/seal.js';
import { serializeString } from '../utils/buffer-utils.js';
import {
  PROOFPASS_BYTES32_LEN,
  hashProofPassContextRef,
  normalizeProofPassPayload,
  type NormalizedProofPassPayload,
  type ProofPassBytesInput,
  type ProofPassContextRefInput,
  type ProofPassPublicKeyInput,
} from './internal/proofpass-internals.js';
import type { GiveFeedbackParams } from '../models/interfaces.js';

export const PROOFPASS_PROGRAM_ID = new PublicKey('72WFGnAp9EjPok7JbadCEC1j83TZe3ti8k6ax25dQVzG');
export const PROOFPASS_CONFIG_SEED = 'proofpass_config';
export const PROOFPASS_SESSION_SEED = 'proofpass_session';
export const DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS = 0n;
export const DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS = 10_000n;
export const DEFAULT_PROOFPASS_TTL_SLOTS = 512n;

const PROOFPASS_UPGRADEABLE_LOADER_PROGRAM_ID = new PublicKey(
  'BPFLoaderUpgradeab1e11111111111111111111111'
);

const PROOFPASS_IX_INITIALIZE_CONFIG = 0;
const PROOFPASS_IX_OPEN_SESSION = 1;
const PROOFPASS_IX_CLOSE_OPEN = 3;
const PROOFPASS_IX_CLOSE_EXPIRED = 4;
const PROOFPASS_IX_FINALIZE_AND_GIVE_FEEDBACK = 5;
const PROOFPASS_IX_UPDATE_TREASURY = 6;

const PROOFPASS_SESSION_ACCOUNT_DISCRIMINATOR = Buffer.from('ppassess', 'ascii');
const PROOFPASS_CONFIG_ACCOUNT_DISCRIMINATOR = Buffer.from('ppasconf', 'ascii');
const PROOFPASS_CONFIG_ACCOUNT_SIZE = 136;
const PROOFPASS_SESSION_ACCOUNT_SIZE = 736;
const PROOFPASS_MAX_ENDPOINT_LEN = 250;
const PROOFPASS_MAX_FEEDBACK_URI_LEN = 250;

const PROOFPASS_STATUS_OPEN = 1;
const PROOFPASS_FEE_MODE_CREATOR_PAYS_ALL = 0;
const PROOFPASS_FEE_MODE_REVIEWER_PAYS_FINALIZE = 1;

const PROOFPASS_SESSION_OFFSETS = {
  discriminator: 0,
  version: 8,
  status: 9,
  contextType: 10,
  feedbackUriLen: 11,
  endpointLen: 12,
  hasFeedbackFileHashHint: 13,
  feeMode: 14,
  openedSlot: 16,
  lockedFinalizeFeeLamports: 24,
  expirySlot: 32,
  creator: 40,
  reviewer: 72,
  targetAsset: 104,
  contextRefHash: 136,
  feedbackFileHashHint: 168,
  nonce: 200,
  feedbackUriHint: 232,
  endpointHint: 482,
} as const;

const PROOFPASS_CONFIG_OFFSETS = {
  discriminator: 0,
  authority: 8,
  treasury: 40,
  registryProgram: 72,
  openFeeLamports: 104,
  finalizeFeeLamports: 112,
  maxExpirySlots: 120,
  paused: 128,
  bump: 129,
  version: 130,
} as const;

const I128_MIN = -(1n << 127n);
const I128_MAX = (1n << 127n) - 1n;
const ZERO_BYTES32 = Buffer.alloc(PROOFPASS_BYTES32_LEN, 0);

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
  targetAsset?: ProofPassPublicKeyInput;
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

export function getProofPassConfigPda(
  proofPassProgramId: ProofPassPublicKeyInput = PROOFPASS_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PROOFPASS_CONFIG_SEED)],
    toPublicKey(proofPassProgramId, 'proofPassProgramId')
  );
}

export function getProofPassSessionPda(
  creator: ProofPassPublicKeyInput,
  reviewer: ProofPassPublicKeyInput,
  targetAsset: ProofPassPublicKeyInput,
  nonce: ProofPassBytesInput,
  proofPassProgramId: ProofPassPublicKeyInput = PROOFPASS_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(PROOFPASS_SESSION_SEED),
      toPublicKey(creator, 'creator').toBuffer(),
      toPublicKey(reviewer, 'reviewer').toBuffer(),
      toPublicKey(targetAsset, 'targetAsset').toBuffer(),
      ensureFixedBytes(nonce, PROOFPASS_BYTES32_LEN, 'nonce'),
    ],
    toPublicKey(proofPassProgramId, 'proofPassProgramId')
  );
}

export function getProofPassProgramDataPda(
  proofPassProgramId: ProofPassPublicKeyInput = PROOFPASS_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [toPublicKey(proofPassProgramId, 'proofPassProgramId').toBuffer()],
    PROOFPASS_UPGRADEABLE_LOADER_PROGRAM_ID
  );
}

export function buildInitializeProofPassConfigInstruction(
  params: InitializeProofPassConfigParams
): TransactionInstruction {
  const programId = toPublicKey(
    params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID,
    'proofPassProgramId'
  );
  const authority = toPublicKey(params.authority, 'authority');
  const treasury = toPublicKey(params.treasury, 'treasury');
  const registryProgram = requireRegistryProgramId(params.registryProgramId);
  const [config] = getProofPassConfigPda(programId);
  const [programData] = getProofPassProgramDataPda(programId);

  const data = Buffer.concat([
    Buffer.from([PROOFPASS_IX_INITIALIZE_CONFIG]),
    registryProgram.toBuffer(),
    u64ToBuffer(
      params.openFeeLamports ?? DEFAULT_PROOFPASS_OPEN_FEE_LAMPORTS,
      'openFeeLamports'
    ),
    u64ToBuffer(
      params.finalizeFeeLamports ?? DEFAULT_PROOFPASS_FINALIZE_FEE_LAMPORTS,
      'finalizeFeeLamports'
    ),
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

export function buildProofPassOpenSessionInstruction(
  params: BuildProofPassOpenSessionInstructionParams & {
    targetAsset?: ProofPassPublicKeyInput;
  }
): TransactionInstruction {
  const request = resolveProofPassRequest(params);
  const programId = toPublicKey(
    params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID,
    'proofPassProgramId'
  );
  return createOpenInstruction(
    request,
    toPublicKey(params.treasury, 'treasury'),
    programId
  );
}

function createOpenInstruction(
  request: ProofPassRequest,
  treasury: PublicKey,
  programId: PublicKey
): TransactionInstruction {
  const creator = new PublicKey(request.creator);
  const targetAsset = new PublicKey(request.targetAsset);
  const [config] = getProofPassConfigPda(programId);
  const [session] = getProofPassSessionPda(
    request.creator,
    request.reviewer,
    request.targetAsset,
    request.nonce,
    programId
  );

  const data = Buffer.concat([
    Buffer.from([PROOFPASS_IX_OPEN_SESSION]),
    new PublicKey(request.reviewer).toBuffer(),
    Buffer.from([request.contextType]),
    Buffer.from(request.contextRefHash),
    Buffer.from([request.feedbackFileHash ? 1 : 0]),
    Buffer.from(request.feedbackFileHash ?? ZERO_BYTES32),
    Buffer.from(request.nonce),
    u64ToBuffer(request.ttlSlots, 'ttlSlots'),
    serializeString(request.feedbackUri),
    serializeString(request.endpoint),
    Buffer.from([serializeFeeMode(request.feeMode)]),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: session, isSigner: false, isWritable: true },
      { pubkey: targetAsset, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildProofPassFinalizeAndGiveFeedbackInstruction(
  params: BuildProofPassFinalizeAndGiveFeedbackInstructionParams
): TransactionInstruction {
  const programId = toPublicKey(
    params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID,
    'proofPassProgramId'
  );
  const creator = toPublicKey(params.creator, 'creator');
  const reviewer = toPublicKey(params.reviewer, 'reviewer');
  const session = toPublicKey(params.session, 'session');
  const asset = toPublicKey(params.asset, 'asset');
  const treasury = toPublicKey(params.treasury, 'treasury');
  const agentAccount = toPublicKey(params.agentAccount, 'agentAccount');
  const collection = toPublicKey(params.collection, 'collection');
  const registryProgram = requireRegistryProgramId(params.registryProgramId);
  const atomEngineProgram = resolveAtomEngineProgramId(
    registryProgram,
    params.atomEngineProgramId
  );
  const atomConfig = params.atomConfig === undefined
    ? getAtomConfigPDAWithProgram(atomEngineProgram)[0]
    : toPublicKey(params.atomConfig, 'atomConfig');
  const atomStats = params.atomStats === undefined
    ? getAtomStatsPDAWithProgram(asset, atomEngineProgram)[0]
    : toPublicKey(params.atomStats, 'atomStats');
  const registryAuthority = params.registryAuthority === undefined
    ? PDAHelpers.getAtomCpiAuthorityPDA(registryProgram)[0]
    : toPublicKey(params.registryAuthority, 'registryAuthority');
  const [config] = getProofPassConfigPda(programId);
  const feedback = normalizeProofPassPayload(params.feedback);

  const data = Buffer.concat([
    Buffer.from([PROOFPASS_IX_FINALIZE_AND_GIVE_FEEDBACK]),
    serializeProofPassGiveFeedbackArgs(feedback),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: reviewer, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: false, isWritable: true },
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

export function buildProofPassCloseOpenInstruction(
  params: BuildProofPassCloseInstructionParams
): TransactionInstruction {
  const programId = toPublicKey(
    params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID,
    'proofPassProgramId'
  );
  const creator = toPublicKey(params.creator, 'creator');
  const session = toPublicKey(params.session, 'session');

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: session, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([PROOFPASS_IX_CLOSE_OPEN]),
  });
}

export function buildProofPassCloseExpiredInstruction(
  params: BuildProofPassCloseInstructionParams
): TransactionInstruction {
  const programId = toPublicKey(
    params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID,
    'proofPassProgramId'
  );
  const creator = toPublicKey(params.creator, 'creator');
  const session = toPublicKey(params.session, 'session');

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: creator, isSigner: false, isWritable: true },
      { pubkey: session, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([PROOFPASS_IX_CLOSE_EXPIRED]),
  });
}

export function buildProofPassUpdateTreasuryInstruction(
  params: BuildProofPassUpdateTreasuryInstructionParams
): TransactionInstruction {
  const programId = toPublicKey(
    params.proofPassProgramId ?? PROOFPASS_PROGRAM_ID,
    'proofPassProgramId'
  );
  const authority = toPublicKey(params.authority, 'authority');
  const newTreasury = params.newTreasury === undefined
    ? null
    : toPublicKey(params.newTreasury, 'newTreasury');
  const newAuthority = params.newAuthority === undefined
    ? null
    : toPublicKey(params.newAuthority, 'newAuthority');
  const [config] = getProofPassConfigPda(programId);
  const updateTreasury = newTreasury !== null;
  const updateRegistryProgram = params.registryProgramId !== undefined;
  const updatePaused = params.paused !== undefined;
  const updateOpenFee = params.openFeeLamports !== undefined;
  const updateFinalizeFee = params.finalizeFeeLamports !== undefined;
  const updateAuthority = newAuthority !== null;
  const updateMaxExpiry = params.maxExpirySlots !== undefined;

  if (
    !updateTreasury
    && !updateRegistryProgram
    && !updatePaused
    && !updateOpenFee
    && !updateFinalizeFee
    && !updateAuthority
    && !updateMaxExpiry
  ) {
    throw new Error(
      'ProofPass update config requires at least one of newTreasury, newAuthority, registryProgramId, paused, openFeeLamports, finalizeFeeLamports or maxExpirySlots'
    );
  }

  const flags =
    (updateRegistryProgram ? 1 : 0)
    | (updatePaused ? 2 : 0)
    | (updateOpenFee ? 4 : 0)
    | (updateFinalizeFee ? 8 : 0)
    | (updateTreasury ? 16 : 0)
    | (updateAuthority ? 32 : 0)
    | (updateMaxExpiry ? 64 : 0);
  const registryProgram = updateRegistryProgram
    ? toPublicKey(params.registryProgramId!, 'registryProgramId').toBuffer()
    : ZERO_BYTES32;
  const chunks: Buffer[] = [Buffer.from([PROOFPASS_IX_UPDATE_TREASURY]), Buffer.from([flags])];
  if (updateRegistryProgram) {
    chunks.push(registryProgram);
  }
  if (updatePaused) {
    chunks.push(Buffer.from([params.paused ? 1 : 0]));
  }
  if (updateOpenFee) {
    chunks.push(u64ToBuffer(params.openFeeLamports!, 'openFeeLamports'));
  }
  if (updateFinalizeFee) {
    chunks.push(u64ToBuffer(params.finalizeFeeLamports!, 'finalizeFeeLamports'));
  }
  if (updateMaxExpiry) {
    chunks.push(u64ToBuffer(params.maxExpirySlots!, 'maxExpirySlots'));
  }

  const keys = [
    { pubkey: authority, isSigner: true, isWritable: false },
    { pubkey: config, isSigner: false, isWritable: true },
  ];
  if (newTreasury) {
    keys.push({ pubkey: newTreasury, isSigner: false, isWritable: false });
  }
  if (newAuthority) {
    keys.push({ pubkey: newAuthority, isSigner: false, isWritable: false });
  }

  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.concat(chunks),
  });
}

export async function openProofPass(
  params: OpenProofPassParams & {
    targetAsset?: ProofPassPublicKeyInput;
  }
): Promise<ProofPassFlow> {
  const programId = PROOFPASS_PROGRAM_ID;
  const config = await fetchProofPassConfig(params.connection, programId);
  if (config.paused) {
    throw new Error('ProofPass is currently paused');
  }
  const resolvedTargetAgent = await resolveOpenProofPassTargetAgent(
    params.targetAgent,
    params.targetAsset,
    config.registryProgram,
    params.indexerClient,
    params.indexerGraphqlUrl
  );

  const request = resolveProofPassRequest({
    creator: params.creator,
    reviewer: params.reviewer,
    targetAgent: resolvedTargetAgent,
    targetAsset: params.targetAsset,
    treasury: config.treasury,
    feeMode: params.feeMode,
    contextType: params.contextType,
    contextRef: params.contextRef,
    contextRefHash: params.contextRefHash,
    ttlSlots: params.ttlSlots,
    endpoint: params.endpoint,
    feedbackUri: params.feedbackUri,
    feedbackFileHashHint: params.feedbackFileHash,
  });
  if (request.ttlSlots > config.maxExpirySlots) {
    throw new Error(
      `ProofPass ttlSlots exceeds configured maxExpirySlots (${config.maxExpirySlots.toString()})`
    );
  }
  const [configPda] = getProofPassConfigPda(programId);
  const [sessionPda] = getProofPassSessionPda(
    request.creator,
    request.reviewer,
    request.targetAsset,
    request.nonce,
    programId
  );

  return {
    ...request,
    targetAgent: request.targetAsset,
    configPda,
    sessionPda,
    sessionAddress: sessionPda.toBase58(),
    treasury: config.treasury,
    openInstruction: createOpenInstruction(
      request,
      config.treasury,
      programId
    ),
  };
}

async function resolveOpenProofPassTargetAgent(
  targetAgent: ProofPassTargetAgentInput,
  targetAsset: ProofPassPublicKeyInput | undefined,
  registryProgram: PublicKey,
  indexerClient?: Pick<IndexerReadClient, 'getAgentByAgentId'>,
  indexerGraphqlUrl?: string | string[]
): Promise<ProofPassPublicKeyInput> {
  if (!isSequentialAgentLookup(targetAgent)) {
    return targetAgent as ProofPassPublicKeyInput;
  }

  const normalizedLookup = normalizeSequentialAgentLookupValue(targetAgent);
  let resolutionError: unknown = null;
  let client: Pick<IndexerReadClient, 'getAgentByAgentId'> | null = null;

  try {
    client = indexerClient ?? createProofPassIndexerClient(registryProgram, indexerGraphqlUrl);
  } catch (error) {
    resolutionError = error;
  }

  if (client) {
    try {
      const agent = await client.getAgentByAgentId(normalizedLookup);
      if (agent?.asset) {
        return agent.asset;
      }
    } catch (error) {
      resolutionError = error;
    }
  }

  if (targetAsset !== undefined) {
    return targetAsset;
  }

  if (typeof normalizedLookup === 'string') {
    try {
      return normalizePublicKey(normalizedLookup, 'targetAgent');
    } catch {
      // Preserve the more specific indexer failure below when available.
    }
  }

  if (resolutionError) {
    throw new Error(
      `Unable to resolve targetAgent ${String(normalizedLookup)} to an agent asset: ${
        resolutionError instanceof Error ? resolutionError.message : String(resolutionError)
      }`
    );
  }
  throw new Error(`Unable to resolve targetAgent ${String(normalizedLookup)} to an agent asset`);
}

export async function giveFeedbackWithProof(
  params: GiveFeedbackWithProofParams
): Promise<TransactionInstruction> {
  const session = await requireLiveProofPass(params.connection, params.session);
  let currentSlot: bigint | null = params.currentSlot === undefined
    ? null
    : toNonNegativeBigInt(params.currentSlot, 'currentSlot');

  if (currentSlot === null && params.connection.getSlot) {
    const slot = await params.connection.getSlot();
    if (slot !== undefined && slot !== null) {
      currentSlot = BigInt(slot);
    }
  }

  if (currentSlot === null) {
    throw new Error(
      'giveFeedbackWithProof requires currentSlot or connection.getSlot() to verify the session has not expired'
    );
  }
  if (currentSlot > session.expirySlot) {
    throw new Error(
      `ProofPass session ${session.sessionAddress} has expired and must be closed instead of finalized`
    );
  }

  const config = await fetchProofPassConfig(params.connection, PROOFPASS_PROGRAM_ID);
  if (config.paused) {
    throw new Error('ProofPass is currently paused');
  }

  const registryProgramId = config.registryProgram;
  const asset = new PublicKey(session.targetAsset);
  const [agentAccount] = PDAHelpers.getAgentPDA(asset, registryProgramId);
  const collection = await getBaseCollection(params.connection as Connection, registryProgramId);
  if (!collection) {
    throw new Error(`Unable to resolve base collection for registry ${registryProgramId.toBase58()}`);
  }

  return buildProofPassFinalizeAndGiveFeedbackInstruction({
    session: session.session,
    creator: session.creator,
    reviewer: params.reviewer,
    asset,
    treasury: config.treasury,
    agentAccount,
    collection,
    registryProgramId,
    atomEngineProgramId: params.atomEngineProgramId,
    feedback: mergeServiceFeedbackHints(session, params.feedback),
    proofPassProgramId: PROOFPASS_PROGRAM_ID,
  });
}

export async function getLiveProofPass(
  params: GetLiveProofPassParams
): Promise<ProofPassLive | null> {
  const session = toPublicKey(params.session, 'session');
  const account = await params.connection.getAccountInfo(session);
  return decodeProofPassLiveAccount(session, account);
}

export async function getLiveProofPassesByCreator(
  params: GetLiveProofPassesByCreatorParams
): Promise<ProofPassLive[]> {
  const creator = toPublicKey(params.creator, 'creator');
  const accounts = await params.connection.getProgramAccounts(PROOFPASS_PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: PROOFPASS_SESSION_OFFSETS.discriminator,
          bytes: bs58.encode(PROOFPASS_SESSION_ACCOUNT_DISCRIMINATOR),
        },
      },
      {
        memcmp: {
          offset: PROOFPASS_SESSION_OFFSETS.creator,
          bytes: creator.toBase58(),
        },
      },
      {
        dataSize: PROOFPASS_SESSION_ACCOUNT_SIZE,
      },
    ],
  });

  return accounts
    .map(({ pubkey, account }) => decodeProofPassLiveAccount(pubkey, account))
    .filter((request): request is ProofPassLive => request !== null)
    .sort((left, right) => {
      if (left.openedSlot > right.openedSlot) return -1;
      if (left.openedSlot < right.openedSlot) return 1;
      return left.sessionAddress.localeCompare(right.sessionAddress);
    });
}

export async function closeProofPass(
  params: CloseProofPassParams
): Promise<CloseProofPassResult> {
  const session = toPublicKey(params.session, 'session');
  const request = await getLiveProofPass({
    connection: params.connection,
    session,
  });

  if (!request) {
    throw new Error(`No live ProofPass request found for session ${session.toBase58()}`);
  }

  let currentSlot: bigint | null = params.currentSlot === undefined
    ? null
    : toNonNegativeBigInt(params.currentSlot, 'currentSlot');

  if (currentSlot === null && params.connection.getSlot) {
    const slot = await params.connection.getSlot();
    if (slot !== undefined && slot !== null) {
      currentSlot = BigInt(slot);
    }
  }

  if (currentSlot === null) {
    throw new Error(
      'closeProofPass requires currentSlot or connection.getSlot() to determine whether the request is expired'
    );
  }

  if (currentSlot <= request.expirySlot) {
    return {
      request,
      closeMode: 'open',
      instruction: buildProofPassCloseOpenInstruction({
        creator: request.creator,
        session,
      }),
    };
  }

  return {
    request,
    closeMode: 'expired',
    instruction: buildProofPassCloseExpiredInstruction({
      creator: request.creator,
      session,
    }),
  };
}

function resolveProofPassRequest(
  params: BuildProofPassOpenSessionInstructionParams & {
    targetAsset?: ProofPassPublicKeyInput;
  }
): ProofPassRequest {
  if (params.contextRef === undefined && params.contextRefHash === undefined) {
    throw new Error('ProofPass open requires contextRef or contextRefHash');
  }

  const creator = normalizePublicKey(params.creator, 'creator');
  const reviewer = normalizePublicKey(params.reviewer, 'reviewer');
  const targetAsset = resolveProofPassTargetAsset(params);
  const contextType = normalizeContextType(params.contextType);
  const contextRefHash = resolveContextRefHash(params.contextRef, params.contextRefHash);
  const nonce = params.nonce === undefined
    ? Buffer.from(getRandomBytes(PROOFPASS_BYTES32_LEN))
    : ensureFixedBytes(params.nonce, PROOFPASS_BYTES32_LEN, 'nonce');
  const ttlSlots = params.ttlSlots === undefined
    ? DEFAULT_PROOFPASS_TTL_SLOTS
    : toPositiveBigInt(params.ttlSlots, 'ttlSlots');
  const feeMode = normalizeFeeMode(params.feeMode);
  const feedbackFileHashHint = params.feedbackFileHashHint === undefined || params.feedbackFileHashHint === null
    ? null
    : ensureFixedBytes(
        params.feedbackFileHashHint,
        PROOFPASS_BYTES32_LEN,
        'feedbackFileHashHint'
      );
  const endpoint = normalizeEndpointHint(params.endpoint);
  const feedbackUri = normalizeFeedbackUri(params.feedbackUri);

  return {
    creator,
    reviewer,
    targetAsset,
    contextType,
    contextRefHash,
    endpoint,
    feedbackUri,
    feedbackFileHash: feedbackFileHashHint,
    nonce,
    ttlSlots,
    feeMode,
  };
}

function resolveProofPassTargetAsset(
  params: { targetAgent: ProofPassPublicKeyInput; targetAsset?: ProofPassPublicKeyInput }
): string {
  const asset = (params as { targetAsset?: ProofPassPublicKeyInput }).targetAsset === undefined
    ? null
    : normalizePublicKey((params as { targetAsset?: ProofPassPublicKeyInput }).targetAsset!, 'targetAsset');
  const agent = params.targetAgent === undefined
    ? null
    : normalizePublicKey(params.targetAgent, 'targetAgent');

  if (!asset && !agent) {
    throw new Error('ProofPass open requires targetAgent');
  }
  if (asset && agent && asset !== agent) {
    throw new Error('targetAgent and targetAsset must match when both are provided');
  }

  return agent ?? asset!;
}

function isSequentialAgentLookup(value: ProofPassTargetAgentInput): value is string | number | bigint {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = normalizeSequentialAgentLookupValue(value);
  return typeof normalized === 'string' && /^\d+$/.test(normalized);
}

function normalizeSequentialAgentLookupValue(value: string | number | bigint): string | number | bigint {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (trimmed.startsWith('sol:')) {
    const stripped = trimmed.slice(4).trim();
    if (stripped) {
      return stripped;
    }
  }
  return trimmed;
}

function createProofPassIndexerClient(
  registryProgram: PublicKey,
  indexerGraphqlUrl?: string | string[]
): Pick<IndexerReadClient, 'getAgentByAgentId'> {
  const graphqlUrl = indexerGraphqlUrl ?? getDefaultIndexerGraphqlUrls(resolveRegistryCluster(registryProgram));
  return new IndexerGraphQLClient({ graphqlUrl });
}

function resolveRegistryCluster(registryProgram: PublicKey): 'devnet' | 'mainnet-beta' {
  if (registryProgram.equals(DEVNET_AGENT_REGISTRY_PROGRAM_ID)) {
    return 'devnet';
  }
  if (registryProgram.equals(MAINNET_AGENT_REGISTRY_PROGRAM_ID)) {
    return 'mainnet-beta';
  }
  throw new Error(
    `targetAgent sequential lookup requires indexerClient or indexerGraphqlUrl for registry ${registryProgram.toBase58()}`
  );
}

function normalizeFeeMode(
  feeMode: ProofPassFeeMode | undefined
): ProofPassFeeMode {
  return feeMode ?? 'creator_pays_all';
}

function serializeFeeMode(feeMode: ProofPassFeeMode): number {
  switch (feeMode) {
    case 'creator_pays_all':
      return PROOFPASS_FEE_MODE_CREATOR_PAYS_ALL;
    case 'reviewer_pays_finalize':
      return PROOFPASS_FEE_MODE_REVIEWER_PAYS_FINALIZE;
    default:
      throw new Error(`Unsupported ProofPass feeMode: ${String(feeMode)}`);
  }
}

function decodeFeeMode(
  feeModeCode: number,
  version: number
): ProofPassFeeMode | null {
  if (version < 3) {
    return 'reviewer_pays_finalize';
  }
  if (feeModeCode === PROOFPASS_FEE_MODE_CREATOR_PAYS_ALL) {
    return 'creator_pays_all';
  }
  if (feeModeCode === PROOFPASS_FEE_MODE_REVIEWER_PAYS_FINALIZE) {
    return 'reviewer_pays_finalize';
  }
  return null;
}

function resolveContextRefHash(
  contextRef: ProofPassContextRefInput | undefined,
  contextRefHash: ProofPassBytesInput | undefined
): Buffer {
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

function requireRegistryProgramId(
  registryProgramId: ProofPassPublicKeyInput | undefined
): PublicKey {
  if (registryProgramId === undefined) {
    throw new Error('registryProgramId is required');
  }
  return toPublicKey(registryProgramId, 'registryProgramId');
}

function resolveAtomEngineProgramId(
  registryProgramId: PublicKey,
  atomEngineProgramId?: ProofPassPublicKeyInput
): PublicKey {
  if (atomEngineProgramId !== undefined) {
    return toPublicKey(atomEngineProgramId, 'atomEngineProgramId');
  }

  if (registryProgramId.equals(DEVNET_AGENT_REGISTRY_PROGRAM_ID)) {
    return DEVNET_ATOM_ENGINE_PROGRAM_ID;
  }

  if (registryProgramId.equals(MAINNET_AGENT_REGISTRY_PROGRAM_ID)) {
    return MAINNET_ATOM_ENGINE_PROGRAM_ID;
  }

  throw new Error(
    `atomEngineProgramId is required for registry ${registryProgramId.toBase58()}`
  );
}

function serializeProofPassGiveFeedbackArgs(
  payload: NormalizedProofPassPayload
): Buffer {
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

function serializeI128(value: bigint): Buffer {
  if (value < I128_MIN || value > I128_MAX) {
    throw new Error(`value ${value} exceeds i128 range`);
  }
  let encoded = value;
  if (encoded < 0n) {
    encoded = (1n << 128n) + encoded;
  }
  const out = Buffer.alloc(16);
  for (let index = 0; index < 16; index += 1) {
    out[index] = Number((encoded >> BigInt(index * 8)) & 0xffn);
  }
  return out;
}

function serializeOptionU8(value: number | null): Buffer {
  if (value === null) {
    return Buffer.from([0]);
  }
  return Buffer.from([1, value]);
}

function serializeOption32Bytes(value: Buffer | Uint8Array | null): Buffer {
  if (value === null) {
    return Buffer.from([0]);
  }
  const bytes = ensureFixedBytes(value, PROOFPASS_BYTES32_LEN, 'feedbackFileHash');
  return Buffer.concat([Buffer.from([1]), bytes]);
}

function decodeProofPassLiveAccount(
  session: PublicKey,
  account: AccountInfo<Buffer> | AccountInfo<Uint8Array> | null
): ProofPassLive | null {
  if (!account) {
    return null;
  }

  const data = Buffer.from(account.data);
  if (data.length !== PROOFPASS_SESSION_ACCOUNT_SIZE) {
    return null;
  }
  if (!data.subarray(0, 8).equals(PROOFPASS_SESSION_ACCOUNT_DISCRIMINATOR)) {
    return null;
  }

  const statusCode = data[PROOFPASS_SESSION_OFFSETS.status];
  if (statusCode !== PROOFPASS_STATUS_OPEN) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const hasFeedbackFileHashHint = data[PROOFPASS_SESSION_OFFSETS.hasFeedbackFileHashHint];
  const feedbackFileHashHint = data.subarray(
    PROOFPASS_SESSION_OFFSETS.feedbackFileHashHint,
    PROOFPASS_SESSION_OFFSETS.feedbackFileHashHint + PROOFPASS_BYTES32_LEN
  );
  const feedbackUriLen = data[PROOFPASS_SESSION_OFFSETS.feedbackUriLen];
  const endpointLen = data[PROOFPASS_SESSION_OFFSETS.endpointLen];
  const version = data[PROOFPASS_SESSION_OFFSETS.version];
  const feeMode = decodeFeeMode(data[PROOFPASS_SESSION_OFFSETS.feeMode], version);
  if (feedbackUriLen > PROOFPASS_MAX_FEEDBACK_URI_LEN) {
    return null;
  }
  if (endpointLen > PROOFPASS_MAX_ENDPOINT_LEN) {
    return null;
  }
  if (hasFeedbackFileHashHint !== 0 && hasFeedbackFileHashHint !== 1) {
    return null;
  }
  if (!feeMode) {
    return null;
  }
  const lockedFinalizeFeeLamports = view.getBigUint64(
    PROOFPASS_SESSION_OFFSETS.lockedFinalizeFeeLamports,
    true
  );

  return {
    session,
    sessionAddress: session.toBase58(),
    creator: new PublicKey(
      data.subarray(PROOFPASS_SESSION_OFFSETS.creator, PROOFPASS_SESSION_OFFSETS.creator + 32)
    ).toBase58(),
    reviewer: new PublicKey(
      data.subarray(PROOFPASS_SESSION_OFFSETS.reviewer, PROOFPASS_SESSION_OFFSETS.reviewer + 32)
    ).toBase58(),
    targetAsset: new PublicKey(
      data.subarray(
        PROOFPASS_SESSION_OFFSETS.targetAsset,
        PROOFPASS_SESSION_OFFSETS.targetAsset + 32
      )
    ).toBase58(),
    targetAgent: new PublicKey(
      data.subarray(
        PROOFPASS_SESSION_OFFSETS.targetAsset,
        PROOFPASS_SESSION_OFFSETS.targetAsset + 32
      )
    ).toBase58(),
    version,
    status: 'open',
    statusCode,
    contextType: data[PROOFPASS_SESSION_OFFSETS.contextType],
    openedSlot: view.getBigUint64(PROOFPASS_SESSION_OFFSETS.openedSlot, true),
    answeredSlot: null,
    feeMode,
    lockedFinalizeFeeLamports: version >= 3 ? lockedFinalizeFeeLamports : 0n,
    expirySlot: view.getBigUint64(PROOFPASS_SESSION_OFFSETS.expirySlot, true),
    contextRefHash: Buffer.from(
      data.subarray(
        PROOFPASS_SESSION_OFFSETS.contextRefHash,
        PROOFPASS_SESSION_OFFSETS.contextRefHash + PROOFPASS_BYTES32_LEN
      )
    ),
    feedbackFileHashHint: hasFeedbackFileHashHint === 0 ? null : Buffer.from(feedbackFileHashHint),
    feedbackUriHint: data
      .subarray(
        PROOFPASS_SESSION_OFFSETS.feedbackUriHint,
        PROOFPASS_SESSION_OFFSETS.feedbackUriHint + feedbackUriLen
      )
      .toString('utf8'),
    endpointHint: data
      .subarray(
        PROOFPASS_SESSION_OFFSETS.endpointHint,
        PROOFPASS_SESSION_OFFSETS.endpointHint + endpointLen
      )
      .toString('utf8'),
    nonce: Buffer.from(
      data.subarray(
        PROOFPASS_SESSION_OFFSETS.nonce,
        PROOFPASS_SESSION_OFFSETS.nonce + PROOFPASS_BYTES32_LEN
      )
    ),
  };
}

async function fetchProofPassConfig(
  connection: Pick<Connection, 'getAccountInfo'>,
  programId: PublicKey = PROOFPASS_PROGRAM_ID
): Promise<{
  treasury: PublicKey;
  registryProgram: PublicKey;
  openFeeLamports: bigint;
  finalizeFeeLamports: bigint;
  maxExpirySlots: bigint;
  paused: boolean;
}> {
  const [configPda] = getProofPassConfigPda(programId);
  const account = await connection.getAccountInfo(configPda);
  if (!account) {
    throw new Error(`ProofPass config ${configPda.toBase58()} is not initialized`);
  }

  const data = Buffer.from(account.data);
  if (
    data.length !== PROOFPASS_CONFIG_ACCOUNT_SIZE
    || !data.subarray(0, 8).equals(PROOFPASS_CONFIG_ACCOUNT_DISCRIMINATOR)
  ) {
    throw new Error(`Invalid ProofPass config account at ${configPda.toBase58()}`);
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    treasury: new PublicKey(
      data.subarray(PROOFPASS_CONFIG_OFFSETS.treasury, PROOFPASS_CONFIG_OFFSETS.treasury + 32)
    ),
    registryProgram: new PublicKey(
      data.subarray(
        PROOFPASS_CONFIG_OFFSETS.registryProgram,
        PROOFPASS_CONFIG_OFFSETS.registryProgram + 32
      )
    ),
    openFeeLamports: view.getBigUint64(PROOFPASS_CONFIG_OFFSETS.openFeeLamports, true),
    finalizeFeeLamports: view.getBigUint64(PROOFPASS_CONFIG_OFFSETS.finalizeFeeLamports, true),
    maxExpirySlots: view.getBigUint64(PROOFPASS_CONFIG_OFFSETS.maxExpirySlots, true),
    paused: data[PROOFPASS_CONFIG_OFFSETS.paused] !== 0,
  };
}

async function requireLiveProofPass(
  connection: Pick<Connection, 'getAccountInfo'>,
  session: ProofPassPublicKeyInput
): Promise<ProofPassLive> {
  const live = await getLiveProofPass({
    connection,
    session,
  });
  if (!live) {
    throw new Error(`No live ProofPass request found for session ${toPublicKey(session, 'session').toBase58()}`);
  }
  return live;
}

function mergeServiceFeedbackHints(
  session: ProofPassLive,
  feedback: GiveFeedbackParams
): GiveFeedbackParams {
  const providedEndpoint = feedback.endpoint && feedback.endpoint !== ''
    ? feedback.endpoint
    : undefined;
  const providedFeedbackUri = feedback.feedbackUri && feedback.feedbackUri !== ''
    ? feedback.feedbackUri
    : undefined;

  if (
    session.endpointHint
    && providedEndpoint !== undefined
    && providedEndpoint !== session.endpointHint
  ) {
    throw new Error('feedback.endpoint does not match the service-provided ProofPass endpoint');
  }
  if (
    session.feedbackUriHint
    && providedFeedbackUri !== undefined
    && providedFeedbackUri !== session.feedbackUriHint
  ) {
    throw new Error('feedback.feedbackUri does not match the service-provided ProofPass attachment');
  }
  if (
    session.feedbackFileHashHint
    && feedback.feedbackFileHash !== undefined
    && !Buffer.from(feedback.feedbackFileHash).equals(session.feedbackFileHashHint)
  ) {
    throw new Error('feedback.feedbackFileHash does not match the service-provided ProofPass attachment');
  }

  return {
    ...feedback,
    endpoint: providedEndpoint ?? (session.endpointHint || undefined),
    feedbackUri: providedFeedbackUri ?? (session.feedbackUriHint || undefined),
    feedbackFileHash: feedback.feedbackFileHash ?? session.feedbackFileHashHint ?? undefined,
  };
}

function normalizeEndpointHint(value: string | undefined): string {
  const resolved = value ?? '';
  if (Buffer.byteLength(resolved, 'utf8') > MAX_ENDPOINT_LEN) {
    throw new Error(`endpoint exceeds ${MAX_ENDPOINT_LEN} UTF-8 bytes`);
  }
  return resolved;
}

function normalizeFeedbackUri(value: string | undefined): string {
  const resolved = value ?? '';
  if (Buffer.byteLength(resolved, 'utf8') > MAX_URI_LEN) {
    throw new Error(`feedbackUri exceeds ${MAX_URI_LEN} UTF-8 bytes`);
  }
  return resolved;
}

function normalizePublicKey(
  value: ProofPassPublicKeyInput,
  fieldName: string
): string {
  return toPublicKey(value, fieldName).toBase58();
}

function toPublicKey(value: ProofPassPublicKeyInput, fieldName: string): PublicKey {
  try {
    return typeof value === 'string' ? new PublicKey(value) : value;
  } catch {
    throw new Error(`${fieldName} must be a valid Solana public key`);
  }
}

function ensureFixedBytes(
  value: ProofPassBytesInput,
  expectedLength: number,
  fieldName: string
): Buffer {
  const bytes = Buffer.from(value);
  if (bytes.length !== expectedLength) {
    throw new Error(`${fieldName} must be ${expectedLength} bytes (got ${bytes.length})`);
  }
  return bytes;
}

function normalizeContextType(contextType?: number): number {
  const resolved = contextType ?? 0;
  if (!Number.isInteger(resolved) || resolved < 0 || resolved > 255) {
    throw new Error(`contextType must be a u8 integer (0-255), got ${resolved}`);
  }
  return resolved;
}

function toNonNegativeBigInt(value: bigint | number, fieldName: string): bigint {
  const normalized = typeof value === 'bigint' ? value : BigInt(value);
  if (normalized < 0n) {
    throw new Error(`${fieldName} must be non-negative`);
  }
  return normalized;
}

function toPositiveBigInt(value: bigint | number, fieldName: string): bigint {
  const normalized = toNonNegativeBigInt(value, fieldName);
  if (normalized === 0n) {
    throw new Error(`${fieldName} must be greater than 0`);
  }
  return normalized;
}

function u64ToBuffer(value: bigint | number, fieldName: string): Buffer {
  const normalized = toNonNegativeBigInt(value, fieldName);
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(normalized);
  return out;
}
