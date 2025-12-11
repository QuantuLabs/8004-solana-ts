/**
 * Manual instruction builder for ERC-8004 Solana programs
 * v0.2.0 - Metaplex Core architecture
 * Builds transactions without Anchor dependency
 * Must match exactly the instruction layouts in 8004-solana programs
 */
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
/**
 * Instruction builder for Identity Registry (Metaplex Core)
 * Program: HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp
 */
export declare class IdentityInstructionBuilder {
    private programId;
    constructor();
    /**
     * Build register instruction (Metaplex Core)
     * Accounts: config, agent_account, asset (signer), collection, owner (signer), system_program, mpl_core_program
     */
    buildRegister(config: PublicKey, agentAccount: PublicKey, asset: PublicKey, collection: PublicKey, owner: PublicKey, agentUri?: string): TransactionInstruction;
    /**
     * Build registerWithMetadata instruction (Metaplex Core)
     * @param metadata - Array of metadata entries (max per config)
     */
    buildRegisterWithMetadata(config: PublicKey, agentAccount: PublicKey, asset: PublicKey, collection: PublicKey, owner: PublicKey, agentUri?: string, metadata?: Array<{
        key: string;
        value: string;
    }>): TransactionInstruction;
    /**
     * Build setAgentUri instruction (Metaplex Core)
     * Accounts: config, agent_account, asset, collection, owner (signer), system_program, mpl_core_program
     */
    buildSetAgentUri(config: PublicKey, agentAccount: PublicKey, asset: PublicKey, collection: PublicKey, owner: PublicKey, newUri: string): TransactionInstruction;
    /**
     * Build setMetadata instruction (v0.2.0 - uses MetadataEntryPda)
     * Accounts: metadata_entry, agent_account, asset, owner (signer), system_program
     */
    buildSetMetadata(metadataEntry: PublicKey, agentAccount: PublicKey, asset: PublicKey, owner: PublicKey, keyHash: Buffer, key: string, value: string, immutable?: boolean): TransactionInstruction;
    /**
     * Build createMetadataExtension instruction (Metaplex Core)
     * Accounts: metadata_extension, asset, agent_account, owner (signer), system_program
     */
    buildCreateMetadataExtension(metadataExtension: PublicKey, asset: PublicKey, agentAccount: PublicKey, owner: PublicKey, extensionIndex: number): TransactionInstruction;
    /**
     * Build setMetadataExtended instruction (Metaplex Core)
     * Accounts: metadata_extension, asset, agent_account, owner (signer)
     */
    buildSetMetadataExtended(metadataExtension: PublicKey, asset: PublicKey, agentAccount: PublicKey, owner: PublicKey, extensionIndex: number, key: string, value: string): TransactionInstruction;
    /**
     * Build transferAgent instruction (Metaplex Core)
     * Accounts: agent_account, asset, collection, owner (signer), new_owner, mpl_core_program
     */
    buildTransferAgent(agentAccount: PublicKey, asset: PublicKey, collection: PublicKey, owner: PublicKey, newOwner: PublicKey): TransactionInstruction;
    /**
     * Build syncOwner instruction
     * Accounts: agent_account, asset
     */
    buildSyncOwner(agentAccount: PublicKey, asset: PublicKey): TransactionInstruction;
    private serializeString;
    private serializeMetadata;
}
/**
 * Instruction builder for Reputation Registry
 * Program: HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp
 */
export declare class ReputationInstructionBuilder {
    private programId;
    constructor();
    /**
     * Build giveFeedback instruction
     * Matches: give_feedback(agent_id, score, tag1, tag2, file_uri, file_hash, feedback_index)
     * Accounts: client, payer, asset, agent_account, feedback_account, agent_reputation, system_program
     */
    buildGiveFeedback(client: PublicKey, payer: PublicKey, asset: PublicKey, agentAccount: PublicKey, feedbackAccount: PublicKey, agentReputation: PublicKey, agentId: bigint, score: number, tag1: string, tag2: string, fileUri: string, fileHash: Buffer, feedbackIndex: bigint): TransactionInstruction;
    /**
     * Build revokeFeedback instruction
     * Matches: revoke_feedback(agent_id, feedback_index)
     */
    buildRevokeFeedback(client: PublicKey, feedbackAccount: PublicKey, agentReputation: PublicKey, agentId: bigint, feedbackIndex: bigint): TransactionInstruction;
    /**
     * Build appendResponse instruction
     * Matches: append_response(agent_id, feedback_index, response_uri, response_hash)
     */
    buildAppendResponse(responder: PublicKey, payer: PublicKey, feedbackAccount: PublicKey, responseIndex: PublicKey, responseAccount: PublicKey, agentId: bigint, feedbackIndex: bigint, responseUri: string, responseHash: Buffer): TransactionInstruction;
    /**
     * Build setFeedbackTags instruction
     * Matches: set_feedback_tags(agent_id, feedback_index, tag1, tag2)
     * Accounts: client, payer, feedback_account, feedback_tags, system_program
     */
    buildSetFeedbackTags(client: PublicKey, payer: PublicKey, feedbackAccount: PublicKey, feedbackTags: PublicKey, agentId: bigint, feedbackIndex: bigint, tag1: string, tag2: string): TransactionInstruction;
    private serializeString;
    private serializeU64;
}
/**
 * Instruction builder for Validation Registry
 * Program: HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp
 */
export declare class ValidationInstructionBuilder {
    private programId;
    constructor();
    /**
     * Build requestValidation instruction
     * Matches: request_validation(agent_id, validator_address, nonce, request_uri, request_hash)
     */
    buildRequestValidation(config: PublicKey, requester: PublicKey, payer: PublicKey, asset: PublicKey, agentAccount: PublicKey, validationRequest: PublicKey, agentId: bigint, validatorAddress: PublicKey, nonce: number, requestUri: string, requestHash: Buffer): TransactionInstruction;
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
    buildCloseValidation(config: PublicKey, closer: PublicKey, asset: PublicKey, agentAccount: PublicKey, validationRequest: PublicKey, rentReceiver: PublicKey): TransactionInstruction;
    private serializeString;
    private serializeU64;
    private serializeU32;
}
//# sourceMappingURL=instruction-builder.d.ts.map