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
     * Accounts: registry_config, agent_account, asset (signer), collection,
     *           user_collection_authority (optional), owner (signer), system_program, mpl_core_program
     */
    buildRegister(config: PublicKey, agentAccount: PublicKey, asset: PublicKey, collection: PublicKey, owner: PublicKey, agentUri?: string): TransactionInstruction;
    /**
     * Build register_with_options instruction (Metaplex Core)
     * Accounts: registry_config, agent_account, asset (signer), collection,
     *           user_collection_authority (optional), owner (signer), system_program, mpl_core_program
     */
    buildRegisterWithOptions(config: PublicKey, agentAccount: PublicKey, asset: PublicKey, collection: PublicKey, owner: PublicKey, agentUri: string, atomEnabled: boolean): TransactionInstruction;
    /**
     * Build enable_atom instruction (one-way)
     * Accounts: agent_account, asset, owner (signer)
     */
    buildEnableAtom(agentAccount: PublicKey, asset: PublicKey, owner: PublicKey): TransactionInstruction;
    /**
     * Build setAgentUri instruction (Metaplex Core)
     * Accounts: registry_config, agent_account, asset, collection,
     *           user_collection_authority (optional), owner (signer), system_program, mpl_core_program
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
     * Build setAgentWallet instruction - v0.4.2
     * Sets the agent wallet with Ed25519 signature verification
     * Wallet is stored directly in AgentAccount (no separate PDA)
     * Accounts: owner (signer), agent_account, asset, instructions_sysvar
     * NOTE: Requires Ed25519 signature instruction immediately before in transaction
     */
    buildSetAgentWallet(owner: PublicKey, agentAccount: PublicKey, asset: PublicKey, newWallet: PublicKey, deadline: bigint): TransactionInstruction;
    private serializeString;
    private serializeOption;
}
/**
 * Instruction builder for Reputation Registry
 * v0.5.0 - value/valueDecimals support (EVM compatibility)
 * Program: HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp
 */
