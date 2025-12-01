/**
 * Manual instruction builder for ERC-8004 Solana programs
 * Builds transactions without Anchor dependency
 * Must match exactly the instruction layouts in 8004-solana programs
 */
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import type { Cluster } from './client.js';
/**
 * Instruction builder for Identity Registry
 * Program: 2dtvC4hyb7M6fKwNx1C6h4SrahYvor3xW11eH6uLNvSZ
 */
export declare class IdentityInstructionBuilder {
    private programId;
    constructor(cluster?: Cluster);
    /**
     * Build register instruction (with optional URI)
     */
    buildRegister(config: PublicKey, collectionAuthorityPda: PublicKey, agentAccount: PublicKey, agentMint: PublicKey, agentMetadata: PublicKey, agentMasterEdition: PublicKey, agentTokenAccount: PublicKey, collectionMint: PublicKey, collectionMetadata: PublicKey, collectionMasterEdition: PublicKey, owner: PublicKey, agentUri?: string): TransactionInstruction;
    /**
     * Build registerWithMetadata instruction
     * @param metadata - Array of metadata entries (max 10)
     */
    buildRegisterWithMetadata(config: PublicKey, collectionAuthorityPda: PublicKey, agentAccount: PublicKey, agentMint: PublicKey, agentMetadata: PublicKey, agentMasterEdition: PublicKey, agentTokenAccount: PublicKey, collectionMint: PublicKey, collectionMetadata: PublicKey, collectionMasterEdition: PublicKey, owner: PublicKey, agentUri?: string, metadata?: Array<{
        key: string;
        value: string;
    }>): TransactionInstruction;
    /**
     * Build setAgentUri instruction
     */
    buildSetAgentUri(agentAccount: PublicKey, tokenAccount: PublicKey, agentMetadata: PublicKey, agentMint: PublicKey, owner: PublicKey, newUri: string): TransactionInstruction;
    /**
     * Build setMetadata instruction (inline metadata storage)
     * Accounts: agent_account (mut), token_account, owner (signer)
     */
    buildSetMetadata(agentAccount: PublicKey, tokenAccount: PublicKey, owner: PublicKey, key: string, value: string): TransactionInstruction;
    /**
     * Build createMetadataExtension instruction
     */
    buildCreateMetadataExtension(metadataExtension: PublicKey, agentMint: PublicKey, agentAccount: PublicKey, tokenAccount: PublicKey, owner: PublicKey, extensionIndex: number): TransactionInstruction;
    /**
     * Build setMetadataExtended instruction (extension PDA metadata storage)
     */
    buildSetMetadataExtended(metadataExtension: PublicKey, agentMint: PublicKey, agentAccount: PublicKey, tokenAccount: PublicKey, owner: PublicKey, extensionIndex: number, key: string, value: string): TransactionInstruction;
    /**
     * Build transferAgent instruction
     */
    buildTransferAgent(agentAccount: PublicKey, fromTokenAccount: PublicKey, toTokenAccount: PublicKey, agentMint: PublicKey, agentMetadata: PublicKey, owner: PublicKey): TransactionInstruction;
    private serializeString;
    private serializeMetadata;
}
/**
 * Instruction builder for Reputation Registry
 * Program: 9WcFLL3Fsqs96JxuewEt9iqRwULtCZEsPT717hPbsQAa
 */
export declare class ReputationInstructionBuilder {
    private programId;
    constructor(cluster?: Cluster);
    /**
     * Build giveFeedback instruction
     * Matches: give_feedback(agent_id, score, tag1, tag2, file_uri, file_hash, feedback_index)
     */
    buildGiveFeedback(client: PublicKey, payer: PublicKey, agentMint: PublicKey, agentAccount: PublicKey, clientIndex: PublicKey, feedbackAccount: PublicKey, agentReputation: PublicKey, identityRegistryProgram: PublicKey, agentId: bigint, score: number, tag1: string, tag2: string, fileUri: string, fileHash: Buffer, feedbackIndex: bigint): TransactionInstruction;
    /**
     * Build revokeFeedback instruction
     * Matches: revoke_feedback(agent_id, feedback_index)
     */
    buildRevokeFeedback(client: PublicKey, feedbackAccount: PublicKey, agentReputation: PublicKey, agentId: bigint, feedbackIndex: bigint): TransactionInstruction;
    /**
     * Build appendResponse instruction
     * Matches: append_response(agent_id, client_address, feedback_index, response_uri, response_hash)
     */
    buildAppendResponse(responder: PublicKey, payer: PublicKey, feedbackAccount: PublicKey, responseIndex: PublicKey, responseAccount: PublicKey, agentId: bigint, clientAddress: PublicKey, feedbackIndex: bigint, responseUri: string, responseHash: Buffer): TransactionInstruction;
    private serializeString;
    private serializeU64;
}
/**
 * Instruction builder for Validation Registry
 * Program: CXvuHNGWTHNqXmWr95wSpNGKR3kpcJUhzKofTF3zsoxW
 */
export declare class ValidationInstructionBuilder {
    private programId;
    constructor(cluster?: Cluster);
    /**
     * Build requestValidation instruction
     * Matches: request_validation(agent_id, validator_address, nonce, request_uri, request_hash)
     */
    buildRequestValidation(config: PublicKey, requester: PublicKey, payer: PublicKey, agentMint: PublicKey, agentAccount: PublicKey, tokenAccount: PublicKey, validationRequest: PublicKey, identityRegistryProgram: PublicKey, agentId: bigint, validatorAddress: PublicKey, nonce: number, requestUri: string, requestHash: Buffer): TransactionInstruction;
    /**
     * Build respondToValidation instruction
     * Matches: respond_to_validation(response, response_uri, response_hash, tag)
     */
    buildRespondToValidation(config: PublicKey, validator: PublicKey, validationRequest: PublicKey, response: number, responseUri: string, responseHash: Buffer, tag: string): TransactionInstruction;
    /**
     * Build updateValidation instruction (same as respondToValidation)
     */
    buildUpdateValidation(config: PublicKey, validator: PublicKey, validationRequest: PublicKey, response: number, responseUri: string, responseHash: Buffer, tag: string): TransactionInstruction;
    /**
     * Build closeValidation instruction
     */
    buildCloseValidation(config: PublicKey, closer: PublicKey, agentMint: PublicKey, agentAccount: PublicKey, tokenAccount: PublicKey, validationRequest: PublicKey, identityRegistryProgram: PublicKey, rentReceiver: PublicKey): TransactionInstruction;
    private serializeString;
    private serializeU64;
    private serializeU32;
}
//# sourceMappingURL=instruction-builder.d.ts.map