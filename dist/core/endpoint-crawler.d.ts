/**
 * Endpoint Crawler for MCP and A2A Servers
 * Automatically fetches capabilities (tools, prompts, resources, skills) from endpoints
 */
export interface McpCapabilities {
    mcpTools?: string[];
    mcpPrompts?: string[];
    mcpResources?: string[];
}
export interface A2aCapabilities {
    a2aSkills?: string[];
}
/**
 * Crawls MCP and A2A endpoints to fetch capabilities
 */
export declare class EndpointCrawler {
    private timeout;
    constructor(timeout?: number);
    /**
     * Fetch MCP capabilities (tools, prompts, resources) from an MCP server
     */
    fetchMcpCapabilities(endpoint: string): Promise<McpCapabilities | null>;
    /**
     * Try to fetch capabilities via JSON-RPC
     */
    private _fetchViaJsonRpc;
    /**
     * Make a JSON-RPC call and return the result
     */
    private _jsonRpcCall;
    /**
     * Parse Server-Sent Events (SSE) format response
     */
    private _parseSseResponse;
    /**
     * Fetch A2A capabilities (skills) from an A2A server
     */
    fetchA2aCapabilities(endpoint: string): Promise<A2aCapabilities | null>;
    /**
     * Extract a list of strings from nested JSON data
     */
    private _extractList;
}
//# sourceMappingURL=endpoint-crawler.d.ts.map