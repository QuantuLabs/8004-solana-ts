/**
 * Manual instruction builder for 8004 Solana programs
 * v0.6.0 - Single-collection architecture
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
    private mplCoreProgramId;
    constructor(programId?: PublicKey, mplCoreProgramId?: PublicKey);
    /**
     * Build register instruction (Metaplex Core)
     * v0.6.0 accounts: root_config, registry_config, agent_account, asset (signer),
     *                   collection, owner (signer), system_program, mpl_core_program
     */
    buildRegister(rootConfig: PublicKey, registryConfig: PublicKey, agentAccount: PublicKey, asset: PublicKey, collection: PublicKey, owner: PublicKey, agentUri?: string): TransactionInstruction;
    /**
     * Build register_with_options instruction (Metaplex Core)
     * v0.6.0 accounts: root_config, registry_config, agent_account, asset (signer),
     *                   collection, owner (signer), system_program, mpl_core_program
     * Same context as register() but with explicit atom_enabled arg
     */
    buildRegisterWithOptions(rootConfig: PublicKey, registryConfig: PublicKey, agentAccount: PublicKey, asset: PublicKey, collection: PublicKey, owner: PublicKey, agentUri: string, atomEnabled: boolean): TransactionInstruction;
    /**
     * Build enable_atom instruction (one-way)
     * Accounts: agent_account, asset, owner (signer)
     */
    buildEnableAtom(agentAccount: PublicKey, asset: PublicKey, owner: PublicKey): TransactionInstruction;
    /**
     * Build setAgentUri instruction (Metaplex Core)
     * v0.6.0 accounts: registry_config, agent_account, asset, collection,
     *                   owner (signer), system_program, mpl_core_program
     */
    buildSetAgentUri(registryConfig: PublicKey, agentAccount: PublicKey, asset: PublicKey, collection: PublicKey, owner: PublicKey, newUri: string): TransactionInstruction;
    /**
     * Build setCollectionPointer instruction
     * Accounts: agent_account (mut), asset, owner (signer, mut)
     */
    buildSetCollectionPointer(agentAccount: PublicKey, asset: PublicKey, owner: PublicKey, col: string): TransactionInstruction;
    /**
     * Build setCollectionPointerWithOptions instruction
     * Accounts: agent_account (mut), asset, owner (signer, mut)
     */
    buildSetCollectionPointerWithOptions(agentAccount: PublicKey, asset: PublicKey, owner: PublicKey, col: string, lock: boolean): TransactionInstruction;
    /**
     * Build setParentAsset instruction
     * Accounts: agent_account (mut), asset, parent_agent_account, parent_asset_account, owner (signer, mut)
     */
    buildSetParentAsset(agentAccount: PublicKey, asset: PublicKey, parentAgentAccount: PublicKey, parentAssetAccount: PublicKey, owner: PublicKey, parentAsset: PublicKey): TransactionInstruction;
    /**
     * Build setParentAssetWithOptions instruction
     * Accounts: agent_account (mut), asset, parent_agent_account, parent_asset_account, owner (signer, mut)
     */
    buildSetParentAssetWithOptions(agentAccount: PublicKey, asset: PublicKey, parentAgentAccount: PublicKey, parentAssetAccount: PublicKey, owner: PublicKey, parentAsset: PublicKey, lock: boolean): TransactionInstruction;
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
     * @deprecated Removed in v0.6.0 - single-collection architecture
     * User registries are no longer supported. Use the base collection for all agents.
     */
    buildCreateUserRegistry(_collectionAuthority: PublicKey, _registryConfig: PublicKey, _collection: PublicKey, _owner: PublicKey, _collectionName: string, _collectionUri: string): TransactionInstruction;
    /**
     * @deprecated Removed in v0.6.0 - single-collection architecture
     * User registries are no longer supported.
     */
    buildUpdateUserRegistryMetadata(_collectionAuthority: PublicKey, _registryConfig: PublicKey, _collection: PublicKey, _owner: PublicKey, _newName: string | null, _newUri: string | null): TransactionInstruction;
    /**
     * Build setAgentWallet instruction - v0.4.2
     * Sets the agent wallet with Ed25519 signature verification
     * Wallet is stored directly in AgentAccount (no separate PDA)
     * Accounts: owner (signer), agent_account, asset, instructions_sysvar
     * NOTE: Requires Ed25519 signature instruction immediately before in transaction
     */
    buildSetAgentWallet(owner: PublicKey, agentAccount: PublicKey, asset: PublicKey, newWallet: PublicKey, deadline: bigint): TransactionInstruction;
    private serializeOption;
}
/**
 * Instruction builder for Reputation Registry
 * v0.5.0 - value/valueDecimals support (EVM compatibility)
 * Program: HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp
 */
