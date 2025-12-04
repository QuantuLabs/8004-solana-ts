/**
 * Anchor instruction discriminators
 * These are the first 8 bytes of SHA256("global:instruction_name")
 * Generated to match the deployed 8004-solana programs
 */

import { createHash } from 'crypto';

/**
 * Calculate Anchor discriminator from instruction name
 * @param instructionName - The instruction name (e.g., "initialize", "give_feedback")
 * @returns 8-byte discriminator buffer
 */
export function anchorDiscriminator(instructionName: string): Buffer {
  const hash = createHash('sha256')
    .update(`global:${instructionName}`)
    .digest();
  return hash.slice(0, 8);
}

/**
 * Calculate Anchor account discriminator from account struct name
 * @param accountName - The account struct name (e.g., "AgentAccount", "RegistryConfig")
 * @returns 8-byte discriminator buffer
 */
export function anchorAccountDiscriminator(accountName: string): Buffer {
  const hash = createHash('sha256')
    .update(`account:${accountName}`)
    .digest();
  return hash.slice(0, 8);
}

/**
 * Check if account data matches expected discriminator
 * @param data - Account data buffer
 * @param expected - Expected discriminator buffer
 * @returns true if first 8 bytes match
 */
export function matchesDiscriminator(data: Buffer, expected: Buffer): boolean {
  if (data.length < 8) return false;
  return data.slice(0, 8).equals(expected);
}

/**
 * Identity Registry instruction discriminators
 * Program: 2dtvC4hyb7M6fKwNx1C6h4SrahYvor3xW11eH6uLNvSZ
 */
export const IDENTITY_DISCRIMINATORS = {
  initialize: anchorDiscriminator('initialize'),
  registerEmpty: anchorDiscriminator('register_empty'),
  register: anchorDiscriminator('register'),
  registerWithMetadata: anchorDiscriminator('register_with_metadata'),
  getMetadata: anchorDiscriminator('get_metadata'),
  setMetadata: anchorDiscriminator('set_metadata_pda'),  // v0.2.0: now uses PDA
  setAgentUri: anchorDiscriminator('set_agent_uri'),
  syncOwner: anchorDiscriminator('sync_owner'),
  ownerOf: anchorDiscriminator('owner_of'),
  createMetadataExtension: anchorDiscriminator('create_metadata_extension'),
  setMetadataExtended: anchorDiscriminator('set_metadata_extended'),
  getMetadataExtended: anchorDiscriminator('get_metadata_extended'),
  transferAgent: anchorDiscriminator('transfer_agent'),
  deleteMetadata: anchorDiscriminator('delete_metadata_pda'),  // v0.2.0
} as const;

/**
 * Reputation Registry instruction discriminators
 * Program: 9WcFLL3Fsqs96JxuewEt9iqRwULtCZEsPT717hPbsQAa
 */
export const REPUTATION_DISCRIMINATORS = {
  initialize: anchorDiscriminator('initialize'),
  giveFeedback: anchorDiscriminator('give_feedback'),
  revokeFeedback: anchorDiscriminator('revoke_feedback'),
  appendResponse: anchorDiscriminator('append_response'),
} as const;

/**
 * Validation Registry instruction discriminators
 * Program: CXvuHNGWTHNqXmWr95wSpNGKR3kpcJUhzKofTF3zsoxW
 */
export const VALIDATION_DISCRIMINATORS = {
  initialize: anchorDiscriminator('initialize'),
  requestValidation: anchorDiscriminator('request_validation'),
  respondToValidation: anchorDiscriminator('respond_to_validation'),
  updateValidation: anchorDiscriminator('update_validation'),
  closeValidation: anchorDiscriminator('close_validation'),
} as const;

/**
 * Account discriminators for identifying account types
 * Each Anchor account has a unique 8-byte discriminator: SHA256("account:StructName")[0..8]
 */
export const ACCOUNT_DISCRIMINATORS = {
  // Identity Registry accounts
  RegistryConfig: anchorAccountDiscriminator('RegistryConfig'),
  AgentAccount: anchorAccountDiscriminator('AgentAccount'),
  MetadataExtension: anchorAccountDiscriminator('MetadataExtension'),

  // Reputation Registry accounts
  AgentReputationMetadata: anchorAccountDiscriminator('AgentReputationMetadata'),
  FeedbackAccount: anchorAccountDiscriminator('FeedbackAccount'),
  ClientIndexAccount: anchorAccountDiscriminator('ClientIndexAccount'),
  ResponseIndexAccount: anchorAccountDiscriminator('ResponseIndexAccount'),
  ResponseAccount: anchorAccountDiscriminator('ResponseAccount'),

  // Validation Registry accounts
  ValidationConfig: anchorAccountDiscriminator('ValidationConfig'),
  ValidationRequest: anchorAccountDiscriminator('ValidationRequest'),
} as const;