export declare class ReputationInstructionBuilder {
    private programId;
    constructor();
    /**
     * Build giveFeedback instruction - v0.5.0
     * Matches: give_feedback(value, value_decimals, score, feedback_hash, feedback_index, tag1, tag2, endpoint, feedback_uri)
     * Accounts: client (signer), agent_account, asset, collection, system_program, [atom_config, atom_stats, atom_engine_program, registry_authority]
     */
    buildGiveFeedback(client: PublicKey, agentAccount: PublicKey, asset: PublicKey, collection: PublicKey, atomConfig: PublicKey | null, atomStats: PublicKey | null, registryAuthority: PublicKey | null, value: bigint, valueDecimals: number, score: number | null, feedbackHash: Buffer, feedbackIndex: bigint, tag1: string, tag2: string, endpoint: string, feedbackUri: string): TransactionInstruction;
    private serializeI64;
    private serializeOptionU8;
    /**
     * Build revokeFeedback instruction - v0.4.0
     * Matches: revoke_feedback(feedback_index)
     * Accounts: client (signer), agent_account, asset, system_program, [atom_config, atom_stats, atom_engine_program, registry_authority]
     * v0.4.0 BREAKING: Removed feedback_account and agent_reputation, added ATOM Engine CPI accounts
     */
    buildRevokeFeedback(client: PublicKey, agentAccount: PublicKey, asset: PublicKey, atomConfig: PublicKey | null, atomStats: PublicKey | null, registryAuthority: PublicKey | null, feedbackIndex: bigint): TransactionInstruction;
    /**
     * Build appendResponse instruction - v0.4.1
     * Matches: append_response(asset_key, client_address, feedback_index, response_uri, response_hash)
     * Accounts: responder (signer), agent_account, asset
     */
    buildAppendResponse(responder: PublicKey, agentAccount: PublicKey, asset: PublicKey, client: PublicKey, feedbackIndex: bigint, responseUri: string, responseHash: Buffer): TransactionInstruction;
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
     * Accounts: validation_config, requester (signer), payer (signer), agent_account, asset, validation_request, validator, system_program
     */
    buildRequestValidation(validationConfig: PublicKey, requester: PublicKey, payer: PublicKey, agentAccount: PublicKey, asset: PublicKey, validationRequest: PublicKey, validatorAddress: PublicKey, nonce: number, requestUri: string, requestHash: Buffer): TransactionInstruction;
    /**
     * Build respondToValidation instruction - v0.5.0 (OOM fix)
     * Matches: respond_to_validation(asset_key, validator_address, nonce, response, response_uri, response_hash, tag)
     * Accounts: validator (signer), agent_account, asset, validation_request
     */
    buildRespondToValidation(validationConfig: PublicKey, validator: PublicKey, agentAccount: PublicKey, asset: PublicKey, validationRequest: PublicKey, nonce: number, response: number, responseUri: string, responseHash: Buffer, tag: string): TransactionInstruction;
    /**
     * Build updateValidation instruction - v0.3.0
     * Same signature as respondToValidation but different discriminator
     * Accounts: validator (signer), agent_account, asset, validation_request
     * Note: updateValidation does not use config account
     */
    buildUpdateValidation(validator: PublicKey, asset: PublicKey, agentAccount: PublicKey, validationRequest: PublicKey, response: number, responseUri: string, responseHash: Buffer, tag: string): TransactionInstruction;
    /**
     * Build closeValidation instruction - v0.3.0
     * Note: closeValidation does not use any config account
     * Accounts: closer (signer), asset, agent_account, validation_request, rent_receiver
     */
    buildCloseValidation(closer: PublicKey, asset: PublicKey, agentAccount: PublicKey, validationRequest: PublicKey, rentReceiver: PublicKey): TransactionInstruction;
    private serializeString;
    private serializeU64;
    private serializeU32;
}
/**
 * Instruction builder for ATOM Engine
 * v0.4.0 - Agent Trust On-chain Model
 * Program: 6Mu7qj6tRDrqchxJJPjr9V1H2XQjCerVKixFEEMwC1Tf
 */
export declare class AtomInstructionBuilder {
    private programId;
    constructor();
    /**
     * Build initializeStats instruction
     * Initializes AtomStats PDA for an agent (must be called before any feedback)
     * Only the agent owner can call this
     * Accounts: owner (signer), asset, collection, config, stats (created), system_program
     */
    buildInitializeStats(owner: PublicKey, asset: PublicKey, collection: PublicKey, config: PublicKey, stats: PublicKey): TransactionInstruction;
    /**
     * Build initializeConfig instruction
     * Initializes global AtomConfig PDA (one-time setup by authority)
     * Accounts: authority (signer), config (created), program_data, system_program
     * Data: agent_registry_program (Pubkey)
     */
    buildInitializeConfig(authority: PublicKey, config: PublicKey, programData: PublicKey, agentRegistryProgram: PublicKey): TransactionInstruction;
    /**
     * Build updateConfig instruction
     * Updates global AtomConfig parameters (authority only)
     * Accounts: authority (signer), config
     * @param params - Optional config params (only provided fields are updated)
     */
    buildUpdateConfig(authority: PublicKey, config: PublicKey, params: UpdateAtomConfigParams): TransactionInstruction;
}
/**
 * Parameters for updating ATOM config
 * All fields are optional - only provided fields will be updated
 */
export interface UpdateAtomConfigParams {
    alphaFast?: number;
    alphaSlow?: number;
    alphaVolatility?: number;
    alphaArrival?: number;
    weightSybil?: number;
    weightBurst?: number;
    weightStagnation?: number;
    weightShock?: number;
    weightVolatility?: number;
    weightArrival?: number;
    diversityThreshold?: number;
    burstThreshold?: number;
    shockThreshold?: number;
    volatilityThreshold?: number;
    paused?: boolean;
}
//# sourceMappingURL=instruction-builder.d.ts.map