/**
 * Manual instruction builder for ERC-8004 Solana programs
 * Builds transactions without Anchor dependency
 * Must match exactly the instruction layouts in 8004-solana programs
 */
import { TransactionInstruction, SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_INSTRUCTIONS_PUBKEY, } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TOKEN_METADATA_PROGRAM_ID } from './metaplex-helpers.js';
import { IDENTITY_DISCRIMINATORS, REPUTATION_DISCRIMINATORS, VALIDATION_DISCRIMINATORS, } from './instruction-discriminators.js';
import { IDENTITY_PROGRAM_ID, REPUTATION_PROGRAM_ID, VALIDATION_PROGRAM_ID } from './pda-helpers.js';
import { toBigInt } from './utils.js';
/**
 * Instruction builder for Identity Registry
 * Program: 2dtvC4hyb7M6fKwNx1C6h4SrahYvor3xW11eH6uLNvSZ
 */
export class IdentityInstructionBuilder {
    constructor(cluster = 'devnet') {
        this.programId = IDENTITY_PROGRAM_ID;
    }
    /**
     * Build register instruction (with optional URI)
     */
    buildRegister(config, collectionAuthorityPda, agentAccount, agentMint, agentMetadata, agentMasterEdition, agentTokenAccount, collectionMint, collectionMetadata, collectionMasterEdition, owner, agentUri = '') {
        const data = Buffer.concat([
            IDENTITY_DISCRIMINATORS.register,
            this.serializeString(agentUri),
        ]);
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: config, isSigner: false, isWritable: true },
                { pubkey: collectionAuthorityPda, isSigner: false, isWritable: true },
                { pubkey: agentAccount, isSigner: false, isWritable: true },
                { pubkey: agentMint, isSigner: true, isWritable: true },
                { pubkey: agentMetadata, isSigner: false, isWritable: true },
                { pubkey: agentMasterEdition, isSigner: false, isWritable: true },
                { pubkey: agentTokenAccount, isSigner: false, isWritable: true },
                { pubkey: collectionMint, isSigner: false, isWritable: false },
                { pubkey: collectionMetadata, isSigner: false, isWritable: true },
                { pubkey: collectionMasterEdition, isSigner: false, isWritable: false },
                { pubkey: owner, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
                { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
    /**
     * Build registerWithMetadata instruction
     * @param metadata - Array of metadata entries (max 10)
     */
    buildRegisterWithMetadata(config, collectionAuthorityPda, agentAccount, agentMint, agentMetadata, agentMasterEdition, agentTokenAccount, collectionMint, collectionMetadata, collectionMasterEdition, owner, agentUri = '', metadata = []) {
        if (metadata.length > 10) {
            throw new Error(`buildRegisterWithMetadata() accepts max 10 inline metadata. Got ${metadata.length}. ` +
                `Use transaction-builder to auto-split into inline + MetadataExtension PDAs.`);
        }
        const data = Buffer.concat([
            IDENTITY_DISCRIMINATORS.registerWithMetadata,
            this.serializeString(agentUri),
            this.serializeMetadata(metadata),
        ]);
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: config, isSigner: false, isWritable: true },
                { pubkey: collectionAuthorityPda, isSigner: false, isWritable: true },
                { pubkey: agentAccount, isSigner: false, isWritable: true },
                { pubkey: agentMint, isSigner: true, isWritable: true },
                { pubkey: agentMetadata, isSigner: false, isWritable: true },
                { pubkey: agentMasterEdition, isSigner: false, isWritable: true },
                { pubkey: agentTokenAccount, isSigner: false, isWritable: true },
                { pubkey: collectionMint, isSigner: false, isWritable: false },
                { pubkey: collectionMetadata, isSigner: false, isWritable: true },
                { pubkey: collectionMasterEdition, isSigner: false, isWritable: false },
                { pubkey: owner, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
                { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
    /**
     * Build setAgentUri instruction
     */
    buildSetAgentUri(agentAccount, tokenAccount, agentMetadata, agentMint, owner, newUri) {
        const data = Buffer.concat([
            IDENTITY_DISCRIMINATORS.setAgentUri,
            this.serializeString(newUri),
        ]);
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: agentAccount, isSigner: false, isWritable: true },
                { pubkey: tokenAccount, isSigner: false, isWritable: false },
                { pubkey: agentMetadata, isSigner: false, isWritable: true },
                { pubkey: agentMint, isSigner: false, isWritable: false },
                { pubkey: owner, isSigner: true, isWritable: true },
                { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
    /**
     * Build setMetadata instruction (inline metadata storage)
     * Accounts: agent_account (mut), token_account, owner (signer)
     */
    buildSetMetadata(agentAccount, tokenAccount, owner, key, value) {
        const valueBytes = Buffer.from(value, 'utf8');
        const valueLen = Buffer.alloc(4);
        valueLen.writeUInt32LE(valueBytes.length);
        const serializedValue = Buffer.concat([valueLen, valueBytes]);
        const data = Buffer.concat([
            IDENTITY_DISCRIMINATORS.setMetadata,
            this.serializeString(key),
            serializedValue,
        ]);
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: agentAccount, isSigner: false, isWritable: true },
                { pubkey: tokenAccount, isSigner: false, isWritable: false },
                { pubkey: owner, isSigner: true, isWritable: false },
            ],
            data,
        });
    }
    /**
     * Build createMetadataExtension instruction
     */
    buildCreateMetadataExtension(metadataExtension, agentMint, agentAccount, tokenAccount, owner, extensionIndex) {
        const data = Buffer.concat([
            IDENTITY_DISCRIMINATORS.createMetadataExtension,
            Buffer.from([extensionIndex]),
        ]);
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: metadataExtension, isSigner: false, isWritable: true },
                { pubkey: agentMint, isSigner: false, isWritable: false },
                { pubkey: agentAccount, isSigner: false, isWritable: false },
                { pubkey: tokenAccount, isSigner: false, isWritable: false },
                { pubkey: owner, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
    /**
     * Build setMetadataExtended instruction (extension PDA metadata storage)
     */
    buildSetMetadataExtended(metadataExtension, agentMint, agentAccount, tokenAccount, owner, extensionIndex, key, value) {
        const valueBytes = Buffer.from(value, 'utf8');
        const valueLen = Buffer.alloc(4);
        valueLen.writeUInt32LE(valueBytes.length);
        const serializedValue = Buffer.concat([valueLen, valueBytes]);
        const data = Buffer.concat([
            IDENTITY_DISCRIMINATORS.setMetadataExtended,
            Buffer.from([extensionIndex]),
            this.serializeString(key),
            serializedValue,
        ]);
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: metadataExtension, isSigner: false, isWritable: true },
                { pubkey: agentMint, isSigner: false, isWritable: false },
                { pubkey: agentAccount, isSigner: false, isWritable: false },
                { pubkey: tokenAccount, isSigner: false, isWritable: false },
                { pubkey: owner, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
    /**
     * Build transferAgent instruction
     */
    buildTransferAgent(agentAccount, fromTokenAccount, toTokenAccount, agentMint, agentMetadata, owner) {
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: agentAccount, isSigner: false, isWritable: true },
                { pubkey: fromTokenAccount, isSigner: false, isWritable: true },
                { pubkey: toTokenAccount, isSigner: false, isWritable: true },
                { pubkey: agentMint, isSigner: false, isWritable: false },
                { pubkey: agentMetadata, isSigner: false, isWritable: true },
                { pubkey: owner, isSigner: true, isWritable: false },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
            ],
            data: IDENTITY_DISCRIMINATORS.transferAgent,
        });
    }
    serializeString(str) {
        const strBytes = Buffer.from(str, 'utf8');
        const len = Buffer.alloc(4);
        len.writeUInt32LE(strBytes.length);
        return Buffer.concat([len, strBytes]);
    }
    serializeMetadata(metadata) {
        const vecLen = Buffer.alloc(4);
        vecLen.writeUInt32LE(metadata.length);
        if (metadata.length === 0) {
            return vecLen;
        }
        const entries = metadata.map(entry => {
            const key = this.serializeString(entry.key);
            const valueBytes = Buffer.from(entry.value, 'utf8');
            const valueLen = Buffer.alloc(4);
            valueLen.writeUInt32LE(valueBytes.length);
            const value = Buffer.concat([valueLen, valueBytes]);
            return Buffer.concat([key, value]);
        });
        return Buffer.concat([vecLen, ...entries]);
    }
}
/**
 * Instruction builder for Reputation Registry
 * Program: 9WcFLL3Fsqs96JxuewEt9iqRwULtCZEsPT717hPbsQAa
 */
