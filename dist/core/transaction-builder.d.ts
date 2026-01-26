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
import { PublicKey, Transaction, Connection, Keypair, TransactionSignature } from '@solana/web3.js';
import { UpdateAtomConfigParams } from './instruction-builder.js';
export type { UpdateAtomConfigParams };
import type { IndexerClient } from './indexer-client.js';
import type { GiveFeedbackParams } from '../models/interfaces.js';
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
    /**
     * Fee payer public key - defaults to signer if not provided
     * Security: Explicitly specifying feePayer prevents implicit fee payment assumptions
     */
    feePayer?: PublicKey;
}
/**
 * Extended options for giveFeedback
 * Allows manual feedbackIndex for testing without indexer
 */
export interface GiveFeedbackOptions extends WriteOptions {
    /** Manual feedback index - bypasses indexer lookup (for testing) */
    feedbackIndex?: bigint;
}
/**
 * Extended options for registerAgent (requires assetPubkey when skipSend is true)
 */
export interface RegisterAgentOptions extends WriteOptions {
    /** Required when skipSend is true - the client generates the asset keypair locally */
    assetPubkey?: PublicKey;
    /** Explicitly disable ATOM at creation (default: true = enabled). */
    atomEnabled?: boolean;
}
/**
 * Result when skipSend is true - contains serialized transaction data
 * IMPORTANT: Transaction is NOT signed - must be signed before sending
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
    /** Security: Transaction is NOT signed - must be signed externally before sending */
    signed: false;
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
export declare function serializeTransaction(transaction: Transaction, signer: PublicKey, blockhash: string, lastValidBlockHeight: number, feePayer?: PublicKey): PreparedTransaction;
/**
 * Transaction builder for Identity Registry operations (Metaplex Core)
 * v0.3.0 - Asset-based identification
 */
