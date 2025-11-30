/**
 * Utility functions for parsing and formatting Agent IDs and Feedback IDs
 */
/**
 * Parse an AgentId string into chainId and tokenId
 * Format: "chainId:tokenId" or just "tokenId" (when chain is implicit)
 */
export declare function parseAgentId(agentId: string | null | undefined): {
    chainId: number;
    tokenId: number;
};
/**
 * Format chainId and tokenId into AgentId string
 */
export declare function formatAgentId(chainId: number, tokenId: number): string;
/**
 * Parse a FeedbackId string into its components
 * Format: "agentId:clientAddress:feedbackIndex"
 * Note: agentId may contain colons (e.g., "11155111:123"), so we split from the right
 */
export declare function parseFeedbackId(feedbackId: string): {
    agentId: string;
    clientAddress: string;
    feedbackIndex: number;
};
/**
 * Format feedback ID components into FeedbackId string
 */
export declare function formatFeedbackId(agentId: string, clientAddress: string, feedbackIndex: number): string;
//# sourceMappingURL=id-format.d.ts.map