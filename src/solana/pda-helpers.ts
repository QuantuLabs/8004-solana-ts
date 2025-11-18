/**
 * PDA (Program Derived Address) helpers for ERC-8004 Solana programs
 * Provides deterministic address derivation for all account types
 */

import { PublicKey } from '@solana/web3.js';

// Program IDs for Devnet
export const IDENTITY_PROGRAM_ID = new PublicKey('AcngQwqu55Ut92MAP5owPh6PhsJUZhaTAG5ULyvW1TpR');
export const REPUTATION_PROGRAM_ID = new PublicKey('9WcFLL3Fsqs96JxuewEt9iqRwULtCZEsPT717hPbsQAa');
export const VALIDATION_PROGRAM_ID = new PublicKey('2masQXYbHKXMrTV9aNLTWS4NMbNHfJhgcsLBtP6N5j6x');

/**
 * PDA derivation helpers
 * All methods return [PublicKey, bump] tuple
 */
export class PDAHelpers {
  /**
   * Get Agent Account PDA (Identity Registry)
   * Seeds: ["agent", agent_id]
   */
  static async getAgentPDA(agentId: bigint): Promise<[PublicKey, number]> {
    const agentIdBuffer = Buffer.alloc(8);
    agentIdBuffer.writeBigUInt64LE(agentId);

    return await PublicKey.findProgramAddress(
      [Buffer.from('agent'), agentIdBuffer],
      IDENTITY_PROGRAM_ID
    );
  }

  /**
   * Get Metadata Entry PDA (Identity Registry)
   * Seeds: ["metadata", agent_id, key]
   */
  static async getMetadataPDA(agentId: bigint, key: Buffer): Promise<[PublicKey, number]> {
    const agentIdBuffer = Buffer.alloc(8);
    agentIdBuffer.writeBigUInt64LE(agentId);

    return await PublicKey.findProgramAddress(
      [Buffer.from('metadata'), agentIdBuffer, key],
      IDENTITY_PROGRAM_ID
    );
  }

  /**
   * Get Registry Config PDA (Identity Registry)
   * Seeds: ["config"]
   */
  static async getRegistryConfigPDA(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [Buffer.from('config')],
      IDENTITY_PROGRAM_ID
    );
  }

  /**
   * Get Feedback Account PDA (Reputation Registry)
   * Seeds: ["feedback", agent_id, client, feedback_index]
   */
  static async getFeedbackPDA(
    agentId: bigint,
    client: PublicKey,
    feedbackIndex: bigint
  ): Promise<[PublicKey, number]> {
    const agentIdBuffer = Buffer.alloc(8);
    agentIdBuffer.writeBigUInt64LE(agentId);

    const feedbackIndexBuffer = Buffer.alloc(8);
    feedbackIndexBuffer.writeBigUInt64LE(feedbackIndex);

    return await PublicKey.findProgramAddress(
      [
        Buffer.from('feedback'),
        agentIdBuffer,
        client.toBuffer(),
        feedbackIndexBuffer,
      ],
      REPUTATION_PROGRAM_ID
    );
  }

  /**
   * Get Agent Reputation PDA (Reputation Registry)
   * Seeds: ["agent_reputation", agent_id]
   * Stores cached aggregates for O(1) queries
   */
  static async getAgentReputationPDA(agentId: bigint): Promise<[PublicKey, number]> {
    const agentIdBuffer = Buffer.alloc(8);
    agentIdBuffer.writeBigUInt64LE(agentId);

    return await PublicKey.findProgramAddress(
      [Buffer.from('agent_reputation'), agentIdBuffer],
      REPUTATION_PROGRAM_ID
    );
  }

  /**
   * Get Client Index PDA (Reputation Registry)
   * Seeds: ["client_index", agent_id, client]
   * Tracks last feedback index for a client
   */
  static async getClientIndexPDA(
    agentId: bigint,
    client: PublicKey
  ): Promise<[PublicKey, number]> {
    const agentIdBuffer = Buffer.alloc(8);
    agentIdBuffer.writeBigUInt64LE(agentId);

    return await PublicKey.findProgramAddress(
      [Buffer.from('client_index'), agentIdBuffer, client.toBuffer()],
      REPUTATION_PROGRAM_ID
    );
  }

  /**
   * Get Response PDA (Reputation Registry)
   * Seeds: ["response", agent_id, client, feedback_index, response_index]
   */
  static async getResponsePDA(
    agentId: bigint,
    client: PublicKey,
    feedbackIndex: bigint,
    responseIndex: bigint
  ): Promise<[PublicKey, number]> {
    const agentIdBuffer = Buffer.alloc(8);
    agentIdBuffer.writeBigUInt64LE(agentId);

    const feedbackIndexBuffer = Buffer.alloc(8);
    feedbackIndexBuffer.writeBigUInt64LE(feedbackIndex);

    const responseIndexBuffer = Buffer.alloc(8);
    responseIndexBuffer.writeBigUInt64LE(responseIndex);

    return await PublicKey.findProgramAddress(
      [
        Buffer.from('response'),
        agentIdBuffer,
        client.toBuffer(),
        feedbackIndexBuffer,
        responseIndexBuffer,
      ],
      REPUTATION_PROGRAM_ID
    );
  }

  /**
   * Get Response Index PDA (Reputation Registry)
   * Seeds: ["response_index", agent_id, client, feedback_index]
   * Tracks number of responses for a feedback
   */
  static async getResponseIndexPDA(
    agentId: bigint,
    client: PublicKey,
    feedbackIndex: bigint
  ): Promise<[PublicKey, number]> {
    const agentIdBuffer = Buffer.alloc(8);
    agentIdBuffer.writeBigUInt64LE(agentId);

    const feedbackIndexBuffer = Buffer.alloc(8);
    feedbackIndexBuffer.writeBigUInt64LE(feedbackIndex);

    return await PublicKey.findProgramAddress(
      [
        Buffer.from('response_index'),
        agentIdBuffer,
        client.toBuffer(),
        feedbackIndexBuffer,
      ],
      REPUTATION_PROGRAM_ID
    );
  }

  /**
   * Get Validation Request PDA (Validation Registry)
   * Seeds: ["validation_request", agent_id, validator, nonce]
   */
  static async getValidationRequestPDA(
    agentId: bigint,
    validator: PublicKey,
    nonce: number
  ): Promise<[PublicKey, number]> {
    const agentIdBuffer = Buffer.alloc(8);
    agentIdBuffer.writeBigUInt64LE(agentId);

    const nonceBuffer = Buffer.alloc(4);
    nonceBuffer.writeUInt32LE(nonce);

    return await PublicKey.findProgramAddress(
      [
        Buffer.from('validation_request'),
        agentIdBuffer,
        validator.toBuffer(),
        nonceBuffer,
      ],
      VALIDATION_PROGRAM_ID
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
