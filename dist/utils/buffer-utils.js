/**
 * Cross-platform buffer utilities for browser compatibility
 * Replaces Node.js-specific Buffer methods with DataView-based alternatives
 */
/**
 * Write a BigInt as little-endian 64-bit unsigned integer
 * Cross-platform alternative to Buffer.writeBigUInt64LE()
 */
export function writeBigUInt64LE(value) {
    const buffer = new Uint8Array(8);
    const view = new DataView(buffer.buffer);
    view.setBigUint64(0, value, true); // true = little-endian
    return buffer;
}
/**
 * Write a number as little-endian 32-bit unsigned integer
 * Cross-platform alternative to Buffer.writeUInt32LE()
 */
export function writeUInt32LE(value) {
    const buffer = new Uint8Array(4);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, value, true); // true = little-endian
    return buffer;
}
/**
 * Write a number as little-endian 16-bit unsigned integer
 * Cross-platform alternative to Buffer.writeUInt16LE()
 */
export function writeUInt16LE(value) {
    const buffer = new Uint8Array(2);
    const view = new DataView(buffer.buffer);
    view.setUint16(0, value, true); // true = little-endian
    return buffer;
}
/**
 * Read a BigInt from little-endian 64-bit unsigned integer
 * Cross-platform alternative to Buffer.readBigUInt64LE()
 */
export function readBigUInt64LE(buffer, offset = 0) {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
    return view.getBigUint64(0, true); // true = little-endian
}
/**
 * Read a number from little-endian 32-bit unsigned integer
 * Cross-platform alternative to Buffer.readUInt32LE()
 */
export function readUInt32LE(buffer, offset = 0) {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
    return view.getUint32(0, true); // true = little-endian
}
/** Maximum string length for Solana transaction size constraints */
const MAX_SERIALIZED_STRING_LENGTH = 1000;
/**
 * Serialize a string to Buffer with 4-byte length prefix (little-endian)
 * Used for Borsh-compatible string serialization in Solana instructions
 * @param str - String to serialize
 * @param maxLength - Optional max byte length (default: 1000 to fit in Solana tx)
 * @returns Buffer with [length (4 bytes LE), utf8 bytes]
 * @throws Error if string exceeds maxLength bytes
 */
export function serializeString(str, maxLength = MAX_SERIALIZED_STRING_LENGTH) {
    const strBytes = Buffer.from(str, 'utf8');
    if (strBytes.length > maxLength) {
        throw new Error(`String exceeds maximum length: ${strBytes.length} > ${maxLength} bytes`);
    }
    const len = Buffer.alloc(4);
    len.writeUInt32LE(strBytes.length);
    return Buffer.concat([len, strBytes]);
}
//# sourceMappingURL=buffer-utils.js.map