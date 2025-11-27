/**
 * Solana program IDs and configuration for ERC-8004
 * Equivalent to contracts.ts for Ethereum
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Program IDs for devnet deployment
 * These are the deployed program addresses on Solana devnet
 */
export const PROGRAM_IDS = {
  identityRegistry: new PublicKey('CAHKQ2amAyKGzPhSE1mJx5qgxn1nJoNToDaiU6Kmacss'),
  reputationRegistry: new PublicKey('Ejb8DaxZCb9Yh4ZYHLFKG5dj46YFyRm4kZpGz2rz6Ajr'),
  validationRegistry: new PublicKey('2y87PVXuBoCTi9b6p44BJREVz14Te2pukQPSwqfPwhhw'),
} as const;

/**
 * Get program IDs (devnet only)
 */
export function getProgramIds() {
  return PROGRAM_IDS;
}

/**
 * Account discriminators (first 8 bytes of account data)
 * Used for account type identification
 */
export const DISCRIMINATORS = {
  // Identity Registry
  agentAccount: Buffer.from([0x0d, 0x9a, 0x3d, 0x7d, 0x0c, 0x1f, 0x8e, 0x9b]), // agent_account
  metadataEntry: Buffer.from([0x1a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f, 0x7a, 0x8b]), // metadata_entry
  registryConfig: Buffer.from([0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0xa7, 0xb8]), // registry_config

  // Reputation Registry
  feedbackAccount: Buffer.from([0x1f, 0x2e, 0x3d, 0x4c, 0x5b, 0x6a, 0x79, 0x88]), // feedback_account
  agentReputation: Buffer.from([0x2a, 0x3b, 0x4c, 0x5d, 0x6e, 0x7f, 0x8a, 0x9b]), // agent_reputation
  clientIndex: Buffer.from([0x3b, 0x4c, 0x5d, 0x6e, 0x7f, 0x8a, 0x9b, 0xac]), // client_index
  responseAccount: Buffer.from([0x4c, 0x5d, 0x6e, 0x7f, 0x8a, 0x9b, 0xac, 0xbd]), // response_account
  responseIndex: Buffer.from([0x5d, 0x6e, 0x7f, 0x8a, 0x9b, 0xac, 0xbd, 0xce]), // response_index

  // Validation Registry
  validationRequest: Buffer.from([0x6e, 0x7f, 0x8a, 0x9b, 0xac, 0xbd, 0xce, 0xdf]), // validation_request
} as const;

/**
 * Account sizes (in bytes) for rent calculation
 */
export const ACCOUNT_SIZES = {
  agentAccount: 297,
  metadataEntry: 307,
  feedbackAccount: 526,
  agentReputation: 64, // Estimated
  clientIndex: 64, // Estimated
  responseAccount: 322,
  responseIndex: 32, // Estimated
  validationRequest: 147,
} as const;

/**
 * Rent cost per byte (lamports)
 * Standard Solana rent-exempt rate
 */
export const LAMPORTS_PER_BYTE_YEAR = 6965;

/**
 * Calculate rent-exempt minimum for an account
 */
export function calculateRentExempt(accountSize: number): number {
  return accountSize * LAMPORTS_PER_BYTE_YEAR;
}

/**
 * PDA seeds for deterministic address derivation
 */
export const PDA_SEEDS = {
  // Identity Registry
  agent: 'agent',
  metadata: 'metadata',
  config: 'config',

  // Reputation Registry
  feedback: 'feedback',
  agentReputation: 'agent_reputation',
  clientIndex: 'client_index',
  response: 'response',
  responseIndex: 'response_index',

  // Validation Registry
  validationRequest: 'validation_request',
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  commitment: 'confirmed' as const,
  maxRetries: 3,
  timeout: 30000, // 30 seconds
  confirmTimeout: 60000, // 60 seconds
} as const;
