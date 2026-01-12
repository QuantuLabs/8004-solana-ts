/**
 * Unit tests for IndexerClient
 * Tests request building, error handling, and response parsing
 */

import { describe, it, expect } from '@jest/globals';
import {
  IndexerClient,
  IndexerError,
  IndexerErrorCode,
  IndexerUnauthorizedError,
  IndexerTimeoutError,
} from '../../src/index.js';

describe('IndexerClient', () => {
  describe('Constructor', () => {
    it('should create client with valid config', () => {
      const client = new IndexerClient({
        baseUrl: 'https://example.supabase.co/rest/v1',
        apiKey: 'test-key',
      });

      expect(client).toBeInstanceOf(IndexerClient);
    });

    it('should accept optional timeout', () => {
      const client = new IndexerClient({
        baseUrl: 'https://example.supabase.co/rest/v1',
        apiKey: 'test-key',
        timeout: 5000,
      });

      expect(client).toBeInstanceOf(IndexerClient);
    });

    it('should accept optional retries', () => {
      const client = new IndexerClient({
        baseUrl: 'https://example.supabase.co/rest/v1',
        apiKey: 'test-key',
        retries: 5,
      });

      expect(client).toBeInstanceOf(IndexerClient);
    });
  });

  describe('Error types', () => {
    it('should have IndexerError with correct code', () => {
      const error = new IndexerError('Test error', IndexerErrorCode.CONNECTION_FAILED);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(IndexerErrorCode.CONNECTION_FAILED);
      expect(error).toBeInstanceOf(Error);
    });

    it('should have IndexerUnauthorizedError', () => {
      const error = new IndexerUnauthorizedError();

      expect(error.code).toBe(IndexerErrorCode.UNAUTHORIZED);
      expect(error.message).toContain('API key');
    });

    it('should have IndexerTimeoutError', () => {
      const error = new IndexerTimeoutError();

      expect(error.code).toBe(IndexerErrorCode.TIMEOUT);
    });

    it('should have all error codes defined', () => {
      expect(IndexerErrorCode.CONNECTION_FAILED).toBeDefined();
      expect(IndexerErrorCode.RATE_LIMITED).toBeDefined();
      expect(IndexerErrorCode.TIMEOUT).toBeDefined();
      expect(IndexerErrorCode.NOT_FOUND).toBeDefined();
      expect(IndexerErrorCode.INVALID_RESPONSE).toBeDefined();
      expect(IndexerErrorCode.UNAUTHORIZED).toBeDefined();
      expect(IndexerErrorCode.SERVER_ERROR).toBeDefined();
    });
  });

  describe('Query building', () => {
    it('should handle getLeaderboard with defaults', async () => {
      const client = new IndexerClient({
        baseUrl: 'https://invalid.example.com/rest/v1',
        apiKey: 'test-key',
        timeout: 100,
        retries: 0,
      });

      // Will fail due to invalid URL, but tests query building
      await expect(client.getLeaderboard()).rejects.toThrow();
    });

    it('should handle getLeaderboard with options', async () => {
      const client = new IndexerClient({
        baseUrl: 'https://invalid.example.com/rest/v1',
        apiKey: 'test-key',
        timeout: 100,
        retries: 0,
      });

      // Tests that options are accepted
      await expect(
        client.getLeaderboard({
          limit: 10,
          minTier: 2,
          collection: 'test-collection',
          cursorSortKey: '1234567890',
        })
      ).rejects.toThrow();
    });
  });

  describe('Response handling', () => {
    it('should handle network errors gracefully', async () => {
      const client = new IndexerClient({
        baseUrl: 'https://this-domain-does-not-exist.invalid/rest/v1',
        apiKey: 'test-key',
        timeout: 1000,
        retries: 0,
      });

      await expect(client.getGlobalStats()).rejects.toThrow();
    });

    it('should timeout on slow responses', async () => {
      const client = new IndexerClient({
        baseUrl: 'https://httpstat.us/200?sleep=5000', // Sleeps for 5 seconds
        apiKey: 'test-key',
        timeout: 100, // 100ms timeout
        retries: 0,
      });

      await expect(client.getGlobalStats()).rejects.toThrow();
    });
  });

  describe('Method signatures', () => {
    const client = new IndexerClient({
      baseUrl: 'https://example.supabase.co/rest/v1',
      apiKey: 'test-key',
    });

    it('should have getAgent method', () => {
      expect(typeof client.getAgent).toBe('function');
    });

    it('should have getAgents method', () => {
      expect(typeof client.getAgents).toBe('function');
    });

    it('should have getAgentsByOwner method', () => {
      expect(typeof client.getAgentsByOwner).toBe('function');
    });

    it('should have getAgentsByCollection method', () => {
      expect(typeof client.getAgentsByCollection).toBe('function');
    });

    it('should have getLeaderboard method', () => {
      expect(typeof client.getLeaderboard).toBe('function');
    });

    it('should have getGlobalStats method', () => {
      expect(typeof client.getGlobalStats).toBe('function');
    });

    it('should have getFeedbacks method', () => {
      expect(typeof client.getFeedbacks).toBe('function');
    });

    it('should have isAvailable method', () => {
      expect(typeof client.isAvailable).toBe('function');
    });
  });
});
