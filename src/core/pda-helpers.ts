/**
 * PDA (Program Derived Address) helpers for ERC-8004 Solana programs
 * v0.3.0 - Asset-based identification
 *
 * BREAKING CHANGES from v0.2.0:
 * - agent_id (u64) replaced by asset (Pubkey) in all PDA seeds
 * - New RootConfig and RegistryConfig PDAs for multi-collection support
 * - ValidationStats removed (counters moved off-chain)
 */

import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, MPL_CORE_PROGRAM_ID } from './programs.js';

// Re-export for convenience
export { PROGRAM_ID, MPL_CORE_PROGRAM_ID };

/**
 * @deprecated Use PROGRAM_ID instead
 */
export const IDENTITY_PROGRAM_ID = PROGRAM_ID;
export const REPUTATION_PROGRAM_ID = PROGRAM_ID;
export const VALIDATION_PROGRAM_ID = PROGRAM_ID;

/**
 * PDA derivation helpers
 * v0.3.0 - All PDAs now use asset (Pubkey) instead of agent_id (u64)
 * All methods return [PublicKey, bump] tuple
 */
export class PDAHelpers {
  // ============================================================================
  // Identity Module PDAs
  // ============================================================================

  /**
   * Get Root Config PDA - v0.3.0
   * Global pointer to current base registry
   * Seeds: ["root_config"]
   */
  static getRootConfigPDA(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('root_config')], programId);
  }

  /**
   * Get Registry Config PDA - v0.3.0
   * Per-collection configuration
   * Seeds: ["registry_config", collection]
   */
  static getRegistryConfigPDA(
    collection: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('registry_config'), collection.toBuffer()],
      programId
    );
  }

  /**
   * @deprecated Use getRegistryConfigPDA instead for v0.3.0
   * Get Config PDA (legacy)
   * Seeds: ["config"]
   */
  static getConfigPDA(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
  }

  /**
   * Get Agent Account PDA - v0.3.0
   * Seeds: ["agent", asset]
   */
  static getAgentPDA(asset: PublicKey, programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('agent'), asset.toBuffer()], programId);
  }

  /**
   * Get Metadata Entry PDA - v0.3.0
   * Seeds: ["agent_meta", asset, key_hash[0..8]]
   * key_hash = SHA256(key)[0..8]
   */
  static getMetadataEntryPDA(
    asset: PublicKey,
    keyHash: Buffer,
    programId: PublicKey = PROGRAM_ID
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('agent_meta'), asset.toBuffer(), keyHash.slice(0, 16)],
      programId
    );
  }

  // ============================================================================
  // Reputation Module PDAs
  // ============================================================================

  /**
   * Get ATOM CPI Authority PDA - v0.4.0
   * Used by agent-registry to sign CPI calls to atom-engine
   * Seeds: ["atom_cpi_authority"]
   */
  static getAtomCpiAuthorityPDA(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('atom_cpi_authority')], programId);
  }

  /**
   * Get Feedback Account PDA - v0.3.0
   * Seeds: ["feedback", asset, feedback_index]
   */
  static getFeedbackPDA(
    asset: PublicKey,
    feedbackIndex: bigint | number,
    programId: PublicKey = PROGRAM_ID
  ): [PublicKey, number] {
    const feedbackIndexBuffer = Buffer.alloc(8);
    feedbackIndexBuffer.writeBigUInt64LE(BigInt(feedbackIndex));

    return PublicKey.findProgramAddressSync(
      [Buffer.from('feedback'), asset.toBuffer(), feedbackIndexBuffer],
      programId
    );
  }

  /**
   * Get Feedback Tags PDA - v0.3.0
   * Seeds: ["feedback_tags", asset, feedback_index]
   */
  static getFeedbackTagsPDA(
    asset: PublicKey,
    feedbackIndex: bigint | number,
    programId: PublicKey = PROGRAM_ID
  ): [PublicKey, number] {
    const feedbackIndexBuffer = Buffer.alloc(8);
    feedbackIndexBuffer.writeBigUInt64LE(BigInt(feedbackIndex));

    return PublicKey.findProgramAddressSync(
      [Buffer.from('feedback_tags'), asset.toBuffer(), feedbackIndexBuffer],
      programId
    );
  }

  /**
   * Get Agent Reputation Metadata PDA - v0.3.0
   * Seeds: ["agent_reputation", asset]
   */
  static getAgentReputationPDA(
    asset: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('agent_reputation'), asset.toBuffer()],
      programId
    );
  }

  /**
   * Get Response PDA - v0.3.0
   * Seeds: ["response", asset, feedback_index, response_index]
   */
  static getResponsePDA(
    asset: PublicKey,
    feedbackIndex: bigint | number,
    responseIndex: bigint | number,
    programId: PublicKey = PROGRAM_ID
  ): [PublicKey, number] {
    const feedbackIndexBuffer = Buffer.alloc(8);
    feedbackIndexBuffer.writeBigUInt64LE(BigInt(feedbackIndex));

    const responseIndexBuffer = Buffer.alloc(8);
    responseIndexBuffer.writeBigUInt64LE(BigInt(responseIndex));

    return PublicKey.findProgramAddressSync(
      [Buffer.from('response'), asset.toBuffer(), feedbackIndexBuffer, responseIndexBuffer],
      programId
    );
  }

  /**
   * Get Response Index PDA - v0.3.0
   * Seeds: ["response_index", asset, feedback_index]
   */
  static getResponseIndexPDA(
    asset: PublicKey,
    feedbackIndex: bigint | number,
    programId: PublicKey = PROGRAM_ID
  ): [PublicKey, number] {
    const feedbackIndexBuffer = Buffer.alloc(8);
    feedbackIndexBuffer.writeBigUInt64LE(BigInt(feedbackIndex));

    return PublicKey.findProgramAddressSync(
      [Buffer.from('response_index'), asset.toBuffer(), feedbackIndexBuffer],
      programId
    );
  }

  /**
   * Get Client Index PDA - v0.3.0
   * Seeds: ["client_index", asset, client]
   */
  static getClientIndexPDA(
    asset: PublicKey,
    client: PublicKey,
    programId: PublicKey = PROGRAM_ID
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('client_index'), asset.toBuffer(), client.toBuffer()],
      programId
    );
  }

  // ============================================================================
  // Validation Module PDAs
  // ============================================================================

  /**
   * Get Validation Request PDA - v0.3.0
   * Seeds: ["validation", asset, validator, nonce]
   */
  static getValidationRequestPDA(
    asset: PublicKey,
    validator: PublicKey,
    nonce: number,
    programId: PublicKey = PROGRAM_ID
  ): [PublicKey, number] {
    const nonceBuffer = Buffer.alloc(4);
    nonceBuffer.writeUInt32LE(nonce);

    return PublicKey.findProgramAddressSync(
      [Buffer.from('validation'), asset.toBuffer(), validator.toBuffer(), nonceBuffer],
      programId
    );
  }
}

/**
 * Helper to convert bytes32 to string
 * Used for metadata keys
 */
export function bytes32ToString(bytes: Uint8Array): string {
  const nullIndex = bytes.indexOf(0);
  const keyBytes = nullIndex >= 0 ? bytes.slice(0, nullIndex) : bytes;
  return Buffer.from(keyBytes).toString('utf8');
}

/**
 * Helper to convert string to bytes32
 * Used for metadata keys
 */
export function stringToBytes32(str: string): Buffer {
  const buffer = Buffer.alloc(32);
  buffer.write(str, 0, 'utf8');
  return buffer;
}
