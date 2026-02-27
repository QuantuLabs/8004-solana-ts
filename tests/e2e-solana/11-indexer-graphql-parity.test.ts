import { beforeAll, describe, expect, it } from '@jest/globals';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';
import { SolanaSDK } from '../../src/core/sdk-solana';

function sha256(input: string): Buffer {
  return createHash('sha256').update(input).digest();
}

function toGraphqlUrl(restUrl: string): string {
  if (restUrl.endsWith('/rest/v1')) {
    return restUrl.replace(/\/rest\/v1$/, '/v2/graphql');
  }
  return `${restUrl.replace(/\/$/, '')}/v2/graphql`;
}

async function isGraphqlAvailable(graphqlUrl: string): Promise<boolean> {
  try {
    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    if (!response.ok) return false;
    const body = await response.json() as { data?: { __typename?: string } };
    return body?.data?.__typename === 'Query';
  } catch {
    return false;
  }
}

describe('Indexer GraphQL Parity (localnet)', () => {
  let writerSdk: SolanaSDK;
  let restSdk: SolanaSDK;
  let gqlSdk: SolanaSDK;
  let clientSdk: SolanaSDK;
  let agent: PublicKey;
  let parent: PublicKey;
  let collectionPointer: string;
  let ownerWallet: Keypair;
  let clientWallet: Keypair;
  let collection: PublicKey;
  let graphqlReady = false;

  beforeAll(async () => {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899';
    const restUrl = process.env.INDEXER_URL || 'http://127.0.0.1:3005/rest/v1';
    const graphqlUrl = process.env.INDEXER_GRAPHQL_URL || toGraphqlUrl(restUrl);
    graphqlReady = await isGraphqlAvailable(graphqlUrl);
    if (!graphqlReady) {
      console.log(`⚠️  GraphQL unavailable at ${graphqlUrl}, parity suite skipped`);
      return;
    }

    ownerWallet = Keypair.generate();
    clientWallet = Keypair.generate();

    const connection = new Connection(rpcUrl);
    await connection.requestAirdrop(ownerWallet.publicKey, 5_000_000_000);
    await connection.requestAirdrop(clientWallet.publicKey, 5_000_000_000);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    writerSdk = new SolanaSDK({
      rpcUrl,
      signer: ownerWallet,
      indexerUrl: restUrl,
    });

    restSdk = new SolanaSDK({
      rpcUrl,
      signer: ownerWallet,
      indexerUrl: restUrl,
    });

    // Force GraphQL client even if INDEXER_URL is present in env.
    gqlSdk = new SolanaSDK({
      rpcUrl,
      signer: ownerWallet,
      indexerUrl: '',
      indexerApiKey: '',
      indexerGraphqlUrl: graphqlUrl,
    });

    clientSdk = new SolanaSDK({
      rpcUrl,
      signer: clientWallet,
      indexerUrl: restUrl,
    });

    collection = (await writerSdk.getBaseCollection())!;
    expect(collection).toBeDefined();

    const parentResult = await writerSdk.registerAgent(`ipfs://gql_parent_${Date.now()}`, collection);
    expect(parentResult.success).toBe(true);
    parent = parentResult.asset!;

    const registerResult = await writerSdk.registerAgent(`ipfs://gql_agent_${Date.now()}`, collection);
    expect(registerResult.success).toBe(true);
    agent = registerResult.asset!;

    collectionPointer = `c1:bafybeigqlparity${Date.now().toString().slice(-8)}`;
    expect((await writerSdk.setCollectionPointer(agent, collectionPointer, { lock: false })).success).toBe(true);
    expect((await writerSdk.setParentAsset(agent, parent, { lock: false })).success).toBe(true);

    const feedbackUri = `ipfs://gql_feedback_${Date.now()}`;
    const fbResult = await clientSdk.giveFeedback(agent, {
      value: 77n,
      score: 77,
      tag1: 'gql-parity',
      feedbackUri,
      feedbackHash: sha256(feedbackUri),
    });
    expect(fbResult.success).toBe(true);

    const synced = await restSdk.waitForIndexerSync(async () => {
      const restAgent = await restSdk.getIndexerClient().getAgent(agent.toBase58());
      const gqlAgent = await gqlSdk.getIndexerClient().getAgent(agent.toBase58());
      return Boolean(
        restAgent &&
          gqlAgent &&
          restAgent.collection_pointer === collectionPointer &&
          gqlAgent.collection_pointer === collectionPointer &&
          restAgent.parent_asset === parent.toBase58() &&
          gqlAgent.parent_asset === parent.toBase58()
      );
    }, {
      timeout: 90000,
      initialDelay: 1500,
      maxDelay: 7000,
    });
    expect(synced).toBe(true);
  }, 120000);

  it('returns consistent agent projection between REST and GraphQL', async () => {
    if (!graphqlReady) return;
    const restAgent = await restSdk.getIndexerClient().getAgent(agent.toBase58());
    const gqlAgent = await gqlSdk.getIndexerClient().getAgent(agent.toBase58());

    expect(restAgent).toBeDefined();
    expect(gqlAgent).toBeDefined();

    expect(gqlAgent!.asset).toBe(restAgent!.asset);
    expect(gqlAgent!.owner).toBe(restAgent!.owner);
    expect(gqlAgent!.collection_pointer).toBe(restAgent!.collection_pointer);
    expect(gqlAgent!.parent_asset).toBe(restAgent!.parent_asset);
    expect(gqlAgent!.col_locked).toBe(restAgent!.col_locked);
    expect(gqlAgent!.parent_locked).toBe(restAgent!.parent_locked);
  });

  it('returns consistent agent search for collection pointer + parent filters', async () => {
    if (!graphqlReady) return;
    const filters = {
      collectionPointer,
      parentAsset: parent.toBase58(),
      colLocked: false,
      parentLocked: false,
      limit: 50,
    };

    const restResults = await restSdk.searchAgents(filters);
    const gqlResults = await gqlSdk.searchAgents(filters);

    const restFound = restResults.find((a) => a.asset === agent.toBase58());
    const gqlFound = gqlResults.find((a) => a.asset === agent.toBase58());

    expect(restFound).toBeDefined();
    expect(gqlFound).toBeDefined();
  });

  it('returns feedbacks for the same asset on REST and GraphQL', async () => {
    if (!graphqlReady) return;
    const restFeedbacks = await restSdk.getFeedbacksFromIndexer(agent, { limit: 50 });
    const gqlFeedbacks = await gqlSdk.getFeedbacksFromIndexer(agent, { limit: 50 });

    expect(restFeedbacks.length).toBeGreaterThan(0);
    expect(gqlFeedbacks.length).toBeGreaterThan(0);

    const restIds = new Set(restFeedbacks.map((f) => `${f.client.toBase58()}:${f.feedbackIndex.toString()}`));
    const gqlIds = new Set(gqlFeedbacks.map((f) => `${f.client.toBase58()}:${f.feedbackIndex.toString()}`));

    expect(gqlIds.size).toBeGreaterThan(0);
    for (const id of gqlIds) {
      expect(restIds.has(id)).toBe(true);
    }
  });
});
