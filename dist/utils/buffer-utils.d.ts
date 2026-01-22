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
//# sourceMappingURL=buffer-utils.d.ts.map