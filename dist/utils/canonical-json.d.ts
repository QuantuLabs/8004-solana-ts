/**
 * RFC 8785 (JCS) canonical JSON stringifier
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
export declare function canonicalizeJson(value: JsonValue): string;
//# sourceMappingURL=canonical-json.d.ts.map