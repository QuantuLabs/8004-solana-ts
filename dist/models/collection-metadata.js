/**
 * Collection Metadata Builder
 * Builds JSON for collection URI (IPFS collection document v1 + SDK legacy fields)
 */
export const COLLECTION_DOCUMENT_VERSION = '1.0.0';
function normalizeOptionalText(value) {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function normalizeSocials(value) {
    if (!value) {
        return undefined;
    }
    const entries = [];
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
    return Object.fromEntries(entries);
}
function mergeSocials(projectSocials, directSocials) {
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
export function buildCollectionMetadataJson(input) {
    const rawInput = input;
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
    const metadata = {
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
        const projectMetadata = {};
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
//# sourceMappingURL=collection-metadata.js.map