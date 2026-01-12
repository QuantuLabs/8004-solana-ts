/**
 * Collection Metadata Builder
 * Builds 8004-compliant JSON for collection URI
 */

/**
 * Collection category types
 */
export type CollectionCategory =
  | 'assistant'
  | 'coding'
  | 'data-analysis'
  | 'creative'
  | 'research'
  | 'automation'
  | 'finance'
  | 'healthcare'
  | 'education'
  | 'gaming'
  | 'other';

/**
 * Social links for project
 */
export interface ProjectSocials {
  website?: string;
  x?: string;
  discord?: string;
  telegram?: string;
  github?: string;
}

/**
 * Project info for collection
 */
export interface CollectionProject {
  name?: string;
  socials?: ProjectSocials;
}

/**
 * Custom attribute (NFT-style)
 */
export interface CollectionAttribute {
  trait_type: string;
  value: string | number | boolean;
}

/**
 * Input for building collection metadata
 */
export interface CollectionMetadataInput {
  /** Collection display name (max 32 characters) */
  name: string;
  /** Collection description */
  description: string;
  /** Collection logo/image URL (IPFS, Arweave, or HTTPS) */
  image?: string;
  /** Website or documentation URL */
  external_url?: string;
  /** Project info for this collection */
  project?: CollectionProject;
  /** Primary category of agents in this collection */
  category?: CollectionCategory;
  /** Searchable tags for discovery (max 10) */
  tags?: string[];
  /** Custom attributes (NFT-style) */
  attributes?: CollectionAttribute[];
}

/**
 * Output JSON format for collection metadata
 */
export interface CollectionMetadataJson {
  name: string;
  description: string;
  image?: string;
  external_url?: string;
  project?: CollectionProject;
  category?: string;
  tags?: string[];
  attributes?: CollectionAttribute[];
}

/**
 * Build collection metadata JSON for IPFS upload
 *
 * @param input - Collection metadata input
 * @returns JSON object ready for IPFS upload
 * @throws Error if name or description is missing/invalid
 *
 * @example
 * ```typescript
 * const metadata = buildCollectionMetadataJson({
 *   name: 'My AI Agents',
 *   description: 'Production AI agents for automation',
 *   image: 'ipfs://QmLogo...',
 *   category: 'automation',
 *   tags: ['enterprise', 'api'],
 *   project: {
 *     name: 'Acme Corp',
 *     socials: {
 *       website: 'https://acme.ai',
 *       x: 'acme_ai',
 *       github: 'acme-ai'
 *     }
 *   }
 * });
 *
 * // Upload to IPFS
 * const cid = await ipfs.addJson(metadata);
 * ```
 */
export function buildCollectionMetadataJson(
  input: CollectionMetadataInput
): CollectionMetadataJson {
  // Validate required fields
  if (!input.name) {
    throw new Error('Collection name is required');
  }
  if (input.name.length > 32) {
    throw new Error('Collection name must be <= 32 characters');
  }
  if (!input.description) {
    throw new Error('Collection description is required');
  }

  // Build metadata object
  const metadata: CollectionMetadataJson = {
    name: input.name,
    description: input.description,
  };

  // Add optional fields
  if (input.image) {
    metadata.image = input.image;
  }
  if (input.external_url) {
    metadata.external_url = input.external_url;
  }
  if (input.project) {
    metadata.project = input.project;
  }
  if (input.category) {
    metadata.category = input.category;
  }
  if (input.tags && input.tags.length > 0) {
    // Limit to 10 tags, each max 32 chars
    metadata.tags = input.tags.slice(0, 10).map((tag) => tag.slice(0, 32));
  }
  if (input.attributes && input.attributes.length > 0) {
    metadata.attributes = input.attributes;
  }

  return metadata;
}
