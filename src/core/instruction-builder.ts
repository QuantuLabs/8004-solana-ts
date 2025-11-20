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
import {
  IDENTITY_DISCRIMINATORS,
  REPUTATION_DISCRIMINATORS,
  VALIDATION_DISCRIMINATORS,
} from './instruction-discriminators.js';

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
      IDENTITY_DISCRIMINATORS.register,
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
      IDENTITY_DISCRIMINATORS.setAgentUri,
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
      IDENTITY_DISCRIMINATORS.setMetadata,
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
      REPUTATION_DISCRIMINATORS.giveFeedback,
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
    const data = REPUTATION_DISCRIMINATORS.revokeFeedback;

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
      REPUTATION_DISCRIMINATORS.appendResponse,
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
      VALIDATION_DISCRIMINATORS.requestValidation,
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
      VALIDATION_DISCRIMINATORS.respondToValidation,
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
