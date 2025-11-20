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
  ComputeBudgetProgram,
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
   * @param metadata - Optional metadata entries (key-value pairs)
   * @returns Transaction result with agent ID, agentMint, and all signatures
   */
  async registerAgent(
    tokenUri?: string,
    metadata?: Array<{ key: string; value: string }>
  ): Promise<TransactionResult & { agentId?: bigint; agentMint?: PublicKey; signatures?: string[] }> {
    try {
      // Fetch registry config from on-chain
      const configData = await fetchRegistryConfig(this.connection);
      if (!configData) {
        throw new Error('Registry not initialized. Please initialize the registry first.');
      }

      // Get the real next agent ID from config (ensure it's a BigInt)
      const agentId = BigInt(configData.next_agent_id);

      // Generate new mint for agent NFT
      const agentMint = Keypair.generate();

      // Derive PDAs
      const [configPda] = await PDAHelpers.getRegistryConfigPDA();
      const [agentPda] = await PDAHelpers.getAgentPDA(agentMint.publicKey);

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

      // Split metadata: first 10 inline, rest in extensions
      const inlineMetadata = metadata && metadata.length > 10
        ? metadata.slice(0, 10)
        : metadata;
      const extendedMetadata = metadata && metadata.length > 10
        ? metadata.slice(10)
        : [];

      // Build register instruction with inline metadata only (max 10)
      const registerInstruction = this.instructionBuilder.buildRegisterAgent(
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
        tokenUri,
        inlineMetadata
      );

      // Create transaction with increased compute budget
      // Note: We allocate 400K CUs but only pay for what's actually consumed
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000, // Increase from default 200K to 400K
      });

      const registerTransaction = new Transaction()
        .add(computeBudgetIx)  // Add compute budget first
        .add(registerInstruction);      // Then add the actual instruction

      // Send register transaction with retry
      const registerSignature = await this.sendWithRetry(
        registerTransaction,
        [this.payer, agentMint]
      );

      const allSignatures = [registerSignature];

      // If we have extended metadata, create additional transactions
      if (extendedMetadata.length > 0) {
        console.log(`Creating ${extendedMetadata.length} metadata extensions...`);

        // Calculate optimal batching based on actual metadata sizes
        const batchSize = this.calculateOptimalBatch(extendedMetadata);
        console.log(`Batch size: ${batchSize} instructions per transaction`);

        // Split into batches
        for (let i = 0; i < extendedMetadata.length; i += batchSize) {
          const batch = extendedMetadata.slice(i, Math.min(i + batchSize, extendedMetadata.length));
          const batchIndex = Math.floor(i / batchSize);

          console.log(`Processing batch ${batchIndex + 1} with ${batch.length} metadata entries...`);

          // Create transaction for this batch
          const extTx = new Transaction().add(computeBudgetIx);

          for (let j = 0; j < batch.length; j++) {
            const extensionIndex = i + j; // Global extension index
            const { key, value } = batch[j];

            const [metadataExtension] = await PDAHelpers.getMetadataExtensionPDA(
              agentMint.publicKey,
              extensionIndex
            );

            const extInstruction = this.instructionBuilder.buildSetMetadataExtended(
              this.payer.publicKey,
              agentPda,
              agentMint.publicKey,
              metadataExtension,
              extensionIndex,
              key,
              value
            );

            extTx.add(extInstruction);
          }

          // Send batch transaction with retry
          const batchSignature = await this.sendWithRetry(extTx, [this.payer]);
          allSignatures.push(batchSignature);

          console.log(`Batch ${batchIndex + 1} completed: ${batchSignature}`);
        }

        console.log(`All metadata extensions created successfully.`);
      }

      return {
        signature: allSignatures[0], // First signature for backward compatibility
        signatures: allSignatures,   // All signatures
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
   * Set metadata for agent (inline storage)
   * @param agentId - Agent ID
   * @param key - Metadata key
   * @param value - Metadata value
   */
  async setMetadata(agentId: bigint, key: string, value: string): Promise<TransactionResult> {
    try {
      // Need to resolve agentId -> agentMint first
      // This is similar to setAgentUri, but we don't have the mint yet
      // For now, this will work for agents we've just created
      // TODO: In a full implementation, we'd need to fetch the agent account
      // to get the mint, or use the AgentMintResolver

      throw new Error('setMetadata() requires agentMint. Use setMetadataByMint() or fetch agent first.');
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
   * @param agentMint - Agent mint public key
   * @param key - Metadata key
   * @param value - Metadata value
   */
  async setMetadataByMint(
    agentMint: PublicKey,
    key: string,
    value: string
  ): Promise<TransactionResult> {
    try {
      const [agent] = await PDAHelpers.getAgentPDA(agentMint);

      const instruction = this.instructionBuilder.buildSetMetadata(
        this.payer.publicKey,
        agent,
        agentMint,
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
   * @param agentMint - Agent mint public key
   * @param extensionIndex - Extension index (0-255)
   * @param key - Metadata key
   * @param value - Metadata value
   */
  async setMetadataExtendedByMint(
    agentMint: PublicKey,
    extensionIndex: number,
    key: string,
    value: string
  ): Promise<TransactionResult> {
    try {
      const [agent] = await PDAHelpers.getAgentPDA(agentMint);
      const [metadataExtension] = await PDAHelpers.getMetadataExtensionPDA(
        agentMint,
        extensionIndex
      );

      const instruction = this.instructionBuilder.buildSetMetadataExtended(
        this.payer.publicKey,
        agent,
        agentMint,
        metadataExtension,
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
   * Private helper: Estimate size of a setMetadataExtended instruction
   */
  private estimateInstructionSize(key: string, value: string): number {
    // Discriminator: 8 bytes
    // extension_index: 1 byte
    // key serialization: 4 (length) + key.length
    // value serialization: 4 (length) + value.length
    // Accounts metadata: ~60 bytes (5 accounts × ~12 bytes each)
    return 8 + 1 + 4 + key.length + 4 + value.length + 60;
  }

  /**
   * Private helper: Calculate optimal batch size for metadata extensions
   */
  private calculateOptimalBatch(
    metadataEntries: Array<{ key: string; value: string }>
  ): number {
    const MAX_TX_SIZE = 1232; // Solana transaction MTU
    const TX_OVERHEAD = 200; // Signatures + base overhead

    let batchSize = 0;
    let currentSize = TX_OVERHEAD;

    for (const entry of metadataEntries) {
      const ixSize = this.estimateInstructionSize(entry.key, entry.value);
      if (currentSize + ixSize > MAX_TX_SIZE) {
        break;
      }
      currentSize += ixSize;
      batchSize++;
    }

    return Math.max(1, batchSize); // At least 1 instruction per batch
  }

  /**
   * Private helper: Send transaction with retry logic
   */
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
          // Exponential backoff: 1s, 2s, 4s
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
