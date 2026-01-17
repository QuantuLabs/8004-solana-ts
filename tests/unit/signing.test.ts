/**
 * Unit tests for signed payload helpers
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Keypair, PublicKey } from '@solana/web3.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SolanaSDK } from '../../src/core/sdk-solana.js';
import { AgentAccount } from '../../src/core/borsh-schemas.js';

const ORIGINAL_FETCH = global.fetch;

function createAgent(asset: PublicKey, agentUri: string, wallet?: PublicKey): AgentAccount {
  return new AgentAccount({
    collection: new Uint8Array(32),
    owner: new Uint8Array(32),
    asset: asset.toBytes(),
    bump: 1,
    agent_wallet: wallet ? wallet.toBytes() : null,
    agent_uri: agentUri,
    nft_name: 'TestAgent',
  });
}

function createResponse(status: number, body?: unknown) {
  const textBody = body !== undefined ? JSON.stringify(body) : '';
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => textBody,
  };
}

describe('Signing and Verification', () => {
  beforeEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('should throw when signing without a signer', () => {
    const sdk = new SolanaSDK();
    const asset = Keypair.generate().publicKey;

    expect(() => sdk.sign(asset, { ok: true })).toThrow('No signer configured');
  });

  it('should normalize data types and preserve custom nonce/issuedAt', () => {
    const signer = Keypair.generate();
    const sdk = new SolanaSDK({ signer });
    const asset = Keypair.generate().publicKey;

    const payload = sdk.sign(
      asset,
      {
        count: 1,
        big: 42n,
        when: new Date('2025-01-01T00:00:00.000Z'),
        key: signer.publicKey,
        bytes: Uint8Array.from([1, 2, 3]),
        optional: undefined,
      },
      { nonce: 'fixed', issuedAt: 1700000000 }
    );

    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const data = parsed.data as Record<string, unknown>;

    expect(parsed.nonce).toBe('fixed');
    expect(parsed.issuedAt).toBe(1700000000);
    expect(data.optional).toBeUndefined();
    expect(data.big).toEqual({ $bigint: '42' });
    expect(data.when).toEqual({ $date: '2025-01-01T00:00:00.000Z' });
    expect(data.key).toEqual({ $pubkey: signer.publicKey.toBase58() });
    expect((data.bytes as Record<string, unknown>).encoding).toBe('base64');
  });

  it('should produce deterministic output with fixed inputs', () => {
    const signer = Keypair.generate();
    const sdk = new SolanaSDK({ signer });
    const asset = Keypair.generate().publicKey;
    const options = { nonce: 'fixed', issuedAt: 1700000000 };

    const one = sdk.sign(asset, { b: 2, a: 1 }, options);
    const two = sdk.sign(asset, { b: 2, a: 1 }, options);

    expect(one).toBe(two);
  });

  it('should sign and verify a payload with a provided public key', async () => {
    const signer = Keypair.generate();
    const sdk = new SolanaSDK({ signer });
    const asset = Keypair.generate().publicKey;

    const payload = sdk.sign(asset, {
      action: 'ping',
      count: 2,
      when: new Date('2025-01-01T00:00:00.000Z'),
      bytes: Uint8Array.from([1, 2, 3]),
      big: 42n,
      pubkey: signer.publicKey,
    });

    const ok = await sdk.verify(payload, asset, signer.publicKey);
    expect(ok).toBe(true);
  });

  it('should verify a payload from file paths and file URLs', async () => {
    const signer = Keypair.generate();
    const sdk = new SolanaSDK({ signer });
    const asset = Keypair.generate().publicKey;
    const payload = sdk.sign(asset, { message: 'file-test' });

    const dir = await mkdtemp(join(tmpdir(), 'agent0-sdk-'));
    const filePath = join(dir, 'payload.json');
    await writeFile(filePath, payload, 'utf8');

    const okPath = await sdk.verify(filePath, asset, signer.publicKey);
    const okUrl = await sdk.verify(pathToFileURL(filePath).toString(), asset, signer.publicKey);

    expect(okPath).toBe(true);
    expect(okUrl).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });

  it('should verify a payload from http and ipfs URIs', async () => {
    const signer = Keypair.generate();
    const asset = Keypair.generate().publicKey;
    const payload = JSON.parse(new SolanaSDK({ signer }).sign(asset, { via: 'http' }));

    global.fetch = (async (url: string) => {
      if (url === 'https://example.com/payload.json') {
        return createResponse(200, payload);
      }
      return createResponse(404, { error: 'not found' });
    }) as typeof fetch;

    const ipfsClient = {
      getJson: async (cid: string) => {
        if (cid === 'ipfs://QmPayloadCid' || cid === 'ipfs://QmPayloadCid/') {
          return payload;
        }
        throw new Error(`Unexpected CID ${cid}`);
      },
    };

    const sdk = new SolanaSDK({ signer, ipfsClient: ipfsClient as any });

    const okHttp = await sdk.verify('https://example.com/payload.json', asset, signer.publicKey);
    const okIpfs = await sdk.verify('ipfs://QmPayloadCid', asset, signer.publicKey);
    const okIpfsPath = await sdk.verify('/ipfs/QmPayloadCid', asset, signer.publicKey);

    expect(okHttp).toBe(true);
    expect(okIpfs).toBe(true);
    expect(okIpfsPath).toBe(true);
  });

  it('should return false when the signer does not match', async () => {
    const signer = Keypair.generate();
    const otherSigner = Keypair.generate();
    const sdk = new SolanaSDK({ signer });
    const asset = Keypair.generate().publicKey;

    const payload = sdk.sign(asset, { message: 'hello' });
    const ok = await sdk.verify(payload, asset, otherSigner.publicKey);
    expect(ok).toBe(false);
  });

  it('should return false when asset does not match', async () => {
    const signer = Keypair.generate();
    const sdk = new SolanaSDK({ signer });
    const asset = Keypair.generate().publicKey;
    const otherAsset = Keypair.generate().publicKey;

    const payload = sdk.sign(asset, { message: 'hello' });
    const ok = await sdk.verify(payload, otherAsset, signer.publicKey);
    expect(ok).toBe(false);
  });

  it('should throw when agent wallet is missing', async () => {
    const signer = Keypair.generate();
    const sdk = new SolanaSDK({ signer });
    const asset = Keypair.generate().publicKey;
    const payload = sdk.sign(asset, { message: 'hello' });

    const agent = createAgent(asset, 'https://example.com/agent.json');
    jest.spyOn(sdk, 'loadAgent').mockResolvedValue(agent);

    await expect(sdk.verify(payload, asset)).rejects.toThrow('Agent wallet not configured');
  });

  it('should verify using on-chain agent wallet when no public key is provided', async () => {
    const signer = Keypair.generate();
    const sdk = new SolanaSDK({ signer });
    const asset = Keypair.generate().publicKey;
    const payload = sdk.sign(asset, { message: 'hello' });

    const agent = createAgent(asset, 'https://example.com/agent.json', signer.publicKey);
    jest.spyOn(sdk, 'loadAgent').mockResolvedValue(agent);

    const ok = await sdk.verify(payload, asset);
    expect(ok).toBe(true);
  });
});
