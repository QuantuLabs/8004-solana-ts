/**
 * Manual instruction builder for ERC-8004 Solana programs
 * Builds transactions without Anchor dependency
 */

import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { serialize } from 'borsh';
import { getProgramIds } from './programs.js';
import type { Cluster } from './client.js';
import { TOKEN_METADATA_PROGRAM_ID } from './metaplex-helpers.js';

/**
 * Instruction discriminators (8-byte hashes)
 * These match the Anchor program discriminators
 */
const INSTRUCTION_DISCRIMINATORS = {
  // Identity Registry
  initializeRegistry: Buffer.from([0x9a, 0x1c, 0x7f, 0x3d, 0x2e, 0x5b, 0x8a, 0x4c]),
  registerAgent: Buffer.from([0x1f, 0x3e, 0x5d, 0x7c, 0x9b, 0xba, 0xd9, 0xf8]),
  setAgentUri: Buffer.from([0x2e, 0x4d, 0x6c, 0x8b, 0xaa, 0xc9, 0xe8, 0x07]),
  setMetadata: Buffer.from([0x3d, 0x5c, 0x7b, 0x9a, 0xb9, 0xd8, 0xf7, 0x16]),
  transferAgent: Buffer.from([0x4c, 0x6b, 0x8a, 0xa9, 0xc8, 0xe7, 0x06, 0x25]),
  syncOwner: Buffer.from([0x5b, 0x7a, 0x99, 0xb8, 0xd7, 0xf6, 0x15, 0x34]),

  // Reputation Registry
  giveFeedback: Buffer.from([0x6a, 0x89, 0xa8, 0xc7, 0xe6, 0x05, 0x24, 0x43]),
  revokeFeedback: Buffer.from([0x79, 0x98, 0xb7, 0xd6, 0xf5, 0x14, 0x33, 0x52]),
  appendResponse: Buffer.from([0x88, 0xa7, 0xc6, 0xe5, 0x04, 0x23, 0x42, 0x61]),

  // Validation Registry
  initializeValidation: Buffer.from([0x97, 0xb6, 0xd5, 0xf4, 0x13, 0x32, 0x51, 0x70]),
  requestValidation: Buffer.from([0xa6, 0xc5, 0xe4, 0x03, 0x22, 0x41, 0x60, 0x7f]),
  respondToValidation: Buffer.from([0xb5, 0xd4, 0xf3, 0x12, 0x31, 0x50, 0x6f, 0x8e]),
};

/**
 * Instruction builder for Identity Registry
 */
export class IdentityInstructionBuilder {
  private programId: PublicKey;

  constructor(cluster: Cluster) {
    const programIds = getProgramIds();
    this.programId = programIds.identityRegistry;
  }

  /**
   * Build registerAgent instruction
   * @param config - Registry config PDA
   * @param authority - Authority from config
   * @param agent - Agent account PDA
   * @param agentMint - Agent NFT mint (signer)
   * @param agentMetadata - Agent metadata PDA
   * @param agentMasterEdition - Agent master edition PDA
   * @param tokenAccount - Associated token account
   * @param collectionMint - Collection mint from config
   * @param collectionMetadata - Collection metadata PDA
   * @param collectionMasterEdition - Collection master edition PDA
   * @param owner - Owner/payer (signer)
   * @param tokenUri - Optional token URI
   */
  buildRegisterAgent(
    config: PublicKey,
    authority: PublicKey,
    agent: PublicKey,
    agentMint: PublicKey,
    agentMetadata: PublicKey,
    agentMasterEdition: PublicKey,
    tokenAccount: PublicKey,
    collectionMint: PublicKey,
    collectionMetadata: PublicKey,
    collectionMasterEdition: PublicKey,
    owner: PublicKey,
    tokenUri?: string
  ): TransactionInstruction {
    // Serialize instruction data
    const data = Buffer.concat([
      INSTRUCTION_DISCRIMINATORS.registerAgent,
      this.serializeString(tokenUri || ''),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: false, isWritable: false },
        { pubkey: agent, isSigner: false, isWritable: true },
        { pubkey: agentMint, isSigner: true, isWritable: true },
        { pubkey: agentMetadata, isSigner: false, isWritable: true },
        { pubkey: agentMasterEdition, isSigner: false, isWritable: true },
        { pubkey: tokenAccount, isSigner: false, isWritable: true },
        { pubkey: collectionMint, isSigner: false, isWritable: false },
        { pubkey: collectionMetadata, isSigner: false, isWritable: true },
        { pubkey: collectionMasterEdition, isSigner: false, isWritable: false },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build setAgentUri instruction
   * @param owner - Agent owner (signer)
   * @param agent - Agent account PDA
   * @param agentMint - Agent NFT mint
   * @param newUri - New URI to set
   */
  buildSetAgentUri(
    owner: PublicKey,
    agent: PublicKey,
    agentMint: PublicKey,
    newUri: string
  ): TransactionInstruction {
    const data = Buffer.concat([
      INSTRUCTION_DISCRIMINATORS.setAgentUri,
      this.serializeString(newUri),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: owner, isSigner: true, isWritable: false },
        { pubkey: agent, isSigner: false, isWritable: true },
        { pubkey: agentMint, isSigner: false, isWritable: false },
        // Add Metaplex accounts
      ],
      data,
    });
  }

