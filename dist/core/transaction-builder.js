/**
 * Transaction builder for ERC-8004 Solana programs
 * Handles transaction creation, signing, and sending without Anchor
 * Updated to match 8004-solana program interfaces
 */
import { Transaction, Keypair, sendAndConfirmTransaction, ComputeBudgetProgram, } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PDAHelpers, IDENTITY_PROGRAM_ID } from './pda-helpers.js';
import { IdentityInstructionBuilder, ReputationInstructionBuilder, ValidationInstructionBuilder, } from './instruction-builder.js';
import { fetchRegistryConfig } from './config-reader.js';
import { getMetadataPDA, getMasterEditionPDA, getCollectionAuthorityPDA } from './metaplex-helpers.js';
import { ClientIndexAccount } from './borsh-schemas.js';
import { toBigInt } from './utils.js';
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
    };
}
/**
 * Transaction builder for Identity Registry operations
 */
export class IdentityTransactionBuilder {
    constructor(connection, cluster, payer) {
        this.connection = connection;
        this.cluster = cluster;
        this.payer = payer;
        this.instructionBuilder = new IdentityInstructionBuilder(cluster);
    }
    /**
     * Register a new agent
     * @param agentUri - Optional agent URI
     * @param metadata - Optional metadata entries (key-value pairs)
     * @param options - Write options (skipSend, signer, mintPubkey)
     * @returns Transaction result with agent ID, agentMint, and all signatures
     */
    async registerAgent(agentUri, metadata, options) {
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
            // Determine the mint pubkey
            let agentMintPubkey;
            let agentMintKeypair;
            if (options?.skipSend) {
                // In skipSend mode, client must provide mintPubkey
                if (!options.mintPubkey) {
                    throw new Error('mintPubkey required when skipSend is true - client must generate keypair locally');
                }
                agentMintPubkey = options.mintPubkey;
            }
            else {
                // Normal mode: generate keypair
                if (!this.payer) {
                    throw new Error('No signer configured - SDK is read-only');
                }
                agentMintKeypair = Keypair.generate();
                agentMintPubkey = agentMintKeypair.publicKey;
            }
            // Derive PDAs
            const [configPda] = await PDAHelpers.getRegistryConfigPDA();
            const [agentPda] = await PDAHelpers.getAgentPDA(agentMintPubkey);
            // Get collection authority PDA - needed for signing collection verification
            const collectionAuthorityPda = getCollectionAuthorityPDA(IDENTITY_PROGRAM_ID);
            // Get collection mint from config
            const collectionMint = configData.getCollectionMintPublicKey();
            // Calculate Metaplex PDAs
            const agentMetadata = getMetadataPDA(agentMintPubkey);
            const agentMasterEdition = getMasterEditionPDA(agentMintPubkey);
            const collectionMetadata = getMetadataPDA(collectionMint);
            const collectionMasterEdition = getMasterEditionPDA(collectionMint);
            // Calculate Associated Token Account
            const agentTokenAccount = getAssociatedTokenAddressSync(agentMintPubkey, signerPubkey);
            // Split metadata: first 1 inline (MAX_METADATA_ENTRIES=1), rest in extensions
            const inlineMetadata = metadata && metadata.length > 1
                ? metadata.slice(0, 1)
                : metadata;
            const extendedMetadata = metadata && metadata.length > 1
                ? metadata.slice(1)
                : [];
            // Build register instruction - choose based on metadata presence
            const registerInstruction = inlineMetadata && inlineMetadata.length > 0
                ? this.instructionBuilder.buildRegisterWithMetadata(configPda, collectionAuthorityPda, agentPda, agentMintPubkey, agentMetadata, agentMasterEdition, agentTokenAccount, collectionMint, collectionMetadata, collectionMasterEdition, signerPubkey, agentUri || '', inlineMetadata)
                : this.instructionBuilder.buildRegister(configPda, collectionAuthorityPda, agentPda, agentMintPubkey, agentMetadata, agentMasterEdition, agentTokenAccount, collectionMint, collectionMetadata, collectionMasterEdition, signerPubkey, agentUri || '');
            // Create transaction with increased compute budget
            const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
                units: 400000,
            });
            const registerTransaction = new Transaction()
                .add(computeBudgetIx)
                .add(registerInstruction);
            // If skipSend, return serialized transaction
            if (options?.skipSend) {
                const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
                const prepared = serializeTransaction(registerTransaction, signerPubkey, blockhash, lastValidBlockHeight);
                // Note: Extended metadata transactions would need separate calls
                if (extendedMetadata.length > 0) {
                    console.warn('Extended metadata with skipSend not yet supported - only first metadata entry included');
                }
                return {
                    ...prepared,
                    agentId,
                    agentMint: agentMintPubkey,
                };
            }
            // Normal mode: send transaction
            if (!this.payer || !agentMintKeypair) {
                throw new Error('No signer configured - SDK is read-only');
            }
            // Send register transaction with retry
            const registerSignature = await this.sendWithRetry(registerTransaction, [this.payer, agentMintKeypair]);
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
                        const [metadataExtension] = await PDAHelpers.getMetadataExtensionPDA(agentMintPubkey, extensionIndex);
                        // First create the extension PDA if needed
                        const createExtIx = this.instructionBuilder.buildCreateMetadataExtension(metadataExtension, agentMintPubkey, agentPda, this.payer.publicKey, extensionIndex);
                        extTx.add(createExtIx);
                        // Then set the metadata
                        const setExtIx = this.instructionBuilder.buildSetMetadataExtended(metadataExtension, agentMintPubkey, agentPda, this.payer.publicKey, extensionIndex, key, value);
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
                agentMint: agentMintPubkey,
            };
        }
        catch (error) {
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
     * @param agentMint - Agent NFT mint
     * @param newUri - New URI
     * @param options - Write options (skipSend, signer)
     */
    async setAgentUri(agentMint, newUri, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
            const agentMetadata = getMetadataPDA(agentMint);
            const instruction = this.instructionBuilder.buildSetAgentUri(agentPda, agentMetadata, agentMint, signerPubkey, newUri);
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
     * Set metadata for agent by mint (inline storage)
     * @param agentMint - Agent NFT mint
     * @param key - Metadata key
     * @param value - Metadata value
     * @param options - Write options (skipSend, signer)
     */
    async setMetadataByMint(agentMint, key, value, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
            const instruction = this.instructionBuilder.buildSetMetadata(agentPda, signerPubkey, key, value);
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
     * Set metadata extended for agent by mint (extension PDA storage)
     * @param agentMint - Agent NFT mint
     * @param extensionIndex - Extension index
     * @param key - Metadata key
     * @param value - Metadata value
     * @param options - Write options (skipSend, signer)
     */
    async setMetadataExtendedByMint(agentMint, extensionIndex, key, value, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
            const [metadataExtension] = await PDAHelpers.getMetadataExtensionPDA(agentMint, extensionIndex);
            const instruction = this.instructionBuilder.buildSetMetadataExtended(metadataExtension, agentMint, agentPda, signerPubkey, extensionIndex, key, value);
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
     * Transfer agent to another owner
     * @param agentMint - Agent NFT mint
     * @param toOwner - New owner public key
     * @param options - Write options (skipSend, signer)
     */
    async transferAgent(agentMint, toOwner, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
            const agentMetadata = getMetadataPDA(agentMint);
            const fromTokenAccount = getAssociatedTokenAddressSync(agentMint, signerPubkey);
            const toTokenAccount = getAssociatedTokenAddressSync(agentMint, toOwner);
            const instruction = this.instructionBuilder.buildTransferAgent(agentPda, fromTokenAccount, toTokenAccount, agentMint, agentMetadata, signerPubkey);
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
    estimateInstructionSize(key, value) {
        return 8 + 1 + 4 + key.length + 4 + value.length + 60;
    }
    calculateOptimalBatch(metadataEntries) {
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
 */
export class ReputationTransactionBuilder {
    constructor(connection, cluster, payer) {
        this.connection = connection;
        this.cluster = cluster;
        this.payer = payer;
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
     * @param options - Write options (skipSend, signer)
     */
    async giveFeedback(agentMint, agentId, score, tag1, tag2, fileUri, fileHash, options) {
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
            const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
            const [clientIndex] = await PDAHelpers.getClientIndexPDA(agentId, signerPubkey);
            const [agentReputation] = await PDAHelpers.getAgentReputationPDA(agentId);
            // Fetch current feedback index from client_index account (or 0 if doesn't exist)
            let feedbackIndex = BigInt(0);
            const clientIndexInfo = await this.connection.getAccountInfo(clientIndex);
            if (clientIndexInfo) {
                const clientIndexData = ClientIndexAccount.deserialize(clientIndexInfo.data);
                // borsh v0.7 returns BN objects, not native bigint - convert to native bigint
                feedbackIndex = toBigInt(clientIndexData.last_index);
            }
            // Derive feedback PDA
            const [feedbackPda] = await PDAHelpers.getFeedbackPDA(agentId, signerPubkey, feedbackIndex);
            const instruction = this.instructionBuilder.buildGiveFeedback(signerPubkey, // client
            signerPubkey, // payer
            agentMint, // agent_mint
            agentPda, // agent_account
            clientIndex, // client_index
            feedbackPda, // feedback_account
            agentReputation, // agent_reputation
            IDENTITY_PROGRAM_ID, // identity_registry_program
            agentId, score, tag1, tag2, fileUri, fileHash, feedbackIndex);
            const transaction = new Transaction().add(instruction);
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
     * Revoke feedback
     * @param agentId - Agent ID
     * @param feedbackIndex - Feedback index to revoke
     * @param options - Write options (skipSend, signer)
     */
    async revokeFeedback(agentId, feedbackIndex, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [feedbackPda] = await PDAHelpers.getFeedbackPDA(agentId, signerPubkey, feedbackIndex);
            const [agentReputation] = await PDAHelpers.getAgentReputationPDA(agentId);
            const instruction = this.instructionBuilder.buildRevokeFeedback(signerPubkey, feedbackPda, agentReputation, agentId, feedbackIndex);
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
     * Append response to feedback
     * @param agentId - Agent ID
     * @param clientAddress - Client who gave feedback
     * @param feedbackIndex - Feedback index
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param options - Write options (skipSend, signer)
     */
    async appendResponse(agentId, clientAddress, feedbackIndex, responseUri, responseHash, options) {
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
            const [responsePda] = await PDAHelpers.getResponsePDA(agentId, clientAddress, feedbackIndex, responseIndexValue);
            const instruction = this.instructionBuilder.buildAppendResponse(signerPubkey, // responder
            signerPubkey, // payer
            feedbackPda, responseIndexPda, responsePda, agentId, clientAddress, feedbackIndex, responseUri, responseHash);
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
}
/**
 * Transaction builder for Validation Registry operations
 */
export class ValidationTransactionBuilder {
    constructor(connection, cluster, payer) {
        this.connection = connection;
        this.cluster = cluster;
        this.payer = payer;
        this.instructionBuilder = new ValidationInstructionBuilder(cluster);
    }
    /**
     * Request validation for an agent
     * @param agentMint - Agent NFT mint
     * @param agentId - Agent ID
     * @param validatorAddress - Validator public key
     * @param nonce - Request nonce
     * @param requestUri - Request URI
     * @param requestHash - Request hash
     * @param options - Write options (skipSend, signer)
     */
    async requestValidation(agentMint, agentId, validatorAddress, nonce, requestUri, requestHash, options) {
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
            const [configPda] = await PDAHelpers.getValidationConfigPDA();
            const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
            const [validationRequestPda] = await PDAHelpers.getValidationRequestPDA(agentId, validatorAddress, nonce);
            const instruction = this.instructionBuilder.buildRequestValidation(configPda, signerPubkey, // requester (must be agent owner)
            signerPubkey, // payer
            agentMint, agentPda, validationRequestPda, IDENTITY_PROGRAM_ID, agentId, validatorAddress, nonce, requestUri, requestHash);
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
     * Respond to validation request
     * @param agentId - Agent ID
     * @param nonce - Request nonce
     * @param response - Response score
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param tag - Response tag
     * @param options - Write options (skipSend, signer)
     */
    async respondToValidation(agentId, nonce, response, responseUri, responseHash, tag, options) {
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
            const [configPda] = await PDAHelpers.getValidationConfigPDA();
            const [validationRequestPda] = await PDAHelpers.getValidationRequestPDA(agentId, signerPubkey, // validator
            nonce);
            const instruction = this.instructionBuilder.buildRespondToValidation(configPda, signerPubkey, validationRequestPda, response, responseUri, responseHash, tag);
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
     * Update validation (same as respond but semantically for updates)
     * @param agentId - Agent ID
     * @param nonce - Request nonce
     * @param response - Response score
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param tag - Response tag
     * @param options - Write options (skipSend, signer)
     */
    async updateValidation(agentId, nonce, response, responseUri, responseHash, tag, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            if (response < 0 || response > 100) {
                throw new Error('Response must be between 0 and 100');
            }
            const [configPda] = await PDAHelpers.getValidationConfigPDA();
            const [validationRequestPda] = await PDAHelpers.getValidationRequestPDA(agentId, signerPubkey, nonce);
            const instruction = this.instructionBuilder.buildUpdateValidation(configPda, signerPubkey, validationRequestPda, response, responseUri, responseHash, tag);
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
     * Close validation request to recover rent
     * @param agentMint - Agent NFT mint
     * @param agentId - Agent ID
     * @param validatorAddress - Validator public key
     * @param nonce - Request nonce
     * @param rentReceiver - Address to receive rent (defaults to signer)
     * @param options - Write options (skipSend, signer)
     */
    async closeValidation(agentMint, agentId, validatorAddress, nonce, rentReceiver, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [configPda] = await PDAHelpers.getValidationConfigPDA();
            const [agentPda] = await PDAHelpers.getAgentPDA(agentMint);
            const [validationRequestPda] = await PDAHelpers.getValidationRequestPDA(agentId, validatorAddress, nonce);
            const instruction = this.instructionBuilder.buildCloseValidation(configPda, signerPubkey, agentMint, agentPda, validationRequestPda, IDENTITY_PROGRAM_ID, rentReceiver || signerPubkey);
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