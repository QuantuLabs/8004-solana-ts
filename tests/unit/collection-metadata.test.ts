import { describe, it, expect } from '@jest/globals';
import {
  buildCollectionMetadataJson,
  COLLECTION_DOCUMENT_VERSION,
} from '../../src/models/collection-metadata.js';

describe('collection-metadata', () => {
  describe('buildCollectionMetadataJson', () => {
    it('should build minimal v1 metadata with version and name', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test Collection',
      });

      expect(result).toEqual({
        version: COLLECTION_DOCUMENT_VERSION,
        name: 'Test Collection',
      });
    });

    it('should throw on missing/blank name', () => {
      expect(() => buildCollectionMetadataJson({ name: '' })).toThrow(
        'Collection name is required'
      );

      expect(() => buildCollectionMetadataJson({ name: '   ' })).toThrow(
        'Collection name is required'
      );
    });

    it('should throw on name exceeding 128 chars', () => {
      expect(() =>
        buildCollectionMetadataJson({ name: 'a'.repeat(129) })
      ).toThrow('Collection name must be <= 128 characters');
    });

    it('should throw on symbol exceeding 16 chars', () => {
      expect(() =>
        buildCollectionMetadataJson({
          name: 'Test',
          symbol: 'a'.repeat(17),
        })
      ).toThrow('Collection symbol must be <= 16 characters');
    });

    it('should include v1 optional fields', () => {
      const result = buildCollectionMetadataJson({
        name: 'Caster Agents',
        symbol: 'CAST',
        description: 'Collection for Caster-compatible agents',
        image: 'ipfs://bafybeigdyrzt5example',
        banner_image: 'ipfs://bafybeibannerexample',
        socials: {
          website: 'https://caster.example',
          x: '@caster',
          twitter: 'caster_team',
          discord: 'https://discord.gg/caster',
          telegram: 'https://t.me/caster',
          github: 'castercorp',
          farcaster: 'caster',
          instagram: 'caster_ig',
          youtube: 'caster_yt',
        },
      });

      expect(result.version).toBe(COLLECTION_DOCUMENT_VERSION);
      expect(result.symbol).toBe('CAST');
      expect(result.description).toBe('Collection for Caster-compatible agents');
      expect(result.image).toBe('ipfs://bafybeigdyrzt5example');
      expect(result.banner_image).toBe('ipfs://bafybeibannerexample');
      expect(result.socials?.website).toBe('https://caster.example');
      expect(result.socials?.x).toBe('@caster');
      expect(result.socials?.twitter).toBe('caster_team');
      expect(result.socials?.youtube).toBe('caster_yt');
    });

    it('should keep legacy SDK fields for compatibility', () => {
      const result = buildCollectionMetadataJson({
        name: 'Legacy Collection',
        external_url: 'https://example.com',
        project: {
          name: 'Acme',
          socials: { website: 'https://acme.ai', x: 'acme_ai' },
        },
        category: 'coding',
        tags: ['enterprise', 'api'],
        attributes: [
          { trait_type: 'tier', value: 'premium' },
          { trait_type: 'agents', value: 42 },
        ],
      });

      expect(result.external_url).toBe('https://example.com');
      expect(result.project?.name).toBe('Acme');
      expect(result.project?.socials?.x).toBe('acme_ai');
      expect(result.category).toBe('coding');
      expect(result.tags).toEqual(['enterprise', 'api']);
      expect(result.attributes?.length).toBe(2);
    });

    it('should merge project.socials into top-level socials', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test',
        project: {
          socials: {
            website: 'https://acme.ai',
            github: 'acme',
          },
        },
      });

      expect(result.socials).toEqual({
        website: 'https://acme.ai',
        github: 'acme',
      });
    });

    it('should prioritize top-level socials over project.socials on key collision', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test',
        socials: {
          x: '@top_level',
        },
        project: {
          socials: {
            x: '@legacy_project',
            github: 'acme',
          },
        },
      });

      expect(result.socials).toEqual({
        x: '@top_level',
        github: 'acme',
      });
    });

    it('should limit tags to 10 and truncate to 32 chars each', () => {
      const tags = Array.from({ length: 15 }, (_, i) => `tag-${i}-${'x'.repeat(40)}`);
      const result = buildCollectionMetadataJson({
        name: 'Test',
        tags,
      });

      expect(result.tags?.length).toBe(10);
      for (const tag of result.tags ?? []) {
        expect(tag.length).toBeLessThanOrEqual(32);
      }
    });

    it('should omit empty tags after trimming', () => {
      const result = buildCollectionMetadataJson({
        name: 'Test',
        tags: ['  ', ''],
      });

      expect(result.tags).toBeUndefined();
    });

    it('should reject parent when present in input', () => {
      expect(() =>
        buildCollectionMetadataJson({
          name: 'Test',
          parent: 'bafybeigdyrzt5example',
        } as unknown as Parameters<typeof buildCollectionMetadataJson>[0])
      ).toThrow('Collection metadata field "parent" is not supported');
    });
  });
});
