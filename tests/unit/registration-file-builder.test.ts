import { describe, it, expect, jest } from '@jest/globals';
import { buildRegistrationFileJson } from '../../src/utils/registration-file-builder.js';
import { ServiceType } from '../../src/models/enums.js';
import type { RegistrationFile } from '../../src/models/interfaces.js';

// Mock oasf-validator
jest.unstable_mockModule('../../src/core/oasf-validator.js', () => ({
  validateSkill: jest.fn((s: string) => s.startsWith('valid/')),
  validateDomain: jest.fn((d: string) => d.startsWith('valid/')),
}));

const { buildRegistrationFileJson: buildJson } = await import('../../src/utils/registration-file-builder.js');

describe('registration-file-builder', () => {
  const minimalFile: RegistrationFile = {
    name: 'Test Agent',
    description: 'A test agent',
    services: [
      { type: ServiceType.MCP, value: 'https://example.com/mcp' },
    ],
  };

  describe('buildRegistrationFileJson', () => {
    it('should build minimal registration file', () => {
      const result = buildJson(minimalFile);
      expect(result.type).toBe('https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
      expect(result.name).toBe('Test Agent');
      expect(result.description).toBe('A test agent');
      expect(result.active).toBe(true);
      expect(result.x402Support).toBe(false);
    });

    it('should convert services to 8004 format', () => {
      const result = buildJson(minimalFile);
      const services = result.services as Array<Record<string, unknown>>;
      expect(services.length).toBe(1);
      expect(services[0].name).toBe(ServiceType.MCP);
      expect(services[0].endpoint).toBe('https://example.com/mcp');
    });

    it('should include service meta fields', () => {
      const file: RegistrationFile = {
        ...minimalFile,
        services: [
          { type: ServiceType.MCP, value: 'https://example.com', meta: { version: '1.0' } },
        ],
      };
      const result = buildJson(file);
      const services = result.services as Array<Record<string, unknown>>;
      expect(services[0].version).toBe('1.0');
    });

    it('should add wallet as service', () => {
      const file: RegistrationFile = {
        ...minimalFile,
        walletAddress: '0x1234',
        walletChainId: 1,
      };
      const result = buildJson(file);
      const services = result.services as Array<Record<string, unknown>>;
      const walletService = services.find(s => s.name === 'agentWallet');
      expect(walletService).toBeDefined();
      expect(walletService?.endpoint).toBe('eip155:1:0x1234');
    });

    it('should use default chainId 1 for wallet when not specified', () => {
      const file: RegistrationFile = {
        ...minimalFile,
        walletAddress: '0x1234',
      };
      const result = buildJson(file);
      const services = result.services as Array<Record<string, unknown>>;
      const walletService = services.find(s => s.name === 'agentWallet');
      expect(walletService?.endpoint).toBe('eip155:1:0x1234');
    });

    it('should include image when provided', () => {
      const file: RegistrationFile = { ...minimalFile, image: 'ipfs://QmImage' };
      const result = buildJson(file);
      expect(result.image).toBe('ipfs://QmImage');
    });

    it('should not include image when absent', () => {
      const result = buildJson(minimalFile);
      expect(result.image).toBeUndefined();
    });

    it('should include trust models', () => {
      const file: RegistrationFile = { ...minimalFile, trustModels: ['reputation', 'custom'] };
      const result = buildJson(file);
      expect(result.supportedTrust).toEqual(['reputation', 'custom']);
    });

    it('should respect active flag', () => {
      const file: RegistrationFile = { ...minimalFile, active: false };
      const result = buildJson(file);
      expect(result.active).toBe(false);
    });

    it('should respect x402Support flag', () => {
      const file: RegistrationFile = { ...minimalFile, x402Support: true };
      const result = buildJson(file);
      expect(result.x402Support).toBe(true);
    });

    it('should include registrations with valid agentId', () => {
      const file: RegistrationFile = { ...minimalFile, agentId: '1:42' };
      const result = buildJson(file, { chainId: 1, identityRegistryAddress: '0xreg' });
      const registrations = result.registrations as Array<Record<string, unknown>>;
      expect(registrations.length).toBe(1);
      expect(registrations[0].agentId).toBe(42);
      expect(registrations[0].agentRegistry).toBe('eip155:1:0xreg');
    });

    it('should throw on invalid agentId format', () => {
      const file: RegistrationFile = { ...minimalFile, agentId: 'invalid' };
      expect(() => buildJson(file)).toThrow('Invalid agentId format');
    });

    it('should throw on negative tokenId', () => {
      const file: RegistrationFile = { ...minimalFile, agentId: '1:-5' };
      expect(() => buildJson(file)).toThrow('Invalid tokenId');
    });

    it('should throw on invalid skills', () => {
      const file: RegistrationFile = { ...minimalFile, skills: ['invalid/skill'] };
      expect(() => buildJson(file)).toThrow('Invalid OASF skills');
    });

    it('should throw on invalid domains', () => {
      const file: RegistrationFile = { ...minimalFile, domains: ['invalid/domain'] };
      expect(() => buildJson(file)).toThrow('Invalid OASF domains');
    });

    it('should accept valid skills', () => {
      const file: RegistrationFile = { ...minimalFile, skills: ['valid/skill1'] };
      expect(() => buildJson(file)).not.toThrow();
    });

    it('should accept valid domains', () => {
      const file: RegistrationFile = { ...minimalFile, domains: ['valid/domain1'] };
      expect(() => buildJson(file)).not.toThrow();
    });

    it('should attach skills/domains to OASF service', () => {
      const file: RegistrationFile = {
        ...minimalFile,
        services: [{ type: ServiceType.OASF, value: 'https://oasf.example.com' }],
        skills: ['valid/skill1'],
        domains: ['valid/domain1'],
      };
      const result = buildJson(file);
      const services = result.services as Array<Record<string, unknown>>;
      expect(services[0].skills).toEqual(['valid/skill1']);
      expect(services[0].domains).toEqual(['valid/domain1']);
    });

    it('should handle eip155 agentId format', () => {
      const file: RegistrationFile = { ...minimalFile, agentId: 'eip155:1:42' };
      const result = buildJson(file);
      const registrations = result.registrations as Array<Record<string, unknown>>;
      expect(registrations[0].agentId).toBe(42);
    });

    it('should handle NaN tokenId', () => {
      const file: RegistrationFile = { ...minimalFile, agentId: '1:abc' };
      expect(() => buildJson(file)).toThrow('Invalid tokenId');
    });
  });
});