  /**
   * Build setMetadata instruction
   * @param owner - Agent owner (signer)
   * @param agent - Agent account PDA
   * @param metadataEntry - Metadata entry PDA
   * @param key - Metadata key (bytes32)
   * @param value - Metadata value (string)
   */
  buildSetMetadata(
    owner: PublicKey,
    agent: PublicKey,
    metadataEntry: PublicKey,
    key: Buffer,
    value: string
  ): TransactionInstruction {
    const data = Buffer.concat([
      INSTRUCTION_DISCRIMINATORS.setMetadata,
      key, // 32 bytes
      this.serializeString(value),
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: agent, isSigner: false, isWritable: false },
        { pubkey: metadataEntry, isSigner: false, isWritable: true },
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
}

/**
 * Instruction builder for Reputation Registry
 */
export class ReputationInstructionBuilder {
  private programId: PublicKey;

  constructor(cluster: Cluster) {
    const programIds = getProgramIds();
    this.programId = programIds.reputationRegistry;
  }

  /**
   * Build giveFeedback instruction
   * @param client - Client giving feedback (signer)
   * @param agent - Agent account (from identity registry)
   * @param feedback - Feedback account PDA
   * @param clientIndex - Client index PDA
   * @param agentReputation - Agent reputation PDA
   * @param score - Score 0-100
   * @param performanceTags - Performance tags (bytes32)
   * @param functionalityTags - Functionality tags (bytes32)
   * @param fileUri - IPFS/Arweave URI
   * @param fileHash - File hash (bytes32)
   */
  buildGiveFeedback(
    client: PublicKey,
    agent: PublicKey,
    feedback: PublicKey,
    clientIndex: PublicKey,
    agentReputation: PublicKey,
    score: number,
    performanceTags: Buffer,
    functionalityTags: Buffer,
    fileUri: string,
    fileHash: Buffer
  ): TransactionInstruction {
    const data = Buffer.concat([
      INSTRUCTION_DISCRIMINATORS.giveFeedback,
      Buffer.from([score]), // u8
      performanceTags, // 32 bytes
      functionalityTags, // 32 bytes
      this.serializeString(fileUri),
      fileHash, // 32 bytes
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: client, isSigner: true, isWritable: true },
        { pubkey: agent, isSigner: false, isWritable: false },
        { pubkey: feedback, isSigner: false, isWritable: true },
        { pubkey: clientIndex, isSigner: false, isWritable: true },
        { pubkey: agentReputation, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build revokeFeedback instruction
   * @param client - Client who gave feedback (signer)
   * @param feedback - Feedback account PDA
   * @param agentReputation - Agent reputation PDA
   */
  buildRevokeFeedback(
    client: PublicKey,
    feedback: PublicKey,
    agentReputation: PublicKey
  ): TransactionInstruction {
    const data = INSTRUCTION_DISCRIMINATORS.revokeFeedback;

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: client, isSigner: true, isWritable: false },
        { pubkey: feedback, isSigner: false, isWritable: true },
        { pubkey: agentReputation, isSigner: false, isWritable: true },
      ],
      data,
    });
  }

  /**
   * Build appendResponse instruction
   * @param responder - Responder (signer)
   * @param feedback - Feedback account PDA
   * @param response - Response account PDA
   * @param responseIndex - Response index PDA
   * @param responseUri - Response URI
   * @param responseHash - Response hash (bytes32)
   */
  buildAppendResponse(
    responder: PublicKey,
    feedback: PublicKey,
    response: PublicKey,
    responseIndex: PublicKey,
    responseUri: string,
    responseHash: Buffer
  ): TransactionInstruction {
    const data = Buffer.concat([
      INSTRUCTION_DISCRIMINATORS.appendResponse,
      this.serializeString(responseUri),
      responseHash, // 32 bytes
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: responder, isSigner: true, isWritable: true },
        { pubkey: feedback, isSigner: false, isWritable: false },
        { pubkey: response, isSigner: false, isWritable: true },
        { pubkey: responseIndex, isSigner: false, isWritable: true },
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
}

/**
 * Instruction builder for Validation Registry
 */
export class ValidationInstructionBuilder {
  private programId: PublicKey;

  constructor(cluster: Cluster) {
    const programIds = getProgramIds();
    this.programId = programIds.validationRegistry;
  }

  /**
   * Build requestValidation instruction
   * @param requester - Requester (signer)
   * @param agent - Agent account
   * @param validationRequest - Validation request PDA
   * @param validator - Validator public key
   * @param requestHash - Request hash (bytes32)
   */
  buildRequestValidation(
    requester: PublicKey,
    agent: PublicKey,
    validationRequest: PublicKey,
    validator: PublicKey,
    requestHash: Buffer
  ): TransactionInstruction {
    const data = Buffer.concat([
      INSTRUCTION_DISCRIMINATORS.requestValidation,
      requestHash, // 32 bytes
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: requester, isSigner: true, isWritable: true },
        { pubkey: agent, isSigner: false, isWritable: false },
        { pubkey: validationRequest, isSigner: false, isWritable: true },
        { pubkey: validator, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build respondToValidation instruction
   * @param validator - Validator (signer)
   * @param validationRequest - Validation request PDA
   * @param response - Response value (0=rejected, 1=approved)
   * @param responseHash - Response hash (bytes32)
   */
  buildRespondToValidation(
    validator: PublicKey,
    validationRequest: PublicKey,
    response: number,
    responseHash: Buffer
  ): TransactionInstruction {
    const data = Buffer.concat([
      INSTRUCTION_DISCRIMINATORS.respondToValidation,
      Buffer.from([response]), // u8
      responseHash, // 32 bytes
    ]);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: validator, isSigner: true, isWritable: false },
        { pubkey: validationRequest, isSigner: false, isWritable: true },
      ],
      data,
    });
  }
}
