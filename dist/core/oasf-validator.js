/**
 * OASF taxonomy validation utilities
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Use createRequire for JSON imports - works across all Node.js versions
const allSkills = require('../taxonomies/all_skills.json');
const allDomains = require('../taxonomies/all_domains.json');
/**
 * Validate if a skill slug exists in the OASF taxonomy
 * @param slug The skill slug to validate (e.g., "natural_language_processing/summarization")
 * @returns True if the skill exists in the taxonomy, False otherwise
 */
export function validateSkill(slug) {
    const skills = allSkills.skills || {};
    return slug in skills;
}
/**
 * Validate if a domain slug exists in the OASF taxonomy
 * @param slug The domain slug to validate (e.g., "finance_and_business/investment_services")
 * @returns True if the domain exists in the taxonomy, False otherwise
 */
export function validateDomain(slug) {
    const domains = allDomains.domains || {};
    return slug in domains;
}
/**
 * Get all available OASF skill slugs
 * @returns Array of all valid skill slugs
 */
export function getAllSkills() {
    return Object.keys(allSkills.skills || {});
}
/**
 * Get all available OASF domain slugs
 * @returns Array of all valid domain slugs
 */
export function getAllDomains() {
    return Object.keys(allDomains.domains || {});
}
//# sourceMappingURL=oasf-validator.js.map