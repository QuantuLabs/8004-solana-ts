import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { EndpointCrawler } = await import('../../src/core/endpoint-crawler.js');

describe('EndpointCrawler deep coverage', () => {
  let crawler: InstanceType<typeof EndpointCrawler>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    crawler = new EndpointCrawler();
  });

  describe('readLimitedText - streaming body', () => {
    it('should read streaming body with multiple chunks', async () => {
      const chunk1 = new TextEncoder().encode('{"part');
      const chunk2 = new TextEncoder().encode('":"one"}');
      const response = {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: chunk1 })
              .mockResolvedValueOnce({ done: false, value: chunk2 })
              .mockResolvedValueOnce({ done: true, value: undefined }),
            releaseLock: jest.fn(),
          }),
        },
        text: undefined,
      } as unknown as Response;

      // readLimitedText is private, so we test it through fetchMcpCapabilities
      // which calls it internally
      mockFetch.mockResolvedValueOnce(response);

      // fetchMcpCapabilities sends a JSON-RPC request and reads the response
      const result = await crawler.fetchMcpCapabilities('https://example.com/mcp');
      // Response {"part":"one"} doesn't have result.tools etc, so returns null or partial
      // The important thing is it didn't throw
      expect(result).toBeNull(); // parsed but no valid capabilities
    });

    it('should enforce streaming size limit', async () => {
      const bigChunk = new Uint8Array(20 * 1024 * 1024);
      const response = {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: bigChunk })
              .mockResolvedValueOnce({ done: true, value: undefined }),
            releaseLock: jest.fn(),
          }),
        },
        text: undefined,
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(response);
      const result = await crawler.fetchMcpCapabilities('https://example.com/mcp');
      // Should handle the error gracefully and return null
      expect(result).toBeNull();
    });

    it('should handle response without body using text()', async () => {
      const makeResponse = (text: string) => ({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: null,
        text: jest.fn().mockResolvedValue(text),
      } as unknown as Response);

      // 3 JSON-RPC calls: tools/list returns tools, resources and prompts return null
      mockFetch
        .mockResolvedValueOnce(makeResponse('{"result":{"tools":[{"name":"t1"}]}}'))
        .mockResolvedValueOnce(makeResponse('{"result":null}'))
        .mockResolvedValueOnce(makeResponse('{"result":null}'));

      const result = await crawler.fetchMcpCapabilities('https://example.com/mcp');
      expect(result).not.toBeNull();
      expect(result!.mcpTools).toContain('t1');
    });
  });

  describe('fetchMcpCapabilities - SSE response', () => {
    it('should parse SSE format response for tools', async () => {
      const sseResponse = 'event: message\ndata: {"result":{"tools":[{"name":"tool1"}]}}\n\n';

      // 3 JSON-RPC calls: tools returns SSE, others return null
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: null,
          text: jest.fn().mockResolvedValue(sseResponse),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true, headers: new Headers(), body: null,
          text: jest.fn().mockResolvedValue('{"result":null}'),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true, headers: new Headers(), body: null,
          text: jest.fn().mockResolvedValue('{"result":null}'),
        } as unknown as Response);

      const result = await crawler.fetchMcpCapabilities('https://example.com/mcp');
      expect(result).not.toBeNull();
      expect(result!.mcpTools).toContain('tool1');
    });

    it('should handle all JSON-RPC calls failing and try agentcard fallback', async () => {
      // All 3 JSON-RPC calls fail
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, headers: new Headers() } as Response)
        .mockResolvedValueOnce({ ok: false, status: 500, headers: new Headers() } as Response)
        .mockResolvedValueOnce({ ok: false, status: 500, headers: new Headers() } as Response)
        // agentcard.json fallback also fails
        .mockResolvedValueOnce({ ok: false, status: 404, headers: new Headers() } as Response);

      const result = await crawler.fetchMcpCapabilities('https://example.com/mcp');
      expect(result).toBeNull();
    });

    it('should handle redirect response in JSON-RPC', async () => {
      // All 3 JSON-RPC calls return redirects
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 302, headers: new Headers() } as Response)
        .mockResolvedValueOnce({ ok: false, status: 302, headers: new Headers() } as Response)
        .mockResolvedValueOnce({ ok: false, status: 302, headers: new Headers() } as Response)
        // agentcard fallback fails
        .mockResolvedValueOnce({ ok: false, status: 404, headers: new Headers() } as Response);

      const result = await crawler.fetchMcpCapabilities('https://example.com/mcp');
      expect(result).toBeNull();
    });
  });

  describe('fetchA2aCapabilities', () => {
    it('should parse A2A agentcard with skills (objects)', async () => {
      // A2A tries multiple URLs - we need to mock all fetch calls
      // First URL succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: null,
        text: jest.fn().mockResolvedValue(JSON.stringify({
          skills: [{ name: 'search' }, { name: 'calculate' }],
        })),
      } as unknown as Response);

      const result = await crawler.fetchA2aCapabilities('https://example.com');
      expect(result).not.toBeNull();
      expect(result!.a2aSkills).toContain('search');
    });

    it('should extract from nested capabilities', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: null,
        text: jest.fn().mockResolvedValue(JSON.stringify({
          capabilities: {
            skills: [{ name: 'nested-skill' }],
          },
        })),
      } as unknown as Response);

      const result = await crawler.fetchA2aCapabilities('https://example.com');
      expect(result).not.toBeNull();
      expect(result!.a2aSkills).toContain('nested-skill');
    });

    it('should handle string items in skills array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: null,
        text: jest.fn().mockResolvedValue(JSON.stringify({
          skills: ['skill-string-1', 'skill-string-2'],
        })),
      } as unknown as Response);

      const result = await crawler.fetchA2aCapabilities('https://example.com');
      expect(result).not.toBeNull();
      expect(result!.a2aSkills).toContain('skill-string-1');
    });

    it('should handle all URLs failing', async () => {
      mockFetch.mockRejectedValue(new Error('network'));
      const result = await crawler.fetchA2aCapabilities('https://example.com');
      expect(result).toBeNull();
    });

    it('should skip non-HTTP endpoints', async () => {
      const result = await crawler.fetchA2aCapabilities('ftp://example.com');
      expect(result).toBeNull();
    });
  });
});
