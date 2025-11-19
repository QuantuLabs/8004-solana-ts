/**
 * Solana implementation for agent0-ts SDK
 * ERC-8004 on Solana with read and write support (no Anchor dependency)
 */

// Main SDK
export { SolanaSDK, createDevnetSDK } from './sdk.js';
export type { SolanaSDKConfig } from './sdk.js';

// Core clients
export { SolanaClient, createDevnetClient } from './client.js';
export type { Cluster, SolanaClientConfig } from './client.js';

// Feedback manager (read functions)
export { SolanaFeedbackManager } from './feedback-manager.js';
export type { SolanaAgentSummary, SolanaFeedback, SolanaResponse } from './feedback-manager.js';

// PDA helpers
export { PDAHelpers, stringToBytes32, bytes32ToString } from './pda-helpers.js';
export {
  IDENTITY_PROGRAM_ID,
  REPUTATION_PROGRAM_ID,
  VALIDATION_PROGRAM_ID,
} from './pda-helpers.js';

// Programs config
export { getProgramIds, PROGRAM_IDS, calculateRentExempt, PDA_SEEDS } from './programs.js';

// Account schemas
export {
  AgentAccount,
  FeedbackAccount,
  AgentReputationAccount,
  ClientIndexAccount,
  ResponseIndexAccount,
  ResponseAccount,
  MetadataEntry,
} from './borsh-schemas.js';

// Transaction builders (for advanced usage)
export {
  IdentityTransactionBuilder,
  ReputationTransactionBuilder,
  ValidationTransactionBuilder,
} from './transaction-builder.js';
export type { TransactionResult } from './transaction-builder.js';

// Instruction builders (for advanced usage)
export {
  IdentityInstructionBuilder,
  ReputationInstructionBuilder,
  ValidationInstructionBuilder,
} from './instruction-builder.js';
