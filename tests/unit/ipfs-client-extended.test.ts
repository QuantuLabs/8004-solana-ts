import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule('../../src/utils/crypto-utils.js', () => ({
  sha256: jest.fn().mockResolvedValue(new Uint8Array(32)),
}));

jest.unstable_mockModule('../../src/utils/registration-file-builder.js', () => ({
  buildRegistrationFileJson: jest.fn().mockReturnValue({ type: 'test' }),
}));

const { IPFSClient } = await import('../../src/core/ipfs-client.js');

describe('IPFSClient extended coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('add - pinata verification edge cases', () => {
    it('should handle verification success (200 OK)', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { cid: 'QmTestCid12345678901234567890123456789012' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
        } as Response);

      const cid = await client.add('data');
      expect(cid).toBe('QmTestCid12345678901234567890123456789012');
    });

    it('should handle verification HTTP 500 gracefully', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { cid: 'QmTestCid12345678901234567890123456789012' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        } as Response);

      // Verification failure with non-429 is caught but CID still returned
      const cid = await client.add('data');
      expect(cid).toBe('QmTestCid12345678901234567890123456789012');
    });

    it('should handle verification aborted error', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { cid: 'QmTestCid12345678901234567890123456789012' } }),
        } as Response)
        .mockRejectedValueOnce(new Error('aborted'));

      const cid = await client.add('data');
      expect(cid).toBe('QmTestCid12345678901234567890123456789012');
    });

    it('should handle verification 429 in error catch', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ cid: 'QmTestCid12345678901234567890123456789012' } ),
        } as Response)
        .mockRejectedValueOnce(new Error('429 rate limit'));

      const cid = await client.add('data');
      expect(cid).toBe('QmTestCid12345678901234567890123456789012');
    });

    it('should handle generic verification error', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { cid: 'QmTestCid12345678901234567890123456789012' } }),
        } as Response)
        .mockRejectedValueOnce(new Error('generic failure'));

      const cid = await client.add('data');
      expect(cid).toBe('QmTestCid12345678901234567890123456789012');
    });

    it('should handle non-Error verification error', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { cid: 'QmTestCid12345678901234567890123456789012' } }),
        } as Response)
        .mockRejectedValueOnce('string error');

      const cid = await client.add('data');
      expect(cid).toBe('QmTestCid12345678901234567890123456789012');
    });
  });

  describe('add - generic error handling', () => {
    it('should wrap non-Error in error message', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      mockFetch.mockRejectedValueOnce('string error');
      await expect(client.add('data')).rejects.toThrow('Failed to pin to Pinata: string error');
    });
  });

  describe('get - gateway response scenarios', () => {
    it('should reject oversized Content-Length', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': '999999999' }),
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
            releaseLock: jest.fn(),
          }),
        },
      } as unknown as Response);

      await expect(
        client.get('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      ).rejects.toThrow('Content too large');
    });

    it('should reject oversized streaming response', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      const bigChunk = new Uint8Array(20 * 1024 * 1024); // 20MB
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: bigChunk })
              .mockResolvedValueOnce({ done: true, value: undefined }),
            releaseLock: jest.fn(),
          }),
        },
      } as unknown as Response);

      await expect(
        client.get('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      ).rejects.toThrow();
    });

    it('should handle response without body', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: null,
      } as unknown as Response);

      await expect(
        client.get('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      ).rejects.toThrow();
    });
  });

  describe('pin/unpin (node)', () => {
    it('pin should call node API and return pinned CID', async () => {
      const client = new IPFSClient({ url: 'http://localhost:5001' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Pins: ['QmTest'] }),
      } as unknown as Response);
      await expect(client.pin('QmTest')).resolves.toEqual({ pinned: ['QmTest'] });
    });

    it('unpin should call node API and return unpinned CID', async () => {
      const client = new IPFSClient({ url: 'http://localhost:5001' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Pins: ['QmTest'] }),
      } as unknown as Response);
      await expect(client.unpin('QmTest')).resolves.toEqual({ unpinned: ['QmTest'] });
    });
  });

  describe('get (node)', () => {
    it('should throw when node API responds with HTTP error', async () => {
      const client = new IPFSClient({ url: 'http://localhost:5001' });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'boom',
      } as unknown as Response);
      await expect(client.get('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).rejects.toThrow();
    });
  });

  describe('addFile - node provider', () => {
    it('should throw for non-existent file (node provider)', async () => {
      const client = new IPFSClient({ url: 'http://localhost:5001' });
      await expect(client.addFile('/tmp/nonexistent-file-xyz123.json')).rejects.toThrow('ENOENT');
    });
  });
});
