/**
 * Endpoint Crawler for MCP and A2A Servers
 * Automatically fetches capabilities (tools, prompts, resources, skills) from endpoints
 */

import { isPrivateHost } from '../utils/validation.js';

export interface McpCapabilities {
  mcpTools?: string[];
  mcpPrompts?: string[];
  mcpResources?: string[];
}

export interface A2aCapabilities {
  a2aSkills?: string[];
}

/**
 * Helper to create JSON-RPC request
 */
function createJsonRpcRequest(method: string, params?: Record<string, unknown>, requestId: number = 1) {
  return {
    jsonrpc: '2.0',
    method,
    id: requestId,
    params: params || {},
  };
}

/**
 * Crawls MCP and A2A endpoints to fetch capabilities
 */
const MAX_CRAWLER_RESPONSE_BYTES = 1024 * 1024; // 1 MB

export class EndpointCrawler {
  private timeout: number;

  constructor(timeout: number = 5000) {
    this.timeout = timeout;
  }

  private async readLimitedText(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      // Fallback for environments where response.body is not available
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_CRAWLER_RESPONSE_BYTES) {
        throw new Error(`Crawler response exceeded ${MAX_CRAWLER_RESPONSE_BYTES} bytes`);
      }
      return text;
    }
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > MAX_CRAWLER_RESPONSE_BYTES) {
          throw new Error(`Crawler response exceeded ${MAX_CRAWLER_RESPONSE_BYTES} bytes`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(merged);
  }

  /**
   * Fetch MCP capabilities (tools, prompts, resources) from an MCP server
   */
  async fetchMcpCapabilities(endpoint: string): Promise<McpCapabilities | null> {
    // Ensure endpoint is HTTP/HTTPS
    if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
      // Invalid endpoint format - return null
      return null;
    }

    // SSRF Protection: Block requests to private/internal IP ranges
    try {
      const url = new URL(endpoint);
      if (isPrivateHost(url.hostname)) {
        return null; // Silently reject private hosts
      }
    } catch {
      return null; // Invalid URL
    }

    // Try JSON-RPC approach first (for real MCP servers)
    const capabilities = await this._fetchViaJsonRpc(endpoint);
    if (capabilities) {
      return capabilities;
    }

    // Fallback to static agentcard.json
    try {
      const agentcardUrl = `${endpoint}/agentcard.json`;
      const response = await fetch(agentcardUrl, {
        signal: AbortSignal.timeout(this.timeout),
        redirect: 'manual',
      });

      if (response.ok) {
        const rawText = await this.readLimitedText(response);
        const data = JSON.parse(rawText) as Record<string, unknown>;

        // Extract capabilities from agentcard
        const result: McpCapabilities = {
          mcpTools: this._extractList(data, 'tools'),
          mcpPrompts: this._extractList(data, 'prompts'),
          mcpResources: this._extractList(data, 'resources'),
        };

        if (result.mcpTools?.length || result.mcpPrompts?.length || result.mcpResources?.length) {
          return result;
        }
      }
    } catch (error) {
      // Silently fail - soft failure pattern
    }

    return null;
  }

  /**
   * Try to fetch capabilities via JSON-RPC
   */
  private async _fetchViaJsonRpc(httpUrl: string): Promise<McpCapabilities | null> {
    try {
      // Make all JSON-RPC calls in parallel for better performance
      const [tools, resources, prompts] = await Promise.all([
        this._jsonRpcCall(httpUrl, 'tools/list'),
        this._jsonRpcCall(httpUrl, 'resources/list'),
        this._jsonRpcCall(httpUrl, 'prompts/list'),
      ]);

      const mcpTools: string[] = [];
      const mcpResources: string[] = [];
      const mcpPrompts: string[] = [];

      // Extract names from tools
      if (tools && typeof tools === 'object' && 'tools' in tools) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolsArray = (tools as Record<string, unknown>).tools as unknown[];
        if (Array.isArray(toolsArray)) {
          for (const tool of toolsArray) {
            if (tool && typeof tool === 'object' && 'name' in tool) {
              mcpTools.push(String((tool as Record<string, unknown>).name));
            }
          }
        }
      }

      // Extract names from resources
      if (resources && typeof resources === 'object' && 'resources' in resources) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resourcesArray = (resources as Record<string, unknown>).resources as unknown[];
        if (Array.isArray(resourcesArray)) {
          for (const resource of resourcesArray) {
            if (resource && typeof resource === 'object' && 'name' in resource) {
              mcpResources.push(String((resource as Record<string, unknown>).name));
            }
          }
        }
      }

      // Extract names from prompts
      if (prompts && typeof prompts === 'object' && 'prompts' in prompts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const promptsArray = (prompts as Record<string, unknown>).prompts as unknown[];
        if (Array.isArray(promptsArray)) {
          for (const prompt of promptsArray) {
            if (prompt && typeof prompt === 'object' && 'name' in prompt) {
              mcpPrompts.push(String((prompt as Record<string, unknown>).name));
            }
          }
        }
      }

      if (mcpTools.length || mcpResources.length || mcpPrompts.length) {
        return {
          mcpTools: mcpTools.length > 0 ? mcpTools : undefined,
          mcpResources: mcpResources.length > 0 ? mcpResources : undefined,
          mcpPrompts: mcpPrompts.length > 0 ? mcpPrompts : undefined,
        };
      }
    } catch (error) {
      // JSON-RPC approach failed - continue to fallback
    }

    return null;
  }

  /**
   * Make a JSON-RPC call and return the result
   */
  private async _jsonRpcCall(url: string, method: string, params?: Record<string, unknown>): Promise<unknown> {
    try {
      const payload = createJsonRpcRequest(method, params);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(payload),
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (response.status >= 300 && response.status < 400) {
        return null;
      }

      if (!response.ok) {
        return null;
      }

      // Check if response is SSE format
      const contentType = response.headers.get('content-type') || '';
      const text = await this.readLimitedText(response);

      if (contentType.includes('text/event-stream') || text.includes('event: message')) {
        // Parse SSE format
        const result = this._parseSseResponse(text);
        if (result) {
          return result;
        }
      }

      // Regular JSON response
      const result = JSON.parse(text);
      if (result.result !== undefined) {
        return result.result;
      }
      return result;
    } catch (error) {
      // JSON-RPC call failed - continue to next method
      return null;
    }
  }

  /**
   * Parse Server-Sent Events (SSE) format response
   */
  private _parseSseResponse(sseText: string): unknown | null {
    try {
      // Look for "data:" lines containing JSON
      const lines = sseText.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6); // Remove "data: " prefix
          const data = JSON.parse(jsonStr);
          if (data.result !== undefined) {
            return data.result;
          }
          return data;
        }
      }
    } catch (error) {
      // Failed to parse SSE response - continue
    }
    return null;
  }

  /**
   * Fetch A2A capabilities (skills) from an A2A server
   */
  async fetchA2aCapabilities(endpoint: string): Promise<A2aCapabilities | null> {
    try {
      // Ensure endpoint is HTTP/HTTPS
      if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
        // Invalid endpoint format - skip
        return null;
      }

      // SSRF Protection: Block requests to private/internal IP ranges
      try {
        const url = new URL(endpoint);
        if (isPrivateHost(url.hostname)) {
          return null; // Silently reject private hosts
        }
      } catch {
        return null; // Invalid URL
      }

      // Try multiple well-known paths for A2A agent cards
      const agentcardUrls = [
        `${endpoint}/agentcard.json`,
        `${endpoint}/.well-known/agent.json`,
        `${endpoint.replace(/\/$/, '')}/.well-known/agent.json`,
      ];

      for (const agentcardUrl of agentcardUrls) {
        try {
          const response = await fetch(agentcardUrl, {
            signal: AbortSignal.timeout(this.timeout),
            redirect: 'manual',
          });

          if (response.ok) {
            const rawText = await this.readLimitedText(response);
            const data = JSON.parse(rawText) as Record<string, unknown>;

            // Extract skills from agentcard
            const skills = this._extractList(data, 'skills');

            if (skills && skills.length > 0) {
              return { a2aSkills: skills };
            }
          }
        } catch {
          // Try next URL
          continue;
        }
      }
    } catch (error) {
      // Unexpected error - continue silently
    }

    return null;
  }

  /**
   * Extract a list of strings from nested JSON data
   */
  private _extractList(data: Record<string, unknown>, key: string): string[] {
    const result: string[] = [];

    // Try top-level key
    if (key in data && Array.isArray(data[key])) {
      for (const item of data[key]) {
        if (typeof item === 'string') {
          result.push(item);
        } else if (item && typeof item === 'object') {
          // For objects, try to extract name/id field
          const nameFields = ['name', 'id', 'identifier', 'title'];
          for (const nameField of nameFields) {
            if (nameField in item && typeof item[nameField] === 'string') {
              result.push(item[nameField]);
              break;
            }
          }
        }
      }
    }

    // Try nested in 'capabilities' or 'abilities'
    if (result.length === 0) {
      const containerKeys = ['capabilities', 'abilities', 'features'];
      for (const containerKey of containerKeys) {
        if (containerKey in data && data[containerKey] && typeof data[containerKey] === 'object') {
          const container = data[containerKey] as Record<string, unknown>;
          if (key in container && Array.isArray(container[key])) {
            for (const item of container[key] as unknown[]) {
              if (typeof item === 'string') {
                result.push(item);
              } else if (item && typeof item === 'object') {
                const itemObj = item as Record<string, unknown>;
                const nameFields = ['name', 'id', 'identifier', 'title'];
                for (const nameField of nameFields) {
                  if (nameField in itemObj && typeof itemObj[nameField] === 'string') {
                    result.push(itemObj[nameField]);
                    break;
                  }
                }
              }
            }
          }
          if (result.length > 0) {
            break;
          }
        }
      }
    }

    return result;
  }
}

