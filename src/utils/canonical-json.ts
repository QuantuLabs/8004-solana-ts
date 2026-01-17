/**
 * RFC 8785 (JCS) canonical JSON stringifier
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export function canonicalizeJson(value: JsonValue): string {
  if (value === null) {
    return 'null';
  }

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number': {
      if (!Number.isFinite(value)) {
        throw new Error('Non-finite number is not valid JSON');
      }
      return JSON.stringify(value);
    }
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object': {
      if (Array.isArray(value)) {
        const items = value.map((entry) => canonicalizeJson(entry));
        return `[${items.join(',')}]`;
      }

      const keys = Object.keys(value).sort();
      const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`);
      return `{${entries.join(',')}}`;
    }
    default:
      throw new Error('Unsupported JSON value');
  }
}