export class ReputationInstructionBuilder {
    constructor(cluster = 'devnet') {
        this.programId = REPUTATION_PROGRAM_ID;
    }
    /**
     * Build giveFeedback instruction
     * Matches: give_feedback(agent_id, score, tag1, tag2, file_uri, file_hash, feedback_index)
     */
    buildGiveFeedback(client, payer, agentMint, agentAccount, clientIndex, feedbackAccount, agentReputation, identityRegistryProgram, agentId, score, tag1, tag2, fileUri, fileHash, feedbackIndex) {
        const data = Buffer.concat([
            REPUTATION_DISCRIMINATORS.giveFeedback,
            this.serializeU64(agentId),
            Buffer.from([score]),
            this.serializeString(tag1),
            this.serializeString(tag2),
            this.serializeString(fileUri),
            fileHash,
            this.serializeU64(feedbackIndex),
        ]);
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: client, isSigner: true, isWritable: true },
                { pubkey: payer, isSigner: true, isWritable: true },
                { pubkey: agentMint, isSigner: false, isWritable: false },
                { pubkey: agentAccount, isSigner: false, isWritable: false },
                { pubkey: clientIndex, isSigner: false, isWritable: true },
                { pubkey: feedbackAccount, isSigner: false, isWritable: true },
                { pubkey: agentReputation, isSigner: false, isWritable: true },
                { pubkey: identityRegistryProgram, isSigner: false, isWritable: false },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
    /**
     * Build revokeFeedback instruction
     * Matches: revoke_feedback(agent_id, feedback_index)
     */
    buildRevokeFeedback(client, feedbackAccount, agentReputation, agentId, feedbackIndex) {
        const data = Buffer.concat([
            REPUTATION_DISCRIMINATORS.revokeFeedback,
            this.serializeU64(agentId),
            this.serializeU64(feedbackIndex),
        ]);
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: client, isSigner: true, isWritable: false },
                { pubkey: feedbackAccount, isSigner: false, isWritable: true },
                { pubkey: agentReputation, isSigner: false, isWritable: true },
            ],
            data,
        });
    }
    /**
     * Build appendResponse instruction
     * Matches: append_response(agent_id, client_address, feedback_index, response_uri, response_hash)
     */
    buildAppendResponse(responder, payer, feedbackAccount, responseIndex, responseAccount, agentId, clientAddress, feedbackIndex, responseUri, responseHash) {
        const data = Buffer.concat([
            REPUTATION_DISCRIMINATORS.appendResponse,
            this.serializeU64(agentId),
            clientAddress.toBuffer(),
            this.serializeU64(feedbackIndex),
            this.serializeString(responseUri),
            responseHash,
        ]);
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: responder, isSigner: true, isWritable: false },
                { pubkey: payer, isSigner: true, isWritable: true },
                { pubkey: feedbackAccount, isSigner: false, isWritable: false },
                { pubkey: responseIndex, isSigner: false, isWritable: true },
                { pubkey: responseAccount, isSigner: false, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
    serializeString(str) {
        const strBytes = Buffer.from(str, 'utf8');
        const len = Buffer.alloc(4);
        len.writeUInt32LE(strBytes.length);
        return Buffer.concat([len, strBytes]);
    }
    serializeU64(value) {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(toBigInt(value));
        return buf;
    }
}
/**
 * Instruction builder for Validation Registry
 * Program: CXvuHNGWTHNqXmWr95wSpNGKR3kpcJUhzKofTF3zsoxW
 */
