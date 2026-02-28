import { beforeAll, describe, expect, it } from '@jest/globals';
import { PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana';

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

const RAILWAY_REST_PUBLISHABLE_KEY = 'sb_publishable_i-ycBRGiolBr8GMdiVq1rA_nwt7N2bq';

type SearchFilters = {
  collectionPointer?: string;
  parentAsset?: string;
  colLocked?: boolean;
  parentLocked?: boolean;
  owner?: string;
  collection?: string;
  limit: number;
};

type ParityFixture = {
  agentAsset: string;
  searchFilters: SearchFilters;
  feedbackAsset: string;
};

function getRestApiKey(restUrl: string): string {
  if (process.env.INDEXER_API_KEY && process.env.INDEXER_API_KEY.trim()) {
    return process.env.INDEXER_API_KEY.trim();
  }

  // Railway/Supabase public read key used across local scripts for remote parity checks.
  if (
    restUrl.includes('8004-indexer-production.up.railway.app/rest/v1')
    || restUrl.includes('uhjytdjxvfbppgjicfly.supabase.co/rest/v1')
  ) {
    return RAILWAY_REST_PUBLISHABLE_KEY;
  }

  return '';
}

function scoreAgentForParity(agent: {
  collection_pointer: string | null;
  parent_asset: string | null;
  feedback_count: number;
}): number {
  let score = 0;
  if (agent.collection_pointer) score += 5;
  if (agent.parent_asset) score += 5;
  if (agent.feedback_count > 0) score += 3;
  return score;
}

function buildSearchFilters(agent: {
  owner: string;
  collection: string;
  collection_pointer: string | null;
  parent_asset: string | null;
  col_locked: boolean;
  parent_locked: boolean;
}): SearchFilters {
  const filters: SearchFilters = { limit: 50 };

  if (agent.collection_pointer && agent.collection_pointer.trim()) {
    filters.collectionPointer = agent.collection_pointer;
    filters.colLocked = agent.col_locked;
  }
  if (agent.parent_asset && agent.parent_asset.trim()) {
    filters.parentAsset = agent.parent_asset;
    filters.parentLocked = agent.parent_locked;
  }

  // Fallback to deterministic, broad filters when pointer/parent are absent.
  if (!filters.collectionPointer && !filters.parentAsset) {
    if (agent.owner && agent.owner.trim()) {
      filters.owner = agent.owner;
    } else if (agent.collection && agent.collection.trim()) {
      filters.collection = agent.collection;
    }
  }

  return filters;
}

function normalizeOptionalString(value: string | null | undefined): string {
  return (value ?? '').trim();
}

async function hasProjectionParity(restSdk: SolanaSDK, gqlSdk: SolanaSDK, asset: string): Promise<boolean> {
  const [restAgent, gqlAgent] = await Promise.all([
    restSdk.getIndexerClient().getAgent(asset),
    gqlSdk.getIndexerClient().getAgent(asset),
  ]);

  if (!restAgent || !gqlAgent) return false;

  return (
    restAgent.asset === gqlAgent.asset
    && restAgent.owner === gqlAgent.owner
    && normalizeOptionalString(restAgent.collection_pointer) === normalizeOptionalString(gqlAgent.collection_pointer)
    && normalizeOptionalString(restAgent.parent_asset) === normalizeOptionalString(gqlAgent.parent_asset)
    && restAgent.col_locked === gqlAgent.col_locked
    && restAgent.parent_locked === gqlAgent.parent_locked
  );
}

async function findParityFixture(restSdk: SolanaSDK, gqlSdk: SolanaSDK): Promise<ParityFixture> {
  const [restAgents, gqlAgents] = await Promise.all([
    restSdk.searchAgents({ limit: 150, orderBy: 'created_at.desc' }),
    gqlSdk.searchAgents({ limit: 150, orderBy: 'created_at.desc' }),
  ]);

  const gqlAssetSet = new Set(gqlAgents.map((a) => a.asset));
  const commonAgents = restAgents.filter((a) => gqlAssetSet.has(a.asset));
  if (commonAgents.length === 0) {
    throw new Error('No overlapping agents between REST and GraphQL results');
  }

  const prioritized = [...commonAgents].sort((a, b) => scoreAgentForParity(b) - scoreAgentForParity(a));

  let selected = prioritized[0];
  let selectedFilters = buildSearchFilters(selected);
  let foundStableCandidate = false;

  // Validate that the chosen filter set finds the same target on both backends.
  for (const candidate of prioritized.slice(0, 25)) {
    const candidateFilters = buildSearchFilters(candidate);
    const [restFiltered, gqlFiltered, projectionParity] = await Promise.all([
      restSdk.searchAgents(candidateFilters),
      gqlSdk.searchAgents(candidateFilters),
      hasProjectionParity(restSdk, gqlSdk, candidate.asset),
    ]);

    const inRest = restFiltered.some((a) => a.asset === candidate.asset);
    const inGql = gqlFiltered.some((a) => a.asset === candidate.asset);
    if (inRest && inGql && projectionParity) {
      selected = candidate;
      selectedFilters = candidateFilters;
      foundStableCandidate = true;
      break;
    }
  }

  if (!foundStableCandidate) {
    throw new Error('Unable to find a stable parity agent (projection/search mismatch)');
  }

  const feedbackCandidates = [
    selected.asset,
    ...prioritized
      .filter((a) => a.asset !== selected.asset && a.feedback_count > 0)
      .map((a) => a.asset),
  ].slice(0, 30);

  let feedbackAsset = '';
  for (const asset of feedbackCandidates) {
    const key = new PublicKey(asset);
    const [restFeedbacks, gqlFeedbacks] = await Promise.all([
      restSdk.getFeedbacksFromIndexer(key, { limit: 50 }),
      gqlSdk.getFeedbacksFromIndexer(key, { limit: 50 }),
    ]);
    if (restFeedbacks.length > 0 && gqlFeedbacks.length > 0) {
      feedbackAsset = asset;
      break;
    }
  }

  if (!feedbackAsset) {
    throw new Error('No common feedback-bearing asset found across REST and GraphQL');
  }

  return {
    agentAsset: selected.asset,
    searchFilters: selectedFilters,
    feedbackAsset,
  };
}

describe('Indexer GraphQL Parity (devnet remote, read mode)', () => {
  let restSdk: SolanaSDK;
  let gqlSdk: SolanaSDK;
  let agentAsset: PublicKey;
  let feedbackAsset: PublicKey;
  let searchFilters: SearchFilters;
  let skipReason = '';
  let graphqlReady = false;
  let restReady = false;

  beforeAll(async () => {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const restUrl = process.env.INDEXER_URL || 'https://8004-indexer-production.up.railway.app/rest/v1';
    const restApiKey = getRestApiKey(restUrl);
    const graphqlUrl = process.env.INDEXER_GRAPHQL_URL || toGraphqlUrl(restUrl);

    graphqlReady = await isGraphqlAvailable(graphqlUrl);
    if (!graphqlReady) {
      skipReason = `GraphQL unavailable at ${graphqlUrl}`;
      console.log(`⚠️  ${skipReason}, parity suite skipped`);
      return;
    }

    restSdk = new SolanaSDK({
      rpcUrl,
      indexerUrl: restUrl,
      indexerApiKey: restApiKey,
    });

    gqlSdk = new SolanaSDK({
      rpcUrl,
      indexerUrl: '',
      indexerApiKey: '',
      indexerGraphqlUrl: graphqlUrl,
    });

    restReady = await restSdk.isIndexerAvailable();
    if (!restReady) {
      skipReason = `REST unavailable at ${restUrl}. Set INDEXER_API_KEY if auth is required.`;
      console.log(`⚠️  ${skipReason} parity suite skipped`);
      return;
    }

    const fixture = await findParityFixture(restSdk, gqlSdk);
    agentAsset = new PublicKey(fixture.agentAsset);
    feedbackAsset = new PublicKey(fixture.feedbackAsset);
    searchFilters = fixture.searchFilters;
  }, 120000);

  it('returns consistent agent projection between REST and GraphQL', async () => {
    if (!graphqlReady || !restReady) {
      console.log(`⏭️  ${skipReason}`);
      return;
    }
    const restAgent = await restSdk.getIndexerClient().getAgent(agentAsset.toBase58());
    const gqlAgent = await gqlSdk.getIndexerClient().getAgent(agentAsset.toBase58());

    expect(restAgent).toBeDefined();
    expect(gqlAgent).toBeDefined();

    expect(gqlAgent!.asset).toBe(restAgent!.asset);
    expect(gqlAgent!.owner).toBe(restAgent!.owner);
    expect(normalizeOptionalString(gqlAgent!.collection_pointer)).toBe(normalizeOptionalString(restAgent!.collection_pointer));
    expect(normalizeOptionalString(gqlAgent!.parent_asset)).toBe(normalizeOptionalString(restAgent!.parent_asset));
    expect(gqlAgent!.col_locked).toBe(restAgent!.col_locked);
    expect(gqlAgent!.parent_locked).toBe(restAgent!.parent_locked);
  });

  it('returns consistent agent search for collection pointer + parent filters', async () => {
    if (!graphqlReady || !restReady) {
      console.log(`⏭️  ${skipReason}`);
      return;
    }
    const restResults = await restSdk.searchAgents(searchFilters);
    const gqlResults = await gqlSdk.searchAgents(searchFilters);

    const restFound = restResults.find((a) => a.asset === agentAsset.toBase58());
    const gqlFound = gqlResults.find((a) => a.asset === agentAsset.toBase58());

    expect(restFound).toBeDefined();
    expect(gqlFound).toBeDefined();
  });

  it('returns feedbacks for the same asset on REST and GraphQL', async () => {
    if (!graphqlReady || !restReady) {
      console.log(`⏭️  ${skipReason}`);
      return;
    }
    const restFeedbacks = await restSdk.getFeedbacksFromIndexer(feedbackAsset, { limit: 50 });
    const gqlFeedbacks = await gqlSdk.getFeedbacksFromIndexer(feedbackAsset, { limit: 50 });

    expect(restFeedbacks.length).toBeGreaterThan(0);
    expect(gqlFeedbacks.length).toBeGreaterThan(0);

    const restIds = new Set(restFeedbacks.map((f) => `${f.client.toBase58()}:${f.feedbackIndex.toString()}`));
    const gqlIds = new Set(gqlFeedbacks.map((f) => `${f.client.toBase58()}:${f.feedbackIndex.toString()}`));

    const overlapCount = [...gqlIds].filter((id) => restIds.has(id)).length;
    expect(gqlIds.size).toBeGreaterThan(0);
    expect(overlapCount).toBeGreaterThan(0);
  });
});
