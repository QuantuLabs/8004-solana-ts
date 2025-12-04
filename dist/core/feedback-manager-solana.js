/**
 * Solana feedback management system for Agent0 SDK
 * Implements the 6 ERC-8004 read functions for Solana
 */
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { PDAHelpers, REPUTATION_PROGRAM_ID } from './pda-helpers.js';
import { FeedbackAccount, AgentReputationAccount, ClientIndexAccount, ResponseIndexAccount, ResponseAccount, } from './borsh-schemas.js';
/**
 * Manages feedback operations for Solana
 * Implements all 6 ERC-8004 read functions
 */
export class SolanaFeedbackManager {
    constructor(client, ipfsClient) {
        this.client = client;
        this.ipfsClient = ipfsClient;
    }
    /**
     * 1. getSummary - Get agent reputation summary
     * @param agentId - Agent ID
     * @param minScore - Optional minimum score filter (client-side)
     * @param clientFilter - Optional client address filter (client-side)
     * @returns Summary with average score and total feedbacks
     *
     * Implementation: Uses cached AgentReputationAccount for O(1) performance
     * Falls back to client-side filtering if filters provided
     */
    async getSummary(agentId, minScore, clientFilter) {
        try {
            // Fetch cached aggregate from AgentReputationAccount
            const [reputationPDA] = await PDAHelpers.getAgentReputationPDA(agentId);
            const data = await this.client.getAccount(reputationPDA);
            if (!data) {
                return { averageScore: 0, totalFeedbacks: 0, totalClients: 0 };
            }
            const reputation = AgentReputationAccount.deserialize(data);
            // If no filters, return cached data (O(1))
            if (!minScore && !clientFilter) {
                return {
                    averageScore: reputation.average_score,
                    totalFeedbacks: Number(reputation.total_feedbacks),
                };
            }
            // If filters provided, fetch all feedbacks and filter client-side
            const feedbacks = await this.readAllFeedback(agentId, false);
            const filtered = feedbacks.filter((f) => (!minScore || f.score >= minScore) &&
                (!clientFilter || f.client.equals(clientFilter)));
            const sum = filtered.reduce((acc, f) => acc + f.score, 0);
            return {
                averageScore: filtered.length > 0 ? sum / filtered.length : 0,
                totalFeedbacks: filtered.length,
            };
        }
        catch (error) {
            console.error(`Error getting summary for agent ${agentId}:`, error);
            return { averageScore: 0, totalFeedbacks: 0, totalClients: 0 };
        }
    }
    /**
     * 2. readFeedback - Read single feedback
     * @param agentId - Agent ID
     * @param client - Client public key
     * @param feedbackIndex - Feedback index
     * @returns Feedback object or null if not found
     */
    async readFeedback(agentId, client, feedbackIndex) {
        try {
            // v0.2.0: client no longer in PDA seeds (global feedback index)
            const [feedbackPDA] = PDAHelpers.getFeedbackPDA(agentId, feedbackIndex);
            const data = await this.client.getAccount(feedbackPDA);
            if (!data) {
                return null;
            }
            const feedback = FeedbackAccount.deserialize(data);
            return this.mapFeedbackAccount(feedback);
        }
        catch (error) {
            console.error(`Error reading feedback for agent ${agentId}, client ${client.toBase58()}, index ${feedbackIndex}:`, error);
            return null;
        }
    }
    /**
     * 3. readAllFeedback - Read all feedbacks for an agent
     * @param agentId - Agent ID
     * @param includeRevoked - Include revoked feedbacks (default: false)
     * @returns Array of feedback objects
     *
     * Implementation: Uses getProgramAccounts with memcmp filter on agent_id
     */
    async readAllFeedback(agentId, includeRevoked = false) {
        try {
            const programId = REPUTATION_PROGRAM_ID;
            // Create memcmp filter for agent_id (offset 8 to skip discriminator)
            const agentIdBuffer = Buffer.alloc(8);
            agentIdBuffer.writeBigUInt64LE(agentId);
            const accounts = await this.client.getProgramAccounts(programId, [
                {
                    memcmp: {
                        offset: 8, // Skip 8-byte discriminator
                        bytes: bs58.encode(agentIdBuffer),
                    },
                },
                {
                    dataSize: 375, // FeedbackAccount::MAX_SIZE = 8+8+32+8+1+(4+32)+(4+32)+(4+200)+32+1+8+1
                },
            ]);
            const feedbacks = accounts
                .map((acc) => FeedbackAccount.deserialize(acc.data))
                .filter((f) => includeRevoked || !f.revoked)
                .map((f) => this.mapFeedbackAccount(f));
            return feedbacks;
        }
        catch (error) {
            console.error(`Error reading all feedback for agent ${agentId}:`, error);
            return [];
        }
    }
    /**
     * 4. getLastIndex - Get last feedback index for a client
     * @param agentId - Agent ID
     * @param client - Client public key
     * @returns Last feedback index (0 if no feedback given)
     */
    async getLastIndex(agentId, client) {
        try {
            const [clientIndexPDA] = await PDAHelpers.getClientIndexPDA(agentId, client);
            const data = await this.client.getAccount(clientIndexPDA);
            if (!data) {
                return BigInt(0);
            }
            const clientIndex = ClientIndexAccount.deserialize(data);
            return clientIndex.last_feedback_index;
        }
        catch (error) {
            console.error(`Error getting last index for agent ${agentId}, client ${client.toBase58()}:`, error);
            return BigInt(0);
        }
    }
    /**
     * 5. getClients - Get all clients who gave feedback to an agent
     * @param agentId - Agent ID
     * @returns Array of unique client public keys
     *
     * Implementation: Uses getProgramAccounts to fetch all ClientIndexAccounts for agent
     */
    async getClients(agentId) {
        try {
            const programId = REPUTATION_PROGRAM_ID;
            // Create memcmp filter for agent_id
            const agentIdBuffer = Buffer.alloc(8);
            agentIdBuffer.writeBigUInt64LE(agentId);
            const accounts = await this.client.getProgramAccounts(programId, [
                {
                    memcmp: {
                        offset: 8, // Skip discriminator
                        bytes: bs58.encode(agentIdBuffer),
                    },
                },
                {
                    dataSize: 64, // ClientIndexAccount size (estimated)
                },
            ]);
            // Extract unique client pubkeys from ClientIndexAccount
            const clients = accounts.map((acc) => {
                const clientIndex = ClientIndexAccount.deserialize(acc.data);
                return clientIndex.getClientPublicKey();
            });
            // Remove duplicates
            const uniqueClients = Array.from(new Set(clients.map((c) => c.toBase58()))).map((base58) => new PublicKey(base58));
            return uniqueClients;
        }
        catch (error) {
            console.error(`Error getting clients for agent ${agentId}:`, error);
            return [];
        }
    }
    /**
     * 6. getResponseCount - Get number of responses for a feedback
     * @param agentId - Agent ID
     * @param client - Client public key
     * @param feedbackIndex - Feedback index
     * @returns Number of responses
     */
    async getResponseCount(agentId, client, feedbackIndex) {
        try {
            // v0.2.0: client no longer in PDA seeds
            const [responseIndexPDA] = PDAHelpers.getResponseIndexPDA(agentId, feedbackIndex);
            const data = await this.client.getAccount(responseIndexPDA);
            if (!data) {
                return 0;
            }
            const responseIndex = ResponseIndexAccount.deserialize(data);
            return Number(responseIndex.response_count);
        }
        catch (error) {
            console.error(`Error getting response count for agent ${agentId}, client ${client.toBase58()}, index ${feedbackIndex}:`, error);
            return 0;
        }
    }
    /**
     * Bonus: Read all responses for a feedback
     * Not required by ERC-8004 but useful for SDK completeness
     */
    async readResponses(agentId, client, feedbackIndex) {
        try {
            // Get response count first
            const responseCount = await this.getResponseCount(agentId, client, feedbackIndex);
            if (responseCount === 0) {
                return [];
            }
            // Fetch all responses by deriving PDAs
            // v0.2.0: client no longer in PDA seeds
            const responsePDAs = [];
            for (let i = 0; i < responseCount; i++) {
                const [responsePDA] = PDAHelpers.getResponsePDA(agentId, feedbackIndex, BigInt(i));
                responsePDAs.push(responsePDA);
            }
            // Batch fetch all response accounts
            const accountsData = await this.client.getMultipleAccounts(responsePDAs);
            const responses = accountsData
                .filter((data) => data !== null)
                .map((data) => {
                const response = ResponseAccount.deserialize(data);
                return {
                    agentId: response.agent_id,
                    feedbackIndex: response.feedback_index,
                    responseIndex: response.response_index,
                    responder: response.getResponderPublicKey(),
                    responseUri: response.response_uri,
                    responseHash: response.response_hash,
                    createdAt: response.created_at,
                };
            });
            return responses;
        }
        catch (error) {
            console.error(`Error reading responses for agent ${agentId}, client ${client.toBase58()}, index ${feedbackIndex}:`, error);
            return [];
        }
    }
    /**
     * Helper to map FeedbackAccount to SolanaFeedback interface
     */
    mapFeedbackAccount(feedback) {
        return {
            agentId: feedback.agent_id,
            client: feedback.getClientPublicKey(),
            feedbackIndex: feedback.feedback_index,
            score: feedback.score,
            tag1: feedback.tag1,
            tag2: feedback.tag2,
            fileUri: feedback.file_uri,
            fileHash: feedback.file_hash,
            revoked: feedback.is_revoked,
            createdAt: feedback.created_at,
        };
    }
    /**
     * Helper to fetch and parse feedback file from IPFS/Arweave
     */
    async fetchFeedbackFile(uri) {
        if (!this.ipfsClient) {
            console.warn('IPFS client not configured, cannot fetch feedback file');
            return null;
        }
        try {
            // This would use the ipfsClient to fetch
            // For now, return null as IPFS client needs to be adapted
            return null;
        }
        catch (error) {
            console.error(`Error fetching feedback file from ${uri}:`, error);
            return null;
        }
    }
}
//# sourceMappingURL=feedback-manager-solana.js.map