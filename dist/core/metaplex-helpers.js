/**
 * Metaplex PDAs and helpers for NFT operations
 * Used for deriving metadata and master edition accounts
 */
import { PublicKey } from '@solana/web3.js';
/**
 * Metaplex Token Metadata Program ID
 */
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
/**
 * Get Metadata PDA for a mint
 * Seeds: ["metadata", TOKEN_METADATA_PROGRAM_ID, mint]
 */
export function getMetadataPDA(mint) {
    const [pda] = PublicKey.findProgramAddressSync([
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
    ], TOKEN_METADATA_PROGRAM_ID);
    return pda;
}
/**
 * Get Master Edition PDA for a mint
 * Seeds: ["metadata", TOKEN_METADATA_PROGRAM_ID, mint, "edition"]
 */
export function getMasterEditionPDA(mint) {
    const [pda] = PublicKey.findProgramAddressSync([
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from('edition'),
    ], TOKEN_METADATA_PROGRAM_ID);
    return pda;
}
/**
 * Get Collection Authority PDA for Identity Registry
 * Seeds: ["collection_authority"]
 * This PDA signs for Metaplex collection verification
 */
export function getCollectionAuthorityPDA(programId) {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('collection_authority')], programId);
    return pda;
}
//# sourceMappingURL=metaplex-helpers.js.map