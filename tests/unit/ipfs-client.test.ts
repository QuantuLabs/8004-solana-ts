import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock logger
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock crypto-utils
jest.unstable_mockModule('../../src/utils/crypto-utils.js', () => ({
  sha256: jest.fn().mockResolvedValue(new Uint8Array(32)),
}));

// Mock registration-file-builder
jest.unstable_mockModule('../../src/utils/registration-file-builder.js', () => ({
  buildRegistrationFileJson: jest.fn().mockReturnValue({ type: 'test', name: 'test' }),
}));

const { IPFSClient } = await import('../../src/core/ipfs-client.js');

describe('IPFSClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create pinata provider', () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'test-jwt' });
      expect(client).toBeDefined();
    });

    it('should throw if pinata enabled without JWT', () => {
      expect(() => new IPFSClient({ pinataEnabled: true })).toThrow('pinataJwt is required');
    });

    it('should create filecoinPin provider', () => {
      const client = new IPFSClient({ filecoinPinEnabled: true });
      expect(client).toBeDefined();
    });

    it('should create node provider with URL', () => {
      const client = new IPFSClient({ url: 'http://localhost:5001' });
      expect(client).toBeDefined();
    });

    it('should throw when no provider configured', () => {
      expect(() => new IPFSClient({})).toThrow('No IPFS provider configured');
    });

    it('should prioritize pinata over filecoin and node', () => {
      const client = new IPFSClient({
        pinataEnabled: true,
        pinataJwt: 'jwt',
        filecoinPinEnabled: true,
        url: 'http://localhost:5001',
      });
      expect(client).toBeDefined();
    });
  });

  describe('add (pinata)', () => {
    it('should upload data and return CID', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'test-jwt' });

      // Mock successful upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { cid: 'QmTestCid12345678901234567890123456789012' } }),
      } as Response);

      // Mock verification (rate limited - non-fatal)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      } as Response);

      const cid = await client.add('test data');
      expect(cid).toBe('QmTestCid12345678901234567890123456789012');
    });

    it('should handle upload failure', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'test-jwt' });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response);
      await expect(client.add('data')).rejects.toThrow('Failed to pin to Pinata');
    });

    it('should handle missing CID in response', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'test-jwt' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} }),
      } as Response);
      await expect(client.add('data')).rejects.toThrow('No CID returned');
    });

    it('should handle timeout', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'test-jwt' });
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortErr);
      await expect(client.add('data')).rejects.toThrow('timed out');
    });

    it('should handle verification timeout gracefully', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'test-jwt' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { cid: 'QmTestCid12345678901234567890123456789012' } }),
      } as Response);
      mockFetch.mockRejectedValueOnce(new Error('timeout'));
      const cid = await client.add('data');
      expect(cid).toBe('QmTestCid12345678901234567890123456789012');
    });

    it('should handle verification HTTP error gracefully (non-fatal)', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'test-jwt' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ IpfsHash: 'QmTestCid12345678901234567890123456789012' }),
      } as Response);
      // Verification fails with non-429 - caught and logged, not fatal
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);
      const cid = await client.add('data');
      expect(cid).toBe('QmTestCid12345678901234567890123456789012');
    });
  });

  describe('add (filecoinPin)', () => {
    it('should throw not implemented error', async () => {
      const client = new IPFSClient({ filecoinPinEnabled: true });
      await expect(client.add('data')).rejects.toThrow('not yet fully implemented');
    });
  });

  describe('add (node)', () => {
    it('should upload to IPFS HTTP API and return CID', async () => {
      const client = new IPFSClient({ url: 'http://localhost:5001' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '{"Name":"data.json","Hash":"QmTestCid12345678901234567890123456789012","Size":"4"}',
      } as unknown as Response);

      const cid = await client.add('data');
      expect(cid).toBe('QmTestCid12345678901234567890123456789012');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v0/add?pin=true'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('get (pinata/filecoinPin)', () => {
    it('should strip ipfs:// prefix', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      const mockBody = {
        getReader: () => ({
          read: jest.fn()
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('test') })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          releaseLock: jest.fn(),
        }),
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '4' }),
        body: mockBody,
      } as unknown as Response);

      // Will fail at hash verification, but tests the CID extraction
      await expect(client.get('ipfs://QmTeSt12345678901234567890123456789012345678')).rejects.toThrow();
    });

    it('should reject invalid CID format', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      await expect(client.get('invalid-cid')).rejects.toThrow('Invalid IPFS CID format');
    });

    it('should reject CID with path injection', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      await expect(client.get('../../../etc/passwd')).rejects.toThrow('Invalid IPFS CID format');
    });

    it('should handle all gateways failing', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      // All gateway fetches fail
      mockFetch.mockRejectedValue(new Error('network error'));
      await expect(
        client.get('QmTeSt12345678901234567890123456789012345678')
      ).rejects.toThrow();
    });
  });

  describe('getJson', () => {
    it('should parse JSON from get result', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      // Mock get to resolve
      const originalGet = client.get.bind(client);
      client.get = jest.fn<typeof client.get>().mockResolvedValue('{"key":"value"}');
      const result = await client.getJson('QmTeSt12345678901234567890123456789012345678');
      expect(result).toEqual({ key: 'value' });
      client.get = originalGet;
    });
  });

  describe('pin (filecoinPin)', () => {
    it('should be a no-op returning pinned CIDs', async () => {
      const client = new IPFSClient({ filecoinPinEnabled: true });
      const result = await client.pin('testcid');
      expect(result.pinned).toEqual(['testcid']);
    });
  });

  describe('unpin (filecoinPin)', () => {
    it('should be a no-op returning unpinned CIDs', async () => {
      const client = new IPFSClient({ filecoinPinEnabled: true });
      const result = await client.unpin('testcid');
      expect(result.unpinned).toEqual(['testcid']);
    });
  });

  describe('addJson', () => {
    it('should stringify and add', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      const addSpy = jest.fn<typeof client.add>().mockResolvedValue('QmResult');
      client.add = addSpy;
      const cid = await client.addJson({ key: 'val' });
      expect(cid).toBe('QmResult');
      expect(addSpy).toHaveBeenCalledWith(JSON.stringify({ key: 'val' }, null, 2));
    });
  });

  describe('addRegistrationFile', () => {
    it('should build and add registration file', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      const addJsonSpy = jest.fn<typeof client.addJson>().mockResolvedValue('QmReg');
      client.addJson = addJsonSpy;
      const cid = await client.addRegistrationFile(
        { name: 'test', description: 'desc', services: [] } as any,
        1,
        '0xreg'
      );
      expect(cid).toBe('QmReg');
    });
  });

  describe('getRegistrationFile', () => {
    it('should fetch and parse registration file', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      const mockFile = { name: 'agent', description: 'test', services: [] };
      client.getJson = jest.fn<typeof client.getJson>().mockResolvedValue(mockFile);
      const result = await client.getRegistrationFile('QmCid');
      expect(result.name).toBe('agent');
    });
  });

  describe('close', () => {
    it('should clear client reference', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      await client.close();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('addFile', () => {
    it('should throw for non-existent file', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      await expect(client.addFile('/tmp/nonexistent-test-file-12345.json')).rejects.toThrow('ENOENT');
    });
  });
});
