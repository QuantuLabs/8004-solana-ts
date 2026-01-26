/**
 * Transaction builder for ERC-8004 Solana programs
 * v0.3.0 - Asset-based identification
 * Browser-compatible - uses cross-platform crypto utilities
 * Handles transaction creation, signing, and sending without Anchor
 *
 * BREAKING CHANGES from v0.2.0:
 * - agent_id removed from all methods, uses asset (Pubkey) for PDA derivation
 * - Multi-collection support via RootConfig
 */
import { PublicKey, Transaction, TransactionInstruction, Keypair, sendAndConfirmTransaction, ComputeBudgetProgram, } from '@solana/web3.js';
import { PDAHelpers, PROGRAM_ID } from './pda-helpers.js';
import { sha256 } from '../utils/crypto-utils.js';
import { writeBigUInt64LE } from '../utils/buffer-utils.js';
import { IdentityInstructionBuilder, ReputationInstructionBuilder, ValidationInstructionBuilder, AtomInstructionBuilder, } from './instruction-builder.js';
import { getProgramIds } from './programs.js';
import { AgentAccount } from './borsh-schemas.js';
import { fetchRegistryConfigByPda, fetchRootConfig } from './config-reader.js';
import { getAtomConfigPDA, getAtomStatsPDA } from './atom-pda.js';
import { validateByteLength, validateNonce } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import { resolveScore } from './feedback-normalizer.js';
const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;
/**
 * Validate and convert value to BigInt
 */
function validateValue(value) {
    if (typeof value === 'bigint') {
        if (value < I64_MIN || value > I64_MAX) {
            throw new Error(`value ${value} exceeds i64 range`);
        }
        return value;
    }
    if (!Number.isFinite(value)) {
        throw new Error('value must be finite');
    }
    if (!Number.isInteger(value)) {
        throw new Error('value must be an integer');
    }
    if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
        throw new Error(`value ${value} exceeds safe integer range, use bigint`);
    }
    const bigVal = BigInt(value);
    if (bigVal < I64_MIN || bigVal > I64_MAX) {
        throw new Error(`value ${bigVal} exceeds i64 range`);
    }
    return bigVal;
}
/**
 * Serialize a transaction for later signing and sending
 * @param transaction - The transaction to serialize
 * @param signer - The public key that will sign the transaction
 * @param blockhash - Recent blockhash
 * @param lastValidBlockHeight - Block height after which transaction expires
 * @param feePayer - Optional fee payer (defaults to signer)
 * @returns PreparedTransaction with base64 serialized transaction
 */
