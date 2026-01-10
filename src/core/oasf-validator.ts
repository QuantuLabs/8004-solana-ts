/**
 * OASF taxonomy validation utilities
 * Requires Node.js 18+
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface SkillsData {
  skills: Record<string, unknown>;
}

interface DomainsData {
  domains: Record<string, unknown>;
}

// Try multiple paths to find the JSON files (works in both src and dist)
function findTaxonomyFile(filename: string): string {
  const possiblePaths = [
    join(process.cwd(), 'src', 'taxonomies', filename),
    join(process.cwd(), 'dist', 'taxonomies', filename),
    join(__dirname, '..', 'taxonomies', filename),
    join(__dirname, 'taxonomies', filename),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  throw new Error(`Could not find taxonomy file: ${filename}`);
}

// Load JSON files at module initialization
let allSkills: SkillsData = { skills: {} };
let allDomains: DomainsData = { domains: {} };

try {
  allSkills = JSON.parse(readFileSync(findTaxonomyFile('all_skills.json'), 'utf-8'));
  allDomains = JSON.parse(readFileSync(findTaxonomyFile('all_domains.json'), 'utf-8'));
} catch {
  // Silently fail if files not found (for testing environments)
}

/**
 * Validate if a skill slug exists in the OASF taxonomy
 * @param slug The skill slug to validate (e.g., "natural_language_processing/summarization")
 * @returns True if the skill exists in the taxonomy, False otherwise
 */
export function validateSkill(slug: string): boolean {
  const skills = allSkills.skills || {};
  return slug in skills;
}

/**
 * Validate if a domain slug exists in the OASF taxonomy
 * @param slug The domain slug to validate (e.g., "finance_and_business/investment_services")
 * @returns True if the domain exists in the taxonomy, False otherwise
 */
export function validateDomain(slug: string): boolean {
  const domains = allDomains.domains || {};
  return slug in domains;
}

/**
 * Get all available OASF skill slugs
 * @returns Array of all valid skill slugs
 */
export function getAllSkills(): string[] {
  return Object.keys(allSkills.skills || {});
}

/**
 * Get all available OASF domain slugs
 * @returns Array of all valid domain slugs
 */
export function getAllDomains(): string[] {
  return Object.keys(allDomains.domains || {});
}
