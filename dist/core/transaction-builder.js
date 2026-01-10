/**
 * Transaction builder for ERC-8004 Solana programs
 * v0.3.0 - Asset-based identification
 * Handles transaction creation, signing, and sending without Anchor
 *
 * BREAKING CHANGES from v0.2.0:
 * - agent_id removed from all methods, uses asset (Pubkey) for PDA derivation
 * - Multi-collection support via RootConfig
 */
import { Transaction, Keypair, sendAndConfirmTransaction, ComputeBudgetProgram, } from '@solana/web3.js';
import { PDAHelpers } from './pda-helpers.js';
import { createHash } from 'crypto';
import { IdentityInstructionBuilder, ReputationInstructionBuilder, ValidationInstructionBuilder, } from './instruction-builder.js';
import { fetchRegistryConfig, fetchRootConfig } from './config-reader.js';
import { AgentReputationMetadata } from './borsh-schemas.js';
import { toBigInt } from './utils.js';
import { validateByteLength, validateNonce } from '../utils/validation.js';
/**
 * Serialize a transaction for later signing and sending
 * @param transaction - The transaction to serialize
 * @param signer - The public key that will sign the transaction
 * @param blockhash - Recent blockhash
 * @param lastValidBlockHeight - Block height after which transaction expires
 * @returns PreparedTransaction with base64 serialized transaction
 */
export function serializeTransaction(transaction, signer, blockhash, lastValidBlockHeight) {
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
        signed: false, // Security: Explicitly indicate transaction is unsigned
    };
}
/**
 * Transaction builder for Identity Registry operations (Metaplex Core)
 * v0.3.0 - Asset-based identification
 */
