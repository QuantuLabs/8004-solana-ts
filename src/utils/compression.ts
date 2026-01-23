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

// Cache for zstd decompress function
type DecompressFn = (data: Buffer) => Promise<Buffer>;
let zstdDecompressCache: DecompressFn | null = null;
let zstdLoadAttempted = false;

async function loadZstdDecompress(): Promise<DecompressFn | null> {
  if (zstdLoadAttempted) return zstdDecompressCache;
  zstdLoadAttempted = true;

  try {
    // Dynamic import - only loaded if needed
    // Using string to avoid TypeScript trying to resolve the module
    const moduleName = '@mongodb-js/zstd';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zstd = await (import(moduleName) as Promise<any>);
    zstdDecompressCache = zstd.decompress as DecompressFn;
    return zstdDecompressCache;
  } catch {
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
export async function decompressFromStorage(data: Buffer): Promise<Buffer> {
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
 * - Base64 encoded BYTEA (Supabase PostgREST)
 * - Plain text (local API, already decompressed)
 * - Hex encoded BYTEA (some PostgREST configs)
 *
 * @param value - Value from API (base64, hex, or plain text)
 * @returns Decompressed string
 */
export async function decompressBase64Value(value: string): Promise<string> {
  if (!value) return '';

  // Check if it looks like base64 (only contains base64 chars and is reasonable length)
  const isLikelyBase64 = /^[A-Za-z0-9+/]+=*$/.test(value) && value.length >= 2;

  // Check if it starts with our compression prefix when decoded
  if (isLikelyBase64) {
    try {
      const buffer = Buffer.from(value, 'base64');

      // Check if first byte is our prefix (0x00 or 0x01)
      if (buffer.length > 0 && (buffer[0] === PREFIX_RAW || buffer[0] === PREFIX_ZSTD)) {
        const decompressed = await decompressFromStorage(buffer);
        return decompressed.toString('utf8');
      }

      // Might be legacy base64 without prefix, try to decode as UTF-8
      const decoded = buffer.toString('utf8');
      // If it decodes to valid UTF-8 text, return it
      if (decoded && !decoded.includes('\ufffd')) {
        return decoded;
      }
    } catch {
      // Base64 decode or decompression failed, fall through
    }
  }

  // Already plain text or unknown format, return as-is
  return value;
}

/**
 * Check if a buffer appears to be compressed (has ZSTD prefix or magic)
 */
export function isCompressed(data: Buffer): boolean {
  if (!data || data.length === 0) return false;

  // Check for our ZSTD prefix
  if (data[0] === PREFIX_ZSTD) return true;

  // Check for raw ZSTD magic (legacy detection)
  if (data.length >= 4 && data.slice(0, 4).equals(ZSTD_MAGIC)) return true;

  return false;
}
