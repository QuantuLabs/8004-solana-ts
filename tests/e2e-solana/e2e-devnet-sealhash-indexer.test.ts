import { beforeAll, describe, expect, it } from '@jest/globals';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';
import { SolanaSDK } from '../../src/core/sdk-solana.js';
import { computeSealHash, verifySealHash } from '../../src/core/seal.js';
import { loadTestWallets, type DevnetTestWallets } from './devnet-setup.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const INDEXER_URL = process.env.INDEXER_URL || 'http://127.0.0.1:3933/rest/v1';
const INDEXER_GRAPHQL_URL = process.env.INDEXER_GRAPHQL_URL
  || INDEXER_URL.replace(/\/rest\/v1$/, '/v2/graphql');

function sha256(data: string): Buffer {
  return createHash('sha256').update(data).digest();
}

async function fetchJson<T>(path: string): Promise<T> {
  const base = INDEXER_URL.endsWith('/') ? INDEXER_URL.slice(0, -1) : INDEXER_URL;
  const res = await fetch(`${base}${path}`);
  if (!res.ok) {
    throw new Error(`Indexer request failed: ${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
}

async function waitFor<T>(
  sdk: SolanaSDK,
  check: () => Promise<T | null | undefined>,
  opts?: { timeout?: number; interval?: number }
): Promise<T> {
  let found: T | null | undefined;
  const timeout = opts?.timeout ?? 90000;
  const interval = opts?.interval ?? 2000;
  const ok = await sdk.waitForIndexerSync(async () => {
    found = await check();
    return found != null;
  }, { timeout, interval, initialDelay: interval });
  if (!ok || found == null) {
    throw new Error('Indexer sync timeout');
  }
  return found;
}

describe('E2E Devnet sealHash with local indexer', () => {
  let connection: Connection;
  let wallets: DevnetTestWallets;
  let ownerSdk: SolanaSDK;
  let client1Sdk: SolanaSDK;
  let client2Sdk: SolanaSDK;
  let ownerGraphqlSdk: SolanaSDK;
  let agentAsset: PublicKey;

  beforeAll(async () => {
    connection = new Connection(RPC_URL, 'confirmed');
    wallets = loadTestWallets();

    ownerSdk = new SolanaSDK({
      rpcUrl: RPC_URL,
      signer: wallets.main,
      indexerUrl: INDEXER_URL,
    });
    client1Sdk = new SolanaSDK({
      rpcUrl: RPC_URL,
      signer: wallets.client1,
      indexerUrl: INDEXER_URL,
    });
    client2Sdk = new SolanaSDK({
      rpcUrl: RPC_URL,
      signer: wallets.client2,
      indexerUrl: INDEXER_URL,
    });
    ownerGraphqlSdk = new SolanaSDK({
      rpcUrl: RPC_URL,
      signer: wallets.main,
      indexerUrl: '',
      indexerGraphqlUrl: INDEXER_GRAPHQL_URL,
    });

    const register = await ownerSdk.registerAgent(`ipfs://seal_indexer_devnet_${Date.now()}`, {
      atomEnabled: true,
    });
    expect(register.success).toBe(true);
    expect(register.asset).toBeInstanceOf(PublicKey);
    agentAsset = register.asset!;
  }, 120000);

  it('round-trips feedbackFileHash into indexed feedback_hash / sealHash', async () => {
    const feedbackUri = `ipfs://seal_feedback_${Date.now()}`;
    const feedbackFileHash = sha256(JSON.stringify({ ok: true, ts: Date.now() }));
    const expectedSealHash = computeSealHash({
      value: 111n,
      valueDecimals: 0,
      score: 77,
      tag1: 'seal-roundtrip',
      tag2: '',
      endpoint: '',
      feedbackUri,
      feedbackFileHash,
    });

    const result = await client1Sdk.giveFeedback(agentAsset, {
      value: 111n,
      score: 77,
      tag1: 'seal-roundtrip',
      feedbackUri,
      feedbackFileHash,
    });

    expect(result.success).toBe(true);
    expect(result.feedbackIndex).toBe(0n);

    const feedback = await waitFor(ownerSdk, async () => (
      ownerSdk.readFeedback(agentAsset, wallets.client1.publicKey, 0n)
    ));

    expect(feedback.sealHash).toBeDefined();
    expect(feedback.sealHash!.toString('hex')).toBe(expectedSealHash.toString('hex'));
    expect(verifySealHash({
      value: 111n,
      valueDecimals: 0,
      score: 77,
      tag1: 'seal-roundtrip',
      tag2: '',
      endpoint: '',
      feedbackUri,
      feedbackFileHash,
      sealHash: feedback.sealHash!,
    })).toBe(true);

    const rows = await waitFor(ownerSdk, async () => {
      const data = await fetchJson<Array<Record<string, string | null>>>(`/feedbacks?asset=${agentAsset.toBase58()}&client_address=${wallets.client1.publicKey.toBase58()}&feedback_index=eq.0&limit=1`);
      return data[0] ?? null;
    });

    expect(rows.feedback_hash).toBe(expectedSealHash.toString('hex'));
  }, 120000);

  it('auto-resolves sealHash for appendResponse when omitted', async () => {
    const responseUri = `ipfs://seal_auto_response_${Date.now()}`;
    const result = await ownerSdk.appendResponse(
      agentAsset,
      wallets.client1.publicKey,
      0n,
      responseUri
    );
    expect(result.success).toBe(true);

    const row = await waitFor(ownerSdk, async () => {
      const data = await fetchJson<Array<Record<string, string | null>>>(`/responses?asset=${agentAsset.toBase58()}&client_address=${wallets.client1.publicKey.toBase58()}&feedback_index=eq.0&limit=5`);
      return data.find((entry) => entry.response_uri === responseUri) ?? null;
    });

    expect(row.status).toBe('PENDING');
    // response_count is agent-global, so the first response on this fresh agent is 1
    expect(row.response_count).toBe('1');
  }, 120000);

  it('resolves feedbackIndex from sealHash via appendResponseBySealHash', async () => {
    const feedbackUri = `ipfs://seal_resolve_by_hash_${Date.now()}`;
    const expectedSealHash = computeSealHash({
      value: 222n,
      valueDecimals: 0,
      score: 88,
      tag1: 'seal-by-hash',
      tag2: '',
      endpoint: '',
      feedbackUri,
      feedbackFileHash: null,
    });

    const feedbackResult = await client2Sdk.giveFeedback(agentAsset, {
      value: 222n,
      score: 88,
      tag1: 'seal-by-hash',
      feedbackUri,
    });
    expect(feedbackResult.success).toBe(true);
    expect(feedbackResult.feedbackIndex).toBe(1n);

    await waitFor(ownerSdk, async () => {
      const feedback = await ownerSdk.readFeedback(agentAsset, wallets.client2.publicKey, 1n);
      return feedback?.sealHash ? feedback : null;
    });

    const responseUri = `ipfs://seal_by_hash_response_${Date.now()}`;
    const responseResult = await ownerSdk.appendResponseBySealHash(
      agentAsset,
      wallets.client2.publicKey,
      expectedSealHash,
      responseUri
    );
    expect(responseResult.success).toBe(true);

    const row = await waitFor(ownerSdk, async () => {
      const data = await fetchJson<Array<Record<string, string | null>>>(`/responses?asset=${agentAsset.toBase58()}&client_address=${wallets.client2.publicKey.toBase58()}&feedback_index=eq.1&limit=5`);
      return data.find((entry) => entry.response_uri === responseUri) ?? null;
    });

    expect(row.status).toBe('PENDING');
    // response_count is agent-global, so this second response increments to 2
    expect(row.response_count).toBe('2');
  }, 120000);

  it('resolves feedbackIndex from sealHash via GraphQL live path', async () => {
    const feedbackUri = `ipfs://seal_graphql_by_hash_${Date.now()}`;
    const expectedSealHash = computeSealHash({
      value: 444n,
      valueDecimals: 0,
      score: 91,
      tag1: 'seal-graphql-by-hash',
      tag2: '',
      endpoint: '',
      feedbackUri,
      feedbackFileHash: null,
    });

    const feedbackResult = await client2Sdk.giveFeedback(agentAsset, {
      value: 444n,
      score: 91,
      tag1: 'seal-graphql-by-hash',
      feedbackUri,
    });
    expect(feedbackResult.success).toBe(true);
    expect(feedbackResult.feedbackIndex).toBe(2n);

    const graphqlFeedback = await waitFor(ownerGraphqlSdk, async () => {
      const feedback = await ownerGraphqlSdk.readFeedback(agentAsset, wallets.client2.publicKey, 2n);
      return feedback?.sealHash ? feedback : null;
    });
    expect(graphqlFeedback.sealHash!.toString('hex')).toBe(expectedSealHash.toString('hex'));

    const responseUri = `ipfs://seal_graphql_response_${Date.now()}`;
    const responseResult = await ownerGraphqlSdk.appendResponseBySealHash(
      agentAsset,
      wallets.client2.publicKey,
      expectedSealHash,
      responseUri
    );
    expect(responseResult.success).toBe(true);

    const row = await waitFor(ownerSdk, async () => {
      const data = await fetchJson<Array<Record<string, string | null>>>(`/responses?asset=${agentAsset.toBase58()}&client_address=${wallets.client2.publicKey.toBase58()}&feedback_index=eq.2&limit=5`);
      return data.find((entry) => entry.response_uri === responseUri) ?? null;
    });

    expect(row.status).toBe('PENDING');
    expect(row.response_count).toBe('3');
  }, 120000);

  it('auto-resolves sealHash for revokeFeedback when omitted', async () => {
    const feedbackUri = `ipfs://seal_auto_revoke_${Date.now()}`;
    const expectedSealHash = computeSealHash({
      value: 333n,
      valueDecimals: 0,
      score: 66,
      tag1: 'seal-auto-revoke',
      tag2: '',
      endpoint: '',
      feedbackUri,
      feedbackFileHash: null,
    });

    const feedbackResult = await client1Sdk.giveFeedback(agentAsset, {
      value: 333n,
      score: 66,
      tag1: 'seal-auto-revoke',
      feedbackUri,
    });
    expect(feedbackResult.success).toBe(true);
    expect(feedbackResult.feedbackIndex).toBe(3n);

    await waitFor(ownerSdk, async () => (
      ownerSdk.readFeedback(agentAsset, wallets.client1.publicKey, 3n)
    ));

    const revokeResult = await client1Sdk.revokeFeedback(agentAsset, 3n);
    expect(revokeResult.success).toBe(true);

    const feedbackRow = await waitFor(ownerSdk, async () => {
      const data = await fetchJson<Array<Record<string, string | null | boolean>>>(`/feedbacks?asset=${agentAsset.toBase58()}&client_address=${wallets.client1.publicKey.toBase58()}&feedback_index=eq.3&limit=1`);
      const row = data[0] ?? null;
      return row?.is_revoked === true ? row : null;
    });
    expect(feedbackRow.is_revoked).toBe(true);

    const revokeRow = await waitFor(ownerSdk, async () => {
      const data = await fetchJson<Array<Record<string, string | null>>>(`/revocations?asset=${agentAsset.toBase58()}&client_address=${wallets.client1.publicKey.toBase58()}&feedback_index=eq.3&limit=5`);
      return data[0] ?? null;
    });
    expect(revokeRow.status).toBe('PENDING');
    expect(revokeRow.feedback_hash).toBe(expectedSealHash.toString('hex'));
  }, 120000);

  it('rejects explicit wrong sealHash once indexer is synced', async () => {
    const badSealHash = Buffer.alloc(32, 0xff);
    await expect(
      ownerSdk.appendResponse(
        agentAsset,
        wallets.client1.publicKey,
        0n,
        badSealHash,
        `ipfs://should_fail_${Date.now()}`
      )
    ).rejects.toThrow('Provided sealHash does not match indexed feedback 0');

    await expect(
      client1Sdk.revokeFeedback(agentAsset, 0n, badSealHash)
    ).rejects.toThrow('Provided sealHash does not match indexed feedback 0');
  }, 120000);
});
