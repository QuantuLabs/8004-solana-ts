import { describe, it, expect } from '@jest/globals';
import { validateSkill, validateDomain, getAllSkills, getAllDomains } from '../../src/core/oasf-validator.js';

describe('oasf-validator', () => {
  describe('validateSkill', () => {
    it('should return true for valid skills', () => {
      const skills = getAllSkills();
      expect(skills.length).toBeGreaterThan(0);
      expect(validateSkill(skills[0])).toBe(true);
    });

    it('should return false for invalid skills', () => {
      expect(validateSkill('nonexistent/skill')).toBe(false);
      expect(validateSkill('')).toBe(false);
      expect(validateSkill('random_garbage_string')).toBe(false);
    });
  });

  describe('validateDomain', () => {
    it('should return true for valid domains', () => {
      const domains = getAllDomains();
      expect(domains.length).toBeGreaterThan(0);
      expect(validateDomain(domains[0])).toBe(true);
    });

    it('should return false for invalid domains', () => {
      expect(validateDomain('nonexistent/domain')).toBe(false);
      expect(validateDomain('')).toBe(false);
      expect(validateDomain('invalid')).toBe(false);
    });
  });

  describe('getAllSkills', () => {
    it('should return an array of strings', () => {
      const skills = getAllSkills();
      expect(Array.isArray(skills)).toBe(true);
      for (const s of skills) {
        expect(typeof s).toBe('string');
      }
    });

    it('should return a copy (not mutable reference)', () => {
      const a = getAllSkills();
      const b = getAllSkills();
      expect(a).toEqual(b);
      a.push('mutated');
      expect(getAllSkills()).not.toContain('mutated');
    });
  });

  describe('getAllDomains', () => {
    it('should return an array of strings', () => {
      const domains = getAllDomains();
      expect(Array.isArray(domains)).toBe(true);
      for (const d of domains) {
        expect(typeof d).toBe('string');
      }
    });

    it('should return a copy (not mutable reference)', () => {
      const a = getAllDomains();
      a.push('mutated');
      expect(getAllDomains()).not.toContain('mutated');
    });
  });
});
