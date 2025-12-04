/**
 * Manual instruction builder for ERC-8004 Solana programs
 * v0.2.0 - Metaplex Core architecture
 * Builds transactions without Anchor dependency
 * Must match exactly the instruction layouts in 8004-solana programs
 */

import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { PROGRAM_ID, MPL_CORE_PROGRAM_ID } from './programs.js';
import {
  IDENTITY_DISCRIMINATORS,
  REPUTATION_DISCRIMINATORS,
  VALIDATION_DISCRIMINATORS,
} from './instruction-discriminators.js';
import { toBigInt } from './utils.js';

/**
 * Instruction builder for Identity Registry (Metaplex Core)
 * Program: 3ah8M3viTAGHRkAqGshRF4b48Ey1ZwrMViQ6bkUNamTi
 */
export class IdentityInstructionBuilder {
  private programId: PublicKey;

  constructor() {
    this.programId = PROGRAM_ID;
  }

  /**
   * Build register instruction (Metaplex Core)
   * Accounts: config, agent_account, asset (signer), collection, owner (signer), system_program, mpl_core_program
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

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: agentAccount, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: true, isWritable: true },
        { pubkey: collection, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build registerWithMetadata instruction (Metaplex Core)
   * @param metadata - Array of metadata entries (max per config)
   */
  buildRegisterWithMetadata(
    config: PublicKey,
    agentAccount: PublicKey,
    asset: PublicKey,
    collection: PublicKey,
    owner: PublicKey,
    agentUri: string = '',
    metadata: Array<{ key: string; value: string }> = [],
  ): TransactionInstruction {
    const data = Buffer.concat([
      IDENTITY_DISCRIMINATORS.registerWithMetadata,
      this.serializeString(agentUri),
      this.serializeMetadata(metadata),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: agentAccount, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: true, isWritable: true },
        { pubkey: collection, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build setAgentUri instruction (Metaplex Core)
   * Accounts: config, agent_account, asset, collection, owner (signer), system_program, mpl_core_program
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

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: agentAccount, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: true },
        { pubkey: collection, isSigner: false, isWritable: false },
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
      keyHash.slice(0, 8),  // [u8; 8] key_hash
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
   * Build createMetadataExtension instruction (Metaplex Core)
   * Accounts: metadata_extension, asset, agent_account, owner (signer), system_program
   */
  buildCreateMetadataExtension(
    metadataExtension: PublicKey,
    asset: PublicKey,
    agentAccount: PublicKey,
    owner: PublicKey,
    extensionIndex: number,
  ): TransactionInstruction {
    const data = Buffer.concat([
      IDENTITY_DISCRIMINATORS.createMetadataExtension,
      Buffer.from([extensionIndex]),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: metadataExtension, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: agentAccount, isSigner: false, isWritable: false },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build setMetadataExtended instruction (Metaplex Core)
   * Accounts: metadata_extension, asset, agent_account, owner (signer)
   */
  buildSetMetadataExtended(
    metadataExtension: PublicKey,
    asset: PublicKey,
    agentAccount: PublicKey,
    owner: PublicKey,
    extensionIndex: number,
    key: string,
    value: string,
  ): TransactionInstruction {
    const valueBytes = Buffer.from(value, 'utf8');
    const valueLen = Buffer.alloc(4);
    valueLen.writeUInt32LE(valueBytes.length);
    const serializedValue = Buffer.concat([valueLen, valueBytes]);

    const data = Buffer.concat([
      IDENTITY_DISCRIMINATORS.setMetadataExtended,
      Buffer.from([extensionIndex]),
      this.serializeString(key),
      serializedValue,
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: metadataExtension, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: agentAccount, isSigner: false, isWritable: false },
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

  private serializeString(str: string): Buffer {
    const strBytes = Buffer.from(str, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(strBytes.length);
    return Buffer.concat([len, strBytes]);
  }

  private serializeMetadata(metadata: Array<{ key: string; value: string }>): Buffer {
    const vecLen = Buffer.alloc(4);
    vecLen.writeUInt32LE(metadata.length);

    if (metadata.length === 0) {
      return vecLen;
    }

    const entries = metadata.map(entry => {
      const key = this.serializeString(entry.key);
      const valueBytes = Buffer.from(entry.value, 'utf8');
      const valueLen = Buffer.alloc(4);
      valueLen.writeUInt32LE(valueBytes.length);
      const value = Buffer.concat([valueLen, valueBytes]);
      return Buffer.concat([key, value]);
    });

    return Buffer.concat([vecLen, ...entries]);
  }
}

/**
 * Instruction builder for Reputation Registry
 * Program: 3ah8M3viTAGHRkAqGshRF4b48Ey1ZwrMViQ6bkUNamTi
 */
export class ReputationInstructionBuilder {
  private programId: PublicKey;

  constructor() {
    this.programId = PROGRAM_ID;
  }

  /**
   * Build giveFeedback instruction
   * Matches: give_feedback(agent_id, score, tag1, tag2, file_uri, file_hash, feedback_index)
   * Accounts: client, payer, asset, agent_account, feedback_account, agent_reputation, system_program
   */
  buildGiveFeedback(
    client: PublicKey,
    payer: PublicKey,
    asset: PublicKey,
    agentAccount: PublicKey,
    feedbackAccount: PublicKey,
    agentReputation: PublicKey,
    agentId: bigint,
    score: number,
    tag1: string,
    tag2: string,
    fileUri: string,
    fileHash: Buffer,
    feedbackIndex: bigint,
  ): TransactionInstruction {
    const data = Buffer.concat([
      REPUTATION_DISCRIMINATORS.giveFeedback,
      this.serializeU64(agentId),
      Buffer.from([score]),
      this.serializeString(tag1),
      this.serializeString(tag2),
      this.serializeString(fileUri),
      fileHash,
      this.serializeU64(feedbackIndex),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: client, isSigner: true, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: false },
        { pubkey: agentAccount, isSigner: false, isWritable: false },
        { pubkey: feedbackAccount, isSigner: false, isWritable: true },
        { pubkey: agentReputation, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build revokeFeedback instruction
   * Matches: revoke_feedback(agent_id, feedback_index)
   */
  buildRevokeFeedback(
    client: PublicKey,
    feedbackAccount: PublicKey,
    agentReputation: PublicKey,
    agentId: bigint,
    feedbackIndex: bigint,
  ): TransactionInstruction {
    const data = Buffer.concat([
      REPUTATION_DISCRIMINATORS.revokeFeedback,
      this.serializeU64(agentId),
      this.serializeU64(feedbackIndex),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: client, isSigner: true, isWritable: false },
        { pubkey: feedbackAccount, isSigner: false, isWritable: true },
        { pubkey: agentReputation, isSigner: false, isWritable: true },
      ],
      data,
    });
  }

  /**
   * Build appendResponse instruction
   * Matches: append_response(agent_id, feedback_index, response_uri, response_hash)
   */
  buildAppendResponse(
    responder: PublicKey,
    payer: PublicKey,
    feedbackAccount: PublicKey,
    responseIndex: PublicKey,
    responseAccount: PublicKey,
    agentId: bigint,
    feedbackIndex: bigint,
    responseUri: string,
    responseHash: Buffer,
  ): TransactionInstruction {
    const data = Buffer.concat([
      REPUTATION_DISCRIMINATORS.appendResponse,
      this.serializeU64(agentId),
      this.serializeU64(feedbackIndex),
      this.serializeString(responseUri),
      responseHash,
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: responder, isSigner: true, isWritable: false },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: feedbackAccount, isSigner: false, isWritable: false },
        { pubkey: responseIndex, isSigner: false, isWritable: true },
        { pubkey: responseAccount, isSigner: false, isWritable: true },
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
 * Program: 3ah8M3viTAGHRkAqGshRF4b48Ey1ZwrMViQ6bkUNamTi
 */
export class ValidationInstructionBuilder {
  private programId: PublicKey;

  constructor() {
    this.programId = PROGRAM_ID;
  }

  /**
   * Build requestValidation instruction
   * Matches: request_validation(agent_id, validator_address, nonce, request_uri, request_hash)
   */
  buildRequestValidation(
    config: PublicKey,
    requester: PublicKey,
    payer: PublicKey,
    asset: PublicKey,
    agentAccount: PublicKey,
    validationRequest: PublicKey,
    agentId: bigint,
    validatorAddress: PublicKey,
    nonce: number,
    requestUri: string,
    requestHash: Buffer,
  ): TransactionInstruction {
    const data = Buffer.concat([
      VALIDATION_DISCRIMINATORS.requestValidation,
      this.serializeU64(agentId),
      validatorAddress.toBuffer(),
      this.serializeU32(nonce),
      this.serializeString(requestUri),
      requestHash,
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true },
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
   * Build respondToValidation instruction
   * Matches: respond_to_validation(response, response_uri, response_hash, tag)
   */
  buildRespondToValidation(
    config: PublicKey,
    validator: PublicKey,
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
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: validator, isSigner: true, isWritable: false },
        { pubkey: validationRequest, isSigner: false, isWritable: true },
      ],
      data,
    });
  }

  /**
   * Build updateValidation instruction (same as respondToValidation)
   */
  buildUpdateValidation(
    config: PublicKey,
    validator: PublicKey,
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
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: validator, isSigner: true, isWritable: false },
        { pubkey: validationRequest, isSigner: false, isWritable: true },
      ],
      data,
    });
  }

  /**
   * Build closeValidation instruction
   */
  buildCloseValidation(
    config: PublicKey,
    closer: PublicKey,
    asset: PublicKey,
    agentAccount: PublicKey,
    validationRequest: PublicKey,
    rentReceiver: PublicKey,
  ): TransactionInstruction {
    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: false },
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
