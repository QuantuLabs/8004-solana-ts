/**
 * Transaction builder for ERC-8004 Solana programs
 * v0.2.0 - Metaplex Core architecture
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
import { PDAHelpers, PROGRAM_ID } from './pda-helpers.js';
import { createHash } from 'crypto';
import {
  IdentityInstructionBuilder,
  ReputationInstructionBuilder,
  ValidationInstructionBuilder,
} from './instruction-builder.js';
import { fetchRegistryConfig } from './config-reader.js';
import { AgentReputationAccount } from './borsh-schemas.js';
import { toBigInt } from './utils.js';

export interface TransactionResult {
  signature: TransactionSignature;
  success: boolean;
  error?: string;
}

/**
 * Options for all write methods
 * Use skipSend to get the serialized transaction instead of sending it
 */
export interface WriteOptions {
  /** If true, returns serialized transaction instead of sending */
  skipSend?: boolean;
  /** Signer public key - defaults to sdk.signer.publicKey if not provided */
  signer?: PublicKey;
}

/**
 * Extended options for registerAgent (requires assetPubkey when skipSend is true)
 */
export interface RegisterAgentOptions extends WriteOptions {
  /** Required when skipSend is true - the client generates the asset keypair locally */
  assetPubkey?: PublicKey;
}

/**
 * Result when skipSend is true - contains serialized transaction data
 */
export interface PreparedTransaction {
  /** Base64 serialized transaction */
  transaction: string;
  /** Recent blockhash used */
  blockhash: string;
  /** Block height after which transaction expires */
  lastValidBlockHeight: number;
  /** Public key (base58) of the account that must sign */
  signer: string;
}

/**
 * Serialize a transaction for later signing and sending
 * @param transaction - The transaction to serialize
 * @param signer - The public key that will sign the transaction
 * @param blockhash - Recent blockhash
 * @param lastValidBlockHeight - Block height after which transaction expires
 * @returns PreparedTransaction with base64 serialized transaction
 */
export function serializeTransaction(
  transaction: Transaction,
  signer: PublicKey,
  blockhash: string,
  lastValidBlockHeight: number
): PreparedTransaction {
  transaction.feePayer = signer;
  transaction.recentBlockhash = blockhash;

  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return {
    transaction: serialized.toString('base64'),
    blockhash,
    lastValidBlockHeight,
    signer: signer.toBase58(),
  };
}

/**
 * Transaction builder for Identity Registry operations (Metaplex Core)
 */
export class IdentityTransactionBuilder {
  private instructionBuilder: IdentityInstructionBuilder;

  constructor(
    private connection: Connection,
    private payer?: Keypair
  ) {
    this.instructionBuilder = new IdentityInstructionBuilder();
  }

  /**
   * Register a new agent (Metaplex Core)
   * @param agentUri - Optional agent URI
   * @param metadata - Optional metadata entries (key-value pairs)
   * @param options - Write options (skipSend, signer, assetPubkey)
   * @returns Transaction result with agent ID, asset, and all signatures
   */
  async registerAgent(
    agentUri?: string,
    metadata?: Array<{ key: string; value: string }>,
    options?: RegisterAgentOptions
  ): Promise<(TransactionResult & { agentId?: bigint; asset?: PublicKey; signatures?: string[] }) | (PreparedTransaction & { agentId: bigint; asset: PublicKey })> {
    try {
      // Determine the signer pubkey
      const signerPubkey = options?.signer || this.payer?.publicKey;
      if (!signerPubkey) {
        throw new Error('signer required when SDK has no signer configured');
      }

      // Fetch registry config from on-chain
      const configData = await fetchRegistryConfig(this.connection);
      if (!configData) {
        throw new Error('Registry not initialized. Please initialize the registry first.');
      }

      // Get the real next agent ID from config
      const agentId = BigInt(configData.next_agent_id);

      // Determine the asset pubkey (Metaplex Core asset)
      let assetPubkey: PublicKey;
      let assetKeypair: Keypair | undefined;

      if (options?.skipSend) {
        // In skipSend mode, client must provide assetPubkey
        if (!options.assetPubkey) {
          throw new Error('assetPubkey required when skipSend is true - client must generate keypair locally');
        }
        assetPubkey = options.assetPubkey;
      } else {
        // Normal mode: generate keypair
        if (!this.payer) {
          throw new Error('No signer configured - SDK is read-only');
        }
        assetKeypair = Keypair.generate();
        assetPubkey = assetKeypair.publicKey;
      }

      // Derive PDAs
      const [configPda] = PDAHelpers.getRegistryConfigPDA();
      const [agentPda] = PDAHelpers.getAgentPDA(assetPubkey);

      // Get collection from config
      const collection = configData.getCollectionPublicKey();

      // Build register instruction (v0.2.0: always use register, metadata via separate PDAs)
      const registerInstruction = this.instructionBuilder.buildRegister(
        configPda,
        agentPda,
        assetPubkey,
        collection,
        signerPubkey,
        agentUri || ''
      );

      // Create transaction with increased compute budget
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000,
      });

