import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

jest.unstable_mockModule('../../src/utils/validation.js', () => ({
  isPrivateHost: jest.fn((h: string) => h === 'localhost' || h === '127.0.0.1' || h.startsWith('10.')),
}));

const { EndpointCrawler } = await import('../../src/core/endpoint-crawler.js');

describe('EndpointCrawler', () => {
  let crawler: InstanceType<typeof EndpointCrawler>;

  beforeEach(() => {
    jest.clearAllMocks();
    crawler = new EndpointCrawler(5000);
  });

  describe('constructor', () => {
    it('should create with default timeout', () => {
      const c = new EndpointCrawler();
      expect(c).toBeDefined();
    });

    it('should create with custom timeout', () => {
      const c = new EndpointCrawler(10000);
      expect(c).toBeDefined();
    });
  });

  describe('fetchMcpCapabilities', () => {
    it('should return null for non-HTTP endpoints', async () => {
      expect(await crawler.fetchMcpCapabilities('ws://example.com')).toBeNull();
      expect(await crawler.fetchMcpCapabilities('ftp://example.com')).toBeNull();
      expect(await crawler.fetchMcpCapabilities('invalid')).toBeNull();
    });

    it('should block private hosts', async () => {
      expect(await crawler.fetchMcpCapabilities('http://localhost:3000')).toBeNull();
      expect(await crawler.fetchMcpCapabilities('http://127.0.0.1:5000')).toBeNull();
    });

    it('should return null for invalid URL', async () => {
      expect(await crawler.fetchMcpCapabilities('http://')).toBeNull();
    });

    it('should fetch via JSON-RPC when available', async () => {
      const toolsResult = { result: { tools: [{ name: 'tool1' }, { name: 'tool2' }] } };
      const resourcesResult = { result: { resources: [{ name: 'res1' }] } };
      const promptsResult = { result: { prompts: [{ name: 'prompt1' }] } };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: null,
        text: async () => JSON.stringify(toolsResult),
      } as unknown as Response);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: null,
        text: async () => JSON.stringify(resourcesResult),
      } as unknown as Response);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: null,
        text: async () => JSON.stringify(promptsResult),
      } as unknown as Response);

      const result = await crawler.fetchMcpCapabilities('https://example.com/mcp');
      expect(result).not.toBeNull();
      expect(result?.mcpTools).toEqual(['tool1', 'tool2']);
      expect(result?.mcpResources).toEqual(['res1']);
      expect(result?.mcpPrompts).toEqual(['prompt1']);
    });

    it('should fallback to agentcard.json', async () => {
      // JSON-RPC calls all fail
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      mockFetch.mockRejectedValueOnce(new Error('fail'));

      // agentcard.json succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
        text: async () => JSON.stringify({ tools: ['toolA'], prompts: ['promptA'] }),
      } as unknown as Response);

      const result = await crawler.fetchMcpCapabilities('https://example.com');
      expect(result?.mcpTools).toEqual(['toolA']);
      expect(result?.mcpPrompts).toEqual(['promptA']);
    });

    it('should return null when all methods fail', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await crawler.fetchMcpCapabilities('https://example.com');
      expect(result).toBeNull();
    });

    it('should handle SSE response format', async () => {
      const sseText = 'event: message\ndata: {"result":{"tools":[{"name":"sse-tool"}]}}\n\n';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: null,
        text: async () => sseText,
      } as unknown as Response);
      // Resources and prompts fail
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      mockFetch.mockRejectedValueOnce(new Error('fail'));

      const result = await crawler.fetchMcpCapabilities('https://example.com');
      expect(result?.mcpTools).toEqual(['sse-tool']);
    });

    it('should handle redirect responses', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 302 } as Response);
      mockFetch.mockResolvedValueOnce({ ok: false, status: 302 } as Response);
      mockFetch.mockResolvedValueOnce({ ok: false, status: 302 } as Response);
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      const result = await crawler.fetchMcpCapabilities('https://example.com');
      expect(result).toBeNull();
    });

    it('should extract names from objects with different name fields', async () => {
      // JSON-RPC fails
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      // agentcard with objects that have id/identifier/title fields
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
        text: async () => JSON.stringify({
          tools: [{ id: 'byId' }, { identifier: 'byIdentifier' }, { title: 'byTitle' }],
        }),
      } as unknown as Response);

      const result = await crawler.fetchMcpCapabilities('https://example.com');
      expect(result?.mcpTools).toContain('byId');
    });

    it('should search in capabilities container', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
        text: async () => JSON.stringify({
          capabilities: { tools: ['nested-tool'] },
        }),
      } as unknown as Response);

      const result = await crawler.fetchMcpCapabilities('https://example.com');
      expect(result?.mcpTools).toEqual(['nested-tool']);
    });

    it('should handle response body with oversized content', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      // agentcard returns oversized (readLimitedText fallback)
      const bigText = 'x'.repeat(2 * 1024 * 1024);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
        text: async () => bigText,
      } as unknown as Response);

      const result = await crawler.fetchMcpCapabilities('https://example.com');
      // Will fail to parse JSON so returns null
      expect(result).toBeNull();
    });
  });

  describe('fetchA2aCapabilities', () => {
    it('should return null for non-HTTP endpoints', async () => {
      expect(await crawler.fetchA2aCapabilities('ws://example.com')).toBeNull();
    });

    it('should block private hosts', async () => {
      expect(await crawler.fetchA2aCapabilities('http://localhost')).toBeNull();
    });

    it('should try multiple well-known paths', async () => {
      // First path fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
      // Second path succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
        text: async () => JSON.stringify({ skills: ['skill1', 'skill2'] }),
      } as unknown as Response);

      const result = await crawler.fetchA2aCapabilities('https://example.com');
      expect(result?.a2aSkills).toEqual(['skill1', 'skill2']);
    });

    it('should return null when all paths fail', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 } as Response);
      const result = await crawler.fetchA2aCapabilities('https://example.com');
      expect(result).toBeNull();
    });

    it('should return null for invalid URL', async () => {
      expect(await crawler.fetchA2aCapabilities('http://')).toBeNull();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const result = await crawler.fetchA2aCapabilities('https://example.com');
      expect(result).toBeNull();
    });

    it('should return null when no skills found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: null,
        text: async () => JSON.stringify({ name: 'agent', skills: [] }),
      } as unknown as Response);
      const result = await crawler.fetchA2aCapabilities('https://example.com');
      expect(result).toBeNull();
    });
  });
});
