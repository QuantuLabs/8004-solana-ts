/**
 * Utility functions for ERC-8004 Solana SDK
 */
/**
 * Convert any bigint-like value to native JavaScript BigInt
 *
 * The borsh library (v0.7.0) returns BN (bn.js) objects for u64 fields,
 * not native JavaScript bigint. This causes issues when passing values
 * to Buffer.writeBigUInt64LE() which requires native bigint.
 *
 * @param value - A bigint, BN object, number, or string
 * @returns Native JavaScript BigInt
 */
export function toBigInt(value) {
    if (typeof value === 'bigint') {
        return value;
    }
    if (typeof value === 'number') {
        return BigInt(value);
    }
    // BN (bn.js) or string - convert via toString()
    return BigInt(value.toString());
}
//# sourceMappingURL=utils.js.map