      const registerTransaction = new Transaction()
        .add(computeBudgetIx)
        .add(registerInstruction);

      // If skipSend, return serialized transaction
      if (options?.skipSend) {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        const prepared = serializeTransaction(registerTransaction, signerPubkey, blockhash, lastValidBlockHeight);

        // Note: Metadata should be set via separate setMetadata calls after registration
        if (metadata && metadata.length > 0) {
          console.warn('Metadata with skipSend: call setMetadata separately after registration');
        }

        return {
          ...prepared,
          agentId,
          asset: assetPubkey,
        };
      }

      // Normal mode: send transaction
      if (!this.payer || !assetKeypair) {
        throw new Error('No signer configured - SDK is read-only');
      }

      // Send register transaction with retry
      const registerSignature = await this.sendWithRetry(
        registerTransaction,
        [this.payer, assetKeypair]
      );

      const allSignatures = [registerSignature];

      // If we have metadata, create MetadataEntryPda accounts (v0.2.0 pattern)
      if (metadata && metadata.length > 0) {
        console.log(`Setting ${metadata.length} metadata entries...`);

        for (const { key, value } of metadata) {
          // Compute key hash for PDA derivation
          const keyHash = createHash('sha256').update(key).digest().slice(0, 8);

          // Derive metadata entry PDA
          const agentIdBuffer = Buffer.alloc(8);
          agentIdBuffer.writeBigUInt64LE(agentId);
          const [metadataEntry] = PublicKey.findProgramAddressSync(
            [Buffer.from('agent_meta'), agentIdBuffer, keyHash],
            PROGRAM_ID
          );

          const setMetadataIx = this.instructionBuilder.buildSetMetadata(
            metadataEntry,
            agentPda,
            assetPubkey,
            this.payer.publicKey,
            keyHash,
            key,
            value,
            false  // not immutable by default
          );

          const metadataTx = new Transaction().add(computeBudgetIx).add(setMetadataIx);
          const metadataSignature = await this.sendWithRetry(metadataTx, [this.payer]);
          allSignatures.push(metadataSignature);

          console.log(`Metadata '${key}' set: ${metadataSignature}`);
        }

        console.log(`All metadata entries created successfully.`);
      }

