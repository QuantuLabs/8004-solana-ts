/**
 * OASF taxonomy validation utilities
 * Browser-compatible - uses inlined taxonomy data
 */
import { ALL_SKILLS, ALL_DOMAINS, isValidSkill, isValidDomain } from './oasf-data.js';
/**
 * Validate if a skill slug exists in the OASF taxonomy
 * @param slug The skill slug to validate (e.g., "natural_language_processing/summarization")
 * @returns True if the skill exists in the taxonomy, False otherwise
 */
export function validateSkill(slug) {
    return isValidSkill(slug);
}
/**
 * Validate if a domain slug exists in the OASF taxonomy
 * @param slug The domain slug to validate (e.g., "finance_and_business/investment_services")
 * @returns True if the domain exists in the taxonomy, False otherwise
 */
export function validateDomain(slug) {
    return isValidDomain(slug);
}
/**
 * Get all available OASF skill slugs
 * @returns Array of all valid skill slugs
 */
export function getAllSkills() {
    return [...ALL_SKILLS];
}
/**
 * Get all available OASF domain slugs
 * @returns Array of all valid domain slugs
 */
export function getAllDomains() {
    return [...ALL_DOMAINS];
}
//# sourceMappingURL=oasf-validator.js.map