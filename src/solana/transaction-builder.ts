/**
 * Transaction builder for ERC-8004 Solana programs
 * Handles transaction creation, signing, and sending without Anchor
 */

import {
  PublicKey,
  Transaction,
  Connection,
  Keypair,
  sendAndConfirmTransaction,
  TransactionSignature,
  Signer,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PDAHelpers } from './pda-helpers.js';
import {
  IdentityInstructionBuilder,
  ReputationInstructionBuilder,
  ValidationInstructionBuilder,
} from './instruction-builder.js';
import { fetchRegistryConfig } from './config-reader.js';
import { getMetadataPDA, getMasterEditionPDA } from './metaplex-helpers.js';
import type { Cluster } from './client.js';
import { stringToBytes32 } from './pda-helpers.js';

export interface TransactionResult {
  signature: TransactionSignature;
  success: boolean;
  error?: string;
}

/**
 * Transaction builder for Identity Registry operations
 */
export class IdentityTransactionBuilder {
  private instructionBuilder: IdentityInstructionBuilder;

  constructor(
    private connection: Connection,
    private cluster: Cluster,
    private payer: Keypair
  ) {
    this.instructionBuilder = new IdentityInstructionBuilder(cluster);
  }

  /**
   * Register a new agent
   * @param tokenUri - Optional token URI
   * @returns Transaction result with agent ID
   */
  async registerAgent(tokenUri?: string): Promise<TransactionResult & { agentId?: bigint }> {
    try {
      // Fetch registry config from on-chain
      const configData = await fetchRegistryConfig(this.connection);
      if (!configData) {
        throw new Error('Registry not initialized. Please initialize the registry first.');
      }

      // Get the real next agent ID from config
      const agentId = configData.next_agent_id;

      // Generate new mint for agent NFT
      const agentMint = Keypair.generate();

      // Derive PDAs
      const [configPda] = await PDAHelpers.getRegistryConfigPDA();
      const [agentPda] = await PDAHelpers.getAgentPDA(agentId);

      // Get collection mint from config
      const collectionMint = configData.getCollectionMintPublicKey();
      const authority = configData.getAuthorityPublicKey();

      // Calculate Metaplex PDAs
      const agentMetadata = getMetadataPDA(agentMint.publicKey);
      const agentMasterEdition = getMasterEditionPDA(agentMint.publicKey);
      const collectionMetadata = getMetadataPDA(collectionMint);
      const collectionMasterEdition = getMasterEditionPDA(collectionMint);

      // Calculate Associated Token Account
      const tokenAccount = getAssociatedTokenAddressSync(
        agentMint.publicKey,
        this.payer.publicKey
      );

      // Build instruction with all required accounts
      const instruction = this.instructionBuilder.buildRegisterAgent(
        configPda,
        authority,
        agentPda,
        agentMint.publicKey,
        agentMetadata,
        agentMasterEdition,
        tokenAccount,
        collectionMint,
        collectionMetadata,
        collectionMasterEdition,
        this.payer.publicKey,
        tokenUri
      );

      // Create and send transaction
      const transaction = new Transaction().add(instruction);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer, agentMint]
      );