export declare class ReputationInstructionBuilder {
    private programId;
    private atomEngineProgramId;
    constructor(programId?: PublicKey, atomEngineProgramId?: PublicKey);
    /**
     * Build giveFeedback instruction - v0.6.0 (SEAL v1)
     * Matches: give_feedback(value, value_decimals, score, feedback_file_hash, tag1, tag2, endpoint, feedback_uri)
     * Accounts: client (signer), agent_account, asset, collection, system_program, [atom_config, atom_stats, atom_engine_program, registry_authority]
     *
     * SEAL v1: The program computes seal_hash on-chain. feedbackFileHash is optional.
     */
    buildGiveFeedback(client: PublicKey, agentAccount: PublicKey, asset: PublicKey, collection: PublicKey, atomConfig: PublicKey | null, atomStats: PublicKey | null, registryAuthority: PublicKey | null, value: bigint, valueDecimals: number, score: number | null, feedbackFileHash: Buffer | null, feedbackIndex: bigint, tag1: string, tag2: string, endpoint: string, feedbackUri: string): TransactionInstruction;
    private serializeI128;
    private serializeOptionU8;
    /**
     * Serialize Option<[u8; 32]> for SEAL v1
     * Format: 1 byte flag (0=None, 1=Some) + 32 bytes if Some
     */
    private serializeOption32Bytes;
    /**
     * Build revokeFeedback instruction - v0.6.0 (SEAL v1)
     * Matches: revoke_feedback(feedback_index, seal_hash)
     * Accounts: client (signer), agent_account, asset, system_program, [atom_config, atom_stats, atom_engine_program, registry_authority]
     *
     * SEAL v1: Client must provide seal_hash (computed using computeSealHash)
     */
    buildRevokeFeedback(client: PublicKey, agentAccount: PublicKey, asset: PublicKey, atomConfig: PublicKey | null, atomStats: PublicKey | null, registryAuthority: PublicKey | null, feedbackIndex: bigint, sealHash: Buffer): TransactionInstruction;
    /**
     * Build appendResponse instruction - v0.6.0 (SEAL v1)
     * Accounts: responder (signer), agent_account (mut), asset
     *
     * SEAL v1: Client must provide seal_hash from the original feedback
     */
    buildAppendResponse(responder: PublicKey, agentAccount: PublicKey, asset: PublicKey, client: PublicKey, feedbackIndex: bigint, responseUri: string, responseHash: Buffer, sealHash: Buffer): TransactionInstruction;
    /**
     * @deprecated Removed on-chain in v0.5.0 - tags are now included in give_feedback instruction
     * This method will throw an error when called.
     */
    buildSetFeedbackTags(_client: PublicKey, _payer: PublicKey, _feedbackAccount: PublicKey, _feedbackTags: PublicKey, _feedbackIndex: bigint, _tag1: string, _tag2: string): TransactionInstruction;
    private serializeU64;
}
/**
 * Instruction builder for Validation Registry
 * v0.3.0 - agent_id removed, uses asset for PDA derivation
 * Program: HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp
 */
export declare class ValidationInstructionBuilder {
    private programId;
    constructor(programId?: PublicKey);
    /**
     * Build requestValidation instruction
     * Accounts: validation_config, requester (signer), payer (signer), agent_account, asset, validation_request, system_program
     */
    buildRequestValidation(validationConfig: PublicKey, requester: PublicKey, payer: PublicKey, agentAccount: PublicKey, asset: PublicKey, validationRequest: PublicKey, validatorAddress: PublicKey, nonce: number, requestUri: string, requestHash: Buffer): TransactionInstruction;
    /**
     * Build respondToValidation instruction - v0.5.0 (OOM fix)
     * Matches: respond_to_validation(asset_key, validator_address, nonce, response, response_uri, response_hash, tag)
     * Accounts: validator (signer), agent_account, asset, validation_request
     */
    buildRespondToValidation(validationConfig: PublicKey, validator: PublicKey, agentAccount: PublicKey, asset: PublicKey, validationRequest: PublicKey, nonce: number, response: number, responseUri: string, responseHash: Buffer, tag: string): TransactionInstruction;
    /**
     * @deprecated Removed on-chain in v0.5.0 - validations are immutable once responded
     * This method will throw an error when called.
     */
    buildUpdateValidation(_validator: PublicKey, _asset: PublicKey, _agentAccount: PublicKey, _validationRequest: PublicKey, _response: number, _responseUri: string, _responseHash: Buffer, _tag: string): TransactionInstruction;
    /**
     * @deprecated Removed on-chain in v0.5.0 - validations are immutable
     * This method will throw an error when called.
     */
    buildCloseValidation(_closer: PublicKey, _asset: PublicKey, _agentAccount: PublicKey, _validationRequest: PublicKey, _rentReceiver: PublicKey): TransactionInstruction;
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
    constructor(programId?: PublicKey);
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