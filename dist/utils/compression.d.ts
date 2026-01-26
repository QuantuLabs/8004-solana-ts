/**
 * Decompression utilities for metadata storage
 *
 * Format (from indexer):
 * - First byte: 0x00 = uncompressed, 0x01 = ZSTD compressed
 * - Rest: actual data (raw or compressed)
 *
 * This module only handles decompression (read-side).
 * Compression happens in the indexer.
 */
/**
 * Decompress data from storage
 * Handles: prefixed data (new format) and legacy unprefixed data
 *
 * @param data - Raw buffer from database (may be compressed)
 * @returns Decompressed buffer
 */
export declare function decompressFromStorage(data: Buffer): Promise<Buffer>;
/**
 * Decompress a value from PostgREST/Supabase or local API
 *
 * Handles multiple formats:
 * - Base64 encoded BYTEA with compression prefix (Supabase PostgREST)
 * - Plain text (local API, already decompressed)
 *
 * Security: Only treats data as base64 if it has our compression prefix (0x00 or 0x01)
 * to avoid misinterpreting plain text that happens to look like base64.
 *
 * @param value - Value from API (base64 or plain text)
 * @returns Decompressed string
 */
export declare function decompressBase64Value(value: string): Promise<string>;
/**
 * Check if a buffer appears to be compressed (has ZSTD prefix or magic)
 */
export declare function isCompressed(data: Buffer): boolean;
//# sourceMappingURL=compression.d.ts.map