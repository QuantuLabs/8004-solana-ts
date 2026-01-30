/**
 * Cross-platform buffer utilities for browser compatibility
 * Replaces Node.js-specific Buffer methods with DataView-based alternatives
 */
/**
 * Write a BigInt as little-endian 64-bit unsigned integer
 * Cross-platform alternative to Buffer.writeBigUInt64LE()
 */
export declare function writeBigUInt64LE(value: bigint): Uint8Array;
/**
 * Write a number as little-endian 32-bit unsigned integer
 * Cross-platform alternative to Buffer.writeUInt32LE()
 */
export declare function writeUInt32LE(value: number): Uint8Array;
/**
 * Write a number as little-endian 16-bit unsigned integer
 * Cross-platform alternative to Buffer.writeUInt16LE()
 */
export declare function writeUInt16LE(value: number): Uint8Array;
/**
 * Read a BigInt from little-endian 64-bit unsigned integer
 * Cross-platform alternative to Buffer.readBigUInt64LE()
 */
export declare function readBigUInt64LE(buffer: Uint8Array, offset?: number): bigint;
/**
 * Read a number from little-endian 32-bit unsigned integer
 * Cross-platform alternative to Buffer.readUInt32LE()
 */
export declare function readUInt32LE(buffer: Uint8Array, offset?: number): number;
/**
 * Serialize a string to Buffer with 4-byte length prefix (little-endian)
 * Used for Borsh-compatible string serialization in Solana instructions
 * @param str - String to serialize
 * @param maxLength - Optional max byte length (default: 1000 to fit in Solana tx)
 * @returns Buffer with [length (4 bytes LE), utf8 bytes]
 * @throws Error if string exceeds maxLength bytes
 */
export declare function serializeString(str: string, maxLength?: number): Buffer;
//# sourceMappingURL=buffer-utils.d.ts.map