import { describe, it, expect } from '@jest/globals';
import {
  isPrivateHost,
  isBlockedUri,
  isValidAgentId,
  isValidURI,
  validateURI,
  isValidScore,
  validateByteLength,
  validateNonce,
} from '../../src/utils/validation.js';

describe('validation utilities', () => {
  describe('isPrivateHost', () => {
    it('should detect standard private IPs', () => {
      expect(isPrivateHost('127.0.0.1')).toBe(true);
      expect(isPrivateHost('10.0.0.1')).toBe(true);
      expect(isPrivateHost('192.168.1.1')).toBe(true);
      expect(isPrivateHost('172.16.0.1')).toBe(true);
      expect(isPrivateHost('172.31.255.255')).toBe(true);
      expect(isPrivateHost('169.254.1.1')).toBe(true);
      expect(isPrivateHost('0.0.0.0')).toBe(true);
    });

    it('should detect localhost', () => {
      expect(isPrivateHost('localhost')).toBe(true);
      expect(isPrivateHost('LOCALHOST')).toBe(true);
    });

    it('should detect IPv6 loopback', () => {
      expect(isPrivateHost('::1')).toBe(true);
      expect(isPrivateHost('[::1]')).toBe(true);
    });

    it('should detect IPv6 link-local', () => {
      expect(isPrivateHost('fe80::1')).toBe(true);
      expect(isPrivateHost('[fe80::1]')).toBe(true);
    });

    it('should detect IPv6 ULA', () => {
      expect(isPrivateHost('fc00::1')).toBe(true);
      expect(isPrivateHost('fd00::1')).toBe(true);
    });

    it('should detect blocked cloud metadata hosts', () => {
      expect(isPrivateHost('metadata.google.internal')).toBe(true);
      expect(isPrivateHost('metadata.google.internal.')).toBe(true);
      expect(isPrivateHost('instance-data.ec2.internal')).toBe(true);
      expect(isPrivateHost('metadata.azure.com')).toBe(true);
    });

    it('should allow public IPs', () => {
      expect(isPrivateHost('8.8.8.8')).toBe(false);
      expect(isPrivateHost('1.1.1.1')).toBe(false);
      expect(isPrivateHost('example.com')).toBe(false);
    });

    it('should detect decimal integer IP bypass (2130706433 = 127.0.0.1)', () => {
      expect(isPrivateHost('2130706433')).toBe(true);
    });

    it('should detect hex IP bypass (0x7f000001 = 127.0.0.1)', () => {
      expect(isPrivateHost('0x7f000001')).toBe(true);
    });

    it('should detect octal IP bypass (0177.0.0.1 = 127.0.0.1)', () => {
      expect(isPrivateHost('0177.0.0.1')).toBe(true);
    });

    it('should detect IPv6-mapped IPv4 in hex notation', () => {
      expect(isPrivateHost('::ffff:7f00:0001')).toBe(true);
    });

    it('should detect IPv6-mapped IPv4 in mixed notation', () => {
      expect(isPrivateHost('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateHost('::ffff:10.0.0.1')).toBe(true);
    });

    it('should detect shared address space (100.64-127)', () => {
      expect(isPrivateHost('100.64.0.1')).toBe(true);
      expect(isPrivateHost('100.127.255.255')).toBe(true);
    });

    it('should allow non-private decimal integers', () => {
      // 8.8.8.8 = 134744072
      expect(isPrivateHost('134744072')).toBe(false);
    });
  });

  describe('isBlockedUri', () => {
    it('should block private host URIs', () => {
      expect(isBlockedUri('http://127.0.0.1/api')).toBe(true);
      expect(isBlockedUri('https://localhost:3000/test')).toBe(true);
    });

    it('should allow public URIs', () => {
      expect(isBlockedUri('https://example.com/api')).toBe(false);
    });

    it('should block invalid URIs', () => {
      expect(isBlockedUri('not-a-url')).toBe(true);
      expect(isBlockedUri('')).toBe(true);
    });
  });

  describe('isValidAgentId', () => {
    it('should validate correct agent IDs', () => {
      expect(isValidAgentId('1:0')).toBe(true);
      expect(isValidAgentId('900:42')).toBe(true);
    });

    it('should reject invalid agent IDs', () => {
      expect(isValidAgentId('')).toBe(false);
      expect(isValidAgentId('0:0')).toBe(false);
      expect(isValidAgentId('abc')).toBe(false);
      expect(isValidAgentId(':1')).toBe(false);
      expect(isValidAgentId('1:')).toBe(false);
      expect(isValidAgentId(null as any)).toBe(false);
      expect(isValidAgentId(undefined as any)).toBe(false);
      expect(isValidAgentId(123 as any)).toBe(false);
    });
  });

  describe('isValidURI', () => {
    it('should accept HTTPS URIs', () => {
      expect(isValidURI('https://example.com/agent.json')).toBe(true);
    });

    it('should reject HTTP by default', () => {
      expect(isValidURI('http://example.com/agent.json')).toBe(false);
    });

    it('should allow HTTP when opted in', () => {
      expect(isValidURI('http://example.com/agent.json', { allowHttp: true })).toBe(true);
    });

    it('should accept IPFS CIDv0 URIs', () => {
      expect(isValidURI('ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(true);
    });

    it('should accept IPFS /ipfs/ path URIs', () => {
      expect(isValidURI('/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(true);
    });

    it('should reject URIs with credentials', () => {
      expect(isValidURI('https://user:pass@example.com/api')).toBe(false);
    });

    it('should reject private host URIs', () => {
      expect(isValidURI('https://127.0.0.1/api')).toBe(false);
      expect(isValidURI('https://localhost/api')).toBe(false);
    });

    it('should reject non-http protocols', () => {
      expect(isValidURI('ftp://example.com/file')).toBe(false);
    });

    it('should reject empty/null', () => {
      expect(isValidURI('')).toBe(false);
      expect(isValidURI(null as any)).toBe(false);
      expect(isValidURI(undefined as any)).toBe(false);
    });
  });

  describe('validateURI', () => {
    it('should not throw for valid HTTPS URIs', () => {
      expect(() => validateURI('https://example.com/api')).not.toThrow();
    });

    it('should not throw for valid IPFS URIs', () => {
      expect(() => validateURI('ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).not.toThrow();
      expect(() => validateURI('/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).not.toThrow();
    });

    it('should throw for empty input', () => {
      expect(() => validateURI('')).toThrow('must be a non-empty string');
      expect(() => validateURI(null as any)).toThrow('must be a non-empty string');
    });

    it('should throw for HTTP without opt-in', () => {
      expect(() => validateURI('http://example.com')).toThrow('must use https');
    });

    it('should allow HTTP with opt-in', () => {
      expect(() => validateURI('http://example.com', 'test', { allowHttp: true })).not.toThrow();
    });

    it('should throw for non-http protocols', () => {
      expect(() => validateURI('ftp://example.com')).toThrow('must use https or ipfs');
    });

    it('should throw for credentials in URI', () => {
      expect(() => validateURI('https://user:pass@example.com')).toThrow('must not contain credentials');
    });

    it('should throw for private hosts', () => {
      expect(() => validateURI('https://127.0.0.1')).toThrow('must not reference private');
    });

    it('should throw for invalid URL format', () => {
      expect(() => validateURI('not-a-url')).toThrow('is not a valid URL');
    });

    it('should throw for invalid IPFS CID', () => {
      expect(() => validateURI('ipfs://badcid')).toThrow('invalid IPFS CID');
    });

    it('should include field name in error messages', () => {
      expect(() => validateURI('', 'agentUri')).toThrow('agentUri must be a non-empty');
    });
  });

  describe('isValidScore', () => {
    it('should accept valid scores', () => {
      expect(isValidScore(0)).toBe(true);
      expect(isValidScore(50)).toBe(true);
      expect(isValidScore(100)).toBe(true);
    });

    it('should reject invalid scores', () => {
      expect(isValidScore(-1)).toBe(false);
      expect(isValidScore(101)).toBe(false);
      expect(isValidScore(50.5)).toBe(false);
      expect(isValidScore(NaN)).toBe(false);
    });
  });

  describe('validateByteLength', () => {
    it('should not throw within limit', () => {
      expect(() => validateByteLength('abc', 10, 'test')).not.toThrow();
    });

    it('should throw when exceeding limit', () => {
      expect(() => validateByteLength('a'.repeat(33), 32, 'tag')).toThrow('tag must be <= 32 bytes');
    });

    it('should count multi-byte chars correctly', () => {
      // emoji = 4 bytes UTF-8
      expect(() => validateByteLength('😀', 3, 'field')).toThrow('must be <= 3 bytes');
      expect(() => validateByteLength('😀', 4, 'field')).not.toThrow();
    });
  });

  describe('validateNonce', () => {
    it('should accept valid u32 nonces', () => {
      expect(() => validateNonce(0)).not.toThrow();
      expect(() => validateNonce(4294967295)).not.toThrow();
      expect(() => validateNonce(1000)).not.toThrow();
    });

    it('should reject invalid nonces', () => {
      expect(() => validateNonce(-1)).toThrow('must be a u32 integer');
      expect(() => validateNonce(4294967296)).toThrow('must be a u32 integer');
      expect(() => validateNonce(1.5)).toThrow('must be a u32 integer');
    });
  });
});
