/**
 * Collection Metadata Builder
 * Builds JSON for collection URI (IPFS collection document v1 + SDK legacy fields)
 */
export declare const COLLECTION_DOCUMENT_VERSION: "1.0.0";
/**
 * Collection category types
 */
export type CollectionCategory = 'assistant' | 'coding' | 'data-analysis' | 'creative' | 'research' | 'automation' | 'finance' | 'healthcare' | 'education' | 'gaming' | 'other';
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
export interface ProjectSocials extends CollectionSocials {
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
/**
 * Build collection metadata JSON for IPFS upload
 *
 * @param input - Collection metadata input
 * @returns JSON object ready for IPFS upload
 * @throws Error if input contains invalid values or unsupported fields
 */
export declare function buildCollectionMetadataJson(input: CollectionMetadataInput): CollectionMetadataJson;
//# sourceMappingURL=collection-metadata.d.ts.map