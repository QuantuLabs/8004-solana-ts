/**
 * PDA helpers for ATOM Engine
 * v0.4.0 - Cross-program invocation support
 */
import { PublicKey } from '@solana/web3.js';
import { getProgramIds } from './programs.js';
/**
 * Get AtomConfig PDA
 * Seeds: ["atom_config"]
 * @returns [PDA address, bump]
 */
export function getAtomConfigPDA() {
    const programIds = getProgramIds();
    return PublicKey.findProgramAddressSync([Buffer.from('atom_config')], programIds.atomEngine);
}
/**
 * Get AtomStats PDA for an agent
 * Seeds: ["atom_stats", asset.key()]
 * @param asset - Agent Core asset pubkey
 * @returns [PDA address, bump]
 */
export function getAtomStatsPDA(asset) {
    const programIds = getProgramIds();
    return PublicKey.findProgramAddressSync([Buffer.from('atom_stats'), asset.toBuffer()], programIds.atomEngine);
}
/**
 * Derive AtomStats PDA with explicit program ID
 * Useful for testing with different program IDs
 * @param asset - Agent Core asset pubkey
 * @param atomEngineProgramId - ATOM Engine program ID
 * @returns [PDA address, bump]
 */
export function getAtomStatsPDAWithProgram(asset, atomEngineProgramId) {
    return PublicKey.findProgramAddressSync([Buffer.from('atom_stats'), asset.toBuffer()], atomEngineProgramId);
}
/**
 * Derive AtomConfig PDA with explicit program ID
 * Useful for testing with different program IDs
 * @param atomEngineProgramId - ATOM Engine program ID
 * @returns [PDA address, bump]
 */
export function getAtomConfigPDAWithProgram(atomEngineProgramId) {
    return PublicKey.findProgramAddressSync([Buffer.from('atom_config')], atomEngineProgramId);
}
//# sourceMappingURL=atom-pda.js.map