export declare class IdentityTransactionBuilder {
    private connection;
    private payer?;
    private instructionBuilder;
    constructor(connection: Connection, payer?: Keypair | undefined);
    /**
     * Register a new agent (Metaplex Core) - v0.3.0
     * @param agentUri - Optional agent URI
     * @param metadata - Optional metadata entries (key-value pairs)
     * @param collection - Optional collection pubkey (defaults to base registry collection)
     * @param options - Write options (skipSend, signer, assetPubkey, atomEnabled)
     * @returns Transaction result with asset and all signatures
     */
    registerAgent(agentUri?: string, collection?: PublicKey, options?: RegisterAgentOptions): Promise<(TransactionResult & {
        asset?: PublicKey;
        signatures?: string[];
    }) | (PreparedTransaction & {
        asset: PublicKey;
    })>;
    /**
     * Set agent URI by asset (Metaplex Core) - v0.3.0
     * @param asset - Agent Core asset
     * @param collection - Collection pubkey for the agent
     * @param newUri - New URI
     * @param options - Write options (skipSend, signer)
     */
    setAgentUri(asset: PublicKey, collection: PublicKey, newUri: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Set metadata for agent by asset - v0.3.0
     * @param asset - Agent Core asset
     * @param key - Metadata key
     * @param value - Metadata value
     * @param immutable - If true, metadata cannot be modified or deleted (default: false)
     * @param options - Write options (skipSend, signer)
     */
    setMetadata(asset: PublicKey, key: string, value: string, immutable?: boolean, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Delete agent metadata - v0.3.0
     * Only works for mutable metadata (will fail for immutable)
     * @param asset - Agent Core asset
     * @param key - Metadata key to delete
     * @param options - Write options (skipSend, signer)
     */
    deleteMetadata(asset: PublicKey, key: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Transfer agent to another owner (Metaplex Core) - v0.3.0
     * @param asset - Agent Core asset
     * @param collection - Collection pubkey for the agent
     * @param toOwner - New owner public key
     * @param options - Write options (skipSend, signer)
     */
    transferAgent(asset: PublicKey, collection: PublicKey, toOwner: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Sync agent owner from Core asset after external transfer - v0.3.0
     * Use this when an agent NFT was transferred outside the protocol (e.g., on a marketplace)
     * @param asset - Agent Core asset
     * @param options - Write options (skipSend, signer)
     */
    syncOwner(asset: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Enable ATOM for an agent (one-way) - v0.4.4
     * @param asset - Agent Core asset
     * @param options - Write options (skipSend, signer)
     */
    enableAtom(asset: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Create a user-owned collection - v0.3.0
     * Allows users to create their own 8004 asset collections for horizontal scaling
     * @param collectionName - Collection name (max 32 bytes)
     * @param collectionUri - Collection URI (max 200 bytes)
     * @param options - Write options with optional collectionPubkey for skipSend mode
     */
    createCollection(collectionName: string, collectionUri: string, options?: WriteOptions & {
        collectionPubkey?: PublicKey;
    }): Promise<(TransactionResult & {
        collection?: PublicKey;
    }) | (PreparedTransaction & {
        collection: PublicKey;
    })>;
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
    setAgentWallet(asset: PublicKey, newWallet: PublicKey, signature: Uint8Array, deadline: bigint, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Build the message to sign for setAgentWallet - v0.3.0
     * Use this to construct the message that must be signed by the new wallet
     * @param asset - Agent Core asset
     * @param newWallet - New operational wallet public key
     * @param owner - Current agent owner
     * @param deadline - Unix timestamp deadline
     * @returns Buffer containing the message to sign
     */
    static buildWalletSetMessage(asset: PublicKey, newWallet: PublicKey, owner: PublicKey, deadline: bigint): Buffer;
    /**
     * Update collection metadata (name/URI) - v0.3.0
     * Only the collection owner can update
     * @param collection - Collection pubkey
     * @param newName - New collection name (null to keep current)
     * @param newUri - New collection URI (null to keep current)
     * @param options - Write options (skipSend, signer)
     */
    updateCollectionMetadata(collection: PublicKey, newName: string | null, newUri: string | null, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Create a new base collection - v0.3.0 (Admin only)
     * Creates a new protocol-managed collection for horizontal scaling
     * Only the program authority can call this
     * @param options - Write options with optional collectionPubkey for skipSend mode
     */
    createBaseCollection(options?: WriteOptions & {
        collectionPubkey?: PublicKey;
    }): Promise<(TransactionResult & {
        collection?: PublicKey;
    }) | (PreparedTransaction & {
        collection: PublicKey;
    })>;
    /**
     * Rotate to a new base collection - v0.3.0 (Admin only)
     * Sets a different collection as the active base collection for new registrations
     * Only the program authority can call this
     * @param newCollection - The collection to set as active base
     * @param options - Write options (skipSend, signer)
     */
    rotateBaseCollection(newCollection: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    private sendWithRetry;
}
/**
 * Transaction builder for Reputation Registry operations
 * v0.3.0 - Asset-based identification
 */
export declare class ReputationTransactionBuilder {
    private connection;
    private payer?;
    private indexerClient?;
    private instructionBuilder;
    constructor(connection: Connection, payer?: Keypair | undefined, indexerClient?: IndexerClient | undefined);
    /**
     * Give feedback - v0.5.0
     * @param asset - Agent Core asset
     * @param params - Feedback parameters (value, valueDecimals, score, tags, etc.)
     * @param options - Write options (skipSend, signer, feedbackIndex)
     */
    giveFeedback(asset: PublicKey, params: GiveFeedbackParams, options?: GiveFeedbackOptions): Promise<(TransactionResult & {
        feedbackIndex?: bigint;
    }) | (PreparedTransaction & {
        feedbackIndex: bigint;
    })>;
    /**
     * Revoke feedback - v0.4.0
     * @param asset - Agent Core asset
     * @param feedbackIndex - Feedback index to revoke
     * @param options - Write options (skipSend, signer)
     *
     * v0.4.0 BREAKING: Now uses ATOM Engine CPI for reputation tracking.
     */
    revokeFeedback(asset: PublicKey, feedbackIndex: bigint, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Append response to feedback - v0.3.0
     * @param asset - Agent Core asset
     * @param client - Client address who gave the feedback
     * @param feedbackIndex - Feedback index
     * @param responseUri - Response URI
     * @param responseHash - Response hash (optional for ipfs://)
     * @param options - Write options (skipSend, signer)
     */
    appendResponse(asset: PublicKey, client: PublicKey, feedbackIndex: bigint, responseUri: string, responseHash?: Buffer, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
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
    setFeedbackTags(_asset: PublicKey, _feedbackIndex: bigint, _tag1: string, _tag2: string, _options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
}
/**
 * Transaction builder for Validation Registry operations
 * v0.3.0 - Asset-based identification
 */
export declare class ValidationTransactionBuilder {
    private connection;
    private payer?;
    private instructionBuilder;
    constructor(connection: Connection, payer?: Keypair | undefined);
    /**
     * Request validation for an agent - v0.3.0
     * @param asset - Agent Core asset
     * @param validatorAddress - Validator public key
     * @param nonce - Request nonce
     * @param requestUri - Request URI
     * @param requestHash - Request hash
     * @param options - Write options (skipSend, signer)
     */
    requestValidation(asset: PublicKey, validatorAddress: PublicKey, nonce: number, requestUri: string, requestHash: Buffer, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
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
    respondToValidation(asset: PublicKey, nonce: number, response: number, responseUri: string, responseHash: Buffer, tag: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
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
    updateValidation(_asset: PublicKey, _nonce: number, _response: number, _responseUri: string, _responseHash: Buffer, _tag: string, _options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Close validation request to recover rent - v0.3.0
     * @param asset - Agent Core asset
     * @param validatorAddress - Validator public key
     * @param nonce - Request nonce
     * @param rentReceiver - Address to receive rent (defaults to signer)
     * @param options - Write options (skipSend, signer)
     * @deprecated Not supported on-chain in current program
     */
    closeValidation(_asset: PublicKey, _validatorAddress: PublicKey, _nonce: number, _rentReceiver?: PublicKey, _options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
}
/**
 * Transaction builder for ATOM Engine operations
 * v0.4.0 - Agent Trust On-chain Model
 */
export declare class AtomTransactionBuilder {
    private connection;
    private payer?;
    private instructionBuilder;
    constructor(connection: Connection, payer?: Keypair | undefined);
    /**
     * Initialize AtomStats for an agent - v0.4.0
     * Must be called by the agent owner before any feedback can be given
     * @param asset - Agent Core asset
     * @param options - Write options (skipSend, signer)
     */
    initializeStats(asset: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Initialize global ATOM config - v0.4.x
     * One-time setup by program authority
     * @param agentRegistryProgram - Optional agent registry program ID override
     * @param options - Write options
     */
    initializeConfig(agentRegistryProgram?: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Update global ATOM config parameters - v0.4.x
     * Authority only
     * @param params - Config parameters to update (only provided fields are changed)
     * @param options - Write options
     */
    updateConfig(params: UpdateAtomConfigParams, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
}
//# sourceMappingURL=transaction-builder.d.ts.map