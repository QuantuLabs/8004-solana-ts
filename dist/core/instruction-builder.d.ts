/**
 * Manual instruction builder for ERC-8004 Solana programs
 * v0.3.0 - Asset-based identification
 * Builds transactions without Anchor dependency
 * Must match exactly the instruction layouts in 8004-solana programs
 *
 * BREAKING CHANGES from v0.2.0:
 * - agent_id (u64) removed from all instruction arguments
 * - Asset (Pubkey) used for PDA derivation only
 * - New multi-collection instructions added
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
     * Build deleteMetadata instruction (v0.2.0 - deletes MetadataEntryPda)
     * Accounts: metadata_entry, agent_account, asset, owner (signer)
     */
    buildDeleteMetadata(metadataEntry: PublicKey, agentAccount: PublicKey, asset: PublicKey, owner: PublicKey, keyHash: Buffer): TransactionInstruction;
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
    /**
     * Build createBaseRegistry instruction - v0.3.0
     * Creates a new base registry (authority only)
     * Accounts: root_config, registry_config, collection (signer), authority (signer), system_program, mpl_core_program
     */
    buildCreateBaseRegistry(rootConfig: PublicKey, registryConfig: PublicKey, collection: PublicKey, authority: PublicKey): TransactionInstruction;
    /**
     * Build rotateBaseRegistry instruction - v0.3.0
     * Rotates to a new base registry (authority only)
     * Accounts: root_config, new_registry, authority (signer)
     */
    buildRotateBaseRegistry(rootConfig: PublicKey, newRegistry: PublicKey, authority: PublicKey): TransactionInstruction;
    /**
     * Build createUserRegistry instruction - v0.3.0
     * Creates a user-owned registry collection
     * Accounts: collection_authority, registry_config, collection (signer), owner (signer), system_program, mpl_core_program
     */
    buildCreateUserRegistry(collectionAuthority: PublicKey, registryConfig: PublicKey, collection: PublicKey, owner: PublicKey, collectionName: string, collectionUri: string): TransactionInstruction;
    /**
     * Build updateUserRegistryMetadata instruction - v0.3.0
     * Updates metadata for a user-owned registry
     * Accounts: collection_authority, registry_config, collection, owner (signer), system_program, mpl_core_program
     */
    buildUpdateUserRegistryMetadata(collectionAuthority: PublicKey, registryConfig: PublicKey, collection: PublicKey, owner: PublicKey, newName: string | null, newUri: string | null): TransactionInstruction;
    /**
     * Build setAgentWallet instruction - v0.3.0
     * Sets the agent wallet metadata with Ed25519 signature verification
     * Accounts: owner (signer), payer (signer), agent_account, wallet_metadata, asset, instructions_sysvar, system_program
     * NOTE: Requires Ed25519 signature instruction immediately before in transaction
     */
    buildSetAgentWallet(owner: PublicKey, payer: PublicKey, agentAccount: PublicKey, walletMetadata: PublicKey, asset: PublicKey, newWallet: PublicKey, deadline: bigint): TransactionInstruction;
    private serializeString;
    private serializeOption;
}
/**
 * Instruction builder for Reputation Registry
 * v0.3.0 - agent_id removed, uses asset for PDA derivation
 * Program: HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp
 */
export declare class ReputationInstructionBuilder {
    private programId;
    constructor();
    /**
     * Build giveFeedback instruction - v0.3.0
     * Matches: give_feedback(score, tag1, tag2, endpoint, feedback_uri, feedback_hash, feedback_index)
     * Accounts: client (signer), payer (signer), asset, agent_account, feedback_account, agent_reputation, system_program
     */
    buildGiveFeedback(client: PublicKey, payer: PublicKey, asset: PublicKey, agentAccount: PublicKey, feedbackAccount: PublicKey, agentReputation: PublicKey, score: number, tag1: string, tag2: string, endpoint: string, feedbackUri: string, feedbackHash: Buffer, feedbackIndex: bigint): TransactionInstruction;
    /**
     * Build revokeFeedback instruction - v0.3.0
     * Matches: revoke_feedback(feedback_index)
     * Accounts: client (signer), feedback_account, agent_reputation
     */
    buildRevokeFeedback(client: PublicKey, feedbackAccount: PublicKey, agentReputation: PublicKey, feedbackIndex: bigint): TransactionInstruction;
    /**
     * Build appendResponse instruction - v0.3.0
     * Matches: append_response(feedback_index, response_uri, response_hash)
     * Accounts: responder (signer), payer (signer), asset, feedback_account, response_index, response_account, system_program
     */
    buildAppendResponse(responder: PublicKey, payer: PublicKey, asset: PublicKey, feedbackAccount: PublicKey, responseIndex: PublicKey, responseAccount: PublicKey, feedbackIndex: bigint, responseUri: string, responseHash: Buffer): TransactionInstruction;
    /**
     * Build setFeedbackTags instruction - v0.3.0
     * Matches: set_feedback_tags(feedback_index, tag1, tag2)
     * Accounts: client (signer), payer (signer), feedback_account, feedback_tags, system_program
     */
    buildSetFeedbackTags(client: PublicKey, payer: PublicKey, feedbackAccount: PublicKey, feedbackTags: PublicKey, feedbackIndex: bigint, tag1: string, tag2: string): TransactionInstruction;
    private serializeString;
    private serializeU64;
}
/**
 * Instruction builder for Validation Registry
 * v0.3.0 - agent_id removed, uses asset for PDA derivation
 * Program: HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp
 */
export declare class ValidationInstructionBuilder {
    private programId;
    constructor();
    /**
     * Build requestValidation instruction - v0.3.0
     * Matches: request_validation(validator_address, nonce, request_uri, request_hash)
     * Accounts: root_config, requester (signer), payer (signer), asset, agent_account, validation_request, system_program
     */
    buildRequestValidation(rootConfig: PublicKey, requester: PublicKey, payer: PublicKey, asset: PublicKey, agentAccount: PublicKey, validationRequest: PublicKey, validatorAddress: PublicKey, nonce: number, requestUri: string, requestHash: Buffer): TransactionInstruction;
    /**
     * Build respondToValidation instruction - v0.3.0
     * Matches: respond_to_validation(response, response_uri, response_hash, tag)
     * Accounts: validator (signer), asset, agent_account, validation_request
     */
    buildRespondToValidation(validator: PublicKey, asset: PublicKey, agentAccount: PublicKey, validationRequest: PublicKey, response: number, responseUri: string, responseHash: Buffer, tag: string): TransactionInstruction;
    /**
     * Build updateValidation instruction - v0.3.0
     * Same signature as respondToValidation but different discriminator
     * Accounts: validator (signer), asset, agent_account, validation_request
     */
    buildUpdateValidation(validator: PublicKey, asset: PublicKey, agentAccount: PublicKey, validationRequest: PublicKey, response: number, responseUri: string, responseHash: Buffer, tag: string): TransactionInstruction;
    /**
     * Build closeValidation instruction - v0.3.0
     * Accounts: root_config, closer (signer), asset, agent_account, validation_request, rent_receiver
     */
    buildCloseValidation(rootConfig: PublicKey, closer: PublicKey, asset: PublicKey, agentAccount: PublicKey, validationRequest: PublicKey, rentReceiver: PublicKey): TransactionInstruction;
    private serializeString;
    private serializeU64;
    private serializeU32;
}
//# sourceMappingURL=instruction-builder.d.ts.map