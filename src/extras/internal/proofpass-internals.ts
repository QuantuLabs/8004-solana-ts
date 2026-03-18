import { PublicKey } from '@solana/web3.js';

import type { GiveFeedbackParams } from '../../models/interfaces.js';
import { keccak256 } from '../../utils/crypto-utils.js';
import { validateByteLength } from '../../utils/validation.js';
import { encodeReputationValue } from '../../utils/value-encoding.js';
import { resolveScore } from '../../core/feedback-normalizer.js';
import {
  computeSealHash,
  MAX_ENDPOINT_LEN,
  MAX_TAG_LEN,
  MAX_URI_LEN,
} from '../../core/seal.js';

export const PROOFPASS_BYTES32_LEN = 32;

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

export function normalizeProofPassPayload(
  params: GiveFeedbackParams
): NormalizedProofPassPayload {
  const encoded = encodeReputationValue(params.value, params.valueDecimals);
  const value = encoded.value;
  const valueDecimals = encoded.valueDecimals;

  if (
    params.score !== undefined
    && (!Number.isInteger(params.score) || params.score < 0 || params.score > 100)
  ) {
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

  const feedbackFileHash =
    params.feedbackFileHash === undefined
      ? null
      : ensureFixedBytes(params.feedbackFileHash, PROOFPASS_BYTES32_LEN, 'feedbackFileHash');

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

export function hashProofPassContextRef(
  input: ProofPassContextRefInput
): Buffer {
  if (typeof input === 'string') {
    return keccak256(Buffer.from(input, 'utf8'));
  }
  return keccak256(Buffer.from(input));
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
