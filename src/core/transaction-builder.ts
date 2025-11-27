/**
 * Transaction builder for ERC-8004 Solana programs
 * Handles transaction creation, signing, and sending without Anchor
 * Updated to match 8004-solana program interfaces
 */

import {
  PublicKey,
  Transaction,
  Connection,
  Keypair,
  sendAndConfirmTransaction,
  TransactionSignature,
  Signer,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PDAHelpers, IDENTITY_PROGRAM_ID } from './pda-helpers.js';
import {
  IdentityInstructionBuilder,
  ReputationInstructionBuilder,
  ValidationInstructionBuilder,
} from './instruction-builder.js';
import { fetchRegistryConfig } from './config-reader.js';
import { getMetadataPDA, getMasterEditionPDA, getCollectionAuthorityPDA } from './metaplex-helpers.js';
import type { Cluster } from './client.js';
import { ClientIndexAccount, AgentAccount } from './borsh-schemas.js';

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
   * @param agentUri - Optional agent URI
   * @param metadata - Optional metadata entries (key-value pairs)
   * @returns Transaction result with agent ID, agentMint, and all signatures
   */
  async registerAgent(
    agentUri?: string,
    metadata?: Array<{ key: string; value: string }>
  ): Promise<TransactionResult & { agentId?: bigint; agentMint?: PublicKey; signatures?: string[] }> {
    try {
      // Fetch registry config from on-chain
      const configData = await fetchRegistryConfig(this.connection);
      if (!configData) {
        throw new Error('Registry not initialized. Please initialize the registry first.');
      }

      // Get the real next agent ID from config
      const agentId = BigInt(configData.next_agent_id);

      // Generate new mint for agent NFT
      const agentMint = Keypair.generate();

      // Derive PDAs
      const [configPda] = await PDAHelpers.getRegistryConfigPDA();
      const [agentPda] = await PDAHelpers.getAgentPDA(agentMint.publicKey);

      // Get collection authority PDA - needed for signing collection verification
      const collectionAuthorityPda = getCollectionAuthorityPDA(IDENTITY_PROGRAM_ID);

      // Get collection mint from config
      const collectionMint = configData.getCollectionMintPublicKey();

      // Calculate Metaplex PDAs
      const agentMetadata = getMetadataPDA(agentMint.publicKey);
      const agentMasterEdition = getMasterEditionPDA(agentMint.publicKey);
      const collectionMetadata = getMetadataPDA(collectionMint);
      const collectionMasterEdition = getMasterEditionPDA(collectionMint);

      // Calculate Associated Token Account
      const agentTokenAccount = getAssociatedTokenAddressSync(
        agentMint.publicKey,
        this.payer.publicKey
      );

      // Split metadata: first 1 inline (MAX_METADATA_ENTRIES=1), rest in extensions
      const inlineMetadata = metadata && metadata.length > 1
        ? metadata.slice(0, 1)
        : metadata;
      const extendedMetadata = metadata && metadata.length > 1
        ? metadata.slice(1)
        : [];

      // Build register instruction - choose based on metadata presence
      const registerInstruction = inlineMetadata && inlineMetadata.length > 0
        ? this.instructionBuilder.buildRegisterWithMetadata(
            configPda,
            collectionAuthorityPda,
            agentPda,
            agentMint.publicKey,
            agentMetadata,
            agentMasterEdition,
            agentTokenAccount,
            collectionMint,
            collectionMetadata,
            collectionMasterEdition,
            this.payer.publicKey,
            agentUri || '',
            inlineMetadata
          )
        : this.instructionBuilder.buildRegister(
            configPda,
            collectionAuthorityPda,
            agentPda,
            agentMint.publicKey,
            agentMetadata,
            agentMasterEdition,
            agentTokenAccount,
            collectionMint,
            collectionMetadata,
            collectionMasterEdition,
            this.payer.publicKey,
            agentUri || ''
          );

      // Create transaction with increased compute budget
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000,
      });

      const registerTransaction = new Transaction()
        .add(computeBudgetIx)
        .add(registerInstruction);

      // Send register transaction with retry
      const registerSignature = await this.sendWithRetry(
        registerTransaction,
        [this.payer, agentMint]
      );

      const allSignatures = [registerSignature];

      // If we have extended metadata, create additional transactions
      if (extendedMetadata.length > 0) {
        console.log(`Creating ${extendedMetadata.length} metadata extensions...`);

        const batchSize = this.calculateOptimalBatch(extendedMetadata);
        console.log(`Batch size: ${batchSize} instructions per transaction`);

        for (let i = 0; i < extendedMetadata.length; i += batchSize) {
          const batch = extendedMetadata.slice(i, Math.min(i + batchSize, extendedMetadata.length));
          const batchIndex = Math.floor(i / batchSize);

          console.log(`Processing batch ${batchIndex + 1} with ${batch.length} metadata entries...`);

          const extTx = new Transaction().add(computeBudgetIx);

          for (let j = 0; j < batch.length; j++) {
            const extensionIndex = i + j;
            const { key, value } = batch[j];

            const [metadataExtension] = await PDAHelpers.getMetadataExtensionPDA(
              agentMint.publicKey,
              extensionIndex
            );

            // First create the extension PDA if needed
            const createExtIx = this.instructionBuilder.buildCreateMetadataExtension(
              metadataExtension,
              agentMint.publicKey,
              agentPda,
              this.payer.publicKey,
              extensionIndex
            );
            extTx.add(createExtIx);

            // Then set the metadata
            const setExtIx = this.instructionBuilder.buildSetMetadataExtended(
              metadataExtension,
              agentMint.publicKey,
              agentPda,
              this.payer.publicKey,
              extensionIndex,
              key,
              value
            );
            extTx.add(setExtIx);
          }

          const batchSignature = await this.sendWithRetry(extTx, [this.payer]);
          allSignatures.push(batchSignature);

          console.log(`Batch ${batchIndex + 1} completed: ${batchSignature}`);
        }

        console.log(`All metadata extensions created successfully.`);
      }

      return {
        signature: allSignatures[0],
        signatures: allSignatures,
        success: true,
        agentId,
        agentMint: agentMint.publicKey,
      };
    } catch (error) {
      console.error('registerAgent error:', error);
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        agentId: undefined,
        agentMint: undefined,
      };
    }
  }

  /**
   * Set agent URI by mint
   */
  async setAgentUri(agentMint: PublicKey, newUri: string): Promise<TransactionResult> {
    try {
      const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
      const agentMetadata = getMetadataPDA(agentMint);

      const instruction = this.instructionBuilder.buildSetAgentUri(
        agentPda,
        agentMetadata,
        agentMint,
        this.payer.publicKey,
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
   * Set metadata for agent by mint (inline storage)
   */
  async setMetadataByMint(
    agentMint: PublicKey,
    key: string,
    value: string
  ): Promise<TransactionResult> {
    try {
      const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);

      const instruction = this.instructionBuilder.buildSetMetadata(
        agentPda,
        this.payer.publicKey,
        key,
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

  /**
   * Set metadata extended for agent by mint (extension PDA storage)
   */
  async setMetadataExtendedByMint(
    agentMint: PublicKey,
    extensionIndex: number,
    key: string,
    value: string
  ): Promise<TransactionResult> {
    try {
      const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
      const [metadataExtension] = await PDAHelpers.getMetadataExtensionPDA(
        agentMint,
        extensionIndex
      );

      const instruction = this.instructionBuilder.buildSetMetadataExtended(
        metadataExtension,
        agentMint,
        agentPda,
        this.payer.publicKey,
        extensionIndex,
        key,
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

  /**
   * Transfer agent to another owner
   */
  async transferAgent(
    agentMint: PublicKey,
    toOwner: PublicKey
  ): Promise<TransactionResult> {
    try {
      const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
      const agentMetadata = getMetadataPDA(agentMint);

      const fromTokenAccount = getAssociatedTokenAddressSync(
        agentMint,
        this.payer.publicKey
      );
      const toTokenAccount = getAssociatedTokenAddressSync(
        agentMint,
        toOwner
      );

      const instruction = this.instructionBuilder.buildTransferAgent(
        agentPda,
        fromTokenAccount,
        toTokenAccount,
        agentMint,
        agentMetadata,
        this.payer.publicKey
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

  private estimateInstructionSize(key: string, value: string): number {
    return 8 + 1 + 4 + key.length + 4 + value.length + 60;
  }

  private calculateOptimalBatch(
    metadataEntries: Array<{ key: string; value: string }>
  ): number {
    const MAX_TX_SIZE = 1232;
    const TX_OVERHEAD = 200;

    let batchSize = 0;
    let currentSize = TX_OVERHEAD;

    for (const entry of metadataEntries) {
      const ixSize = this.estimateInstructionSize(entry.key, entry.value) * 2; // x2 for create + set
      if (currentSize + ixSize > MAX_TX_SIZE) {
        break;
      }
      currentSize += ixSize;
      batchSize++;
    }

    return Math.max(1, batchSize);
  }

  private async sendWithRetry(
    transaction: Transaction,
    signers: Signer[],
    maxRetries: number = 3
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          signers
        );
        return signature;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Transaction attempt ${attempt}/${maxRetries} failed:`, lastError.message);

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Transaction failed after retries');
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
   * @param agentMint - Agent NFT mint
   * @param agentId - Agent ID
   * @param score - Score 0-100
   * @param tag1 - Tag 1 (max 32 bytes)
   * @param tag2 - Tag 2 (max 32 bytes)
   * @param fileUri - IPFS/Arweave URI
   * @param fileHash - File hash (32 bytes)
   */
  async giveFeedback(
    agentMint: PublicKey,
    agentId: bigint,
    score: number,
    tag1: string,
    tag2: string,
    fileUri: string,
    fileHash: Buffer
  ): Promise<TransactionResult & { feedbackIndex?: bigint }> {
    try {
      // Validate inputs
      if (score < 0 || score > 100) {
        throw new Error('Score must be between 0 and 100');
      }
      if (tag1.length > 32) {
        throw new Error('tag1 must be <= 32 bytes');
      }
      if (tag2.length > 32) {
        throw new Error('tag2 must be <= 32 bytes');
      }
      if (fileUri.length > 200) {
        throw new Error('fileUri must be <= 200 bytes');
      }
      if (fileHash.length !== 32) {
        throw new Error('fileHash must be 32 bytes');
      }

      // Derive PDAs
      const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
      const [clientIndex] = await PDAHelpers.getClientIndexPDA(agentId, this.payer.publicKey);
      const [agentReputation] = await PDAHelpers.getAgentReputationPDA(agentId);

      // Fetch current feedback index from client_index account (or 0 if doesn't exist)
      let feedbackIndex = BigInt(0);
      const clientIndexInfo = await this.connection.getAccountInfo(clientIndex);
      if (clientIndexInfo) {
        const clientIndexData = ClientIndexAccount.deserialize(clientIndexInfo.data);
        feedbackIndex = clientIndexData.last_index;
      }

      // Derive feedback PDA
      const [feedbackPda] = await PDAHelpers.getFeedbackPDA(
        agentId,
        this.payer.publicKey,
        feedbackIndex
      );

      const instruction = this.instructionBuilder.buildGiveFeedback(
        this.payer.publicKey,       // client
        this.payer.publicKey,       // payer
        agentMint,                   // agent_mint
        agentPda,                    // agent_account
        clientIndex,                 // client_index
        feedbackPda,                 // feedback_account
        agentReputation,             // agent_reputation
        IDENTITY_PROGRAM_ID,         // identity_registry_program
        agentId,
        score,
        tag1,
        tag2,
        fileUri,
        fileHash,
        feedbackIndex
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
   */
  async revokeFeedback(
    agentId: bigint,
    feedbackIndex: bigint
  ): Promise<TransactionResult> {
    try {
      const [feedbackPda] = await PDAHelpers.getFeedbackPDA(
        agentId,
        this.payer.publicKey,
        feedbackIndex
      );
      const [agentReputation] = await PDAHelpers.getAgentReputationPDA(agentId);

      const instruction = this.instructionBuilder.buildRevokeFeedback(
        this.payer.publicKey,
        feedbackPda,
        agentReputation,
        agentId,
        feedbackIndex
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
   */
  async appendResponse(
    agentId: bigint,
    clientAddress: PublicKey,
    feedbackIndex: bigint,
    responseUri: string,
    responseHash: Buffer
  ): Promise<TransactionResult & { responseIndex?: bigint }> {
    try {
      if (responseUri.length > 200) {
        throw new Error('responseUri must be <= 200 bytes');
      }
      if (responseHash.length !== 32) {
        throw new Error('responseHash must be 32 bytes');
      }

      // Derive PDAs
      const [feedbackPda] = await PDAHelpers.getFeedbackPDA(agentId, clientAddress, feedbackIndex);
      const [responseIndexPda] = await PDAHelpers.getResponseIndexPDA(agentId, clientAddress, feedbackIndex);

      // Fetch current response index
      let responseIndexValue = BigInt(0);
      const responseIndexInfo = await this.connection.getAccountInfo(responseIndexPda);
      if (responseIndexInfo) {
        // Parse the account - simplified, assumes next_index is at offset 8+8+32+8 = 56
        const data = responseIndexInfo.data.slice(8); // Skip discriminator
        responseIndexValue = data.readBigUInt64LE(8 + 32 + 8); // After agent_id + client + feedback_index
      }

      const [responsePda] = await PDAHelpers.getResponsePDA(
        agentId,
        clientAddress,
        feedbackIndex,
        responseIndexValue
      );

      const instruction = this.instructionBuilder.buildAppendResponse(
        this.payer.publicKey,       // responder
        this.payer.publicKey,       // payer
        feedbackPda,
        responseIndexPda,
        responsePda,
        agentId,
        clientAddress,
        feedbackIndex,
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
   * Request validation for an agent
   */
  async requestValidation(
    agentMint: PublicKey,
    agentId: bigint,
    validatorAddress: PublicKey,
    nonce: number,
    requestUri: string,
    requestHash: Buffer
  ): Promise<TransactionResult> {
    try {
      if (requestUri.length > 200) {
        throw new Error('requestUri must be <= 200 bytes');
      }
      if (requestHash.length !== 32) {
        throw new Error('requestHash must be 32 bytes');
      }

      // Derive PDAs
      const [configPda] = await PDAHelpers.getValidationConfigPDA();
      const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
      const [validationRequestPda] = await PDAHelpers.getValidationRequestPDA(
        agentId,
        validatorAddress,
        nonce
      );

      const instruction = this.instructionBuilder.buildRequestValidation(
        configPda,
        this.payer.publicKey,       // requester (must be agent owner)
        this.payer.publicKey,       // payer
        agentMint,
        agentPda,
        validationRequestPda,
        IDENTITY_PROGRAM_ID,
        agentId,
        validatorAddress,
        nonce,
        requestUri,
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
   */
  async respondToValidation(
    agentId: bigint,
    nonce: number,
    response: number,
    responseUri: string,
    responseHash: Buffer,
    tag: string
  ): Promise<TransactionResult> {
    try {
      if (response < 0 || response > 100) {
        throw new Error('Response must be between 0 and 100');
      }
      if (responseUri.length > 200) {
        throw new Error('responseUri must be <= 200 bytes');
      }
      if (responseHash.length !== 32) {
        throw new Error('responseHash must be 32 bytes');
      }
      if (tag.length > 32) {
        throw new Error('tag must be <= 32 bytes');
      }

      const [configPda] = await PDAHelpers.getValidationConfigPDA();
      const [validationRequestPda] = await PDAHelpers.getValidationRequestPDA(
        agentId,
        this.payer.publicKey, // validator
        nonce
      );

      const instruction = this.instructionBuilder.buildRespondToValidation(
        configPda,
        this.payer.publicKey,
        validationRequestPda,
        response,
        responseUri,
        responseHash,
        tag
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
   * Update validation (same as respond but semantically for updates)
   */
  async updateValidation(
    agentId: bigint,
    nonce: number,
    response: number,
    responseUri: string,
    responseHash: Buffer,
    tag: string
  ): Promise<TransactionResult> {
    try {
      if (response < 0 || response > 100) {
        throw new Error('Response must be between 0 and 100');
      }

      const [configPda] = await PDAHelpers.getValidationConfigPDA();
      const [validationRequestPda] = await PDAHelpers.getValidationRequestPDA(
        agentId,
        this.payer.publicKey,
        nonce
      );

      const instruction = this.instructionBuilder.buildUpdateValidation(
        configPda,
        this.payer.publicKey,
        validationRequestPda,
        response,
        responseUri,
        responseHash,
        tag
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
   * Close validation request to recover rent
   */
  async closeValidation(
    agentMint: PublicKey,
    agentId: bigint,
    validatorAddress: PublicKey,
    nonce: number,
    rentReceiver?: PublicKey
  ): Promise<TransactionResult> {
    try {
      const [configPda] = await PDAHelpers.getValidationConfigPDA();
      const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
      const [validationRequestPda] = await PDAHelpers.getValidationRequestPDA(
        agentId,
        validatorAddress,
        nonce
      );

      const instruction = this.instructionBuilder.buildCloseValidation(
        configPda,
        this.payer.publicKey,
        agentMint,
        agentPda,
        validationRequestPda,
        IDENTITY_PROGRAM_ID,
        rentReceiver || this.payer.publicKey
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
