/**
 * Metaplex PDAs and helpers for NFT operations
 * Used for deriving metadata and master edition accounts
 */
import { PublicKey } from '@solana/web3.js';
/**
 * Metaplex Token Metadata Program ID
 */
export declare const TOKEN_METADATA_PROGRAM_ID: PublicKey;
/**
 * Get Metadata PDA for a mint
 * Seeds: ["metadata", TOKEN_METADATA_PROGRAM_ID, mint]
 */
export declare function getMetadataPDA(mint: PublicKey): PublicKey;
/**
 * Get Master Edition PDA for a mint
 * Seeds: ["metadata", TOKEN_METADATA_PROGRAM_ID, mint, "edition"]
 */
export declare function getMasterEditionPDA(mint: PublicKey): PublicKey;
/**
 * Get Collection Authority PDA for Identity Registry
 * Seeds: ["collection_authority"]
 * This PDA signs for Metaplex collection verification
 */
export declare function getCollectionAuthorityPDA(programId: PublicKey): PublicKey;
//# sourceMappingURL=metaplex-helpers.d.ts.map