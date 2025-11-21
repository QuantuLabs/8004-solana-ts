/**
 * FeedbackAuth helper functions (ERC-8004 spec)
 *
 * Provides utilities for creating and managing feedbackAuth signatures
 * used to prevent spam in reputation feedback submissions.
 */

import {
  PublicKey,
  TransactionInstruction,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import type { FeedbackAuth } from '../models/interfaces.js';
import type { AgentId, Address } from '../models/types.js';

/**
 * Options for creating a FeedbackAuth
 */
export interface CreateFeedbackAuthOptions {
  /** Agent ID this auth is for */
  agentId: AgentId;

  /** Client address authorized to give feedback */
  clientAddress: Address | PublicKey;

  /** Maximum number of feedbacks this client can submit */
  indexLimit: number;

  /** Expiry duration in seconds from now (default: 3600 = 1 hour) */
  expiryDuration?: number;

  /** Chain identifier (default: "solana-devnet") */
  chainId?: string;

  /** Identity Registry program ID */
  identityRegistry: Address | PublicKey;

  /** Signer address (agent owner or delegate) */
  signerAddress: Address | PublicKey;

  /** Ed25519 signature (64 bytes) - if not provided, will be filled with zeros (for testing) */
  signature?: Uint8Array;
}

/**
 * Create a FeedbackAuth object
 *
 * @param options - Configuration options
 * @returns FeedbackAuth object ready for use in giveFeedback transaction
 *
 * @example
 * ```ts
 * const feedbackAuth = createFeedbackAuth({
 *   agentId: 1n,
 *   clientAddress: client.publicKey,
 *   indexLimit: 5,
 *   expiryDuration: 3600, // 1 hour
 *   chainId: "solana-devnet",
 *   identityRegistry: identityProgramId,
 *   signerAddress: agentOwner.publicKey,
 *   signature: signedBytes, // Optional: Ed25519 signature
 * });
 * ```
 */
export function createFeedbackAuth(
  options: CreateFeedbackAuthOptions
): FeedbackAuth {
  const {
    agentId,
    clientAddress,
    indexLimit,
    expiryDuration = 3600, // Default: 1 hour
    chainId = 'solana-devnet',
    identityRegistry,
    signerAddress,
    signature,
  } = options;

  // Convert PublicKey to string if needed
  const clientAddressStr =
    typeof clientAddress === 'string'
      ? clientAddress
      : clientAddress.toBase58();

  const identityRegistryStr =
    typeof identityRegistry === 'string'
      ? identityRegistry
      : identityRegistry.toBase58();

  const signerAddressStr =
    typeof signerAddress === 'string'
      ? signerAddress
      : signerAddress.toBase58();

  // Calculate expiry timestamp
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + expiryDuration;

  // Use provided signature or create empty 64-byte array for testing
  const sig = signature || new Uint8Array(64);

  return {
    agentId,
    clientAddress: clientAddressStr,
    indexLimit,
    expiry,
    chainId,
    identityRegistry: identityRegistryStr,
    signerAddress: signerAddressStr,
    signature: sig,
  };
}

/**
 * Construct the message that needs to be signed for feedbackAuth
 *
 * Format: "feedback_auth:{agent_id}:{client}:{index_limit}:{expiry}:{chain_id}:{identity_registry}"
 *
 * @param auth - FeedbackAuth object (can be partial, signature not required)
 * @returns Message bytes to be signed
 *
 * @example
 * ```ts
 * const message = constructFeedbackAuthMessage({
 *   agentId: 1n,
 *   clientAddress: client.publicKey.toBase58(),
 *   indexLimit: 5,
 *   expiry: 1234567890,
 *   chainId: "solana-devnet",
 *   identityRegistry: identityProgramId.toBase58(),
 * });
 *
 * // Sign with Ed25519
 * const signature = nacl.sign.detached(message, signerKeypair.secretKey);
 * ```
 */
export function constructFeedbackAuthMessage(
  auth: Omit<FeedbackAuth, 'signature' | 'signerAddress'>
): Uint8Array {
  const message = `feedback_auth:${auth.agentId}:${auth.clientAddress}:${auth.indexLimit}:${auth.expiry}:${auth.chainId}:${auth.identityRegistry}`;
  return new TextEncoder().encode(message);
}

/**
 * Verify that a feedbackAuth is still valid (not expired)
 *
 * @param auth - FeedbackAuth object
 * @returns true if not expired, false otherwise
 */
export function isFeedbackAuthValid(auth: FeedbackAuth): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now < auth.expiry;
}

/**
 * Get remaining time until feedbackAuth expires
 *
 * @param auth - FeedbackAuth object
 * @returns Seconds until expiry (negative if already expired)
 */
