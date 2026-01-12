/**
 * Manual instruction builder for ERC-8004 Solana programs
 * v0.3.0 - Asset-based identification
 * Builds transactions without Anchor dependency
 * Must match exactly the instruction layouts in 8004-solana programs
 *
 * BREAKING CHANGES from v0.2.0:
 * - agent_id (u64) removed from all instruction arguments
 * - Asset (Pubkey) used for PDA derivation only
 * - New multi-collection instructions added
 */

import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import { PROGRAM_ID, MPL_CORE_PROGRAM_ID, ATOM_ENGINE_PROGRAM_ID } from './programs.js';
import {
  IDENTITY_DISCRIMINATORS,
  REPUTATION_DISCRIMINATORS,
  VALIDATION_DISCRIMINATORS,
  ATOM_ENGINE_DISCRIMINATORS,
} from './instruction-discriminators.js';
import { toBigInt } from './utils.js';

/**
 * Instruction builder for Identity Registry (Metaplex Core)
 * Program: HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp
 */
export class IdentityInstructionBuilder {
  private programId: PublicKey;

  constructor() {
    this.programId = PROGRAM_ID;
  }

  /**
   * Build register instruction (Metaplex Core)
   * Accounts: registry_config, agent_account, asset (signer), collection,
   *           user_collection_authority (optional), owner (signer), system_program, mpl_core_program
   */
  buildRegister(
    config: PublicKey,
    agentAccount: PublicKey,
    asset: PublicKey,
    collection: PublicKey,
    owner: PublicKey,
    agentUri: string = '',
  ): TransactionInstruction {
    const data = Buffer.concat([
      IDENTITY_DISCRIMINATORS.register,
      this.serializeString(agentUri),
    ]);

    // Derive user_collection_authority PDA (seeds: ["user_collection_authority"])
    // This is an optional account but must be included in the accounts list
    const [userCollectionAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_collection_authority')],
      this.programId
    );

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: agentAccount, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: true, isWritable: true },
        { pubkey: collection, isSigner: false, isWritable: true },
        { pubkey: userCollectionAuthority, isSigner: false, isWritable: false }, // Optional PDA
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build setAgentUri instruction (Metaplex Core)
   * Accounts: registry_config, agent_account, asset, collection,
   *           user_collection_authority (optional), owner (signer), system_program, mpl_core_program
   */
  buildSetAgentUri(
    config: PublicKey,
    agentAccount: PublicKey,
    asset: PublicKey,
    collection: PublicKey,
    owner: PublicKey,
    newUri: string,
  ): TransactionInstruction {
    const data = Buffer.concat([
      IDENTITY_DISCRIMINATORS.setAgentUri,
      this.serializeString(newUri),
    ]);

    // Derive user_collection_authority PDA (seeds: ["user_collection_authority"])
    const [userCollectionAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_collection_authority')],
      this.programId
    );

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: agentAccount, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: true },
        { pubkey: collection, isSigner: false, isWritable: true }, // mut for Core CPI
        { pubkey: userCollectionAuthority, isSigner: false, isWritable: false }, // Optional PDA
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build setMetadata instruction (v0.2.0 - uses MetadataEntryPda)
   * Accounts: metadata_entry, agent_account, asset, owner (signer), system_program
   */
  buildSetMetadata(
    metadataEntry: PublicKey,
    agentAccount: PublicKey,
    asset: PublicKey,
    owner: PublicKey,
    keyHash: Buffer,
    key: string,
    value: string,
    immutable: boolean = false,
  ): TransactionInstruction {
    const valueBytes = Buffer.from(value, 'utf8');
    const valueLen = Buffer.alloc(4);
    valueLen.writeUInt32LE(valueBytes.length);
    const serializedValue = Buffer.concat([valueLen, valueBytes]);

    const data = Buffer.concat([
      IDENTITY_DISCRIMINATORS.setMetadata,
      keyHash.slice(0, 16),  // [u8; 16] key_hash (v1.9 security update)
      this.serializeString(key),
      serializedValue,
      Buffer.from([immutable ? 1 : 0]),  // bool
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: metadataEntry, isSigner: false, isWritable: true },
        { pubkey: agentAccount, isSigner: false, isWritable: false },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build deleteMetadata instruction (v0.2.0 - deletes MetadataEntryPda)
   * Accounts: metadata_entry, agent_account, asset, owner (signer)
   */
  buildDeleteMetadata(
    metadataEntry: PublicKey,
    agentAccount: PublicKey,
    asset: PublicKey,
    owner: PublicKey,
    keyHash: Buffer,
  ): TransactionInstruction {
    const data = Buffer.concat([
      IDENTITY_DISCRIMINATORS.deleteMetadata,
      keyHash.slice(0, 16),  // [u8; 16] key_hash (v1.9 security update)
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: metadataEntry, isSigner: false, isWritable: true },
        { pubkey: agentAccount, isSigner: false, isWritable: false },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: owner, isSigner: true, isWritable: true },
      ],
      data,
    });
  }

  /**
   * Build transferAgent instruction (Metaplex Core)
   * Accounts: agent_account, asset, collection, owner (signer), new_owner, mpl_core_program
   */
  buildTransferAgent(
    agentAccount: PublicKey,
    asset: PublicKey,
    collection: PublicKey,
    owner: PublicKey,
    newOwner: PublicKey,
  ): TransactionInstruction {
    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: agentAccount, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: true },
        { pubkey: collection, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: newOwner, isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: IDENTITY_DISCRIMINATORS.transferAgent,
    });
  }

  /**
   * Build syncOwner instruction
   * Accounts: agent_account, asset
   */
  buildSyncOwner(
    agentAccount: PublicKey,
    asset: PublicKey,
  ): TransactionInstruction {
    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: agentAccount, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
      ],
      data: IDENTITY_DISCRIMINATORS.syncOwner,
    });
  }

  // ============================================================================
  // v0.3.0 - Multi-collection instructions
  // ============================================================================

  /**
   * Build createBaseRegistry instruction - v0.3.0
   * Creates a new base registry (authority only)
   * Accounts: root_config, registry_config, collection (signer), authority (signer), system_program, mpl_core_program
   */
  buildCreateBaseRegistry(
    rootConfig: PublicKey,
    registryConfig: PublicKey,
    collection: PublicKey,
    authority: PublicKey,
  ): TransactionInstruction {
    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: rootConfig, isSigner: false, isWritable: true },
        { pubkey: registryConfig, isSigner: false, isWritable: true },
        { pubkey: collection, isSigner: true, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: IDENTITY_DISCRIMINATORS.createBaseRegistry,
    });
  }

  /**
   * Build rotateBaseRegistry instruction - v0.3.0
   * Rotates to a new base registry (authority only)
   * Accounts: root_config, new_registry, authority (signer)
   */
  buildRotateBaseRegistry(
    rootConfig: PublicKey,
    newRegistry: PublicKey,
    authority: PublicKey,
  ): TransactionInstruction {
    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: rootConfig, isSigner: false, isWritable: true },
        { pubkey: newRegistry, isSigner: false, isWritable: false },
        { pubkey: authority, isSigner: true, isWritable: false },
      ],
      data: IDENTITY_DISCRIMINATORS.rotateBaseRegistry,
    });
  }

  /**
   * Build createUserRegistry instruction - v0.3.0
   * Creates a user-owned registry collection
   * Accounts: collection_authority, registry_config, collection (signer), owner (signer), system_program, mpl_core_program
   */
  buildCreateUserRegistry(
    collectionAuthority: PublicKey,
    registryConfig: PublicKey,
    collection: PublicKey,
    owner: PublicKey,
    collectionName: string,
    collectionUri: string,
  ): TransactionInstruction {
    const data = Buffer.concat([
      IDENTITY_DISCRIMINATORS.createUserRegistry,
      this.serializeString(collectionName),
      this.serializeString(collectionUri),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: collectionAuthority, isSigner: false, isWritable: false },
        { pubkey: registryConfig, isSigner: false, isWritable: true },
        { pubkey: collection, isSigner: true, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build updateUserRegistryMetadata instruction - v0.3.0
   * Updates metadata for a user-owned registry
   * Accounts: collection_authority, registry_config, collection, owner (signer), system_program, mpl_core_program
   */
  buildUpdateUserRegistryMetadata(
    collectionAuthority: PublicKey,
    registryConfig: PublicKey,
    collection: PublicKey,
    owner: PublicKey,
    newName: string | null,
    newUri: string | null,
  ): TransactionInstruction {
    // Serialize optional strings
    const nameBuffer = this.serializeOption(newName, (s) => this.serializeString(s));
    const uriBuffer = this.serializeOption(newUri, (s) => this.serializeString(s));

    const data = Buffer.concat([
      IDENTITY_DISCRIMINATORS.updateUserRegistryMetadata,
      nameBuffer,
      uriBuffer,
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: collectionAuthority, isSigner: false, isWritable: false },
        { pubkey: registryConfig, isSigner: false, isWritable: false },
        { pubkey: collection, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build setAgentWallet instruction - v0.3.0
   * Sets the agent wallet metadata with Ed25519 signature verification
   * Accounts: owner (signer), payer (signer), agent_account, wallet_metadata, asset, instructions_sysvar, system_program
   * NOTE: Requires Ed25519 signature instruction immediately before in transaction
   */
  buildSetAgentWallet(
    owner: PublicKey,
    payer: PublicKey,
    agentAccount: PublicKey,
    walletMetadata: PublicKey,
    asset: PublicKey,
    newWallet: PublicKey,
    deadline: bigint,
  ): TransactionInstruction {
    // Security: Validate deadline is non-negative u64
    if (deadline < 0n) {
      throw new Error('Security: deadline must be non-negative');
    }
    const deadlineBuffer = Buffer.alloc(8);
    deadlineBuffer.writeBigUInt64LE(deadline);

    const data = Buffer.concat([
      IDENTITY_DISCRIMINATORS.setAgentWallet,
      newWallet.toBuffer(),
      deadlineBuffer,
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: agentAccount, isSigner: false, isWritable: false },
        { pubkey: walletMetadata, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  private serializeString(str: string): Buffer {
    const strBytes = Buffer.from(str, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(strBytes.length);
    return Buffer.concat([len, strBytes]);
  }

  private serializeOption<T>(value: T | null, serializer: (v: T) => Buffer): Buffer {
    if (value === null) {
      return Buffer.from([0]); // None
    }
    return Buffer.concat([Buffer.from([1]), serializer(value)]); // Some
  }
}

/**
 * Instruction builder for Reputation Registry
 * v0.3.0 - agent_id removed, uses asset for PDA derivation
 * Program: HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp
 */
export class ReputationInstructionBuilder {
  private programId: PublicKey;

  constructor() {
    this.programId = PROGRAM_ID;
  }

  /**
   * Build giveFeedback instruction - v0.4.0
   * Matches: give_feedback(score, tag1, tag2, endpoint, feedback_uri, feedback_hash, feedback_index)
   * Accounts: client (signer), asset, collection, agent_account, atom_config, atom_stats, atom_engine_program, instructions_sysvar, system_program
   * v0.4.0 BREAKING: Removed feedback_account and agent_reputation, added ATOM Engine CPI accounts
   */
  buildGiveFeedback(
    client: PublicKey,
    asset: PublicKey,
    collection: PublicKey,
    agentAccount: PublicKey,
    atomConfig: PublicKey,
    atomStats: PublicKey,
    score: number,
    tag1: string,
    tag2: string,
    endpoint: string,
    feedbackUri: string,
    feedbackHash: Buffer,
    feedbackIndex: bigint,
  ): TransactionInstruction {
    const data = Buffer.concat([
      REPUTATION_DISCRIMINATORS.giveFeedback,
      Buffer.from([score]),
      this.serializeString(tag1),
      this.serializeString(tag2),
      this.serializeString(endpoint),
      this.serializeString(feedbackUri),
      feedbackHash,
      this.serializeU64(feedbackIndex),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: client, isSigner: true, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: collection, isSigner: false, isWritable: false },
        { pubkey: agentAccount, isSigner: false, isWritable: false },
        { pubkey: atomConfig, isSigner: false, isWritable: false },
        { pubkey: atomStats, isSigner: false, isWritable: true },
        { pubkey: ATOM_ENGINE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build revokeFeedback instruction - v0.4.0
   * Matches: revoke_feedback(feedback_index)
   * Accounts: client (signer), asset, atom_config, atom_stats, atom_engine_program, instructions_sysvar, system_program
   * v0.4.0 BREAKING: Removed feedback_account and agent_reputation, added ATOM Engine CPI accounts
   */
  buildRevokeFeedback(
    client: PublicKey,
    asset: PublicKey,
    atomConfig: PublicKey,
    atomStats: PublicKey,
    feedbackIndex: bigint,
  ): TransactionInstruction {
    const data = Buffer.concat([
      REPUTATION_DISCRIMINATORS.revokeFeedback,
      this.serializeU64(feedbackIndex),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: client, isSigner: true, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: atomConfig, isSigner: false, isWritable: false },
        { pubkey: atomStats, isSigner: false, isWritable: true },
        { pubkey: ATOM_ENGINE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build appendResponse instruction - v0.3.0
   * Matches: append_response(feedback_index, response_uri, response_hash)
   * Accounts: responder (signer), payer (signer), asset, feedback_account, response_index, response_account, system_program
   */
  buildAppendResponse(
    responder: PublicKey,
    payer: PublicKey,
    asset: PublicKey,
    feedbackAccount: PublicKey,
    responseIndex: PublicKey,
    responseAccount: PublicKey,
    feedbackIndex: bigint,
    responseUri: string,
    responseHash: Buffer,
  ): TransactionInstruction {
    const data = Buffer.concat([
      REPUTATION_DISCRIMINATORS.appendResponse,
      this.serializeU64(feedbackIndex),
      this.serializeString(responseUri),
      responseHash,
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: responder, isSigner: true, isWritable: false },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: feedbackAccount, isSigner: false, isWritable: false },
        { pubkey: responseIndex, isSigner: false, isWritable: true },
        { pubkey: responseAccount, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build setFeedbackTags instruction - v0.3.0
   * Matches: set_feedback_tags(feedback_index, tag1, tag2)
   * Accounts: client (signer), payer (signer), feedback_account, feedback_tags, system_program
   */
  buildSetFeedbackTags(
    client: PublicKey,
    payer: PublicKey,
    feedbackAccount: PublicKey,
    feedbackTags: PublicKey,
    feedbackIndex: bigint,
    tag1: string,
    tag2: string,
  ): TransactionInstruction {
    const data = Buffer.concat([
      REPUTATION_DISCRIMINATORS.setFeedbackTags,
      this.serializeU64(feedbackIndex),
      this.serializeString(tag1),
      this.serializeString(tag2),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: client, isSigner: true, isWritable: false },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: feedbackAccount, isSigner: false, isWritable: false },
        { pubkey: feedbackTags, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  private serializeString(str: string): Buffer {
    const strBytes = Buffer.from(str, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(strBytes.length);
    return Buffer.concat([len, strBytes]);
  }

  private serializeU64(value: bigint | number | string | { toString(): string }): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(toBigInt(value));
    return buf;
  }
}

/**
 * Instruction builder for Validation Registry
 * v0.3.0 - agent_id removed, uses asset for PDA derivation
 * Program: HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp
 */
export class ValidationInstructionBuilder {
  private programId: PublicKey;

  constructor() {
    this.programId = PROGRAM_ID;
  }

  /**
   * Build requestValidation instruction - v0.3.0
   * Matches: request_validation(validator_address, nonce, request_uri, request_hash)
   * Accounts: root_config, requester (signer), payer (signer), asset, agent_account, validation_request, system_program
   */
  buildRequestValidation(
    rootConfig: PublicKey,
    requester: PublicKey,
    payer: PublicKey,
    asset: PublicKey,
    agentAccount: PublicKey,
    validationRequest: PublicKey,
    validatorAddress: PublicKey,
    nonce: number,
    requestUri: string,
    requestHash: Buffer,
  ): TransactionInstruction {
    const data = Buffer.concat([
      VALIDATION_DISCRIMINATORS.requestValidation,
      validatorAddress.toBuffer(),
      this.serializeU32(nonce),
      this.serializeString(requestUri),
      requestHash,
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: rootConfig, isSigner: false, isWritable: false },
        { pubkey: requester, isSigner: true, isWritable: false },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: agentAccount, isSigner: false, isWritable: false },
        { pubkey: validationRequest, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build respondToValidation instruction - v0.3.0
   * Matches: respond_to_validation(response, response_uri, response_hash, tag)
   * Accounts: validator (signer), asset, agent_account, validation_request
   */
  buildRespondToValidation(
    validator: PublicKey,
    asset: PublicKey,
    agentAccount: PublicKey,
    validationRequest: PublicKey,
    response: number,
    responseUri: string,
    responseHash: Buffer,
    tag: string,
  ): TransactionInstruction {
    const data = Buffer.concat([
      VALIDATION_DISCRIMINATORS.respondToValidation,
      Buffer.from([response]),
      this.serializeString(responseUri),
      responseHash,
      this.serializeString(tag),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: validator, isSigner: true, isWritable: false },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: agentAccount, isSigner: false, isWritable: false },
        { pubkey: validationRequest, isSigner: false, isWritable: true },
      ],
      data,
    });
  }

  /**
   * Build updateValidation instruction - v0.3.0
   * Same signature as respondToValidation but different discriminator
   * Accounts: validator (signer), asset, agent_account, validation_request
   */
  buildUpdateValidation(
    validator: PublicKey,
    asset: PublicKey,
    agentAccount: PublicKey,
    validationRequest: PublicKey,
    response: number,
    responseUri: string,
    responseHash: Buffer,
    tag: string,
  ): TransactionInstruction {
    const data = Buffer.concat([
      VALIDATION_DISCRIMINATORS.updateValidation,
      Buffer.from([response]),
      this.serializeString(responseUri),
      responseHash,
      this.serializeString(tag),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: validator, isSigner: true, isWritable: false },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: agentAccount, isSigner: false, isWritable: false },
        { pubkey: validationRequest, isSigner: false, isWritable: true },
      ],
      data,
    });
  }

  /**
   * Build closeValidation instruction - v0.3.0
   * Accounts: root_config, closer (signer), asset, agent_account, validation_request, rent_receiver
   */
  buildCloseValidation(
    rootConfig: PublicKey,
    closer: PublicKey,
    asset: PublicKey,
    agentAccount: PublicKey,
    validationRequest: PublicKey,
    rentReceiver: PublicKey,
  ): TransactionInstruction {
    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: rootConfig, isSigner: false, isWritable: false },
        { pubkey: closer, isSigner: true, isWritable: false },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: agentAccount, isSigner: false, isWritable: false },
        { pubkey: validationRequest, isSigner: false, isWritable: true },
        { pubkey: rentReceiver, isSigner: false, isWritable: true },
      ],
      data: VALIDATION_DISCRIMINATORS.closeValidation,
    });
  }

  private serializeString(str: string): Buffer {
    const strBytes = Buffer.from(str, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(strBytes.length);
    return Buffer.concat([len, strBytes]);
  }

  private serializeU64(value: bigint): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(value);
    return buf;
  }

  private serializeU32(value: number): Buffer {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value);
    return buf;
  }
}

/**
 * Instruction builder for ATOM Engine
 * v0.4.0 - Agent Trust On-chain Model
 * Program: CSx95Vn3gZuRTVnJ9j6ceiT9PEe1J5r1zooMa2dY7Vo3
 */
export class AtomInstructionBuilder {
  private programId: PublicKey;

  constructor() {
    this.programId = ATOM_ENGINE_PROGRAM_ID;
  }

  /**
   * Build initializeStats instruction
   * Initializes AtomStats PDA for an agent (must be called before any feedback)
   * Only the agent owner can call this
   * Accounts: owner (signer), asset, collection, config, stats (created), system_program
   */
  buildInitializeStats(
    owner: PublicKey,
    asset: PublicKey,
    collection: PublicKey,
    config: PublicKey,
    stats: PublicKey,
  ): TransactionInstruction {
    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: collection, isSigner: false, isWritable: false },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: stats, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: ATOM_ENGINE_DISCRIMINATORS.initializeStats,
    });
  }
}
