import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PublicKey, Keypair } from '@solana/web3.js';
import {
  normalizeSignData,
  buildSignedPayload,
  verifySignedPayload,
  parseSignedPayload,
  canonicalizeSignedPayload,
  createNonce,
} from '../../src/utils/signing.js';

describe('signing utilities (full coverage)', () => {
  describe('normalizeSignData', () => {
    it('should handle null', () => {
      expect(normalizeSignData(null)).toBeNull();
    });

    it('should handle string', () => {
      expect(normalizeSignData('hello')).toBe('hello');
    });

    it('should handle boolean', () => {
      expect(normalizeSignData(true)).toBe(true);
      expect(normalizeSignData(false)).toBe(false);
    });

    it('should handle finite number', () => {
      expect(normalizeSignData(42)).toBe(42);
      expect(normalizeSignData(0)).toBe(0);
    });

    it('should throw on non-finite number', () => {
      expect(() => normalizeSignData(Infinity)).toThrow('Non-finite');
      expect(() => normalizeSignData(NaN)).toThrow('Non-finite');
    });

    it('should convert bigint to $bigint wrapper', () => {
      const result = normalizeSignData(123n) as any;
      expect(result.$bigint).toBe('123');
    });

    it('should convert PublicKey to $pubkey wrapper', () => {
      const pk = PublicKey.unique();
      const result = normalizeSignData(pk) as any;
      expect(result.$pubkey).toBe(pk.toBase58());
    });

    it('should convert Date to $date wrapper', () => {
      const d = new Date('2024-01-01T00:00:00Z');
      const result = normalizeSignData(d) as any;
      expect(result.$date).toBe(d.toISOString());
    });

    it('should convert Uint8Array to $bytes wrapper', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const result = normalizeSignData(bytes) as any;
      expect(result.$bytes).toBeDefined();
      expect(result.encoding).toBe('base64');
    });

    it('should convert Buffer to $bytes wrapper', () => {
      const buf = Buffer.from([4, 5, 6]);
      const result = normalizeSignData(buf) as any;
      expect(result.$bytes).toBeDefined();
      expect(result.encoding).toBe('base64');
    });

    it('should convert ArrayBuffer to $bytes wrapper', () => {
      const ab = new ArrayBuffer(3);
      const view = new Uint8Array(ab);
      view[0] = 7; view[1] = 8; view[2] = 9;
      const result = normalizeSignData(ab) as any;
      expect(result.$bytes).toBeDefined();
    });

    it('should handle arrays recursively', () => {
      const result = normalizeSignData([1, 'two', null]);
      expect(result).toEqual([1, 'two', null]);
    });

    it('should handle plain objects recursively', () => {
      const result = normalizeSignData({ a: 1, b: 'two' }) as any;
      expect(result.a).toBe(1);
      expect(result.b).toBe('two');
    });

    it('should skip undefined values in objects', () => {
      const result = normalizeSignData({ a: 1, b: undefined }) as any;
      expect(result.a).toBe(1);
      expect('b' in result).toBe(false);
    });

    it('should throw on circular reference in arrays', () => {
      const arr: any[] = [];
      arr.push(arr);
      expect(() => normalizeSignData(arr)).toThrow('Circular reference');
    });

    it('should throw on circular reference in objects', () => {
      const obj: any = {};
      obj.self = obj;
      expect(() => normalizeSignData(obj)).toThrow('Circular reference');
    });

    it('should throw on non-plain objects', () => {
      class Custom {}
      expect(() => normalizeSignData(new Custom())).toThrow('Unsupported object type');
    });

    it('should throw on functions', () => {
      expect(() => normalizeSignData((() => {}) as any)).toThrow('Unsupported data type');
    });

    it('should throw on symbols', () => {
      expect(() => normalizeSignData(Symbol('test') as any)).toThrow('Unsupported data type');
    });
  });

  describe('createNonce', () => {
    it('should generate a string nonce', () => {
      const nonce = createNonce();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(0);
    });

    it('should accept custom byte length', () => {
      const nonce = createNonce(8);
      expect(typeof nonce).toBe('string');
    });
  });

  describe('buildSignedPayload', () => {
    const signer = Keypair.generate();
    const asset = PublicKey.unique();

    it('should build and sign a payload', () => {
      const { payload, unsignedCanonical } = buildSignedPayload(asset, { key: 'value' }, signer);
      expect(payload.v).toBe(1);
      expect(payload.alg).toBe('ed25519');
      expect(payload.asset).toBe(asset.toBase58());
      expect(payload.sig).toBeDefined();
      expect(payload.nonce).toBeDefined();
      expect(typeof unsignedCanonical).toBe('string');
    });

    it('should use custom nonce and issuedAt', () => {
      const { payload } = buildSignedPayload(asset, 'data', signer, {
        nonce: 'custom-nonce',
        issuedAt: 1700000000,
      });
      expect(payload.nonce).toBe('custom-nonce');
      expect(payload.issuedAt).toBe(1700000000);
    });
  });

  describe('verifySignedPayload', () => {
    const signer = Keypair.generate();
    const asset = PublicKey.unique();

    it('should verify a valid signature', () => {
      const { payload } = buildSignedPayload(asset, { test: true }, signer);
      const valid = verifySignedPayload(payload, signer.publicKey);
      expect(valid).toBe(true);
    });

    it('should reject tampered data', () => {
      const { payload } = buildSignedPayload(asset, { test: true }, signer);
      payload.nonce = 'tampered';
      const valid = verifySignedPayload(payload, signer.publicKey);
      expect(valid).toBe(false);
    });

    it('should reject wrong public key', () => {
      const { payload } = buildSignedPayload(asset, { test: true }, signer);
      const wrongKey = Keypair.generate().publicKey;
      const valid = verifySignedPayload(payload, wrongKey);
      expect(valid).toBe(false);
    });

    it('should return false for invalid base58 signature', () => {
      const { payload } = buildSignedPayload(asset, { test: true }, signer);
      payload.sig = 'not-valid-base58!!!';
      const valid = verifySignedPayload(payload, signer.publicKey);
      expect(valid).toBe(false);
    });

    it('should return false for wrong-length signature', () => {
      const { payload } = buildSignedPayload(asset, { test: true }, signer);
      payload.sig = 'shortSig';
      const valid = verifySignedPayload(payload, signer.publicKey);
      expect(valid).toBe(false);
    });
  });

  describe('canonicalizeSignedPayload', () => {
    const signer = Keypair.generate();
    const asset = PublicKey.unique();

    it('should produce a canonical JSON string', () => {
      const { payload } = buildSignedPayload(asset, 'test', signer);
      const result = canonicalizeSignedPayload(payload);
      expect(typeof result).toBe('string');
      expect(result).toContain('"sig"');
      expect(result).toContain('"v":1');
    });

    it('should include issuedAt when present', () => {
      const { payload } = buildSignedPayload(asset, 'test', signer, { issuedAt: 12345 });
      const result = canonicalizeSignedPayload(payload);
      expect(result).toContain('"issuedAt":12345');
    });
  });

  describe('parseSignedPayload', () => {
    it('should parse valid payload', () => {
      const input = {
        v: 1,
        alg: 'ed25519',
        asset: PublicKey.unique().toBase58(),
        nonce: 'test-nonce',
        sig: 'test-sig',
        data: { key: 'value' },
      };
      const result = parseSignedPayload(input);
      expect(result.v).toBe(1);
      expect(result.alg).toBe('ed25519');
      expect(result.nonce).toBe('test-nonce');
    });

    it('should include issuedAt when present', () => {
      const input = {
        v: 1,
        alg: 'ed25519',
        asset: 'test',
        nonce: 'n',
        sig: 's',
        data: null,
        issuedAt: 999,
      };
      const result = parseSignedPayload(input);
      expect(result.issuedAt).toBe(999);
    });

    it('should throw on null input', () => {
      expect(() => parseSignedPayload(null)).toThrow('expected an object');
    });

    it('should throw on array input', () => {
      expect(() => parseSignedPayload([])).toThrow('expected an object');
    });

    it('should throw on wrong version', () => {
      expect(() => parseSignedPayload({ v: 2, alg: 'ed25519', asset: 'a', nonce: 'n', sig: 's', data: null }))
        .toThrow('Unsupported signed payload version');
    });

    it('should throw on wrong algorithm', () => {
      expect(() => parseSignedPayload({ v: 1, alg: 'rsa', asset: 'a', nonce: 'n', sig: 's', data: null }))
        .toThrow('Unsupported signed payload algorithm');
    });

    it('should throw on non-string asset', () => {
      expect(() => parseSignedPayload({ v: 1, alg: 'ed25519', asset: 123, nonce: 'n', sig: 's', data: null }))
        .toThrow('asset must be a string');
    });

    it('should throw on non-string nonce', () => {
      expect(() => parseSignedPayload({ v: 1, alg: 'ed25519', asset: 'a', nonce: 123, sig: 's', data: null }))
        .toThrow('nonce must be a string');
    });

    it('should throw on non-string sig', () => {
      expect(() => parseSignedPayload({ v: 1, alg: 'ed25519', asset: 'a', nonce: 'n', sig: 123, data: null }))
        .toThrow('sig must be a string');
    });

    it('should throw on non-number issuedAt', () => {
      expect(() => parseSignedPayload({ v: 1, alg: 'ed25519', asset: 'a', nonce: 'n', sig: 's', data: null, issuedAt: 'bad' }))
        .toThrow('issuedAt must be a number');
    });

    it('should throw when data is missing', () => {
      expect(() => parseSignedPayload({ v: 1, alg: 'ed25519', asset: 'a', nonce: 'n', sig: 's' }))
        .toThrow('data is required');
    });
  });
});