export function getFeedbackAuthTimeRemaining(auth: FeedbackAuth): number {
  const now = Math.floor(Date.now() / 1000);
  return auth.expiry - now;
}

/**
 * Check if a client can still submit feedbacks with this auth
 *
 * @param auth - FeedbackAuth object
 * @param currentIndex - Current feedback index for this client
 * @returns true if client has not exceeded index limit
 */
export function canSubmitFeedback(
  auth: FeedbackAuth,
  currentIndex: number
): boolean {
  return currentIndex < auth.indexLimit && isFeedbackAuthValid(auth);
}

/**
 * Sign a feedbackAuth message with Ed25519
 *
 * This function requires the `tweetnacl` package to be installed:
 * ```bash
 * npm install tweetnacl
 * ```
 *
 * @param auth - FeedbackAuth object (without signature)
 * @param signerSecretKey - Agent owner's Ed25519 secret key (64 bytes from Keypair.secretKey)
 * @returns Signed FeedbackAuth with signature field populated
 *
 * @example
 * ```ts
 * import nacl from 'tweetnacl';
 *
 * const feedbackAuth = createFeedbackAuth({
 *   agentId: 1n,
 *   clientAddress: client.publicKey,
 *   indexLimit: 5,
 *   expiryDuration: 3600,
 *   chainId: "solana-devnet",
 *   identityRegistry: identityProgramId,
 *   signerAddress: agentOwner.publicKey,
 * });
 *
 * // Sign with agent owner's keypair
 * const signedAuth = signFeedbackAuth(feedbackAuth, agentOwner.secretKey);
 * ```
 */
export function signFeedbackAuth(
  auth: Omit<FeedbackAuth, 'signature'>,
  signerSecretKey: Uint8Array
): FeedbackAuth {
  // Dynamically import tweetnacl (optional dependency)
  let nacl: any;
  try {
    nacl = require('tweetnacl');
  } catch (e) {
    throw new Error(
      'tweetnacl is required for signing feedbackAuth. Install it with: npm install tweetnacl'
    );
  }

  // Construct the message to sign
  const message = constructFeedbackAuthMessage(auth);

  // Sign with Ed25519
  const signature = nacl.sign.detached(message, signerSecretKey);

  return {
    ...auth,
    signature,
  };
}

/**
 * Create Ed25519Program verification instruction for feedbackAuth
 *
 * This instruction must be placed BEFORE the give_feedback instruction
 * in the same transaction. The program will introspect this instruction
 * to verify the Ed25519 signature matches the feedbackAuth parameters.
 *
 * @param feedbackAuth - Signed FeedbackAuth object
 * @returns Ed25519Program instruction
 *
 * @example
 * ```ts
 * import { Transaction } from '@solana/web3.js';
 *
 * const feedbackAuth = signFeedbackAuth(...);
 *
 * // Create Ed25519 verification instruction
 * const ed25519Ix = createFeedbackAuthEd25519Ix(feedbackAuth);
 *
 * // Create give_feedback instruction
 * const giveFeedbackIx = await reputationProgram.methods
 *   .giveFeedback(...)
 *   .accounts({
 *     // ... accounts ...
 *     instructionSysvar: getInstructionsSysvarPubkey(),
 *   })
 *   .instruction();
 *
 * // Combine in transaction (Ed25519 MUST be first)
 * const tx = new Transaction().add(ed25519Ix).add(giveFeedbackIx);
 * ```
 */
export function createFeedbackAuthEd25519Ix(
  feedbackAuth: FeedbackAuth
): TransactionInstruction {
  // Construct the message (same as what was signed)
  const message = constructFeedbackAuthMessage(feedbackAuth);

  // Convert signer address string to PublicKey
  const signerPubkey =
    typeof feedbackAuth.signerAddress === 'string'
      ? new PublicKey(feedbackAuth.signerAddress)
      : feedbackAuth.signerAddress;

  // Create Ed25519Program instruction
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: signerPubkey.toBytes(),
    message,
    signature: feedbackAuth.signature,
  });
}

/**
 * Get the Instructions Sysvar public key for use in program accounts
 *
 * This sysvar is required for Ed25519 signature verification via
 * instruction introspection.
 *
 * @returns SYSVAR_INSTRUCTIONS_PUBKEY
 *
 * @example
 * ```ts
 * await reputationProgram.methods
 *   .giveFeedback(...)
 *   .accounts({
 *     client: client.publicKey,
 *     payer: client.publicKey,
 *     // ... other accounts ...
 *     instructionSysvar: getInstructionsSysvarPubkey(),
 *   })
 *   .rpc();
 * ```
 */
export function getInstructionsSysvarPubkey(): PublicKey {
  return SYSVAR_INSTRUCTIONS_PUBKEY;
}
