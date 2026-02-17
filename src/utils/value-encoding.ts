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

const MAX_VALUE_DECIMALS = 6;
const MAX_EXPONENT = 20;
const I64_MAX = 9223372036854775807n;
const I64_MIN = -9223372036854775808n;

export interface EncodedValue {
  value: bigint;
  valueDecimals: number;
  /** Original normalized decimal string */
  normalized: string;
}

/**
 * Strip leading zeros from a string, keeping at least one digit
 */
function stripLeadingZeros(s: string): string {
  let i = 0;
  while (i < s.length - 1 && s[i] === '0') i++;
  return s.slice(i);
}

/**
 * Normalize a decimal string (handle exponential notation, trim zeros)
 */
function normalizeDecimalString(input: string): string {
  const s = input.trim();
  if (s.length === 0) throw new Error('Empty value');

  const lower = s.toLowerCase();
  if (lower === 'nan' || lower === '+nan' || lower === '-nan') {
    throw new Error('NaN not supported');
  }
  if (lower === 'infinity' || lower === '+infinity' || lower === '-infinity') {
    throw new Error('Infinity not supported');
  }

  // Handle exponential notation (e.g., 1.23e-4)
  if (/[eE]/.test(s)) {
    const match = s.match(/^([+-]?)(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
    if (!match) throw new Error(`Invalid numeric string: ${input}`);
    const sign = match[1] === '-' ? '-' : '';
    const mantissa = match[2];
    const exp = parseInt(match[3], 10);
    if (!Number.isFinite(exp)) throw new Error(`Invalid exponent: ${input}`);

    const [intPartRaw, fracPartRaw = ''] = mantissa.split('.');
    const digits = stripLeadingZeros((intPartRaw || '0') + fracPartRaw);
    const fracLen = fracPartRaw.length;
    const shift = exp - fracLen;

    if (digits === '0') return '0';

    if (shift >= 0) {
      if (shift > MAX_EXPONENT) {
        throw new Error(`Exponent too large: ${input} (max shift ${MAX_EXPONENT})`);
      }
      return sign + digits + '0'.repeat(shift);
    }
    const pos = digits.length + shift;
    if (pos > 0) {
      return sign + digits.slice(0, pos) + '.' + digits.slice(pos);
    }
    if (-pos > MAX_EXPONENT) {
      throw new Error(`Exponent too large: ${input} (max shift ${MAX_EXPONENT})`);
    }
    return sign + '0.' + '0'.repeat(-pos) + digits;
  }

  // Plain decimal
  if (!/^([+-])?(\d+)(\.\d+)?$/.test(s)) {
    throw new Error(`Invalid numeric string: ${input}`);
  }

  let sign = '';
  let body = s;
  if (body[0] === '+') body = body.slice(1);
  if (body[0] === '-') {
    sign = '-';
    body = body.slice(1);
  }

  let [intPart, fracPart = ''] = body.split('.');
  intPart = stripLeadingZeros(intPart || '0');
  fracPart = fracPart.replace(/0+$/, '');

  if (intPart === '0' && fracPart.length === 0) return '0';
  return sign + intPart + (fracPart.length ? '.' + fracPart : '');
}

/**
 * Encode a decimal value to (value, valueDecimals) for on-chain storage
 *
 * @param input - Decimal string ("99.77"), number (99.77), or bigint (9977n)
 * @param explicitDecimals - If provided, use this instead of auto-detecting (for bigint/int inputs)
 * @returns Encoded value with bigint and decimal precision
 */
export function encodeReputationValue(
  input: string | number | bigint,
  explicitDecimals?: number
): EncodedValue {
  // If bigint with explicit decimals, use directly
  if (typeof input === 'bigint') {
    const decimals = explicitDecimals ?? 0;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_VALUE_DECIMALS) {
      throw new Error(`valueDecimals must be integer 0-${MAX_VALUE_DECIMALS}`);
    }
    const value = input;
    if (value > I64_MAX || value < I64_MIN) {
      throw new Error(`Value ${value} exceeds i64 range (${I64_MIN} to ${I64_MAX})`);
    }
    return {
      value,
      valueDecimals: decimals,
      normalized: decodeToDecimalString(value, decimals),
    };
  }

  // If number is an integer with explicit decimals, use directly
  if (typeof input === 'number' && Number.isInteger(input) && explicitDecimals !== undefined) {
    const decimals = explicitDecimals;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_VALUE_DECIMALS) {
      throw new Error(`valueDecimals must be integer 0-${MAX_VALUE_DECIMALS}`);
    }
    // Reject unsafe integers to prevent silent precision loss
    if (!Number.isSafeInteger(input)) {
      throw new Error(`Integer ${input} exceeds safe integer range. Use bigint for large values.`);
    }
    const value = BigInt(input);
    if (value > I64_MAX || value < I64_MIN) {
      throw new Error(`Value ${value} exceeds i64 range (${I64_MIN} to ${I64_MAX})`);
    }
    return {
      value,
      valueDecimals: decimals,
      normalized: decodeToDecimalString(value, decimals),
    };
  }

  // Otherwise, parse as decimal string
  let normalized: string;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Non-finite number not supported');
    // Reject unsafe integers to prevent silent precision loss via toString()
    if (Number.isInteger(input) && !Number.isSafeInteger(input)) {
      throw new Error(`Integer ${input} exceeds safe integer range. Use bigint or string for large values.`);
    }
    normalized = normalizeDecimalString(input.toString());
  } else {
    normalized = normalizeDecimalString(input);
  }

  if (normalized === '0') {
    return { value: 0n, valueDecimals: 0, normalized };
  }

  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [intPart, fracPart = ''] = unsigned.split('.');

  // Limit decimals to max (truncate with rounding)
  const decimals = Math.min(fracPart.length, MAX_VALUE_DECIMALS);
  const kept = fracPart.slice(0, decimals);
  const nextDigit = fracPart.length > decimals ? parseInt(fracPart[decimals], 10) : 0;

  // Build scaled integer
  const scaledStr = stripLeadingZeros((intPart || '0') + kept.padEnd(decimals, '0')) || '0';
  let raw = BigInt(scaledStr);

  // Round half-up
  if (nextDigit >= 5) raw = raw + 1n;
  if (negative) raw = -raw;

  if (raw > I64_MAX || raw < I64_MIN) {
    throw new Error(`Encoded value ${raw} exceeds i64 range (${I64_MIN} to ${I64_MAX})`);
  }

  return {
    value: raw,
    valueDecimals: decimals,
    normalized,
  };
}

/**
 * Decode (value, valueDecimals) back to a decimal string
 *
 * @param value - Raw bigint value
 * @param valueDecimals - Decimal precision
 * @returns Decimal string (e.g., "99.77")
 */
export function decodeToDecimalString(value: bigint, valueDecimals: number): string {
  if (valueDecimals === 0) return value.toString();

  const str = value.toString();
  const isNegative = str.startsWith('-');
  const absStr = isNegative ? str.slice(1) : str;

  if (absStr.length <= valueDecimals) {
    const padded = absStr.padStart(valueDecimals, '0');
    const result = '0.' + padded;
    return isNegative ? '-' + result : result;
  }

  const intPart = absStr.slice(0, -valueDecimals);
  const fracPart = absStr.slice(-valueDecimals).replace(/0+$/, '');
  const result = fracPart ? intPart + '.' + fracPart : intPart;
  return isNegative ? '-' + result : result;
}

/**
 * Decode (value, valueDecimals) to a JS number
 * Note: May lose precision for very large values
 */
export function decodeToNumber(value: bigint, valueDecimals: number): number {
  return Number(value) / Math.pow(10, valueDecimals);
}