      return {
        signature: allSignatures[0],
        signatures: allSignatures,
        success: true,
        agentId,
        asset: assetPubkey,
      };
    } catch (error) {
      console.error('registerAgent error:', error);
      return {
        signature: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        agentId: undefined,
        asset: undefined,
      };
    }
  }

  /**
   * Set agent URI by asset (Metaplex Core)
   * @param asset - Agent Core asset
   * @param newUri - New URI
   * @param options - Write options (skipSend, signer)
   */
  async setAgentUri(
    asset: PublicKey,
    newUri: string,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    try {
      const signerPubkey = options?.signer || this.payer?.publicKey;
      if (!signerPubkey) {
        throw new Error('signer required when SDK has no signer configured');
      }

      // Fetch registry config for collection
      const configData = await fetchRegistryConfig(this.connection);
      if (!configData) {
        throw new Error('Registry not initialized.');
      }

      const [configPda] = PDAHelpers.getRegistryConfigPDA();
      const [agentPda] = PDAHelpers.getAgentPDA(asset);
      const collection = configData.getCollectionPublicKey();

      const instruction = this.instructionBuilder.buildSetAgentUri(
        configPda,
        agentPda,
        asset,
        collection,
        signerPubkey,
        newUri
      );

      const transaction = new Transaction().add(instruction);

      // If skipSend, return serialized transaction
      if (options?.skipSend) {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
      }

      // Normal mode: send transaction
      if (!this.payer) {
        throw new Error('No signer configured - SDK is read-only');
      }

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
   * Set metadata for agent by asset (v0.2.0 - uses MetadataEntryPda)
   * @param asset - Agent Core asset
   * @param key - Metadata key
   * @param value - Metadata value
   * @param immutable - If true, metadata cannot be modified or deleted (default: false)
   * @param options - Write options (skipSend, signer)
   */
  async setMetadata(
    asset: PublicKey,
    key: string,
    value: string,
    immutable: boolean = false,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    try {
      const signerPubkey = options?.signer || this.payer?.publicKey;
      if (!signerPubkey) {
        throw new Error('signer required when SDK has no signer configured');
      }

      const [agentPda] = PDAHelpers.getAgentPDA(asset);

      // Fetch agent account to get agent_id
      const agentData = await this.connection.getAccountInfo(agentPda);
      if (!agentData) {
        throw new Error('Agent account not found');
      }
      // Read agent_id (u64 at offset 8 after discriminator)
      const agentId = agentData.data.readBigUInt64LE(8);

      // Compute key hash (SHA256(key)[0..8])
      const keyHash = createHash('sha256').update(key).digest().slice(0, 8);

      // Derive metadata entry PDA
      const agentIdBuffer = Buffer.alloc(8);
      agentIdBuffer.writeBigUInt64LE(agentId);
      const [metadataEntry] = PublicKey.findProgramAddressSync(
        [Buffer.from('agent_meta'), agentIdBuffer, keyHash],
        PROGRAM_ID
      );

      const instruction = this.instructionBuilder.buildSetMetadata(
        metadataEntry,
        agentPda,
        asset,
        signerPubkey,
        keyHash,
        key,
        value,
        immutable
      );

      const transaction = new Transaction().add(instruction);

      // If skipSend, return serialized transaction
      if (options?.skipSend) {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
      }

      // Normal mode: send transaction
      if (!this.payer) {
        throw new Error('No signer configured - SDK is read-only');
      }

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
   * Transfer agent to another owner (Metaplex Core)
   * @param asset - Agent Core asset
   * @param toOwner - New owner public key
   * @param options - Write options (skipSend, signer)
   */
  async transferAgent(
    asset: PublicKey,
    toOwner: PublicKey,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    try {
      const signerPubkey = options?.signer || this.payer?.publicKey;
      if (!signerPubkey) {
        throw new Error('signer required when SDK has no signer configured');
      }

      // Fetch registry config for collection
      const configData = await fetchRegistryConfig(this.connection);
      if (!configData) {
        throw new Error('Registry not initialized.');
      }

      const [agentPda] = PDAHelpers.getAgentPDA(asset);
      const collection = configData.getCollectionPublicKey();

      const instruction = this.instructionBuilder.buildTransferAgent(
        agentPda,
        asset,
        collection,
        signerPubkey,
        toOwner
      );

      const transaction = new Transaction().add(instruction);

      // If skipSend, return serialized transaction
      if (options?.skipSend) {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
      }

      // Normal mode: send transaction
      if (!this.payer) {
        throw new Error('No signer configured - SDK is read-only');
      }

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
    private payer?: Keypair
  ) {
    this.instructionBuilder = new ReputationInstructionBuilder();
  }

  /**
   * Give feedback to an agent
   * @param asset - Agent Core asset
   * @param agentId - Agent ID
   * @param score - Score 0-100
   * @param tag1 - Tag 1 (max 32 bytes)
   * @param tag2 - Tag 2 (max 32 bytes)
   * @param fileUri - IPFS/Arweave URI
   * @param fileHash - File hash (32 bytes)
   * @param options - Write options (skipSend, signer)
   */
  async giveFeedback(
    asset: PublicKey,
    agentId: bigint,
    score: number,
    tag1: string,
    tag2: string,
    fileUri: string,
    fileHash: Buffer,
    options?: WriteOptions
  ): Promise<(TransactionResult & { feedbackIndex?: bigint }) | (PreparedTransaction & { feedbackIndex: bigint })> {
    try {
      const signerPubkey = options?.signer || this.payer?.publicKey;
      if (!signerPubkey) {
        throw new Error('signer required when SDK has no signer configured');
      }

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
      const [agentPda] = PDAHelpers.getAgentPDA(asset);
      const [agentReputation] = PDAHelpers.getAgentReputationPDA(agentId);

      // Get feedback index from AgentReputationAccount (global index)
      let feedbackIndex = BigInt(0);
      const agentReputationInfo = await this.connection.getAccountInfo(agentReputation);
      if (agentReputationInfo) {
        const reputationData = AgentReputationAccount.deserialize(agentReputationInfo.data);
        feedbackIndex = toBigInt(reputationData.next_feedback_index);
      }

      // Feedback PDA (without client in seeds for v0.2.0)
      const [feedbackPda] = PDAHelpers.getFeedbackPDA(agentId, feedbackIndex);

      const giveFeedbackInstruction = this.instructionBuilder.buildGiveFeedback(
        signerPubkey,       // client
        signerPubkey,       // payer
        asset,              // Core asset
        agentPda,           // agent_account
        feedbackPda,        // feedback_account
        agentReputation,    // agent_reputation
        agentId,
        score,
        tag1,
        tag2,
        fileUri,
        fileHash,
        feedbackIndex
      );

      const transaction = new Transaction().add(giveFeedbackInstruction);

      // If tags are provided, also add setFeedbackTags instruction in the same transaction
      // This creates the FeedbackTagsPda on-chain (tags are otherwise only in the event)
      if (tag1 || tag2) {
        const [feedbackTagsPda] = PDAHelpers.getFeedbackTagsPDA(agentId, feedbackIndex);

        const setTagsInstruction = this.instructionBuilder.buildSetFeedbackTags(
          signerPubkey,       // client
          signerPubkey,       // payer
          feedbackPda,        // feedback_account
          feedbackTagsPda,    // feedback_tags
          agentId,
          feedbackIndex,
          tag1,
          tag2
        );

        transaction.add(setTagsInstruction);
      }

      // If skipSend, return serialized transaction
      if (options?.skipSend) {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        const prepared = serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
        return { ...prepared, feedbackIndex };
      }

      // Normal mode: send transaction
      if (!this.payer) {
        throw new Error('No signer configured - SDK is read-only');
      }

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
   * @param options - Write options (skipSend, signer)
   */
  async revokeFeedback(
    agentId: bigint,
    feedbackIndex: bigint,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    try {
      const signerPubkey = options?.signer || this.payer?.publicKey;
      if (!signerPubkey) {
        throw new Error('signer required when SDK has no signer configured');
      }

      // v0.2.0: Feedback PDA without client in seeds
      const [feedbackPda] = PDAHelpers.getFeedbackPDA(agentId, feedbackIndex);
      const [agentReputation] = PDAHelpers.getAgentReputationPDA(agentId);

      const instruction = this.instructionBuilder.buildRevokeFeedback(
        signerPubkey,
        feedbackPda,
        agentReputation,
        agentId,
        feedbackIndex
      );

      const transaction = new Transaction().add(instruction);

      // If skipSend, return serialized transaction
      if (options?.skipSend) {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
      }

      // Normal mode: send transaction
      if (!this.payer) {
        throw new Error('No signer configured - SDK is read-only');
      }

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
   * @param feedbackIndex - Feedback index
   * @param responseUri - Response URI
   * @param responseHash - Response hash
   * @param options - Write options (skipSend, signer)
   */
  async appendResponse(
    agentId: bigint,
    feedbackIndex: bigint,
    responseUri: string,
    responseHash: Buffer,
    options?: WriteOptions
  ): Promise<(TransactionResult & { responseIndex?: bigint }) | (PreparedTransaction & { responseIndex: bigint })> {
    try {
      const signerPubkey = options?.signer || this.payer?.publicKey;
      if (!signerPubkey) {
        throw new Error('signer required when SDK has no signer configured');
      }

      if (responseUri.length > 200) {
        throw new Error('responseUri must be <= 200 bytes');
      }
      if (responseHash.length !== 32) {
        throw new Error('responseHash must be 32 bytes');
      }

      // v0.2.0: Derive PDAs without client in seeds
      const [feedbackPda] = PDAHelpers.getFeedbackPDA(agentId, feedbackIndex);
      const [responseIndexPda] = PDAHelpers.getResponseIndexPDA(agentId, feedbackIndex);

      // Fetch current response index
      let responseIndexValue = BigInt(0);
      const responseIndexInfo = await this.connection.getAccountInfo(responseIndexPda);
      if (responseIndexInfo) {
        // Skip discriminator (8 bytes), then read response_count after agent_id (8) + feedback_index (8)
        const data = responseIndexInfo.data.slice(8);
        responseIndexValue = data.readBigUInt64LE(16); // After agent_id + feedback_index
      }

      const [responsePda] = PDAHelpers.getResponsePDA(
        agentId,
        feedbackIndex,
        responseIndexValue
      );

      const instruction = this.instructionBuilder.buildAppendResponse(
        signerPubkey,       // responder
        signerPubkey,       // payer
        feedbackPda,
        responseIndexPda,
        responsePda,
        agentId,
        feedbackIndex,
        responseUri,
        responseHash
      );

      const transaction = new Transaction().add(instruction);

      // If skipSend, return serialized transaction
      if (options?.skipSend) {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        const prepared = serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
        return { ...prepared, responseIndex: responseIndexValue };
      }

      // Normal mode: send transaction
      if (!this.payer) {
        throw new Error('No signer configured - SDK is read-only');
      }

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

  /**
   * Set feedback tags (optional, creates FeedbackTagsPda)
   * Creates a separate PDA for tags to save -42% cost when tags not needed
   * @param agentId - Agent ID
   * @param feedbackIndex - Feedback index
   * @param tag1 - First tag (max 32 bytes)
   * @param tag2 - Second tag (max 32 bytes)
   * @param options - Write options (skipSend, signer)
   */
  async setFeedbackTags(
    agentId: bigint,
    feedbackIndex: bigint,
    tag1: string,
    tag2: string,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    try {
      const signerPubkey = options?.signer || this.payer?.publicKey;
      if (!signerPubkey) {
        throw new Error('signer required when SDK has no signer configured');
      }

      // Validate inputs
      if (tag1.length > 32) {
        throw new Error('tag1 must be <= 32 bytes');
      }
      if (tag2.length > 32) {
        throw new Error('tag2 must be <= 32 bytes');
      }
      if (!tag1 && !tag2) {
        throw new Error('At least one tag must be provided');
      }

      // Derive PDAs
      const [feedbackPda] = PDAHelpers.getFeedbackPDA(agentId, feedbackIndex);
      const [feedbackTagsPda] = PDAHelpers.getFeedbackTagsPDA(agentId, feedbackIndex);

      const instruction = this.instructionBuilder.buildSetFeedbackTags(
        signerPubkey,       // client
        signerPubkey,       // payer
        feedbackPda,        // feedback_account
        feedbackTagsPda,    // feedback_tags
        agentId,
        feedbackIndex,
        tag1,
        tag2
      );

      const transaction = new Transaction().add(instruction);

      // If skipSend, return serialized transaction
      if (options?.skipSend) {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
      }

      // Normal mode: send transaction
      if (!this.payer) {
        throw new Error('No signer configured - SDK is read-only');
      }

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
 * Transaction builder for Validation Registry operations
 */
export class ValidationTransactionBuilder {
  private instructionBuilder: ValidationInstructionBuilder;

  constructor(
    private connection: Connection,
    private payer?: Keypair
  ) {
    this.instructionBuilder = new ValidationInstructionBuilder();
  }

  /**
   * Request validation for an agent
   * @param asset - Agent Core asset
   * @param agentId - Agent ID
   * @param validatorAddress - Validator public key
   * @param nonce - Request nonce
   * @param requestUri - Request URI
   * @param requestHash - Request hash
   * @param options - Write options (skipSend, signer)
   */
  async requestValidation(
    asset: PublicKey,
    agentId: bigint,
    validatorAddress: PublicKey,
    nonce: number,
    requestUri: string,
    requestHash: Buffer,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    try {
      const signerPubkey = options?.signer || this.payer?.publicKey;
      if (!signerPubkey) {
        throw new Error('signer required when SDK has no signer configured');
      }

      if (requestUri.length > 200) {
        throw new Error('requestUri must be <= 200 bytes');
      }
      if (requestHash.length !== 32) {
        throw new Error('requestHash must be 32 bytes');
      }

      // Derive PDAs
      const [configPda] = PDAHelpers.getValidationConfigPDA();
      const [agentPda] = PDAHelpers.getAgentPDA(asset);
      const [validationRequestPda] = PDAHelpers.getValidationRequestPDA(
        agentId,
        validatorAddress,
        nonce
      );

      const instruction = this.instructionBuilder.buildRequestValidation(
        configPda,
        signerPubkey,       // requester (must be agent owner)
        signerPubkey,       // payer
        asset,              // Core asset
        agentPda,
        validationRequestPda,
        agentId,
        validatorAddress,
        nonce,
        requestUri,
        requestHash
      );

      const transaction = new Transaction().add(instruction);

      // If skipSend, return serialized transaction
      if (options?.skipSend) {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
      }

      // Normal mode: send transaction
      if (!this.payer) {
        throw new Error('No signer configured - SDK is read-only');
      }

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
   * @param nonce - Request nonce
   * @param response - Response score
   * @param responseUri - Response URI
   * @param responseHash - Response hash
   * @param tag - Response tag
   * @param options - Write options (skipSend, signer)
   */
  async respondToValidation(
    agentId: bigint,
    nonce: number,
    response: number,
    responseUri: string,
    responseHash: Buffer,
    tag: string,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    try {
      const signerPubkey = options?.signer || this.payer?.publicKey;
      if (!signerPubkey) {
        throw new Error('signer required when SDK has no signer configured');
      }

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

      const [configPda] = PDAHelpers.getValidationConfigPDA();
      const [validationRequestPda] = PDAHelpers.getValidationRequestPDA(
        agentId,
        signerPubkey, // validator
        nonce
      );

      const instruction = this.instructionBuilder.buildRespondToValidation(
        configPda,
        signerPubkey,
        validationRequestPda,
        response,
        responseUri,
        responseHash,
        tag
      );

      const transaction = new Transaction().add(instruction);

      // If skipSend, return serialized transaction
      if (options?.skipSend) {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
      }

      // Normal mode: send transaction
      if (!this.payer) {
        throw new Error('No signer configured - SDK is read-only');
      }

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
   * @param agentId - Agent ID
   * @param nonce - Request nonce
   * @param response - Response score
   * @param responseUri - Response URI
   * @param responseHash - Response hash
   * @param tag - Response tag
   * @param options - Write options (skipSend, signer)
   */
  async updateValidation(
    agentId: bigint,
    nonce: number,
    response: number,
    responseUri: string,
    responseHash: Buffer,
    tag: string,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    try {
      const signerPubkey = options?.signer || this.payer?.publicKey;
      if (!signerPubkey) {
        throw new Error('signer required when SDK has no signer configured');
      }

      if (response < 0 || response > 100) {
        throw new Error('Response must be between 0 and 100');
      }

      const [configPda] = PDAHelpers.getValidationConfigPDA();
      const [validationRequestPda] = PDAHelpers.getValidationRequestPDA(
        agentId,
        signerPubkey,
        nonce
      );

      const instruction = this.instructionBuilder.buildUpdateValidation(
        configPda,
        signerPubkey,
        validationRequestPda,
        response,
        responseUri,
        responseHash,
        tag
      );

      const transaction = new Transaction().add(instruction);

      // If skipSend, return serialized transaction
      if (options?.skipSend) {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
      }

      // Normal mode: send transaction
      if (!this.payer) {
        throw new Error('No signer configured - SDK is read-only');
      }

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
   * @param asset - Agent Core asset
   * @param agentId - Agent ID
   * @param validatorAddress - Validator public key
   * @param nonce - Request nonce
   * @param rentReceiver - Address to receive rent (defaults to signer)
   * @param options - Write options (skipSend, signer)
   */
  async closeValidation(
    asset: PublicKey,
    agentId: bigint,
    validatorAddress: PublicKey,
    nonce: number,
    rentReceiver?: PublicKey,
    options?: WriteOptions
  ): Promise<TransactionResult | PreparedTransaction> {
    try {
      const signerPubkey = options?.signer || this.payer?.publicKey;
      if (!signerPubkey) {
        throw new Error('signer required when SDK has no signer configured');
      }

      const [configPda] = PDAHelpers.getValidationConfigPDA();
      const [agentPda] = PDAHelpers.getAgentPDA(asset);
      const [validationRequestPda] = PDAHelpers.getValidationRequestPDA(
        agentId,
        validatorAddress,
        nonce
      );

      const instruction = this.instructionBuilder.buildCloseValidation(
        configPda,
        signerPubkey,
        asset,
        agentPda,
        validationRequestPda,
        rentReceiver || signerPubkey
      );

      const transaction = new Transaction().add(instruction);

      // If skipSend, return serialized transaction
      if (options?.skipSend) {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
      }

      // Normal mode: send transaction
      if (!this.payer) {
        throw new Error('No signer configured - SDK is read-only');
      }

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
