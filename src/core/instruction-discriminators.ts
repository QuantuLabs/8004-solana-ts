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
 * Identity Registry instruction discriminators
 * Program: 2dtvC4hyb7M6fKwNx1C6h4SrahYvor3xW11eH6uLNvSZ
 */
export const IDENTITY_DISCRIMINATORS = {
  initialize: anchorDiscriminator('initialize'),
  registerEmpty: anchorDiscriminator('register_empty'),
  register: anchorDiscriminator('register'),
  registerWithMetadata: anchorDiscriminator('register_with_metadata'),
  getMetadata: anchorDiscriminator('get_metadata'),
  setMetadata: anchorDiscriminator('set_metadata'),
  setAgentUri: anchorDiscriminator('set_agent_uri'),
  syncOwner: anchorDiscriminator('sync_owner'),
  ownerOf: anchorDiscriminator('owner_of'),
  createMetadataExtension: anchorDiscriminator('create_metadata_extension'),
  setMetadataExtended: anchorDiscriminator('set_metadata_extended'),
  getMetadataExtended: anchorDiscriminator('get_metadata_extended'),
  transferAgent: anchorDiscriminator('transfer_agent'),
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
