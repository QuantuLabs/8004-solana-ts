/**
 * Signed payload types for agent verification
 */
import type { Keypair } from '@solana/web3.js';
export type SignedPayloadAlgorithm = 'ed25519';
export interface SignedPayloadV1 {
    v: 1;
    alg: SignedPayloadAlgorithm;
    asset: string;
    nonce: string;
    issuedAt?: number;
    data: unknown;
    sig: string;
}
export interface SignOptions {
    signer?: Keypair;
    nonce?: string;
    issuedAt?: number;
}
//# sourceMappingURL=signatures.d.ts.map