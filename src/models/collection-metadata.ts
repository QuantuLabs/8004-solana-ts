/**
 * Collection Metadata Builder
 * Builds JSON for collection URI (IPFS collection document v1 + SDK legacy fields)
 */

export const COLLECTION_DOCUMENT_VERSION = '1.0.0' as const;

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
 * Social links for collection/project
 */
export interface CollectionSocials {
  website?: string;
  x?: string;
  twitter?: string;
  discord?: string;
  telegram?: string;
  github?: string;
  farcaster?: string;
  instagram?: string;
  youtube?: string;
  [key: string]: string | undefined;
}

export interface ProjectSocials extends CollectionSocials {}

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
  /** Collection document name (max 128 characters) */
  name: string;
  /** Collection symbol (max 16 characters) */
  symbol?: string;
  /** Collection description (max 4096 characters) */
  description?: string;
  /** Collection logo/image URL (IPFS, Arweave, or HTTPS) */
  image?: string;
  /** Collection banner image URL */
  banner_image?: string;
  /** Top-level socials for collection document v1 */
  socials?: CollectionSocials;
  /** Legacy SDK website or documentation URL */
  external_url?: string;
  /** Legacy SDK project info */
  project?: CollectionProject;
  /** Legacy SDK category */
  category?: CollectionCategory;
  /** Legacy SDK searchable tags (max 10) */
  tags?: string[];
  /** Legacy SDK custom attributes (NFT-style) */
  attributes?: CollectionAttribute[];
  /** Explicitly unsupported by this builder */
  parent?: never;
}

/**
 * Output JSON format for collection metadata
 */
export interface CollectionMetadataJson {
  version: typeof COLLECTION_DOCUMENT_VERSION;
  name: string;
  symbol?: string;
  description?: string;
  image?: string;
  banner_image?: string;
  socials?: CollectionSocials;
  external_url?: string;
  project?: CollectionProject;
  category?: string;
  tags?: string[];
  attributes?: CollectionAttribute[];
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSocials(
  value: CollectionSocials | undefined
): CollectionSocials | undefined {
  if (!value) {
    return undefined;
  }

  const entries: Array<[string, string]> = [];
  for (const [key, socialValue] of Object.entries(value)) {
    if (typeof socialValue !== 'string') {
      continue;
    }

    const trimmed = socialValue.trim();
    if (trimmed.length === 0) {
      continue;
    }

    entries.push([key, trimmed]);
  }

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as CollectionSocials;
}

function mergeSocials(
  projectSocials: CollectionSocials | undefined,
  directSocials: CollectionSocials | undefined
): CollectionSocials | undefined {
  if (!projectSocials && !directSocials) {
    return undefined;
  }

  return normalizeSocials({
    ...(projectSocials ?? {}),
    ...(directSocials ?? {}),
  });
}

/**
 * Build collection metadata JSON for IPFS upload
 *
 * @param input - Collection metadata input
 * @returns JSON object ready for IPFS upload
 * @throws Error if input contains invalid values or unsupported fields
 */
export function buildCollectionMetadataJson(
  input: CollectionMetadataInput
): CollectionMetadataJson {
  const rawInput = input as unknown as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(rawInput, 'parent')) {
    const parentValue = rawInput.parent;

    if (parentValue !== undefined && parentValue !== null && parentValue !== '') {
      throw new Error('Collection metadata field "parent" is not supported');
    }
  }

  const name = normalizeOptionalText(input.name);
  if (!name) {
    throw new Error('Collection name is required');
  }
  if (name.length > 128) {
    throw new Error('Collection name must be <= 128 characters');
  }

  const symbol = normalizeOptionalText(input.symbol);
  if (symbol && symbol.length > 16) {
    throw new Error('Collection symbol must be <= 16 characters');
  }

  const description = normalizeOptionalText(input.description);
  if (description && description.length > 4096) {
    throw new Error('Collection description must be <= 4096 characters');
  }

  const projectSocials = normalizeSocials(input.project?.socials);
  const directSocials = normalizeSocials(input.socials);
  const mergedSocials = mergeSocials(projectSocials, directSocials);

  const metadata: CollectionMetadataJson = {
    version: COLLECTION_DOCUMENT_VERSION,
    name,
  };

  if (symbol) {
    metadata.symbol = symbol;
  }
  if (description) {
    metadata.description = description;
  }
  if (input.image) {
    metadata.image = input.image;
  }
  if (input.banner_image) {
    metadata.banner_image = input.banner_image;
  }
  if (mergedSocials) {
    metadata.socials = mergedSocials;
  }
  if (input.external_url) {
    metadata.external_url = input.external_url;
  }
  if (input.project) {
    const projectName = normalizeOptionalText(input.project.name);
    const projectMetadata: CollectionProject = {};

    if (projectName) {
      projectMetadata.name = projectName;
    }
    if (projectSocials) {
      projectMetadata.socials = projectSocials;
    }

    if (Object.keys(projectMetadata).length > 0) {
      metadata.project = projectMetadata;
    }
  }
  if (input.category) {
    metadata.category = input.category;
  }
  if (input.tags && input.tags.length > 0) {
    metadata.tags = input.tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 10)
      .map((tag) => tag.slice(0, 32));

    if (metadata.tags.length === 0) {
      delete metadata.tags;
    }
  }
  if (input.attributes && input.attributes.length > 0) {
    metadata.attributes = input.attributes;
  }

  return metadata;
}