      return {
        signature,
        success: true,
        agentId,
      };
    } catch (error) {
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        agentId: undefined,
      };
    }
  }

  /**
   * Set agent URI
   * @param agentId - Agent ID
   * @param newUri - New URI
   */
  async setAgentUri(agentId: bigint, newUri: string): Promise<TransactionResult> {
    try {
      const [agent] = await PDAHelpers.getAgentPDA(agentId);

      // Fetch agent to get mint
      const agentData = await this.connection.getAccountInfo(agent);
      if (!agentData) {
        throw new Error('Agent not found');
      }

      // Extract mint from agent account (would need proper deserialization)
      const agentMint = PublicKey.default; // Placeholder

      const instruction = this.instructionBuilder.buildSetAgentUri(
        this.payer.publicKey,
        agent,
        agentMint,
        newUri
      );

      const transaction = new Transaction().add(instruction);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer]
      );

      return { signature, success: true };
    } catch (error) {
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Set metadata for agent
   * @param agentId - Agent ID
   * @param key - Metadata key (will be converted to bytes32)
   * @param value - Metadata value
   */
  async setMetadata(agentId: bigint, key: string, value: string): Promise<TransactionResult> {
    try {
      const [agent] = await PDAHelpers.getAgentPDA(agentId);
      const keyBytes = stringToBytes32(key);
      const [metadataEntry] = await PDAHelpers.getMetadataPDA(agentId, keyBytes);

      const instruction = this.instructionBuilder.buildSetMetadata(
        this.payer.publicKey,
        agent,
        metadataEntry,
        keyBytes,
        value
      );

      const transaction = new Transaction().add(instruction);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer]
      );

      return { signature, success: true };
    } catch (error) {
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Transaction builder for Reputation Registry operations
 */
export class ReputationTransactionBuilder {
  private instructionBuilder: ReputationInstructionBuilder;

  constructor(
    private connection: Connection,
    private cluster: Cluster,
    private payer: Keypair
  ) {
    this.instructionBuilder = new ReputationInstructionBuilder(cluster);
  }

  /**
   * Give feedback to an agent
   * @param agentId - Agent ID
   * @param score - Score 0-100
   * @param fileUri - IPFS/Arweave URI
   * @param fileHash - File hash
   * @param performanceTags - Performance tags (optional)
   * @param functionalityTags - Functionality tags (optional)
   */
  async giveFeedback(
    agentId: bigint,
    score: number,
    fileUri: string,
    fileHash: Buffer,
    performanceTags?: Buffer,
    functionalityTags?: Buffer
  ): Promise<TransactionResult & { feedbackIndex?: bigint }> {
    try {
      // Validate score
      if (score < 0 || score > 100) {
        throw new Error('Score must be between 0 and 100');
      }

      // Get last index for this client
      const [clientIndex] = await PDAHelpers.getClientIndexPDA(
        agentId,
        this.payer.publicKey
      );

      // Fetch current index (simplified)
      const feedbackIndex = BigInt(0); // Should fetch from clientIndex account

      // Derive PDAs
      const [agent] = await PDAHelpers.getAgentPDA(agentId);
      const [feedback] = await PDAHelpers.getFeedbackPDA(
        agentId,
        this.payer.publicKey,
        feedbackIndex
      );
      const [agentReputation] = await PDAHelpers.getAgentReputationPDA(agentId);

      const instruction = this.instructionBuilder.buildGiveFeedback(
        this.payer.publicKey,
        agent,
        feedback,
        clientIndex,
        agentReputation,
        score,
        performanceTags || Buffer.alloc(32),
        functionalityTags || Buffer.alloc(32),
        fileUri,
        fileHash
      );

      const transaction = new Transaction().add(instruction);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer]
      );

      return { signature, success: true, feedbackIndex };
    } catch (error) {
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Revoke feedback
   * @param agentId - Agent ID
   * @param feedbackIndex - Feedback index to revoke
   */
  async revokeFeedback(
    agentId: bigint,
    feedbackIndex: bigint
  ): Promise<TransactionResult> {
    try {
      const [feedback] = await PDAHelpers.getFeedbackPDA(
        agentId,
        this.payer.publicKey,
        feedbackIndex
      );
      const [agentReputation] = await PDAHelpers.getAgentReputationPDA(agentId);

      const instruction = this.instructionBuilder.buildRevokeFeedback(
        this.payer.publicKey,
        feedback,
        agentReputation
      );

      const transaction = new Transaction().add(instruction);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer]
      );

      return { signature, success: true };
    } catch (error) {
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Append response to feedback
   * @param agentId - Agent ID
   * @param client - Client who gave feedback
   * @param feedbackIndex - Feedback index
   * @param responseUri - Response URI
   * @param responseHash - Response hash
   */
  async appendResponse(
    agentId: bigint,
    client: PublicKey,
    feedbackIndex: bigint,
    responseUri: string,
    responseHash: Buffer
  ): Promise<TransactionResult & { responseIndex?: bigint }> {
    try {
      // Get response index
      const [responseIndex] = await PDAHelpers.getResponseIndexPDA(
        agentId,
        client,
        feedbackIndex
      );

      // Fetch current count (simplified)
      const responseIndexValue = BigInt(0); // Should fetch from responseIndex account

      const [feedback] = await PDAHelpers.getFeedbackPDA(agentId, client, feedbackIndex);
      const [response] = await PDAHelpers.getResponsePDA(
        agentId,
        client,
        feedbackIndex,
        responseIndexValue
      );

      const instruction = this.instructionBuilder.buildAppendResponse(
        this.payer.publicKey,
        feedback,
        response,
        responseIndex,
        responseUri,
        responseHash
      );

      const transaction = new Transaction().add(instruction);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer]
      );

      return { signature, success: true, responseIndex: responseIndexValue };
    } catch (error) {
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Transaction builder for Validation Registry operations
 */
export class ValidationTransactionBuilder {
  private instructionBuilder: ValidationInstructionBuilder;

  constructor(
    private connection: Connection,
    private cluster: Cluster,
    private payer: Keypair
  ) {
    this.instructionBuilder = new ValidationInstructionBuilder(cluster);
  }

  /**
   * Request validation
   * @param agentId - Agent ID
   * @param validator - Validator public key
   * @param requestHash - Request hash
   */
  async requestValidation(
    agentId: bigint,
    validator: PublicKey,
    requestHash: Buffer
  ): Promise<TransactionResult> {
    try {
      const [agent] = await PDAHelpers.getAgentPDA(agentId);

      // Get nonce (simplified - should track per validator)
      const nonce = 0;

      const [validationRequest] = await PDAHelpers.getValidationRequestPDA(
        agentId,
        validator,
        nonce
      );

      const instruction = this.instructionBuilder.buildRequestValidation(
        this.payer.publicKey,
        agent,
        validationRequest,
        validator,
        requestHash
      );

      const transaction = new Transaction().add(instruction);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer]
      );

      return { signature, success: true };
    } catch (error) {
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Respond to validation request
   * @param agentId - Agent ID
   * @param requester - Requester public key (for PDA)
   * @param nonce - Request nonce
   * @param response - Response value (0=rejected, 1=approved)
   * @param responseHash - Response hash
   */
  async respondToValidation(
    agentId: bigint,
    requester: PublicKey,
    nonce: number,
    response: number,
    responseHash: Buffer
  ): Promise<TransactionResult> {
    try {
      const [validationRequest] = await PDAHelpers.getValidationRequestPDA(
        agentId,
        this.payer.publicKey, // validator
        nonce
      );

      const instruction = this.instructionBuilder.buildRespondToValidation(
        this.payer.publicKey,
        validationRequest,
        response,
        responseHash
      );

      const transaction = new Transaction().add(instruction);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer]
      );

      return { signature, success: true };
    } catch (error) {
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
