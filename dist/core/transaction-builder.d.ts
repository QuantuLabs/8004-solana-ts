/**
 * Transaction builder for ERC-8004 Solana programs
 * v0.2.0 - Metaplex Core architecture
 * Handles transaction creation, signing, and sending without Anchor
 */
import { PublicKey, Transaction, Connection, Keypair, TransactionSignature } from '@solana/web3.js';
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
export declare function serializeTransaction(transaction: Transaction, signer: PublicKey, blockhash: string, lastValidBlockHeight: number): PreparedTransaction;
/**
 * Transaction builder for Identity Registry operations (Metaplex Core)
 */
export declare class IdentityTransactionBuilder {
    private connection;
    private payer?;
    private instructionBuilder;
    constructor(connection: Connection, payer?: Keypair | undefined);
    /**
     * Register a new agent (Metaplex Core)
     * @param agentUri - Optional agent URI
     * @param metadata - Optional metadata entries (key-value pairs)
     * @param options - Write options (skipSend, signer, assetPubkey)
     * @returns Transaction result with agent ID, asset, and all signatures
     */
    registerAgent(agentUri?: string, metadata?: Array<{
        key: string;
        value: string;
    }>, options?: RegisterAgentOptions): Promise<(TransactionResult & {
        agentId?: bigint;
        asset?: PublicKey;
        signatures?: string[];
    }) | (PreparedTransaction & {
        agentId: bigint;
        asset: PublicKey;
    })>;
    /**
     * Set agent URI by asset (Metaplex Core)
     * @param asset - Agent Core asset
     * @param newUri - New URI
     * @param options - Write options (skipSend, signer)
     */
    setAgentUri(asset: PublicKey, newUri: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Set metadata for agent by asset (v0.2.0 - uses MetadataEntryPda)
     * @param asset - Agent Core asset
     * @param key - Metadata key
     * @param value - Metadata value
     * @param immutable - If true, metadata cannot be modified or deleted (default: false)
     * @param options - Write options (skipSend, signer)
     */
    setMetadata(asset: PublicKey, key: string, value: string, immutable?: boolean, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Delete agent metadata (v0.2.0 - deletes MetadataEntryPda)
     * Only works for mutable metadata (will fail for immutable)
     * @param asset - Agent Core asset
     * @param key - Metadata key to delete
     * @param options - Write options (skipSend, signer)
     */
    deleteMetadata(asset: PublicKey, key: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Transfer agent to another owner (Metaplex Core)
     * @param asset - Agent Core asset
     * @param toOwner - New owner public key
     * @param options - Write options (skipSend, signer)
     */
    transferAgent(asset: PublicKey, toOwner: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    private sendWithRetry;
}
/**
 * Transaction builder for Reputation Registry operations
 */
export declare class ReputationTransactionBuilder {
    private connection;
    private payer?;
    private instructionBuilder;
    constructor(connection: Connection, payer?: Keypair | undefined);
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
    giveFeedback(asset: PublicKey, agentId: bigint, score: number, tag1: string, tag2: string, fileUri: string, fileHash: Buffer, options?: WriteOptions): Promise<(TransactionResult & {
        feedbackIndex?: bigint;
    }) | (PreparedTransaction & {
        feedbackIndex: bigint;
    })>;
    /**
     * Revoke feedback
     * @param agentId - Agent ID
     * @param feedbackIndex - Feedback index to revoke
     * @param options - Write options (skipSend, signer)
     */
    revokeFeedback(agentId: bigint, feedbackIndex: bigint, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Append response to feedback
     * @param agentId - Agent ID
     * @param feedbackIndex - Feedback index
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param options - Write options (skipSend, signer)
     */
    appendResponse(agentId: bigint, feedbackIndex: bigint, responseUri: string, responseHash: Buffer, options?: WriteOptions): Promise<(TransactionResult & {
        responseIndex?: bigint;
    }) | (PreparedTransaction & {
        responseIndex: bigint;
    })>;
    /**
     * Set feedback tags (optional, creates FeedbackTagsPda)
     * Creates a separate PDA for tags to save -42% cost when tags not needed
     * @param agentId - Agent ID
     * @param feedbackIndex - Feedback index
     * @param tag1 - First tag (max 32 bytes)
     * @param tag2 - Second tag (max 32 bytes)
     * @param options - Write options (skipSend, signer)
     */
    setFeedbackTags(agentId: bigint, feedbackIndex: bigint, tag1: string, tag2: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
}
/**
 * Transaction builder for Validation Registry operations
 */
export declare class ValidationTransactionBuilder {
    private connection;
    private payer?;
    private instructionBuilder;
    constructor(connection: Connection, payer?: Keypair | undefined);
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
    requestValidation(asset: PublicKey, agentId: bigint, validatorAddress: PublicKey, nonce: number, requestUri: string, requestHash: Buffer, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
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
    respondToValidation(agentId: bigint, nonce: number, response: number, responseUri: string, responseHash: Buffer, tag: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
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
    updateValidation(agentId: bigint, nonce: number, response: number, responseUri: string, responseHash: Buffer, tag: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Close validation request to recover rent
     * @param asset - Agent Core asset
     * @param agentId - Agent ID
     * @param validatorAddress - Validator public key
     * @param nonce - Request nonce
     * @param rentReceiver - Address to receive rent (defaults to signer)
     * @param options - Write options (skipSend, signer)
     */
    closeValidation(asset: PublicKey, agentId: bigint, validatorAddress: PublicKey, nonce: number, rentReceiver?: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
}
//# sourceMappingURL=transaction-builder.d.ts.map