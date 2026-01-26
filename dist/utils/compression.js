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
// ZSTD magic number: 0x28 0xB5 0x2F 0xFD
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
// Prefix bytes
const PREFIX_RAW = 0x00;
const PREFIX_ZSTD = 0x01;
let zstdDecompressCache = null;
let zstdLoadAttempted = false;
async function loadZstdDecompress() {
    if (zstdLoadAttempted)
        return zstdDecompressCache;
    zstdLoadAttempted = true;
    try {
        // Dynamic import - only loaded if needed
        // Using string to avoid TypeScript trying to resolve the module
        const moduleName = '@mongodb-js/zstd';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const zstd = await import(moduleName);
        zstdDecompressCache = zstd.decompress;
        return zstdDecompressCache;
    }
    catch {
        // zstd not available - this is fine, we'll return data as-is
        return null;
    }
}
/**
 * Decompress data from storage
 * Handles: prefixed data (new format) and legacy unprefixed data
 *
 * @param data - Raw buffer from database (may be compressed)
 * @returns Decompressed buffer
 */
export async function decompressFromStorage(data) {
    if (!data || data.length === 0) {
        return Buffer.alloc(0);
    }
    const prefix = data[0];
    // New format: prefixed data
    if (prefix === PREFIX_RAW) {
        // Uncompressed, just strip the prefix
        return data.slice(1);
    }
    if (prefix === PREFIX_ZSTD) {
        // ZSTD compressed
        const decompress = await loadZstdDecompress();
        if (!decompress) {
            throw new Error('ZSTD decompression required but @mongodb-js/zstd not installed');
        }
        return decompress(data.slice(1));
    }
    // Legacy format: no prefix, return as-is
    // This handles data stored before compression was added
    return data;
}
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
export async function decompressBase64Value(value) {
    if (!value)
        return '';
    // Minimum length for valid base64-encoded prefixed data:
    // prefix(1) + content(1+) = 2+ bytes = 4+ base64 chars (due to padding)
    // Using 4 as minimum to avoid false positives on short strings like "AA", "AB"
    if (value.length < 4) {
        return value;
    }
    // Check if it looks like base64 (only contains base64 chars)
    const isLikelyBase64 = /^[A-Za-z0-9+/]+=*$/.test(value);
    if (!isLikelyBase64) {
        return value;
    }
    try {
        const buffer = Buffer.from(value, 'base64');
        // ONLY process as base64 if first byte is our compression prefix
        // This prevents misinterpreting random text that decodes to valid base64
        if (buffer.length > 1 && (buffer[0] === PREFIX_RAW || buffer[0] === PREFIX_ZSTD)) {
            const decompressed = await decompressFromStorage(buffer);
            return decompressed.toString('utf8');
        }
    }
    catch {
        // Base64 decode or decompression failed, fall through
    }
    // Not our prefixed format - return as-is (plain text)
    return value;
}
/**
 * Check if a buffer appears to be compressed (has ZSTD prefix or magic)
 */
export function isCompressed(data) {
    if (!data || data.length === 0)
        return false;
    // Check for our ZSTD prefix
    if (data[0] === PREFIX_ZSTD)
        return true;
    // Check for raw ZSTD magic (legacy detection)
    if (data.length >= 4 && data.slice(0, 4).equals(ZSTD_MAGIC))
        return true;
    return false;
}
//# sourceMappingURL=compression.js.map