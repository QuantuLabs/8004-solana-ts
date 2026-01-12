/**
 * PDA helpers for ATOM Engine
 * v0.4.0 - Cross-program invocation support
 */
import { PublicKey } from '@solana/web3.js';
/**
 * Get AtomConfig PDA
 * Seeds: ["atom_config"]
 * @returns [PDA address, bump]
 */
export declare function getAtomConfigPDA(): [PublicKey, number];
/**
 * Get AtomStats PDA for an agent
 * Seeds: ["atom_stats", asset.key()]
 * @param asset - Agent Core asset pubkey
 * @returns [PDA address, bump]
 */
export declare function getAtomStatsPDA(asset: PublicKey): [PublicKey, number];
/**
 * Derive AtomStats PDA with explicit program ID
 * Useful for testing with different program IDs
 * @param asset - Agent Core asset pubkey
 * @param atomEngineProgramId - ATOM Engine program ID
 * @returns [PDA address, bump]
 */
export declare function getAtomStatsPDAWithProgram(asset: PublicKey, atomEngineProgramId: PublicKey): [PublicKey, number];
/**
 * Derive AtomConfig PDA with explicit program ID
 * Useful for testing with different program IDs
 * @param atomEngineProgramId - ATOM Engine program ID
 * @returns [PDA address, bump]
 */
export declare function getAtomConfigPDAWithProgram(atomEngineProgramId: PublicKey): [PublicKey, number];
//# sourceMappingURL=atom-pda.d.ts.map