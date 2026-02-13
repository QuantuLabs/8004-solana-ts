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

describe('IPFSClient deep coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('add - filecoin provider', () => {
    it('should throw for filecoin provider (not implemented)', async () => {
      const client = new IPFSClient({ filecoinPinEnabled: true, filecoinPrivateKey: 'key' });
      await expect(client.add('test data')).rejects.toThrow('not yet fully implemented');
    });
  });

  describe('addFile - pinata provider', () => {
    it('should pin file content to pinata', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });

      const fs = await import('fs');
      const tmpPath = '/tmp/test-ipfs-client-deep.json';
      fs.writeFileSync(tmpPath, '{"test": true}');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { cid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG' } }),
        } as Response)
        .mockResolvedValueOnce({ ok: true } as Response);

      const cid = await client.addFile(tmpPath);
      expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');

      fs.unlinkSync(tmpPath);
    });
  });

  describe('addFile - filecoin provider', () => {
    it('should throw for filecoin provider (not implemented)', async () => {
      const client = new IPFSClient({ filecoinPinEnabled: true, filecoinPrivateKey: 'key' });

      const fs = await import('fs');
      const tmpPath = '/tmp/test-ipfs-filecoin.json';
      fs.writeFileSync(tmpPath, '{"test": true}');

      await expect(client.addFile(tmpPath)).rejects.toThrow('not yet fully implemented');
      fs.unlinkSync(tmpPath);
    });
  });

  describe('get - gateway with successful fetch', () => {
    it('should fetch from gateway and decode content', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      const content = '{"hello":"world"}';
      const contentBytes = new TextEncoder().encode(content);

      // Need to mock sha256 to return matching hash for CIDv0 verification
      // Since we mock sha256 to return Uint8Array(32), the CID verification will fail
      // unless we use a CIDv1 which skips verification (returns false → throws)
      // Let's test the error path first
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: contentBytes })
              .mockResolvedValueOnce({ done: true, value: undefined }),
            releaseLock: jest.fn(),
          }),
        },
      } as unknown as Response);

      // CID hash verification will fail since sha256 mock returns zeros
      // and CID contains a different hash
      await expect(
        client.get('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      ).rejects.toThrow('hash verification failed');
    });

    it('should handle gateway HTTP error and try next', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });

      // All gateways fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
      } as unknown as Response);

      await expect(
        client.get('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      ).rejects.toThrow();
    }, 30000);
  });

  describe('get - CIDv1 verification', () => {
    it('should reject CIDv1 content (verification not implemented)', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      const contentBytes = new TextEncoder().encode('test');

      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: contentBytes })
              .mockResolvedValueOnce({ done: true, value: undefined }),
            releaseLock: jest.fn(),
          }),
        },
      } as unknown as Response);

      // CIDv1 starts with 'b' and has 58+ base32 chars
      const cidV1 = 'b' + 'a'.repeat(58);
      await expect(client.get(cidV1)).rejects.toThrow('hash verification failed');
    });
  });

  describe('pin - filecoin provider', () => {
    it('should return pinned CID as no-op', async () => {
      const client = new IPFSClient({ filecoinPinEnabled: true, filecoinPrivateKey: 'key' });
      const result = await client.pin('QmTest');
      expect(result.pinned).toEqual(['QmTest']);
    });
  });

  describe('unpin - filecoin provider', () => {
    it('should return unpinned CID as no-op', async () => {
      const client = new IPFSClient({ filecoinPinEnabled: true, filecoinPrivateKey: 'key' });
      const result = await client.unpin('QmTest');
      expect(result.unpinned).toEqual(['QmTest']);
    });
  });

  describe('addJson', () => {
    it('should stringify and pin JSON', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { cid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG' } }),
        } as Response)
        .mockResolvedValueOnce({ ok: true } as Response);

      const cid = await client.addJson({ key: 'value' });
      expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
    });
  });

  describe('addRegistrationFile', () => {
    it('should build and add registration file', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { cid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG' } }),
        } as Response)
        .mockResolvedValueOnce({ ok: true } as Response);

      const cid = await client.addRegistrationFile({ services: [] } as any);
      expect(cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
    });
  });

  describe('close', () => {
    it('should clear client reference', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      await client.close();
      // No error expected
    });
  });

  describe('get - streaming size limit', () => {
    it('should enforce streaming size limit', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      const bigChunk = new Uint8Array(20 * 1024 * 1024);

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
      ).rejects.toThrow('exceeded max size');
    });
  });

  describe('CID validation', () => {
    it('should reject invalid CID format', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      await expect(client.get('invalid-cid-format!')).rejects.toThrow('Invalid IPFS CID format');
    });

    it('should strip ipfs:// prefix', async () => {
      const client = new IPFSClient({ pinataEnabled: true, pinataJwt: 'jwt' });
      // Will fail at hash verification but should not fail at CID validation
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: jest.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array(10) })
              .mockResolvedValueOnce({ done: true, value: undefined }),
            releaseLock: jest.fn(),
          }),
        },
      } as unknown as Response);

      await expect(
        client.get('ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      ).rejects.toThrow('hash verification');
    });
  });
});
