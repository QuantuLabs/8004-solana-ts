/**
 * Signing helpers for canonical JSON payloads
 * Browser-compatible - uses cross-platform crypto utilities
 */
import { ed25519 } from '@noble/curves/ed25519';
import { getRandomBytes } from './crypto-utils.js';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { canonicalizeJson } from './canonical-json.js';
function isPlainObject(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
function wrapBytes(bytes) {
    const buffer = Buffer.from(bytes);
    return {
        $bytes: buffer.toString('base64'),
        encoding: 'base64',
    };
}
export function normalizeSignData(input, seen = new Set()) {
    if (input === null) {
        return null;
    }
    if (typeof input === 'string' || typeof input === 'boolean') {
        return input;
    }
    if (typeof input === 'number') {
        if (!Number.isFinite(input)) {
            throw new Error('Non-finite number is not allowed in signed data');
        }
        return input;
    }
    if (typeof input === 'bigint') {
        return { $bigint: input.toString() };
    }
    if (input instanceof PublicKey) {
        return { $pubkey: input.toBase58() };
    }
    if (input instanceof Date) {
        return { $date: input.toISOString() };
    }
    if (input instanceof Uint8Array) {
        return wrapBytes(input);
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
        return wrapBytes(input);
    }
    if (input instanceof ArrayBuffer) {
        return wrapBytes(new Uint8Array(input));
    }
    if (Array.isArray(input)) {
        return input.map((entry) => normalizeSignData(entry, seen));
    }
    if (typeof input === 'object') {
        if (seen.has(input)) {
            throw new Error('Circular reference detected in signed data');
        }
        if (!isPlainObject(input)) {
            throw new Error('Unsupported object type in signed data');
        }
        seen.add(input);
        const result = {};
        for (const [key, value] of Object.entries(input)) {
            if (value === undefined) {
                continue;
            }
            result[key] = normalizeSignData(value, seen);
        }
        seen.delete(input);
        return result;
    }
    throw new Error('Unsupported data type in signed data');
}
export function createNonce(bytes = 16) {
    return bs58.encode(getRandomBytes(bytes));
}
export function buildSignedPayload(asset, data, signer, options = {}) {
    const nonce = options.nonce ?? createNonce();
    const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
    const normalizedData = normalizeSignData(data);
    const unsignedPayload = {
        v: 1,
        alg: 'ed25519',
        asset: asset.toBase58(),
        nonce,
        issuedAt,
        data: normalizedData,
    };
    const unsignedCanonical = canonicalizeJson(unsignedPayload);
    const signature = ed25519.sign(new TextEncoder().encode(unsignedCanonical), signer.secretKey.slice(0, 32));
    return {
        payload: {
            ...unsignedPayload,
            sig: bs58.encode(signature),
        },
        unsignedCanonical,
    };
}
function buildCanonicalPayload(payload, includeSig) {
    const result = {
        v: payload.v,
        alg: payload.alg,
        asset: payload.asset,
        nonce: payload.nonce,
        data: payload.data,
    };
    if (payload.issuedAt !== undefined) {
        result.issuedAt = payload.issuedAt;
    }
    if (includeSig) {
        result.sig = payload.sig;
    }
    return result;
}
export function canonicalizeSignedPayload(payload) {
    return canonicalizeJson(buildCanonicalPayload(payload, true));
}
export function verifySignedPayload(payload, publicKey) {
    const unsignedCanonical = canonicalizeJson(buildCanonicalPayload(payload, false));
    let signature;
    try {
        signature = bs58.decode(payload.sig);
    }
    catch {
        return false;
    }
    if (signature.length !== 64) {
        return false;
    }
    return ed25519.verify(signature, new TextEncoder().encode(unsignedCanonical), publicKey.toBytes());
}
export function parseSignedPayload(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Invalid signed payload: expected an object');
    }
    const payload = input;
    if (payload.v !== 1) {
        throw new Error('Unsupported signed payload version');
    }
    if (payload.alg !== 'ed25519') {
        throw new Error('Unsupported signed payload algorithm');
    }
    const asset = payload.asset;
    if (typeof asset !== 'string') {
        throw new Error('Invalid signed payload: asset must be a string');
    }
    const nonce = payload.nonce;
    if (typeof nonce !== 'string') {
        throw new Error('Invalid signed payload: nonce must be a string');
    }
    const sig = payload.sig;
    if (typeof sig !== 'string') {
        throw new Error('Invalid signed payload: sig must be a string');
    }
    const issuedAt = payload.issuedAt;
    if (issuedAt !== undefined && typeof issuedAt !== 'number') {
        throw new Error('Invalid signed payload: issuedAt must be a number');
    }
    if (!('data' in payload)) {
        throw new Error('Invalid signed payload: data is required');
    }
    const parsed = {
        v: 1,
        alg: 'ed25519',
        asset,
        nonce,
        sig,
        data: payload.data,
        ...(issuedAt !== undefined ? { issuedAt } : {}),
    };
    return parsed;
}
//# sourceMappingURL=signing.js.map