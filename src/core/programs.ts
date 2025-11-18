/**
 * Solana program IDs and configuration for ERC-8004
 * Equivalent to contracts.ts for Ethereum
 */

import { PublicKey } from '@solana/web3.js';
import type { Cluster } from './solana-client.js';

/**
 * Program IDs by cluster
 */
export const PROGRAM_IDS = {
  devnet: {
    identityRegistry: new PublicKey('AcngQwqu55Ut92MAP5owPh6PhsJUZhaTAG5ULyvW1TpR'),
    reputationRegistry: new PublicKey('9WcFLL3Fsqs96JxuewEt9iqRwULtCZEsPT717hPbsQAa'),
    validationRegistry: new PublicKey('2masQXYbHKXMrTV9aNLTWS4NMbNHfJhgcsLBtP6N5j6x'),
  },
  'mainnet-beta': {
    // TODO: Add mainnet program IDs when deployed
    identityRegistry: new PublicKey('11111111111111111111111111111111'), // Placeholder
    reputationRegistry: new PublicKey('11111111111111111111111111111111'), // Placeholder
    validationRegistry: new PublicKey('11111111111111111111111111111111'), // Placeholder
  },
  testnet: {
    // Solana testnet is rarely used, defaults to devnet
    identityRegistry: new PublicKey('AcngQwqu55Ut92MAP5owPh6PhsJUZhaTAG5ULyvW1TpR'),
    reputationRegistry: new PublicKey('9WcFLL3Fsqs96JxuewEt9iqRwULtCZEsPT717hPbsQAa'),
    validationRegistry: new PublicKey('2masQXYbHKXMrTV9aNLTWS4NMbNHfJhgcsLBtP6N5j6x'),
  },
  localnet: {
    // For local development with anchor localnet
    identityRegistry: new PublicKey('11111111111111111111111111111111'), // Placeholder
    reputationRegistry: new PublicKey('11111111111111111111111111111111'), // Placeholder
    validationRegistry: new PublicKey('11111111111111111111111111111111'), // Placeholder
  },
} as const;

/**
 * Get program IDs for a specific cluster
 */
export function getProgramIds(cluster: Cluster) {
  return PROGRAM_IDS[cluster];
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
