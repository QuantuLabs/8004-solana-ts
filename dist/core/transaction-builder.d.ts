/**
 * Transaction builder for ERC-8004 Solana programs
 * v0.3.0 - Asset-based identification
 * Handles transaction creation, signing, and sending without Anchor
 *
 * BREAKING CHANGES from v0.2.0:
 * - agent_id removed from all methods, uses asset (Pubkey) for PDA derivation
 * - Multi-collection support via RootConfig
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
 * @returns PreparedTransaction with base64 serialized transaction
 */
export declare function serializeTransaction(transaction: Transaction, signer: PublicKey, blockhash: string, lastValidBlockHeight: number): PreparedTransaction;
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
     * @param options - Write options (skipSend, signer, assetPubkey)
     * @returns Transaction result with asset and all signatures
     */
    registerAgent(agentUri?: string, metadata?: Array<{
        key: string;
        value: string;
    }>, collection?: PublicKey, options?: RegisterAgentOptions): Promise<(TransactionResult & {
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
    private sendWithRetry;
}
/**
 * Transaction builder for Reputation Registry operations
 * v0.3.0 - Asset-based identification
 */
export declare class ReputationTransactionBuilder {
    private connection;
    private payer?;
    private instructionBuilder;
    constructor(connection: Connection, payer?: Keypair | undefined);
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
    giveFeedback(asset: PublicKey, score: number, tag1: string, tag2: string, endpoint: string, feedbackUri: string, feedbackHash: Buffer, options?: WriteOptions): Promise<(TransactionResult & {
        feedbackIndex?: bigint;
    }) | (PreparedTransaction & {
        feedbackIndex: bigint;
    })>;
    /**
     * Revoke feedback - v0.3.0
     * @param asset - Agent Core asset
     * @param feedbackIndex - Feedback index to revoke
     * @param options - Write options (skipSend, signer)
     */
    revokeFeedback(asset: PublicKey, feedbackIndex: bigint, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Append response to feedback - v0.3.0
     * @param asset - Agent Core asset
     * @param feedbackIndex - Feedback index
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param options - Write options (skipSend, signer)
     */
    appendResponse(asset: PublicKey, feedbackIndex: bigint, responseUri: string, responseHash: Buffer, options?: WriteOptions): Promise<(TransactionResult & {
        responseIndex?: bigint;
    }) | (PreparedTransaction & {
        responseIndex: bigint;
    })>;
    /**
     * Set feedback tags (optional, creates FeedbackTagsPda) - v0.3.0
     * Creates a separate PDA for tags to save -42% cost when tags not needed
     * @param asset - Agent Core asset
     * @param feedbackIndex - Feedback index
     * @param tag1 - First tag (max 32 bytes)
     * @param tag2 - Second tag (max 32 bytes)
     * @param options - Write options (skipSend, signer)
     */
    setFeedbackTags(asset: PublicKey, feedbackIndex: bigint, tag1: string, tag2: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
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
     */
    updateValidation(asset: PublicKey, nonce: number, response: number, responseUri: string, responseHash: Buffer, tag: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Close validation request to recover rent - v0.3.0
     * @param asset - Agent Core asset
     * @param validatorAddress - Validator public key
     * @param nonce - Request nonce
     * @param rentReceiver - Address to receive rent (defaults to signer)
     * @param options - Write options (skipSend, signer)
     */
    closeValidation(asset: PublicKey, validatorAddress: PublicKey, nonce: number, rentReceiver?: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
}
//# sourceMappingURL=transaction-builder.d.ts.map