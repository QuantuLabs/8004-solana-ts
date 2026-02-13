import { describe, it, expect } from '@jest/globals';
import { buildCollectionMetadataJson } from '../../src/models/collection-metadata.js';

describe('collection-metadata', () => {
  describe('buildCollectionMetadataJson', () => {
    it('should build minimal metadata with name and description', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test Collection',
        description: 'A test collection',
      });
      expect(result.name).toBe('Test Collection');
      expect(result.description).toBe('A test collection');
    });

    it('should throw on missing name', () => {
      expect(() =>
        buildCollectionMetadataJson({ name: '', description: 'desc' })
      ).toThrow('Collection name is required');
    });

    it('should throw on name exceeding 32 chars', () => {
      expect(() =>
        buildCollectionMetadataJson({ name: 'a'.repeat(33), description: 'desc' })
      ).toThrow('Collection name must be <= 32 characters');
    });

    it('should accept exactly 32 char name', () => {
      const result = buildCollectionMetadataJson({
        name: 'a'.repeat(32),
        description: 'desc',
      });
      expect(result.name.length).toBe(32);
    });

    it('should throw on missing description', () => {
      expect(() =>
        buildCollectionMetadataJson({ name: 'Test', description: '' })
      ).toThrow('Collection description is required');
    });

    it('should include optional image', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test',
        description: 'desc',
        image: 'ipfs://QmLogo',
      });
      expect(result.image).toBe('ipfs://QmLogo');
    });

    it('should exclude image when not provided', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test',
        description: 'desc',
      });
      expect(result.image).toBeUndefined();
    });

    it('should include external_url', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test',
        description: 'desc',
        external_url: 'https://example.com',
      });
      expect(result.external_url).toBe('https://example.com');
    });

    it('should include project info', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test',
        description: 'desc',
        project: {
          name: 'Acme',
          socials: { website: 'https://acme.ai', x: 'acme_ai' },
        },
      });
      expect(result.project?.name).toBe('Acme');
      expect(result.project?.socials?.x).toBe('acme_ai');
    });

    it('should include category', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test',
        description: 'desc',
        category: 'coding',
      });
      expect(result.category).toBe('coding');
    });

    it('should limit tags to 10 and truncate to 32 chars each', () => {
      const tags = Array.from({ length: 15 }, (_, i) => `tag-${i}-${'x'.repeat(40)}`);
      const result = buildCollectionMetadataJson({
        name: 'Test',
        description: 'desc',
        tags,
      });
      expect(result.tags?.length).toBe(10);
      for (const tag of result.tags!) {
        expect(tag.length).toBeLessThanOrEqual(32);
      }
    });

    it('should not include tags when empty array', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test',
        description: 'desc',
        tags: [],
      });
      expect(result.tags).toBeUndefined();
    });

    it('should include attributes', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test',
        description: 'desc',
        attributes: [
          { trait_type: 'tier', value: 'premium' },
          { trait_type: 'agents', value: 42 },
        ],
      });
      expect(result.attributes?.length).toBe(2);
      expect(result.attributes?.[0].trait_type).toBe('tier');
      expect(result.attributes?.[1].value).toBe(42);
    });

    it('should not include attributes when empty', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test',
        description: 'desc',
        attributes: [],
      });
      expect(result.attributes).toBeUndefined();
    });
  });
});
