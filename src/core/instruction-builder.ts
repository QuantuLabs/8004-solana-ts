/**
 * Manual instruction builder for 8004 Solana programs
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
import { serializeString } from '../utils/buffer-utils.js';
import { validateByteLength } from '../utils/validation.js';

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
   *           user_collection_authority (optional), root_config (optional), owner (signer), system_program, mpl_core_program
   */
  buildRegister(
    config: PublicKey,
    agentAccount: PublicKey,
    asset: PublicKey,
    collection: PublicKey,
    owner: PublicKey,
    agentUri: string = '',
    rootConfig?: PublicKey,
  ): TransactionInstruction {
    const data = Buffer.concat([
      IDENTITY_DISCRIMINATORS.register,
      serializeString(agentUri),
    ]);

    // Derive user_collection_authority PDA (seeds: ["user_collection_authority"])
    const [userCollectionAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_collection_authority')],
      this.programId
    );

    // For optional root_config: use program ID to signal None, or actual PDA for Some
    // Anchor interprets program ID as None for Option<Account>
    const rootConfigAccount = rootConfig || this.programId;

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: agentAccount, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: true, isWritable: true },
        { pubkey: collection, isSigner: false, isWritable: true },
        { pubkey: userCollectionAuthority, isSigner: false, isWritable: false },
        { pubkey: rootConfigAccount, isSigner: false, isWritable: false },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build register_with_options instruction (Metaplex Core)
   * Accounts: registry_config, agent_account, asset (signer), collection,
   *           user_collection_authority (optional), root_config (optional), owner (signer), system_program, mpl_core_program
   */
  buildRegisterWithOptions(
    config: PublicKey,
    agentAccount: PublicKey,
    asset: PublicKey,
    collection: PublicKey,
    owner: PublicKey,
    agentUri: string,
    atomEnabled: boolean,
    rootConfig?: PublicKey,
  ): TransactionInstruction {
    const data = Buffer.concat([
      IDENTITY_DISCRIMINATORS.registerWithOptions,
      serializeString(agentUri),
      Buffer.from([atomEnabled ? 1 : 0]),
    ]);

    const [userCollectionAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_collection_authority')],
      this.programId
    );

    // For optional root_config: use program ID to signal None, or actual PDA for Some
    const rootConfigAccount = rootConfig || this.programId;

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: agentAccount, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: true, isWritable: true },
        { pubkey: collection, isSigner: false, isWritable: true },
        { pubkey: userCollectionAuthority, isSigner: false, isWritable: false },
        { pubkey: rootConfigAccount, isSigner: false, isWritable: false },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build enable_atom instruction (one-way)
   * Accounts: agent_account, asset, owner (signer)
   */
  buildEnableAtom(
    agentAccount: PublicKey,
    asset: PublicKey,
    owner: PublicKey
  ): TransactionInstruction {
    const data = IDENTITY_DISCRIMINATORS.enableAtom;

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: agentAccount, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: owner, isSigner: true, isWritable: false },
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
      serializeString(newUri),
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
      serializeString(key),
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
      serializeString(collectionName),
      serializeString(collectionUri),
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
    const nameBuffer = this.serializeOption(newName, (s) => serializeString(s));
    const uriBuffer = this.serializeOption(newUri, (s) => serializeString(s));

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
   * Build setAgentWallet instruction - v0.4.2
   * Sets the agent wallet with Ed25519 signature verification
   * Wallet is stored directly in AgentAccount (no separate PDA)
   * Accounts: owner (signer), agent_account, asset, instructions_sysvar
   * NOTE: Requires Ed25519 signature instruction immediately before in transaction
   */
  buildSetAgentWallet(
    owner: PublicKey,
    agentAccount: PublicKey,
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
        { pubkey: owner, isSigner: true, isWritable: false },
        { pubkey: agentAccount, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  private serializeOption<T>(value: T | null, serializer: (v: T) => Buffer): Buffer {
    if (value === null) {
      return Buffer.from([0]); // None
    }
    return Buffer.concat([Buffer.from([1]), serializer(value)]); // Some
  }
}

// i64 bounds for validation
const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;

/**
 * Instruction builder for Reputation Registry
 * v0.5.0 - value/valueDecimals support (EVM compatibility)
 * Program: HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp
 */
export class ReputationInstructionBuilder {
  private programId: PublicKey;

  constructor() {
    this.programId = PROGRAM_ID;
  }

  /**
   * Build giveFeedback instruction - v0.5.0
   * Matches: give_feedback(value, value_decimals, score, feedback_hash, feedback_index, tag1, tag2, endpoint, feedback_uri)
   * Accounts: client (signer), agent_account, asset, collection, system_program, [atom_config, atom_stats, atom_engine_program, registry_authority]
   */
  buildGiveFeedback(
    client: PublicKey,
    agentAccount: PublicKey,
    asset: PublicKey,
    collection: PublicKey,
    atomConfig: PublicKey | null,
    atomStats: PublicKey | null,
    registryAuthority: PublicKey | null,
    value: bigint,
    valueDecimals: number,
    score: number | null,
    feedbackHash: Buffer,
    feedbackIndex: bigint,
    tag1: string,
    tag2: string,
    endpoint: string,
    feedbackUri: string,
  ): TransactionInstruction {
    if (typeof value !== 'bigint') {
      throw new Error(`value must be bigint, got ${typeof value}. Use BigInt(n) or validateValue().`);
    }

    if (!Number.isInteger(valueDecimals) || valueDecimals < 0 || valueDecimals > 6) {
      throw new Error('valueDecimals must be integer 0-6');
    }
    if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) {
      throw new Error('score must be integer 0-100 or null');
    }
    if (value < I64_MIN || value > I64_MAX) {
      throw new Error(`value ${value} exceeds i64 range`);
    }

    // Anchor program instruction: give_feedback(value, value_decimals, score, feedback_hash, tag1, tag2, endpoint, feedback_uri)
    // Note: feedbackIndex is NOT an instruction parameter - it's computed from agent_account.feedback_count
    const data = Buffer.concat([
      REPUTATION_DISCRIMINATORS.giveFeedback,
      this.serializeI64(value),
      Buffer.from([valueDecimals]),
      this.serializeOptionU8(score),
      feedbackHash,
      serializeString(tag1),
      serializeString(tag2),
      serializeString(endpoint),
      serializeString(feedbackUri),
    ]);

    const hasAtomAccounts = !!(atomConfig && atomStats && registryAuthority);
    if ((atomConfig || atomStats || registryAuthority) && !hasAtomAccounts) {
      throw new Error('ATOM accounts must be all provided or all omitted');
    }

    const keys = [
      { pubkey: client, isSigner: true, isWritable: true },
      { pubkey: agentAccount, isSigner: false, isWritable: true },  // mut in Anchor
      { pubkey: asset, isSigner: false, isWritable: false },
      { pubkey: collection, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    if (hasAtomAccounts) {
      keys.push(
        { pubkey: atomConfig!, isSigner: false, isWritable: false },
        { pubkey: atomStats!, isSigner: false, isWritable: true },
        { pubkey: ATOM_ENGINE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: registryAuthority!, isSigner: false, isWritable: false },
      );
    }

    return new TransactionInstruction({
      programId: this.programId,
      keys,
      data,
    });
  }

  private serializeI64(value: bigint): Buffer {
    if (value < I64_MIN || value > I64_MAX) {
      throw new Error(`Value ${value} exceeds i64 range`);
    }
    const buf = Buffer.alloc(8);
    buf.writeBigInt64LE(value);
    return buf;
  }

  private serializeOptionU8(value: number | null): Buffer {
    if (value === null) {
      return Buffer.from([0]);
    }
    return Buffer.from([1, value]);
  }

  /**
   * Build revokeFeedback instruction - v0.5.0
   * Matches: revoke_feedback(feedback_index, feedback_hash)
   * Accounts: client (signer), agent_account, asset, system_program, [atom_config, atom_stats, atom_engine_program, registry_authority]
   */
  buildRevokeFeedback(
    client: PublicKey,
    agentAccount: PublicKey,
    asset: PublicKey,
    atomConfig: PublicKey | null,
    atomStats: PublicKey | null,
    registryAuthority: PublicKey | null,
    feedbackIndex: bigint,
    feedbackHash: Buffer,
  ): TransactionInstruction {
    if (!feedbackHash || feedbackHash.length !== 32) {
      throw new Error('feedbackHash must be 32 bytes');
    }
    const data = Buffer.concat([
      REPUTATION_DISCRIMINATORS.revokeFeedback,
      this.serializeU64(feedbackIndex),
      feedbackHash,
    ]);

    const hasAtomAccounts = !!(atomConfig && atomStats && registryAuthority);
    if ((atomConfig || atomStats || registryAuthority) && !hasAtomAccounts) {
      throw new Error('ATOM accounts must be all provided or all omitted');
    }

    const keys = [
      { pubkey: client, isSigner: true, isWritable: true },
      { pubkey: agentAccount, isSigner: false, isWritable: true },  // mut in Anchor
      { pubkey: asset, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    if (hasAtomAccounts) {
      keys.push(
        { pubkey: atomConfig!, isSigner: false, isWritable: false },
        { pubkey: atomStats!, isSigner: false, isWritable: true },
        { pubkey: ATOM_ENGINE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: registryAuthority!, isSigner: false, isWritable: false },
      );
    }

    return new TransactionInstruction({
      programId: this.programId,
      keys,
      data,
    });
  }

  /**
   * Build appendResponse instruction
   * Accounts: responder (signer), agent_account (mut), asset
   */
  buildAppendResponse(
    responder: PublicKey,
    agentAccount: PublicKey,
    asset: PublicKey,
    client: PublicKey,
    feedbackIndex: bigint,
    responseUri: string,
    responseHash: Buffer,
    feedbackHash: Buffer,
  ): TransactionInstruction {
    const data = Buffer.concat([
      REPUTATION_DISCRIMINATORS.appendResponse,
      asset.toBuffer(),
      client.toBuffer(),
      this.serializeU64(feedbackIndex),
      serializeString(responseUri),
      responseHash,
      feedbackHash,
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: responder, isSigner: true, isWritable: false },
        { pubkey: agentAccount, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * @deprecated Removed on-chain in v0.5.0 - tags are now included in give_feedback instruction
   * This method will throw an error when called.
   */
  buildSetFeedbackTags(
    _client: PublicKey,
    _payer: PublicKey,
    _feedbackAccount: PublicKey,
    _feedbackTags: PublicKey,
    _feedbackIndex: bigint,
    _tag1: string,
    _tag2: string,
  ): TransactionInstruction {
    throw new Error(
      "setFeedbackTags instruction removed on-chain in v0.5.0. " +
      "Tags are now included in give_feedback instruction. " +
      "Use buildGiveFeedback with tag1 and tag2 parameters instead."
    );
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
   * Build requestValidation instruction
   * Accounts: validation_config, requester (signer), payer (signer), agent_account, asset, validation_request, system_program
   */
  buildRequestValidation(
    validationConfig: PublicKey,
    requester: PublicKey,
    payer: PublicKey,
    agentAccount: PublicKey,
    asset: PublicKey,
    validationRequest: PublicKey,
    validatorAddress: PublicKey,
    nonce: number,
    requestUri: string,
    requestHash: Buffer,
  ): TransactionInstruction {
    // v0.5.0: Pass asset_key to avoid .key() allocations in seeds (OOM fix)
    const data = Buffer.concat([
      VALIDATION_DISCRIMINATORS.requestValidation,
      asset.toBuffer(),              // asset_key: Pubkey (32 bytes)
      validatorAddress.toBuffer(),   // validator_address: Pubkey (32 bytes)
      this.serializeU32(nonce),      // nonce: u32 (4 bytes)
      serializeString(requestUri),
      requestHash,
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: validationConfig, isSigner: false, isWritable: true },
        { pubkey: requester, isSigner: true, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: agentAccount, isSigner: false, isWritable: false },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: validationRequest, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build respondToValidation instruction - v0.5.0 (OOM fix)
   * Matches: respond_to_validation(asset_key, validator_address, nonce, response, response_uri, response_hash, tag)
   * Accounts: validator (signer), agent_account, asset, validation_request
   */
  buildRespondToValidation(
    validationConfig: PublicKey,
    validator: PublicKey,
    agentAccount: PublicKey,
    asset: PublicKey,
    validationRequest: PublicKey,
    nonce: number,
    response: number,
    responseUri: string,
    responseHash: Buffer,
    tag: string,
  ): TransactionInstruction {
    // Validate string lengths before serialization
    validateByteLength(responseUri, 250, 'responseUri');
    validateByteLength(tag, 32, 'tag');

    // v0.5.0: Pass asset_key and validator_address to avoid .key() allocations in seeds
    const nonceBuffer = Buffer.alloc(4);
    nonceBuffer.writeUInt32LE(nonce, 0);

    const data = Buffer.concat([
      VALIDATION_DISCRIMINATORS.respondToValidation,
      asset.toBuffer(),              // asset_key: Pubkey
      validator.toBuffer(),          // validator_address: Pubkey
      nonceBuffer,                   // nonce: u32
      Buffer.from([response]),       // response: u8
      serializeString(responseUri),
      responseHash,
      serializeString(tag),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: validationConfig, isSigner: false, isWritable: true },  // validation_config is mut
        { pubkey: validator, isSigner: true, isWritable: true },     // validator is mut
        { pubkey: agentAccount, isSigner: false, isWritable: false },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: validationRequest, isSigner: false, isWritable: true },
      ],
      data,
    });
  }

  /**
   * @deprecated Removed on-chain in v0.5.0 - validations are immutable once responded
   * This method will throw an error when called.
   */
  buildUpdateValidation(
    _validator: PublicKey,
    _asset: PublicKey,
    _agentAccount: PublicKey,
    _validationRequest: PublicKey,
    _response: number,
    _responseUri: string,
    _responseHash: Buffer,
    _tag: string,
  ): TransactionInstruction {
    throw new Error(
      "updateValidation instruction removed on-chain in v0.5.0. " +
      "Validations are immutable once responded. " +
      "Create a new validation request if updates are needed."
    );
  }

  /**
   * @deprecated Removed on-chain in v0.5.0 - validations are immutable
   * This method will throw an error when called.
   */
  buildCloseValidation(
    _closer: PublicKey,
    _asset: PublicKey,
    _agentAccount: PublicKey,
    _validationRequest: PublicKey,
    _rentReceiver: PublicKey,
  ): TransactionInstruction {
    throw new Error(
      "closeValidation instruction removed on-chain in v0.5.0. " +
      "Validation requests are now permanent records. " +
      "Rent is optimized via event-based indexing."
    );
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
 * Program: 6Mu7qj6tRDrqchxJJPjr9V1H2XQjCerVKixFEEMwC1Tf
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

  /**
   * Build initializeConfig instruction
   * Initializes global AtomConfig PDA (one-time setup by authority)
   * Accounts: authority (signer), config (created), program_data, system_program
   * Data: agent_registry_program (Pubkey)
   */
  buildInitializeConfig(
    authority: PublicKey,
    config: PublicKey,
    programData: PublicKey,
    agentRegistryProgram: PublicKey,
  ): TransactionInstruction {
    // Serialize instruction data: discriminator (8 bytes) + agent_registry_program (32 bytes)
    const data = Buffer.concat([
      ATOM_ENGINE_DISCRIMINATORS.initializeConfig,
      agentRegistryProgram.toBuffer(),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: programData, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build updateConfig instruction
   * Updates global AtomConfig parameters (authority only)
   * Accounts: authority (signer), config
   * @param params - Optional config params (only provided fields are updated)
   */
  buildUpdateConfig(
    authority: PublicKey,
    config: PublicKey,
    params: UpdateAtomConfigParams,
  ): TransactionInstruction {
    // Serialize optional params - use Option encoding (1 byte flag + value)
    const buffers: Buffer[] = [ATOM_ENGINE_DISCRIMINATORS.updateConfig];

    // Helper to serialize Option<T>
    const optU16 = (val: number | undefined): Buffer => {
      if (val === undefined) return Buffer.from([0]); // None
      const buf = Buffer.alloc(3);
      buf.writeUInt8(1, 0); // Some
      buf.writeUInt16LE(val, 1);
      return buf;
    };
    const optU8 = (val: number | undefined): Buffer => {
      if (val === undefined) return Buffer.from([0]); // None
      return Buffer.from([1, val]); // Some + value
    };
    const optBool = (val: boolean | undefined): Buffer => {
      if (val === undefined) return Buffer.from([0]); // None
      return Buffer.from([1, val ? 1 : 0]); // Some + bool
    };

    // EMA Parameters (u16)
    buffers.push(optU16(params.alphaFast));
    buffers.push(optU16(params.alphaSlow));
    buffers.push(optU16(params.alphaVolatility));
    buffers.push(optU16(params.alphaArrival));
    // Risk Weights (u8)
    buffers.push(optU8(params.weightSybil));
    buffers.push(optU8(params.weightBurst));
    buffers.push(optU8(params.weightStagnation));
    buffers.push(optU8(params.weightShock));
    buffers.push(optU8(params.weightVolatility));
    buffers.push(optU8(params.weightArrival));
    // Thresholds
    buffers.push(optU8(params.diversityThreshold));
    buffers.push(optU8(params.burstThreshold));
    buffers.push(optU16(params.shockThreshold));
    buffers.push(optU16(params.volatilityThreshold));
    // Paused flag
    buffers.push(optBool(params.paused));

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: false },
        { pubkey: config, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat(buffers),
    });
  }
}

/**
 * Parameters for updating ATOM config
 * All fields are optional - only provided fields will be updated
 */
export interface UpdateAtomConfigParams {
  // EMA Parameters (u16, 0-10000 basis points)
  alphaFast?: number;
  alphaSlow?: number;
  alphaVolatility?: number;
  alphaArrival?: number;
  // Risk Weights (u8, 0-100)
  weightSybil?: number;
  weightBurst?: number;
  weightStagnation?: number;
  weightShock?: number;
  weightVolatility?: number;
  weightArrival?: number;
  // Thresholds
  diversityThreshold?: number;  // u8
  burstThreshold?: number;       // u8
  shockThreshold?: number;       // u16
  volatilityThreshold?: number;  // u16
  // Control
  paused?: boolean;
}
