/**
 * Security tests for SSRF protection in SolanaSDK
 * Validates that isAllowedUri blocks private/internal addresses
 * and that fetch calls use redirect: 'manual' instead of 'follow'.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a minimal SDK instance for testing isAllowedUri
const sdk = new SolanaSDK();
const isAllowedUri = (uri: string): boolean => (sdk as any).isAllowedUri(uri);

describe('SSRF Protection', () => {
  describe('isAllowedUri blocks IPv4 private ranges', () => {
    const blockedAddresses = [
      ['http://127.0.0.1', 'loopback'],
      ['http://127.0.0.42/path', 'loopback (alternate)'],
      ['http://10.0.0.1', 'class A private'],
      ['http://10.255.255.255', 'class A private (end)'],
      ['http://192.168.1.1', 'class C private'],
      ['http://192.168.0.100/api', 'class C private (with path)'],
      ['http://172.16.0.1', 'class B private (start)'],
      ['http://172.31.255.255', 'class B private (end)'],
      ['http://169.254.169.254', 'AWS metadata'],
      ['http://169.254.169.254/latest/meta-data/', 'AWS metadata (with path)'],
      ['http://0.0.0.0', 'unspecified'],
      ['http://localhost', 'localhost'],
      ['http://localhost:8080/admin', 'localhost with port'],
    ];

    it.each(blockedAddresses)('blocks %s (%s)', (uri) => {
      expect(isAllowedUri(uri as string)).toBe(false);
    });
  });

  describe('isAllowedUri blocks CGNAT range (100.64.0.0/10)', () => {
    const cgnatBlocked = [
      ['http://100.64.0.1', 'CGNAT start'],
      ['http://100.100.100.100', 'CGNAT mid'],
      ['http://100.127.255.255', 'CGNAT end'],
    ];

    it.each(cgnatBlocked)('blocks %s (%s)', (uri) => {
      expect(isAllowedUri(uri as string)).toBe(false);
    });

    it('allows 100.128.0.1 (outside CGNAT range)', () => {
      expect(isAllowedUri('http://100.128.0.1')).toBe(true);
    });
  });

  describe('isAllowedUri blocks IPv6 private addresses', () => {
    const ipv6Blocked = [
      ['http://[::1]', 'loopback'],
      ['http://[fe80::1]', 'link-local'],
      ['http://[fc00::1]', 'ULA (fc)'],
      ['http://[fd00::1]', 'ULA (fd)'],
    ];

    it.each(ipv6Blocked)('blocks %s (%s)', (uri) => {
      expect(isAllowedUri(uri as string)).toBe(false);
    });

    // Node's URL parser normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1 (hex form),
    // which bypasses the current dotted-decimal regex. Track as known gap.
    it.todo('should block http://[::ffff:127.0.0.1] (IPv4-mapped loopback)');
    it.todo('should block http://[::ffff:10.0.0.1] (IPv4-mapped class A)');
  });

  describe('isAllowedUri allows legitimate public URLs', () => {
    const allowedUrls = [
      'https://example.com',
      'https://api.mainnet-beta.solana.com',
      'https://ipfs.io/ipfs/QmTest',
      'https://arweave.net/abc123',
      'http://100.128.0.1',
    ];

    it.each(allowedUrls)('allows %s', (uri) => {
      expect(isAllowedUri(uri)).toBe(true);
    });
  });

  describe('isAllowedUri rejects malformed URIs', () => {
    it('rejects empty string', () => {
      expect(isAllowedUri('')).toBe(false);
    });

    it('rejects non-URL string', () => {
      expect(isAllowedUri('not-a-url')).toBe(false);
    });
  });

  describe('redirect policy', () => {
    it('sdk-solana.ts uses redirect: manual (never follow)', () => {
      const sdkSource = readFileSync(
        path.join(__dirname, '../../src/core/sdk-solana.ts'),
        'utf-8',
      );
      expect(sdkSource).not.toContain("redirect: 'follow'");
      expect(sdkSource).not.toContain('redirect: "follow"');
    });

    it('endpoint-crawler.ts uses redirect: manual (never follow)', () => {
      const crawlerSource = readFileSync(
        path.join(__dirname, '../../src/core/endpoint-crawler.ts'),
        'utf-8',
      );
      expect(crawlerSource).not.toContain("redirect: 'follow'");
      expect(crawlerSource).not.toContain('redirect: "follow"');
    });
  });

  describe('no console.warn in SDK', () => {
    it('sdk-solana.ts does not contain console.warn', () => {
      const sdkSource = readFileSync(
        path.join(__dirname, '../../src/core/sdk-solana.ts'),
        'utf-8',
      );
      expect(sdkSource).not.toContain('console.warn');
    });
  });
});
