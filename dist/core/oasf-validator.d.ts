/**
 * OASF taxonomy validation utilities
 * Browser-compatible - uses inlined taxonomy data
 */
/**
 * Validate if a skill slug exists in the OASF taxonomy
 * @param slug The skill slug to validate (e.g., "natural_language_processing/summarization")
 * @returns True if the skill exists in the taxonomy, False otherwise
 */
export declare function validateSkill(slug: string): boolean;
/**
 * Validate if a domain slug exists in the OASF taxonomy
 * @param slug The domain slug to validate (e.g., "finance_and_business/investment_services")
 * @returns True if the domain exists in the taxonomy, False otherwise
 */
export declare function validateDomain(slug: string): boolean;
/**
 * Get all available OASF skill slugs
 * @returns Array of all valid skill slugs
 */
export declare function getAllSkills(): string[];
/**
 * Get all available OASF domain slugs
 * @returns Array of all valid domain slugs
 */
export declare function getAllDomains(): string[];
//# sourceMappingURL=oasf-validator.d.ts.map