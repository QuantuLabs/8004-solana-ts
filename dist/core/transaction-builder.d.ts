/**
 * Transaction builder for ERC-8004 Solana programs
 * Handles transaction creation, signing, and sending without Anchor
 * Updated to match 8004-solana program interfaces
 */
import { PublicKey, Transaction, Connection, Keypair, TransactionSignature } from '@solana/web3.js';
import type { Cluster } from './client.js';
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
 * Extended options for registerAgent (requires mintPubkey when skipSend is true)
 */
export interface RegisterAgentOptions extends WriteOptions {
    /** Required when skipSend is true - the client generates the mint keypair locally */
    mintPubkey?: PublicKey;
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
 * Transaction builder for Identity Registry operations
 */
export declare class IdentityTransactionBuilder {
    private connection;
    private cluster;
    private payer?;
    private instructionBuilder;
    constructor(connection: Connection, cluster: Cluster, payer?: Keypair | undefined);
    /**
     * Register a new agent
     * @param agentUri - Optional agent URI
     * @param metadata - Optional metadata entries (key-value pairs)
     * @param options - Write options (skipSend, signer, mintPubkey)
     * @returns Transaction result with agent ID, agentMint, and all signatures
     */
    registerAgent(agentUri?: string, metadata?: Array<{
        key: string;
        value: string;
    }>, options?: RegisterAgentOptions): Promise<(TransactionResult & {
        agentId?: bigint;
        agentMint?: PublicKey;
        signatures?: string[];
    }) | (PreparedTransaction & {
        agentId: bigint;
        agentMint: PublicKey;
    })>;
    /**
     * Set agent URI by mint
     * @param agentMint - Agent NFT mint
     * @param newUri - New URI
     * @param options - Write options (skipSend, signer)
     */
    setAgentUri(agentMint: PublicKey, newUri: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Set metadata for agent by mint (inline storage)
     * @param agentMint - Agent NFT mint
     * @param key - Metadata key
     * @param value - Metadata value
     * @param options - Write options (skipSend, signer)
     */
    setMetadataByMint(agentMint: PublicKey, key: string, value: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Set metadata extended for agent by mint (extension PDA storage)
     * @param agentMint - Agent NFT mint
     * @param extensionIndex - Extension index
     * @param key - Metadata key
     * @param value - Metadata value
     * @param options - Write options (skipSend, signer)
     */
    setMetadataExtendedByMint(agentMint: PublicKey, extensionIndex: number, key: string, value: string, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    /**
     * Transfer agent to another owner
     * @param agentMint - Agent NFT mint
     * @param toOwner - New owner public key
     * @param options - Write options (skipSend, signer)
     */
    transferAgent(agentMint: PublicKey, toOwner: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
    private estimateInstructionSize;
    private calculateOptimalBatch;
    private sendWithRetry;
}
/**
 * Transaction builder for Reputation Registry operations
 */
export declare class ReputationTransactionBuilder {
    private connection;
    private cluster;
    private payer?;
    private instructionBuilder;
    constructor(connection: Connection, cluster: Cluster, payer?: Keypair | undefined);
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
    giveFeedback(agentMint: PublicKey, agentId: bigint, score: number, tag1: string, tag2: string, fileUri: string, fileHash: Buffer, options?: WriteOptions): Promise<(TransactionResult & {
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
     * @param clientAddress - Client who gave feedback
     * @param feedbackIndex - Feedback index
     * @param responseUri - Response URI
     * @param responseHash - Response hash
     * @param options - Write options (skipSend, signer)
     */
    appendResponse(agentId: bigint, clientAddress: PublicKey, feedbackIndex: bigint, responseUri: string, responseHash: Buffer, options?: WriteOptions): Promise<(TransactionResult & {
        responseIndex?: bigint;
    }) | (PreparedTransaction & {
        responseIndex: bigint;
    })>;
}
/**
 * Transaction builder for Validation Registry operations
 */
export declare class ValidationTransactionBuilder {
    private connection;
    private cluster;
    private payer?;
    private instructionBuilder;
    constructor(connection: Connection, cluster: Cluster, payer?: Keypair | undefined);
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
    requestValidation(agentMint: PublicKey, agentId: bigint, validatorAddress: PublicKey, nonce: number, requestUri: string, requestHash: Buffer, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
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
     * @param agentMint - Agent NFT mint
     * @param agentId - Agent ID
     * @param validatorAddress - Validator public key
     * @param nonce - Request nonce
     * @param rentReceiver - Address to receive rent (defaults to signer)
     * @param options - Write options (skipSend, signer)
     */
    closeValidation(agentMint: PublicKey, agentId: bigint, validatorAddress: PublicKey, nonce: number, rentReceiver?: PublicKey, options?: WriteOptions): Promise<TransactionResult | PreparedTransaction>;
}
//# sourceMappingURL=transaction-builder.d.ts.map