export class IdentityTransactionBuilder {
    connection;
    payer;
    instructionBuilder;
    constructor(connection, payer) {
        this.connection = connection;
        this.payer = payer;
        this.instructionBuilder = new IdentityInstructionBuilder();
    }
    /**
     * Register a new agent (Metaplex Core) - v0.3.0
     * @param agentUri - Optional agent URI
     * @param metadata - Optional metadata entries (key-value pairs)
     * @param collection - Optional collection pubkey (defaults to base registry collection)
     * @param options - Write options (skipSend, signer, assetPubkey)
     * @returns Transaction result with asset and all signatures
     */
    async registerAgent(agentUri, metadata, collection, options) {
        try {
            // Determine the signer pubkey
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Get collection - either provided or from base registry
            let collectionPubkey;
            if (collection) {
                collectionPubkey = collection;
            }
            else {
                // Fetch root config to get current base registry
                const rootConfig = await fetchRootConfig(this.connection);
                if (!rootConfig) {
                    throw new Error('Root config not initialized. Please initialize the registry first.');
                }
                // Get registry config for collection
                const registryConfig = await fetchRegistryConfig(this.connection, rootConfig.getCurrentBaseRegistryPublicKey());
                if (!registryConfig) {
                    throw new Error('Registry not initialized.');
                }
                collectionPubkey = registryConfig.getCollectionPublicKey();
            }
            // Determine the asset pubkey (Metaplex Core asset)
            let assetPubkey;
            let assetKeypair;
            if (options?.skipSend) {
                // In skipSend mode, client must provide assetPubkey
                if (!options.assetPubkey) {
                    throw new Error('assetPubkey required when skipSend is true - client must generate keypair locally');
                }
                assetPubkey = options.assetPubkey;
            }
            else {
                // Normal mode: generate keypair
                if (!this.payer) {
                    throw new Error('No signer configured - SDK is read-only');
                }
                assetKeypair = Keypair.generate();
                assetPubkey = assetKeypair.publicKey;
            }
            // Derive PDAs (v0.3.0 - uses asset, not agent_id)
            const [registryConfigPda] = PDAHelpers.getRegistryConfigPDA(collectionPubkey);
            const [agentPda] = PDAHelpers.getAgentPDA(assetPubkey);
            // Build register instruction
            const registerInstruction = this.instructionBuilder.buildRegister(registryConfigPda, agentPda, assetPubkey, collectionPubkey, signerPubkey, agentUri || '');
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
                    asset: assetPubkey,
                };
            }
            // Normal mode: send transaction
            if (!this.payer || !assetKeypair) {
                throw new Error('No signer configured - SDK is read-only');
            }
            // Send register transaction with retry
            const registerSignature = await this.sendWithRetry(registerTransaction, [this.payer, assetKeypair]);
            const allSignatures = [registerSignature];
            // If we have metadata, create MetadataEntryPda accounts (v0.3.0 - uses asset for PDA)
            if (metadata && metadata.length > 0) {
                console.log(`Setting ${metadata.length} metadata entries...`);
                for (const { key, value } of metadata) {
                    // Compute key hash for PDA derivation
                    const keyHash = createHash('sha256').update(key).digest().slice(0, 8);
                    // Derive metadata entry PDA (v0.3.0 - uses asset)
                    const [metadataEntry] = PDAHelpers.getMetadataEntryPDA(assetPubkey, keyHash);
                    const setMetadataIx = this.instructionBuilder.buildSetMetadata(metadataEntry, agentPda, assetPubkey, this.payer.publicKey, keyHash, key, value, false // not immutable by default
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
                asset: assetPubkey,
            };
        }
        catch (error) {
            // Security: Don't log errors to console (may expose sensitive info)
            // Error is returned in the result for caller to handle
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
                asset: undefined,
            };
        }
    }
    /**
     * Set agent URI by asset (Metaplex Core) - v0.3.0
     * @param asset - Agent Core asset
     * @param collection - Collection pubkey for the agent
     * @param newUri - New URI
     * @param options - Write options (skipSend, signer)
     */
    async setAgentUri(asset, collection, newUri, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [registryConfigPda] = PDAHelpers.getRegistryConfigPDA(collection);
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const instruction = this.instructionBuilder.buildSetAgentUri(registryConfigPda, agentPda, asset, collection, signerPubkey, newUri);
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
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature, success: true };
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Set metadata for agent by asset - v0.3.0
     * @param asset - Agent Core asset
     * @param key - Metadata key
     * @param value - Metadata value
     * @param immutable - If true, metadata cannot be modified or deleted (default: false)
     * @param options - Write options (skipSend, signer)
     */
    async setMetadata(asset, key, value, immutable = false, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            // Compute key hash (SHA256(key)[0..8])
            const keyHash = createHash('sha256').update(key).digest().slice(0, 8);
            // Derive metadata entry PDA (v0.3.0 - uses asset, not agent_id)
            const [metadataEntry] = PDAHelpers.getMetadataEntryPDA(asset, keyHash);
            const instruction = this.instructionBuilder.buildSetMetadata(metadataEntry, agentPda, asset, signerPubkey, keyHash, key, value, immutable);
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
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature, success: true };
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Delete agent metadata - v0.3.0
     * Only works for mutable metadata (will fail for immutable)
     * @param asset - Agent Core asset
     * @param key - Metadata key to delete
     * @param options - Write options (skipSend, signer)
     */
    async deleteMetadata(asset, key, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            // Compute key hash (SHA256(key)[0..8])
            const keyHash = createHash('sha256').update(key).digest().slice(0, 8);
            // Derive metadata entry PDA (v0.3.0 - uses asset, not agent_id)
            const [metadataEntry] = PDAHelpers.getMetadataEntryPDA(asset, keyHash);
            const instruction = this.instructionBuilder.buildDeleteMetadata(metadataEntry, agentPda, asset, signerPubkey, keyHash);
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
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature, success: true };
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Transfer agent to another owner (Metaplex Core) - v0.3.0
     * @param asset - Agent Core asset
     * @param collection - Collection pubkey for the agent
     * @param toOwner - New owner public key
     * @param options - Write options (skipSend, signer)
     */
    async transferAgent(asset, collection, toOwner, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const instruction = this.instructionBuilder.buildTransferAgent(agentPda, asset, collection, signerPubkey, toOwner);
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
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature, success: true };
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    async sendWithRetry(transaction, signers, maxRetries = 3) {
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const signature = await sendAndConfirmTransaction(this.connection, transaction, signers);
                return signature;
            }
            catch (error) {
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
 * v0.3.0 - Asset-based identification
 */
export class ReputationTransactionBuilder {
    connection;
    payer;
    instructionBuilder;
    constructor(connection, payer) {
        this.connection = connection;
        this.payer = payer;
        this.instructionBuilder = new ReputationInstructionBuilder();
    }
    /**
     * Give feedback to an agent - v0.3.0
     * @param asset - Agent Core asset
     * @param score - Score 0-100
     * @param tag1 - Tag 1 (max 32 bytes)
     * @param tag2 - Tag 2 (max 32 bytes)
     * @param endpoint - Endpoint being rated (max 200 bytes)
     * @param feedbackUri - IPFS/Arweave URI (max 200 bytes)
     * @param feedbackHash - Feedback hash (32 bytes)
     * @param options - Write options (skipSend, signer)
     */
    async giveFeedback(asset, score, tag1, tag2, endpoint, feedbackUri, feedbackHash, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Validate inputs
            if (score < 0 || score > 100) {
                throw new Error('Score must be between 0 and 100');
            }
            // Security: Use byte length validation for UTF-8 strings (not character count)
            validateByteLength(tag1, 32, 'tag1');
            validateByteLength(tag2, 32, 'tag2');
            validateByteLength(endpoint, 200, 'endpoint');
            validateByteLength(feedbackUri, 200, 'feedbackUri');
            if (feedbackHash.length !== 32) {
                throw new Error('feedbackHash must be 32 bytes');
            }
            // Derive PDAs (v0.3.0 - uses asset, not agent_id)
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const [agentReputation] = PDAHelpers.getAgentReputationPDA(asset);
            // Get feedback index from AgentReputationMetadata (global index)
            let feedbackIndex = BigInt(0);
            const agentReputationInfo = await this.connection.getAccountInfo(agentReputation);
            if (agentReputationInfo) {
                const reputationData = AgentReputationMetadata.deserialize(agentReputationInfo.data);
                feedbackIndex = toBigInt(reputationData.next_feedback_index);
            }
            // Feedback PDA (v0.3.0 - uses asset)
            const [feedbackPda] = PDAHelpers.getFeedbackPDA(asset, feedbackIndex);
            const giveFeedbackInstruction = this.instructionBuilder.buildGiveFeedback(signerPubkey, // client
            signerPubkey, // payer
            asset, // Core asset
            agentPda, // agent_account
            feedbackPda, // feedback_account
            agentReputation, // agent_reputation
            score, tag1, tag2, endpoint, feedbackUri, feedbackHash, feedbackIndex);
            const transaction = new Transaction().add(giveFeedbackInstruction);
            // If tags are provided, also add setFeedbackTags instruction in the same transaction
            // This creates the FeedbackTagsPda on-chain (tags are otherwise only in the event)
            if (tag1 || tag2) {
                const [feedbackTagsPda] = PDAHelpers.getFeedbackTagsPDA(asset, feedbackIndex);
                const setTagsInstruction = this.instructionBuilder.buildSetFeedbackTags(signerPubkey, // client
                signerPubkey, // payer
                feedbackPda, // feedback_account
                feedbackTagsPda, // feedback_tags
                feedbackIndex, tag1, tag2);
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
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature, success: true, feedbackIndex };
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Revoke feedback - v0.3.0
     * @param asset - Agent Core asset
     * @param feedbackIndex - Feedback index to revoke
     * @param options - Write options (skipSend, signer)
     */
    async revokeFeedback(asset, feedbackIndex, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // v0.3.0: PDAs use asset
            const [feedbackPda] = PDAHelpers.getFeedbackPDA(asset, feedbackIndex);
            const [agentReputation] = PDAHelpers.getAgentReputationPDA(asset);
            const instruction = this.instructionBuilder.buildRevokeFeedback(signerPubkey, feedbackPda, agentReputation, feedbackIndex);
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
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature, success: true };
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Append response to feedback - v0.3.0
     * @param asset - Agent Core asset
     * @param feedbackIndex - Feedback index
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param options - Write options (skipSend, signer)
     */
    async appendResponse(asset, feedbackIndex, responseUri, responseHash, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Security: Use byte length validation for UTF-8 strings
            validateByteLength(responseUri, 200, 'responseUri');
            if (responseHash.length !== 32) {
                throw new Error('responseHash must be 32 bytes');
            }
            // v0.3.0: Derive PDAs using asset
            const [feedbackPda] = PDAHelpers.getFeedbackPDA(asset, feedbackIndex);
            const [responseIndexPda] = PDAHelpers.getResponseIndexPDA(asset, feedbackIndex);
            // Fetch current response index
            let responseIndexValue = BigInt(0);
            const responseIndexInfo = await this.connection.getAccountInfo(responseIndexPda);
            if (responseIndexInfo) {
                // Skip discriminator (8 bytes), then read next_index(8) + bump(1) = 9 bytes minimum
                const data = responseIndexInfo.data.slice(8);
                // Security: Validate buffer size before reading
                if (data.length < 8) {
                    throw new Error(`Invalid ResponseIndex data: expected >= 8 bytes, got ${data.length}`);
                }
                responseIndexValue = data.readBigUInt64LE(0); // next_index is first field after discriminator
            }
            const [responsePda] = PDAHelpers.getResponsePDA(asset, feedbackIndex, responseIndexValue);
            const instruction = this.instructionBuilder.buildAppendResponse(signerPubkey, // responder
            signerPubkey, // payer
            asset, // Core asset
            feedbackPda, responseIndexPda, responsePda, feedbackIndex, responseUri, responseHash);
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
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature, success: true, responseIndex: responseIndexValue };
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Set feedback tags (optional, creates FeedbackTagsPda) - v0.3.0
     * Creates a separate PDA for tags to save -42% cost when tags not needed
     * @param asset - Agent Core asset
     * @param feedbackIndex - Feedback index
     * @param tag1 - First tag (max 32 bytes)
     * @param tag2 - Second tag (max 32 bytes)
     * @param options - Write options (skipSend, signer)
     */
    async setFeedbackTags(asset, feedbackIndex, tag1, tag2, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Validate inputs - Security: Use byte length validation for UTF-8 strings
            validateByteLength(tag1, 32, 'tag1');
            validateByteLength(tag2, 32, 'tag2');
            if (!tag1 && !tag2) {
                throw new Error('At least one tag must be provided');
            }
            // Derive PDAs (v0.3.0 - uses asset)
            const [feedbackPda] = PDAHelpers.getFeedbackPDA(asset, feedbackIndex);
            const [feedbackTagsPda] = PDAHelpers.getFeedbackTagsPDA(asset, feedbackIndex);
            const instruction = this.instructionBuilder.buildSetFeedbackTags(signerPubkey, // client
            signerPubkey, // payer
            feedbackPda, // feedback_account
            feedbackTagsPda, // feedback_tags
            feedbackIndex, tag1, tag2);
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
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature, success: true };
        }
        catch (error) {
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
 * v0.3.0 - Asset-based identification
 */
export class ValidationTransactionBuilder {
    connection;
    payer;
    instructionBuilder;
    constructor(connection, payer) {
        this.connection = connection;
        this.payer = payer;
        this.instructionBuilder = new ValidationInstructionBuilder();
    }
    /**
     * Request validation for an agent - v0.3.0
     * @param asset - Agent Core asset
     * @param validatorAddress - Validator public key
     * @param nonce - Request nonce
     * @param requestUri - Request URI
     * @param requestHash - Request hash
     * @param options - Write options (skipSend, signer)
     */
    async requestValidation(asset, validatorAddress, nonce, requestUri, requestHash, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Security: Validate nonce range (u32)
            validateNonce(nonce);
            // Security: Use byte length validation for UTF-8 strings
            validateByteLength(requestUri, 200, 'requestUri');
            if (requestHash.length !== 32) {
                throw new Error('requestHash must be 32 bytes');
            }
            // Derive PDAs (v0.3.0 - uses asset, not agent_id)
            const [rootConfigPda] = PDAHelpers.getRootConfigPDA();
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const [validationRequestPda] = PDAHelpers.getValidationRequestPDA(asset, validatorAddress, nonce);
            const instruction = this.instructionBuilder.buildRequestValidation(rootConfigPda, signerPubkey, // requester (must be agent owner)
            signerPubkey, // payer
            asset, // Core asset
            agentPda, validationRequestPda, validatorAddress, nonce, requestUri, requestHash);
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
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature, success: true };
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Respond to validation request - v0.3.0
     * @param asset - Agent Core asset
     * @param nonce - Request nonce
     * @param response - Response score
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param tag - Response tag
     * @param options - Write options (skipSend, signer)
     */
    async respondToValidation(asset, nonce, response, responseUri, responseHash, tag, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            if (response < 0 || response > 100) {
                throw new Error('Response must be between 0 and 100');
            }
            // Security: Validate nonce range (u32)
            validateNonce(nonce);
            // Security: Use byte length validation for UTF-8 strings
            validateByteLength(responseUri, 200, 'responseUri');
            if (responseHash.length !== 32) {
                throw new Error('responseHash must be 32 bytes');
            }
            validateByteLength(tag, 32, 'tag');
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const [validationRequestPda] = PDAHelpers.getValidationRequestPDA(asset, signerPubkey, // validator
            nonce);
            const instruction = this.instructionBuilder.buildRespondToValidation(signerPubkey, asset, agentPda, validationRequestPda, response, responseUri, responseHash, tag);
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
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature, success: true };
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Update validation (same as respond but semantically for updates) - v0.3.0
     * @param asset - Agent Core asset
     * @param nonce - Request nonce
     * @param response - Response score
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param tag - Response tag
     * @param options - Write options (skipSend, signer)
     */
    async updateValidation(asset, nonce, response, responseUri, responseHash, tag, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            if (response < 0 || response > 100) {
                throw new Error('Response must be between 0 and 100');
            }
            // Security: Validate nonce range (u32)
            validateNonce(nonce);
            // Security: Use byte length validation for UTF-8 strings
            validateByteLength(responseUri, 200, 'responseUri');
            if (responseHash.length !== 32) {
                throw new Error('responseHash must be 32 bytes');
            }
            validateByteLength(tag, 32, 'tag');
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const [validationRequestPda] = PDAHelpers.getValidationRequestPDA(asset, signerPubkey, nonce);
            const instruction = this.instructionBuilder.buildUpdateValidation(signerPubkey, asset, agentPda, validationRequestPda, response, responseUri, responseHash, tag);
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
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature, success: true };
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /**
     * Close validation request to recover rent - v0.3.0
     * @param asset - Agent Core asset
     * @param validatorAddress - Validator public key
     * @param nonce - Request nonce
     * @param rentReceiver - Address to receive rent (defaults to signer)
     * @param options - Write options (skipSend, signer)
     */
    async closeValidation(asset, validatorAddress, nonce, rentReceiver, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Security: Validate nonce range (u32)
            validateNonce(nonce);
            const [rootConfigPda] = PDAHelpers.getRootConfigPDA();
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const [validationRequestPda] = PDAHelpers.getValidationRequestPDA(asset, validatorAddress, nonce);
            const instruction = this.instructionBuilder.buildCloseValidation(rootConfigPda, signerPubkey, asset, agentPda, validationRequestPda, rentReceiver || signerPubkey);
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
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature, success: true };
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
//# sourceMappingURL=transaction-builder.js.map