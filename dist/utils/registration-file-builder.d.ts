/**
 * Build ERC-8004 compliant registration file JSON
 * Extracted from IPFSClient.addRegistrationFile for frontend use
 */
import type { RegistrationFile } from '../models/interfaces.js';
export interface RegistrationFileJsonOptions {
    chainId?: number;
    identityRegistryAddress?: string;
}
/**
 * Build ERC-8004 compliant JSON from RegistrationFile
 * Validates OASF skills/domains if provided
 * Does NOT upload - just returns the JSON object
 */
export declare function buildRegistrationFileJson(registrationFile: RegistrationFile, options?: RegistrationFileJsonOptions): Record<string, unknown>;
//# sourceMappingURL=registration-file-builder.d.ts.map