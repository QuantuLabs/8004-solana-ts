/**
 * Collection Metadata Builder
 * Builds 8004-compliant JSON for collection URI
 */
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
export function buildCollectionMetadataJson(input) {
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
    const metadata = {
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
//# sourceMappingURL=collection-metadata.js.map