export function serializeTransaction(transaction, signer, blockhash, lastValidBlockHeight, feePayer) {
    // Security: Use explicit feePayer if provided, otherwise default to signer
    transaction.feePayer = feePayer || signer;
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
     * @param options - Write options (skipSend, signer, assetPubkey, atomEnabled)
     * @returns Transaction result with asset and all signatures
     */
    async registerAgent(agentUri, collection, options) {
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
                // current_base_registry is the RegistryConfig PDA, fetch it directly
                const registryConfigPda = rootConfig.getCurrentBaseRegistryPublicKey();
                const registryConfig = await fetchRegistryConfigByPda(this.connection, registryConfigPda);
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
            const registerInstruction = options?.atomEnabled === false
                ? this.instructionBuilder.buildRegisterWithOptions(registryConfigPda, agentPda, assetPubkey, collectionPubkey, signerPubkey, agentUri || '', false)
                : this.instructionBuilder.buildRegister(registryConfigPda, agentPda, assetPubkey, collectionPubkey, signerPubkey, agentUri || '');
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
            return {
                signature: registerSignature,
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
        // Pre-validate BEFORE try block so errors can be thrown
        validateByteLength(newUri, 250, 'newUri');
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
        // Pre-validate BEFORE try block so errors can be thrown
        // Reserved key check
        if (key === 'agentWallet') {
            throw new Error('Key "agentWallet" is reserved. Use setAgentWallet() instead.');
        }
        // Key and value length validation (must match Rust constants)
        validateByteLength(key, 32, 'key');
        validateByteLength(value, 250, 'value');
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            // Compute key hash (SHA256(key)[0..16]) - v1.9 security update
            const keyHashFull = await sha256(key);
            const keyHash = Buffer.from(keyHashFull.slice(0, 16));
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
            // Compute key hash (SHA256(key)[0..16]) - v1.9 security update
            const keyHashFull = await sha256(key);
            const keyHash = Buffer.from(keyHashFull.slice(0, 16));
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
    /**
     * Sync agent owner from Core asset after external transfer - v0.3.0
     * Use this when an agent NFT was transferred outside the protocol (e.g., on a marketplace)
     * @param asset - Agent Core asset
     * @param options - Write options (skipSend, signer)
     */
    async syncOwner(asset, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const instruction = this.instructionBuilder.buildSyncOwner(agentPda, asset);
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
     * Enable ATOM for an agent (one-way) - v0.4.4
     * @param asset - Agent Core asset
     * @param options - Write options (skipSend, signer)
     */
    async enableAtom(asset, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const instruction = this.instructionBuilder.buildEnableAtom(agentPda, asset, signerPubkey);
            const transaction = new Transaction().add(instruction);
            if (options?.skipSend) {
                const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
                return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
            }
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
     * Create a user-owned collection - v0.3.0
     * Allows users to create their own 8004 asset collections for horizontal scaling
     * @param collectionName - Collection name (max 32 bytes)
     * @param collectionUri - Collection URI (max 200 bytes)
     * @param options - Write options with optional collectionPubkey for skipSend mode
     */
    async createCollection(collectionName, collectionUri, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Validate inputs (MAX_URI_LENGTH = 250 per program)
            validateByteLength(collectionName, 32, 'collectionName');
            validateByteLength(collectionUri, 250, 'collectionUri');
            // Determine collection keypair
            let collectionPubkey;
            let collectionKeypair;
            if (options?.skipSend) {
                if (!options.collectionPubkey) {
                    throw new Error('collectionPubkey required when skipSend is true');
                }
                collectionPubkey = options.collectionPubkey;
            }
            else {
                if (!this.payer) {
                    throw new Error('No signer configured - SDK is read-only');
                }
                collectionKeypair = Keypair.generate();
                collectionPubkey = collectionKeypair.publicKey;
            }
            // Derive PDAs - user_collection_authority uses only the string seed (no collection key)
            const [collectionAuthority] = PublicKey.findProgramAddressSync([Buffer.from('user_collection_authority')], PROGRAM_ID);
            const [registryConfigPda] = PDAHelpers.getRegistryConfigPDA(collectionPubkey);
            const instruction = this.instructionBuilder.buildCreateUserRegistry(collectionAuthority, registryConfigPda, collectionPubkey, signerPubkey, collectionName, collectionUri);
            const transaction = new Transaction().add(instruction);
            // If skipSend, return serialized transaction
            if (options?.skipSend) {
                const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
                const prepared = serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
                return { ...prepared, collection: collectionPubkey };
            }
            // Normal mode: send transaction
            if (!this.payer || !collectionKeypair) {
                throw new Error('No signer configured - SDK is read-only');
            }
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer, collectionKeypair]);
            return { signature, success: true, collection: collectionPubkey };
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
     * Set agent operational wallet with Ed25519 signature verification - v0.3.0
     * The new wallet must sign the message to prove ownership
     * Message format: "8004_WALLET_SET:" || asset || new_wallet || owner || deadline
     * @param asset - Agent Core asset
     * @param newWallet - New operational wallet public key
     * @param signature - Ed25519 signature from the new wallet
     * @param deadline - Unix timestamp deadline (max 5 minutes from now)
     * @param options - Write options (skipSend, signer)
     */
    async setAgentWallet(asset, newWallet, signature, deadline, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Validate signature length
            if (signature.length !== 64) {
                throw new Error('signature must be 64 bytes');
            }
            // Build the message that was signed
            const messagePrefix = Buffer.from('8004_WALLET_SET:');
            const message = Buffer.concat([
                messagePrefix,
                asset.toBuffer(),
                newWallet.toBuffer(),
                signerPubkey.toBuffer(),
                writeBigUInt64LE(deadline), // Security: use unsigned for u64 deadline
            ]);
            // Derive PDAs
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            // Build Ed25519 verify instruction (must be immediately before setAgentWallet)
            // Ed25519 instruction data format:
            // - num_signatures: u8 = 1
            // - padding: u8 = 0
            // - signature_offset: u16 = 16 (after header)
            // - signature_instruction_index: u16 = 0xFFFF (inline)
            // - pubkey_offset: u16 = 80 (16 + 64)
            // - pubkey_instruction_index: u16 = 0xFFFF (inline)
            // - message_offset: u16 = 112 (16 + 64 + 32)
            // - message_size: u16 = message.length
            // - message_instruction_index: u16 = 0xFFFF (inline)
            // Followed by: signature (64), pubkey (32), message (variable)
            const signatureOffset = 16;
            const pubkeyOffset = signatureOffset + 64;
            const messageOffset = pubkeyOffset + 32;
            const messageSize = message.length;
            const ed25519Header = Buffer.alloc(16);
            ed25519Header.writeUInt8(1, 0); // num_signatures
            ed25519Header.writeUInt8(0, 1); // padding
            ed25519Header.writeUInt16LE(signatureOffset, 2); // signature_offset
            ed25519Header.writeUInt16LE(0xFFFF, 4); // signature_instruction_index (inline)
            ed25519Header.writeUInt16LE(pubkeyOffset, 6); // pubkey_offset
            ed25519Header.writeUInt16LE(0xFFFF, 8); // pubkey_instruction_index (inline)
            ed25519Header.writeUInt16LE(messageOffset, 10); // message_offset
            ed25519Header.writeUInt16LE(messageSize, 12); // message_size
            ed25519Header.writeUInt16LE(0xFFFF, 14); // message_instruction_index (inline)
            const ed25519Data = Buffer.concat([
                ed25519Header,
                Buffer.from(signature),
                newWallet.toBuffer(),
                message,
            ]);
            const ed25519ProgramId = new PublicKey('Ed25519SigVerify111111111111111111111111111');
            const ed25519Instruction = new TransactionInstruction({
                programId: ed25519ProgramId,
                keys: [],
                data: ed25519Data,
            });
            // Build setAgentWallet instruction
            const setWalletInstruction = this.instructionBuilder.buildSetAgentWallet(signerPubkey, // owner
            agentPda, // agent_account (writable - agent_wallet field will be modified)
            asset, // asset
            newWallet, // new_wallet
            deadline // deadline
            );
            // Transaction: Ed25519 verify MUST be immediately before setAgentWallet
            const transaction = new Transaction()
                .add(ed25519Instruction)
                .add(setWalletInstruction);
            // If skipSend, return serialized transaction
            if (options?.skipSend) {
                const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
                return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
            }
            // Normal mode: send transaction
            if (!this.payer) {
                throw new Error('No signer configured - SDK is read-only');
            }
            const txSignature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);
            return { signature: txSignature, success: true };
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
     * Build the message to sign for setAgentWallet - v0.3.0
     * Use this to construct the message that must be signed by the new wallet
     * @param asset - Agent Core asset
     * @param newWallet - New operational wallet public key
     * @param owner - Current agent owner
     * @param deadline - Unix timestamp deadline
     * @returns Buffer containing the message to sign
     */
    static buildWalletSetMessage(asset, newWallet, owner, deadline) {
        const messagePrefix = Buffer.from('8004_WALLET_SET:');
        return Buffer.concat([
            messagePrefix,
            asset.toBuffer(),
            newWallet.toBuffer(),
            owner.toBuffer(),
            writeBigUInt64LE(deadline), // Security: use unsigned for u64 deadline
        ]);
    }
    /**
     * Update collection metadata (name/URI) - v0.3.0
     * Only the collection owner can update
     * @param collection - Collection pubkey
     * @param newName - New collection name (null to keep current)
     * @param newUri - New collection URI (null to keep current)
     * @param options - Write options (skipSend, signer)
     */
    async updateCollectionMetadata(collection, newName, newUri, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Validate inputs if provided (MAX_URI_LENGTH = 250 per program)
            if (newName !== null) {
                validateByteLength(newName, 32, 'newName');
            }
            if (newUri !== null) {
                validateByteLength(newUri, 250, 'newUri');
            }
            if (newName === null && newUri === null) {
                throw new Error('At least one of newName or newUri must be provided');
            }
            // Derive PDAs - user_collection_authority uses only the string seed (no collection key)
            const [collectionAuthority] = PublicKey.findProgramAddressSync([Buffer.from('user_collection_authority')], PROGRAM_ID);
            const [registryConfigPda] = PDAHelpers.getRegistryConfigPDA(collection);
            const instruction = this.instructionBuilder.buildUpdateUserRegistryMetadata(collectionAuthority, registryConfigPda, collection, signerPubkey, newName, newUri);
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
    // ============================================================================
    // Admin methods (authority only)
    // ============================================================================
    /**
     * Create a new base collection - v0.3.0 (Admin only)
     * Creates a new protocol-managed collection for horizontal scaling
     * Only the program authority can call this
     * @param options - Write options with optional collectionPubkey for skipSend mode
     */
    async createBaseCollection(options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Determine collection keypair
            let collectionPubkey;
            let collectionKeypair;
            if (options?.skipSend) {
                if (!options.collectionPubkey) {
                    throw new Error('collectionPubkey required when skipSend is true');
                }
                collectionPubkey = options.collectionPubkey;
            }
            else {
                if (!this.payer) {
                    throw new Error('No signer configured - SDK is read-only');
                }
                collectionKeypair = Keypair.generate();
                collectionPubkey = collectionKeypair.publicKey;
            }
            // Derive PDAs
            const [rootConfigPda] = PDAHelpers.getRootConfigPDA();
            const [registryConfigPda] = PDAHelpers.getRegistryConfigPDA(collectionPubkey);
            const instruction = this.instructionBuilder.buildCreateBaseRegistry(rootConfigPda, registryConfigPda, collectionPubkey, signerPubkey);
            const transaction = new Transaction().add(instruction);
            // If skipSend, return serialized transaction
            if (options?.skipSend) {
                const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
                const prepared = serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
                return { ...prepared, collection: collectionPubkey };
            }
            // Normal mode: send transaction
            if (!this.payer || !collectionKeypair) {
                throw new Error('No signer configured - SDK is read-only');
            }
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer, collectionKeypair]);
            return { signature, success: true, collection: collectionPubkey };
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
     * Rotate to a new base collection - v0.3.0 (Admin only)
     * Sets a different collection as the active base collection for new registrations
     * Only the program authority can call this
     * @param newCollection - The collection to set as active base
     * @param options - Write options (skipSend, signer)
     */
    async rotateBaseCollection(newCollection, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Derive PDAs
            const [rootConfigPda] = PDAHelpers.getRootConfigPDA();
            const [newRegistryConfigPda] = PDAHelpers.getRegistryConfigPDA(newCollection);
            const instruction = this.instructionBuilder.buildRotateBaseRegistry(rootConfigPda, newRegistryConfigPda, signerPubkey);
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
                logger.warn(`Transaction attempt ${attempt}/${maxRetries} failed`);
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    logger.debug(`Retrying in ${delay}ms...`);
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
    indexerClient;
    instructionBuilder;
    constructor(connection, payer, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    indexerClient) {
        this.connection = connection;
        this.payer = payer;
        this.indexerClient = indexerClient;
        this.instructionBuilder = new ReputationInstructionBuilder();
    }
    /**
     * Give feedback - v0.5.0
     * @param asset - Agent Core asset
     * @param params - Feedback parameters (value, valueDecimals, score, tags, etc.)
     * @param options - Write options (skipSend, signer, feedbackIndex)
     */
    async giveFeedback(asset, params, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            const valueDecimals = params.valueDecimals ?? 0;
            if (!Number.isInteger(valueDecimals) || valueDecimals < 0 || valueDecimals > 6) {
                throw new Error('valueDecimals must be integer 0-6');
            }
            const valueBigInt = validateValue(params.value);
            if (params.score !== undefined && (!Number.isInteger(params.score) || params.score < 0 || params.score > 100)) {
                throw new Error('score must be integer 0-100');
            }
            const resolvedScore = resolveScore({
                tag1: params.tag1,
                value: valueBigInt,
                valueDecimals,
                score: params.score,
            });
            validateByteLength(params.tag1 ?? '', 32, 'tag1');
            validateByteLength(params.tag2 ?? '', 32, 'tag2');
            validateByteLength(params.endpoint ?? '', 250, 'endpoint');
            validateByteLength(params.feedbackUri, 250, 'feedbackUri');
            if (params.feedbackHash.length !== 32) {
                throw new Error('feedbackHash must be 32 bytes');
            }
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const agentInfo = await this.connection.getAccountInfo(agentPda);
            if (!agentInfo) {
                throw new Error('Agent not found');
            }
            const agentAccount = AgentAccount.deserialize(agentInfo.data);
            const collection = agentAccount.getCollectionPublicKey();
            const atomEnabled = agentAccount.isAtomEnabled();
            const atomConfig = atomEnabled ? getAtomConfigPDA()[0] : null;
            const atomStats = atomEnabled ? getAtomStatsPDA(asset)[0] : null;
            const registryAuthority = atomEnabled ? PDAHelpers.getAtomCpiAuthorityPDA()[0] : null;
            let feedbackIndex;
            if (options?.feedbackIndex !== undefined) {
                feedbackIndex = options.feedbackIndex;
            }
            else if (this.indexerClient) {
                try {
                    const lastIndex = await this.indexerClient.getLastFeedbackIndex(asset.toBase58(), signerPubkey.toBase58());
                    feedbackIndex = lastIndex + 1n;
                }
                catch (error) {
                    throw new Error(`Failed to get feedback index from indexer: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            else {
                throw new Error('Indexer client required for feedback_index calculation. Use options.feedbackIndex for manual index.');
            }
            const giveFeedbackInstruction = this.instructionBuilder.buildGiveFeedback(signerPubkey, agentPda, asset, collection, atomConfig, atomStats, registryAuthority, valueBigInt, valueDecimals, resolvedScore, params.feedbackHash, feedbackIndex, params.tag1 ?? '', params.tag2 ?? '', params.endpoint ?? '', params.feedbackUri);
            const transaction = new Transaction().add(giveFeedbackInstruction);
            if (options?.skipSend) {
                const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
                const prepared = serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
                return { ...prepared, feedbackIndex };
            }
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
     * Revoke feedback - v0.4.0
     * @param asset - Agent Core asset
     * @param feedbackIndex - Feedback index to revoke
     * @param options - Write options (skipSend, signer)
     *
     * v0.4.0 BREAKING: Now uses ATOM Engine CPI for reputation tracking.
     */
    async revokeFeedback(asset, feedbackIndex, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Derive PDAs (v0.4.0)
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const agentInfo = await this.connection.getAccountInfo(agentPda);
            if (!agentInfo) {
                throw new Error('Agent not found');
            }
            const agentAccount = AgentAccount.deserialize(agentInfo.data);
            const atomEnabled = agentAccount.isAtomEnabled();
            const atomConfig = atomEnabled ? getAtomConfigPDA()[0] : null;
            const atomStats = atomEnabled ? getAtomStatsPDA(asset)[0] : null;
            const registryAuthority = atomEnabled ? PDAHelpers.getAtomCpiAuthorityPDA()[0] : null;
            const instruction = this.instructionBuilder.buildRevokeFeedback(signerPubkey, agentPda, asset, atomConfig, atomStats, registryAuthority, feedbackIndex);
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
     * @param client - Client address who gave the feedback
     * @param feedbackIndex - Feedback index
     * @param responseUri - Response URI
     * @param responseHash - Response hash (optional for ipfs://)
     * @param options - Write options (skipSend, signer)
     */
    async appendResponse(asset, client, feedbackIndex, responseUri, responseHash, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            validateByteLength(responseUri, 250, 'responseUri');
            if (!responseHash) {
                if (!responseUri.startsWith('ipfs://')) {
                    throw new Error('responseHash is required unless responseUri is ipfs://');
                }
            }
            else if (responseHash.length !== 32) {
                throw new Error('responseHash must be 32 bytes');
            }
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const hash = responseHash ?? Buffer.alloc(32);
            const instruction = this.instructionBuilder.buildAppendResponse(signerPubkey, agentPda, asset, client, feedbackIndex, responseUri, hash);
            const transaction = new Transaction().add(instruction);
            if (options?.skipSend) {
                const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
                return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
            }
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
     * Set feedback tags (optional, creates FeedbackTagsPda) - v0.3.0
     * Creates a separate PDA for tags to save -42% cost when tags not needed
     * @param asset - Agent Core asset
     * @param feedbackIndex - Feedback index
     * @param tag1 - First tag (max 32 bytes)
     * @param tag2 - Second tag (max 32 bytes)
     * @param options - Write options (skipSend, signer)
     * @deprecated Not supported on-chain in current program
     */
    async setFeedbackTags(_asset, _feedbackIndex, _tag1, _tag2, _options) {
        return {
            signature: '',
            success: false,
            error: 'setFeedbackTags is not supported on-chain in this program',
        };
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
            validateByteLength(requestUri, 250, 'requestUri');
            if (requestHash.length !== 32) {
                throw new Error('requestHash must be 32 bytes');
            }
            // Derive PDAs (v0.3.0 - uses asset, not agent_id)
            const [validationConfigPda] = PDAHelpers.getValidationConfigPDA();
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const [validationRequestPda, bump] = PDAHelpers.getValidationRequestPDA(asset, validatorAddress, nonce);
            console.log('[DEBUG] requestValidation - Creating validation request:');
            console.log(`  Asset: ${asset.toBase58()}`);
            console.log(`  Validator: ${validatorAddress.toBase58()}`);
            console.log(`  Nonce: ${nonce}`);
            console.log(`  PDA: ${validationRequestPda.toBase58()}`);
            console.log(`  Bump: ${bump}`);
            const instruction = this.instructionBuilder.buildRequestValidation(validationConfigPda, signerPubkey, // requester (must be agent owner)
            signerPubkey, // payer
            agentPda, // agent_account (before asset in v0.4.2)
            asset, // Core asset
            validationRequestPda, validatorAddress, nonce, requestUri, requestHash);
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
            validateByteLength(responseUri, 250, 'responseUri');
            if (responseHash.length !== 32) {
                throw new Error('responseHash must be 32 bytes');
            }
            validateByteLength(tag, 32, 'tag');
            const [validationConfigPda] = PDAHelpers.getValidationConfigPDA();
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const [validationRequestPda] = PDAHelpers.getValidationRequestPDA(asset, signerPubkey, // validator
            nonce);
            const instruction = this.instructionBuilder.buildRespondToValidation(validationConfigPda, signerPubkey, agentPda, asset, validationRequestPda, nonce, response, responseUri, responseHash, tag);
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
     * @deprecated Not supported on-chain in current program
     */
    async updateValidation(_asset, _nonce, _response, _responseUri, _responseHash, _tag, _options) {
        return {
            signature: '',
            success: false,
            error: 'updateValidation is not supported on-chain in this program',
        };
    }
    /**
     * Close validation request to recover rent - v0.3.0
     * @param asset - Agent Core asset
     * @param validatorAddress - Validator public key
     * @param nonce - Request nonce
     * @param rentReceiver - Address to receive rent (defaults to signer)
     * @param options - Write options (skipSend, signer)
     * @deprecated Not supported on-chain in current program
     */
    async closeValidation(_asset, _validatorAddress, _nonce, _rentReceiver, _options) {
        return {
            signature: '',
            success: false,
            error: 'closeValidation is not supported on-chain in this program',
        };
    }
}
/**
 * Transaction builder for ATOM Engine operations
 * v0.4.0 - Agent Trust On-chain Model
 */
export class AtomTransactionBuilder {
    connection;
    payer;
    instructionBuilder;
    constructor(connection, payer) {
        this.connection = connection;
        this.payer = payer;
        this.instructionBuilder = new AtomInstructionBuilder();
    }
    /**
     * Initialize AtomStats for an agent - v0.4.0
     * Must be called by the agent owner before any feedback can be given
     * @param asset - Agent Core asset
     * @param options - Write options (skipSend, signer)
     */
    async initializeStats(asset, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Get collection from AgentAccount (supports user registries)
            const [agentPda] = PDAHelpers.getAgentPDA(asset);
            const agentInfo = await this.connection.getAccountInfo(agentPda);
            if (!agentInfo) {
                throw new Error('Agent not found');
            }
            const agentAccount = AgentAccount.deserialize(agentInfo.data);
            const collection = agentAccount.getCollectionPublicKey();
            // Derive ATOM Engine PDAs
            const [atomConfig] = getAtomConfigPDA();
            const [atomStats] = getAtomStatsPDA(asset);
            const instruction = this.instructionBuilder.buildInitializeStats(signerPubkey, asset, collection, atomConfig, atomStats);
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
     * Initialize global ATOM config - v0.4.x
     * One-time setup by program authority
     * @param agentRegistryProgram - Optional agent registry program ID override
     * @param options - Write options
     */
    async initializeConfig(agentRegistryProgram, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Derive ATOM Engine config PDA
            const [atomConfig] = getAtomConfigPDA();
            // Get program data PDA (for authority verification)
            const programIds = getProgramIds();
            const [programData] = PublicKey.findProgramAddressSync([programIds.atomEngine.toBuffer()], new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'));
            const registryProgram = agentRegistryProgram || programIds.agentRegistry;
            const instruction = this.instructionBuilder.buildInitializeConfig(signerPubkey, atomConfig, programData, registryProgram);
            const transaction = new Transaction().add(instruction);
            if (options?.skipSend) {
                const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
                return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
            }
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
     * Update global ATOM config parameters - v0.4.x
     * Authority only
     * @param params - Config parameters to update (only provided fields are changed)
     * @param options - Write options
     */
    async updateConfig(params, options) {
        try {
            const signerPubkey = options?.signer || this.payer?.publicKey;
            if (!signerPubkey) {
                throw new Error('signer required when SDK has no signer configured');
            }
            // Derive ATOM Engine config PDA
            const [atomConfig] = getAtomConfigPDA();
            const instruction = this.instructionBuilder.buildUpdateConfig(signerPubkey, atomConfig, params);
            const transaction = new Transaction().add(instruction);
            if (options?.skipSend) {
                const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
                return serializeTransaction(transaction, signerPubkey, blockhash, lastValidBlockHeight);
            }
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