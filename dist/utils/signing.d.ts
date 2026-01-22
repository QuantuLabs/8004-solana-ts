/**
 * Signing helpers for canonical JSON payloads
 * Browser-compatible - uses cross-platform crypto utilities
 */
import { PublicKey } from '@solana/web3.js';
import type { Keypair } from '@solana/web3.js';
import type { SignOptions, SignedPayloadV1 } from '../models/signatures.js';
import { type JsonValue } from './canonical-json.js';
export declare function normalizeSignData(input: unknown, seen?: Set<object>): JsonValue;
export declare function createNonce(bytes?: number): string;
export declare function buildSignedPayload(asset: PublicKey, data: unknown, signer: Keypair, options?: SignOptions): {
    payload: SignedPayloadV1;
    unsignedCanonical: string;
};
export declare function canonicalizeSignedPayload(payload: SignedPayloadV1): string;
export declare function verifySignedPayload(payload: SignedPayloadV1, publicKey: PublicKey): boolean;
export declare function parseSignedPayload(input: unknown): SignedPayloadV1;
//# sourceMappingURL=signing.d.ts.map