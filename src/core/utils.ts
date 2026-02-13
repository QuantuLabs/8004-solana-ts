/**
 * Utility functions for 8004 Solana SDK
 */

/**
 * Convert any bigint-like value to native JavaScript BigInt.
 *
 * The borsh library (v0.7.0) returns BN (bn.js) objects for u64 fields,
 * not native JavaScript bigint. This causes issues when passing values
 * to Buffer.writeBigUInt64LE() which requires native bigint.
 *
 * @param value - A bigint, BN object, number, or string
 * @param fieldName - Optional field name for error messages
 * @returns Native JavaScript BigInt
 */
export function toBigInt(value: bigint | number | string | { toString(): string }, fieldName?: string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  if (value && typeof (value as { toString: () => string }).toString === 'function') {
    try {
      return BigInt((value as { toString: () => string }).toString());
    } catch {
      throw new Error(`Invalid numeric value for ${fieldName ?? 'unknown'}: cannot convert to BigInt`);
    }
  }
  throw new Error(`Invalid numeric value for ${fieldName ?? 'unknown'}: unexpected type ${typeof value}`);
}
