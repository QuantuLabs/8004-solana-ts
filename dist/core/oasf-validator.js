/**
 * OASF taxonomy validation utilities
 */
import allSkills from '../taxonomies/all_skills.json';
import allDomains from '../taxonomies/all_domains.json';
/**
 * Validate if a skill slug exists in the OASF taxonomy
 * @param slug The skill slug to validate (e.g., "natural_language_processing/summarization")
 * @returns True if the skill exists in the taxonomy, False otherwise
 */
export function validateSkill(slug) {
    const skillsData = allSkills;
    const skills = skillsData.skills || {};
    return slug in skills;
}
/**
 * Validate if a domain slug exists in the OASF taxonomy
 * @param slug The domain slug to validate (e.g., "finance_and_business/investment_services")
 * @returns True if the domain exists in the taxonomy, False otherwise
 */
export function validateDomain(slug) {
    const domainsData = allDomains;
    const domains = domainsData.domains || {};
    return slug in domains;
}
/**
 * Get all available OASF skill slugs
 * @returns Array of all valid skill slugs
 */
export function getAllSkills() {
    const skillsData = allSkills;
    return Object.keys(skillsData.skills || {});
}
/**
 * Get all available OASF domain slugs
 * @returns Array of all valid domain slugs
 */
export function getAllDomains() {
    const domainsData = allDomains;
    return Object.keys(domainsData.domains || {});
}
//# sourceMappingURL=oasf-validator.js.map