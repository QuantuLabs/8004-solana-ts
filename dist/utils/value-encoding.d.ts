/**
 * Encode a decimal value (number|string) to (value: bigint, valueDecimals: number)
 *
 * Examples:
 *   "99.77" → { value: 9977n, valueDecimals: 2 }
 *   99.77   → { value: 9977n, valueDecimals: 2 }
 *   9977    → { value: 9977n, valueDecimals: 0 }
 *   "-5.5"  → { value: -55n, valueDecimals: 1 }
 *
 * - Supports negatives (for yields, PnL, etc.)
 * - Max 6 decimals (Solana program limit)
 * - Clamps to i64 range
 */
export interface EncodedValue {
    value: bigint;
    valueDecimals: number;
    /** Original normalized decimal string */
    normalized: string;
}
/**
 * Encode a decimal value to (value, valueDecimals) for on-chain storage
 *
 * @param input - Decimal string ("99.77"), number (99.77), or bigint (9977n)
 * @param explicitDecimals - If provided, use this instead of auto-detecting (for bigint/int inputs)
 * @returns Encoded value with bigint and decimal precision
 */
export declare function encodeReputationValue(input: string | number | bigint, explicitDecimals?: number): EncodedValue;
/**
 * Decode (value, valueDecimals) back to a decimal string
 *
 * @param value - Raw bigint value
 * @param valueDecimals - Decimal precision
 * @returns Decimal string (e.g., "99.77")
 */
export declare function decodeToDecimalString(value: bigint, valueDecimals: number): string;
/**
 * Decode (value, valueDecimals) to a JS number
 * Note: May lose precision for very large values
 */
export declare function decodeToNumber(value: bigint, valueDecimals: number): number;
//# sourceMappingURL=value-encoding.d.ts.map