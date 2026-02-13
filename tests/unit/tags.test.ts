import { describe, it, expect } from '@jest/globals';
import { Tag, isKnownTag, getTagDescription } from '../../src/utils/tags.js';

describe('tags', () => {
  describe('Tag constants', () => {
    it('should have category tags (tag1)', () => {
      expect(Tag.starred).toBe('starred');
      expect(Tag.reachable).toBe('reachable');
      expect(Tag.ownerVerified).toBe('ownerVerified');
      expect(Tag.uptime).toBe('uptime');
      expect(Tag.successRate).toBe('successRate');
      expect(Tag.responseTime).toBe('responseTime');
      expect(Tag.blocktimeFreshness).toBe('blocktimeFreshness');
      expect(Tag.revenues).toBe('revenues');
      expect(Tag.tradingYield).toBe('tradingYield');
    });

    it('should have period tags (tag2)', () => {
      expect(Tag.day).toBe('day');
      expect(Tag.week).toBe('week');
      expect(Tag.month).toBe('month');
      expect(Tag.year).toBe('year');
    });

    it('should have x402 tags', () => {
      expect(Tag.x402ResourceDelivered).toBe('x402-resource-delivered');
      expect(Tag.x402DeliveryFailed).toBe('x402-delivery-failed');
      expect(Tag.x402DeliveryTimeout).toBe('x402-delivery-timeout');
      expect(Tag.x402QualityIssue).toBe('x402-quality-issue');
      expect(Tag.x402GoodPayer).toBe('x402-good-payer');
      expect(Tag.x402PaymentFailed).toBe('x402-payment-failed');
      expect(Tag.x402InsufficientFunds).toBe('x402-insufficient-funds');
      expect(Tag.x402InvalidSignature).toBe('x402-invalid-signature');
      expect(Tag.x402Evm).toBe('exact-evm');
      expect(Tag.x402Svm).toBe('exact-svm');
    });
  });

  describe('isKnownTag', () => {
    it('should return true for known standard tags', () => {
      expect(isKnownTag('starred')).toBe(true);
      expect(isKnownTag('uptime')).toBe(true);
      expect(isKnownTag('day')).toBe(true);
      expect(isKnownTag('month')).toBe(true);
    });

    it('should return true for x402 tags', () => {
      expect(isKnownTag('x402-resource-delivered')).toBe(true);
      expect(isKnownTag('x402-good-payer')).toBe(true);
      expect(isKnownTag('exact-evm')).toBe(true);
      expect(isKnownTag('exact-svm')).toBe(true);
    });

    it('should return false for unknown tags', () => {
      expect(isKnownTag('custom-tag')).toBe(false);
      expect(isKnownTag('')).toBe(false);
      expect(isKnownTag('STARRED')).toBe(false);
    });
  });

  describe('getTagDescription', () => {
    it('should return descriptions for known category tags', () => {
      expect(getTagDescription('starred')).toBe('Quality rating measurement (0-100)');
      expect(getTagDescription('uptime')).toBe('Endpoint availability percentage');
      expect(getTagDescription('reachable')).toBe('Endpoint availability verification (binary)');
    });

    it('should return descriptions for period tags', () => {
      expect(getTagDescription('day')).toBe('Daily measurement window');
      expect(getTagDescription('week')).toBe('Weekly measurement window');
      expect(getTagDescription('month')).toBe('Monthly measurement window');
      expect(getTagDescription('year')).toBe('Yearly measurement window');
    });

    it('should return descriptions for x402 tags', () => {
      expect(getTagDescription('x402-resource-delivered')).toBe('x402: Resource delivered successfully');
      expect(getTagDescription('x402-good-payer')).toBe('x402: Client paid successfully');
      expect(getTagDescription('exact-evm')).toBe('x402: EVM network settlement');
    });

    it('should return undefined for unknown tags', () => {
      expect(getTagDescription('unknown')).toBeUndefined();
      expect(getTagDescription('')).toBeUndefined();
    });
  });
});
