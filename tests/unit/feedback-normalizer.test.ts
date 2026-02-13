import { describe, it, expect } from '@jest/globals';
import {
  ATOM_ENABLED_TAGS,
  isAtomEnabledTag,
  normalizeToScore,
  resolveScore,
} from '../../src/core/feedback-normalizer.js';

describe('feedback-normalizer', () => {
  describe('ATOM_ENABLED_TAGS', () => {
    it('should include expected tags', () => {
      expect(ATOM_ENABLED_TAGS).toContain('starred');
      expect(ATOM_ENABLED_TAGS).toContain('reachable');
      expect(ATOM_ENABLED_TAGS).toContain('responsetime');
      expect(ATOM_ENABLED_TAGS).toContain('uptime');
      expect(ATOM_ENABLED_TAGS).toContain('successrate');
    });
  });

  describe('isAtomEnabledTag', () => {
    it('should return true for known tags', () => {
      expect(isAtomEnabledTag('starred')).toBe(true);
      expect(isAtomEnabledTag('reachable')).toBe(true);
      expect(isAtomEnabledTag('uptime')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isAtomEnabledTag('STARRED')).toBe(true);
      expect(isAtomEnabledTag('Uptime')).toBe(true);
      expect(isAtomEnabledTag('RESPONSETIME')).toBe(true);
    });

    it('should return false for unknown tags', () => {
      expect(isAtomEnabledTag('unknown')).toBe(false);
      expect(isAtomEnabledTag('foobar')).toBe(false);
      expect(isAtomEnabledTag('')).toBe(false);
    });
  });

  describe('normalizeToScore', () => {
    it('should normalize starred to 0-100', () => {
      expect(normalizeToScore('starred', 85n, 0)).toBe(85);
      expect(normalizeToScore('starred', 8500n, 2)).toBe(85);
    });

    it('should clamp starred above 100', () => {
      expect(normalizeToScore('starred', 150n, 0)).toBe(100);
    });

    it('should clamp starred below 0', () => {
      expect(normalizeToScore('starred', 0n, 0)).toBe(0);
    });

    it('should normalize uptime', () => {
      expect(normalizeToScore('uptime', 99n, 0)).toBe(99);
      expect(normalizeToScore('uptime', 9950n, 2)).toBe(100);
    });

    it('should normalize successrate', () => {
      expect(normalizeToScore('successrate', 100n, 0)).toBe(100);
      expect(normalizeToScore('successrate', 50n, 0)).toBe(50);
    });

    it('should return null for binary/context tags', () => {
      expect(normalizeToScore('reachable', 1n, 0)).toBeNull();
      expect(normalizeToScore('ownerverified', 1n, 0)).toBeNull();
      expect(normalizeToScore('responsetime', 200n, 0)).toBeNull();
      expect(normalizeToScore('blocktimefreshness', 5n, 0)).toBeNull();
      expect(normalizeToScore('revenues', 1000n, 0)).toBeNull();
      expect(normalizeToScore('tradingyield', 12n, 0)).toBeNull();
    });

    it('should return null for unknown tags', () => {
      expect(normalizeToScore('unknown', 50n, 0)).toBeNull();
    });

    it('should throw on invalid decimals', () => {
      expect(() => normalizeToScore('starred', 50n, -1)).toThrow('Invalid decimals');
      expect(() => normalizeToScore('starred', 50n, 7)).toThrow('Invalid decimals');
      expect(() => normalizeToScore('starred', 50n, 1.5)).toThrow('Invalid decimals');
    });

    it('should handle decimals correctly', () => {
      // 85000 with 3 decimals = 85.0 → 85
      expect(normalizeToScore('starred', 85000n, 3)).toBe(85);
      // 99999 with 3 decimals = 99.999 → 100
      expect(normalizeToScore('starred', 99999n, 3)).toBe(100);
    });
  });

  describe('resolveScore', () => {
    it('should use explicit score when provided', () => {
      expect(resolveScore({ tag1: 'starred', value: 50, valueDecimals: 0, score: 80 })).toBe(80);
    });

    it('should round explicit score', () => {
      expect(resolveScore({ tag1: 'starred', value: 50, valueDecimals: 0, score: 75.7 })).toBe(76);
    });

    it('should ignore null score and normalize from tag', () => {
      expect(resolveScore({ tag1: 'starred', value: 90, valueDecimals: 0, score: null })).toBe(90);
    });

    it('should ignore undefined score and normalize from tag', () => {
      expect(resolveScore({ tag1: 'starred', value: 90, valueDecimals: 0 })).toBe(90);
    });

    it('should handle bigint value', () => {
      expect(resolveScore({ tag1: 'starred', value: 75n, valueDecimals: 0 })).toBe(75);
    });

    it('should return null for non-normalizable tag without explicit score', () => {
      expect(resolveScore({ tag1: 'responsetime', value: 200, valueDecimals: 0 })).toBeNull();
    });

    it('should return null for unknown tag without explicit score', () => {
      expect(resolveScore({ tag1: 'custom', value: 50, valueDecimals: 0 })).toBeNull();
    });

    it('should return null when no tag and no score', () => {
      expect(resolveScore({ value: 50, valueDecimals: 0 })).toBeNull();
    });

    it('should reject score out of range', () => {
      expect(resolveScore({ tag1: 'starred', value: 50, valueDecimals: 0, score: -1 })).toBe(50);
      expect(resolveScore({ tag1: 'starred', value: 50, valueDecimals: 0, score: 101 })).toBe(50);
    });

    it('should convert number value to bigint via truncation', () => {
      expect(resolveScore({ tag1: 'starred', value: 85.9, valueDecimals: 0 })).toBe(85);
    });
  });
});
