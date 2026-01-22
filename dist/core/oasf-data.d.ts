/**
 * OASF taxonomy data - inlined for browser compatibility
 * Generated from src/taxonomies/*.json
 *
 * This file contains only the skill and domain slugs (keys) needed for validation.
 * Full taxonomy metadata is available in the original JSON files for Node.js environments.
 */
/**
 * All valid OASF skill slugs (136 total)
 * Format: "category/skill" or "category/subcategory/skill"
 */
export declare const ALL_SKILLS: string[];
/**
 * All valid OASF domain slugs (204 total)
 * Format: "category/domain" or "category/subcategory/domain"
 */
export declare const ALL_DOMAINS: string[];
/**
 * Check if a skill slug exists in the taxonomy
 */
export declare function isValidSkill(slug: string): boolean;
/**
 * Check if a domain slug exists in the taxonomy
 */
export declare function isValidDomain(slug: string): boolean;
//# sourceMappingURL=oasf-data.d.ts.map