export class ValidationInstructionBuilder {
    constructor(cluster = 'devnet') {
        this.programId = VALIDATION_PROGRAM_ID;
    }
    /**
     * Build requestValidation instruction
     * Matches: request_validation(agent_id, validator_address, nonce, request_uri, request_hash)
     */
    buildRequestValidation(config, requester, payer, agentMint, agentAccount, tokenAccount, validationRequest, identityRegistryProgram, agentId, validatorAddress, nonce, requestUri, requestHash) {
        const data = Buffer.concat([
            VALIDATION_DISCRIMINATORS.requestValidation,
            this.serializeU64(agentId),
            validatorAddress.toBuffer(),
            this.serializeU32(nonce),
            this.serializeString(requestUri),
            requestHash,
        ]);
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: config, isSigner: false, isWritable: true },
                { pubkey: requester, isSigner: true, isWritable: false },
                { pubkey: payer, isSigner: true, isWritable: true },
                { pubkey: agentMint, isSigner: false, isWritable: false },
                { pubkey: agentAccount, isSigner: false, isWritable: false },
                { pubkey: tokenAccount, isSigner: false, isWritable: false },
                { pubkey: validationRequest, isSigner: false, isWritable: true },
                { pubkey: identityRegistryProgram, isSigner: false, isWritable: false },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        });
    }
    /**
     * Build respondToValidation instruction
     * Matches: respond_to_validation(response, response_uri, response_hash, tag)
     */
    buildRespondToValidation(config, validator, validationRequest, response, responseUri, responseHash, tag) {
        const data = Buffer.concat([
            VALIDATION_DISCRIMINATORS.respondToValidation,
            Buffer.from([response]),
            this.serializeString(responseUri),
            responseHash,
            this.serializeString(tag),
        ]);
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: config, isSigner: false, isWritable: true },
                { pubkey: validator, isSigner: true, isWritable: false },
                { pubkey: validationRequest, isSigner: false, isWritable: true },
            ],
            data,
        });
    }
    /**
     * Build updateValidation instruction (same as respondToValidation)
     */
    buildUpdateValidation(config, validator, validationRequest, response, responseUri, responseHash, tag) {
        const data = Buffer.concat([
            VALIDATION_DISCRIMINATORS.updateValidation,
            Buffer.from([response]),
            this.serializeString(responseUri),
            responseHash,
            this.serializeString(tag),
        ]);
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: config, isSigner: false, isWritable: true },
                { pubkey: validator, isSigner: true, isWritable: false },
                { pubkey: validationRequest, isSigner: false, isWritable: true },
            ],
            data,
        });
    }
    /**
     * Build closeValidation instruction
     */
    buildCloseValidation(config, closer, agentMint, agentAccount, tokenAccount, validationRequest, identityRegistryProgram, rentReceiver) {
        return new TransactionInstruction({
            programId: this.programId,
            keys: [
                { pubkey: config, isSigner: false, isWritable: false },
                { pubkey: closer, isSigner: true, isWritable: false },
                { pubkey: agentMint, isSigner: false, isWritable: false },
                { pubkey: agentAccount, isSigner: false, isWritable: false },
                { pubkey: tokenAccount, isSigner: false, isWritable: false },
                { pubkey: validationRequest, isSigner: false, isWritable: true },
                { pubkey: identityRegistryProgram, isSigner: false, isWritable: false },
                { pubkey: rentReceiver, isSigner: false, isWritable: true },
            ],
            data: VALIDATION_DISCRIMINATORS.closeValidation,
        });
    }
    serializeString(str) {
        const strBytes = Buffer.from(str, 'utf8');
        const len = Buffer.alloc(4);
        len.writeUInt32LE(strBytes.length);
        return Buffer.concat([len, strBytes]);
    }
    serializeU64(value) {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(value);
        return buf;
    }
    serializeU32(value) {
        const buf = Buffer.alloc(4);
        buf.writeUInt32LE(value);
        return buf;
    }
}
//# sourceMappingURL=instruction-builder.js.map