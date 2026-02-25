#!/usr/bin/env node

import {
  DEFAULT_INDEXER_API_KEY,
  DEFAULT_INDEXER_GRAPHQL_URL,
  DEFAULT_INDEXER_URL,
  IndexerClient,
  IndexerGraphQLClient,
} from '../dist/index.js';
import {
  errorMessage,
  getArg,
  getArgOr,
  nowIso,
  parseArgs,
  resolveFromCwd,
  writeJson,
} from './e2e-indexers-lib.mjs';

function isBackend(value) {
  return value === 'classic' || value === 'substream';
}

function isTransport(value) {
  return value === 'rest' || value === 'graphql';
}

function parseHeadersJson(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function resolveBaseUrl(args, backend, transport) {
  if (transport === 'rest') {
    if (backend === 'classic') {
      return (
        getArg(args, 'base-url') ||
        process.env.CLASSIC_INDEXER_URL ||
        process.env.INDEXER_URL ||
        DEFAULT_INDEXER_URL
      );
    }
    return (
      getArg(args, 'base-url') ||
      process.env.SUBSTREAM_INDEXER_URL ||
      process.env.E2E_INDEXERS_SUBSTREAM_REST_URL ||
      null
    );
  }

  if (backend === 'classic') {
    return (
      getArg(args, 'base-url') ||
      process.env.CLASSIC_INDEXER_GRAPHQL_URL ||
      process.env.INDEXER_GRAPHQL_URL ||
      DEFAULT_INDEXER_GRAPHQL_URL
    );
  }
  return (
    getArg(args, 'base-url') ||
    process.env.SUBSTREAM_INDEXER_GRAPHQL_URL ||
    process.env.E2E_INDEXERS_SUBSTREAM_GRAPHQL_URL ||
    null
  );
}

function resolveApiKey(args, backend) {
  if (backend === 'classic') {
    return (
      getArg(args, 'api-key') ||
      process.env.CLASSIC_INDEXER_API_KEY ||
      process.env.INDEXER_API_KEY ||
      DEFAULT_INDEXER_API_KEY
    );
  }
  return (
    getArg(args, 'api-key') ||
    process.env.SUBSTREAM_INDEXER_API_KEY ||
    process.env.E2E_INDEXERS_SUBSTREAM_API_KEY ||
    ''
  );
}

function resolveGraphqlHeaders(backend) {
  const scoped =
    backend === 'classic'
      ? process.env.CLASSIC_INDEXER_GRAPHQL_HEADERS_JSON
      : process.env.SUBSTREAM_INDEXER_GRAPHQL_HEADERS_JSON;
  return {
    ...parseHeadersJson(process.env.INDEXER_GRAPHQL_HEADERS_JSON),
    ...parseHeadersJson(scoped),
  };
}

function inferStatus(available, errors, baseUrl) {
  if (!baseUrl) return 'skipped';
  if (available === true && errors.length === 0) return 'passed';
  if (available === true && errors.length > 0) return 'partial';
  return 'failed';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const backendRaw = getArgOr(args, 'backend', 'classic');
  const transportRaw = getArgOr(args, 'transport', 'rest');

  if (!isBackend(backendRaw)) {
    throw new Error(`--backend must be classic|substream (got: ${backendRaw})`);
  }
  if (!isTransport(transportRaw)) {
    throw new Error(`--transport must be rest|graphql (got: ${transportRaw})`);
  }

  const runId = getArgOr(args, 'run-id', process.env.E2E_INDEXERS_RUN_ID || 'manual');
  const artifactPath = resolveFromCwd(
    getArgOr(args, 'artifact', `artifacts/e2e-indexers/${runId}/jobs/${backendRaw}-${transportRaw}.json`)
  );
  const seedAsset = getArg(args, 'seed-asset') || process.env.E2E_INDEXERS_SEED_ASSET || null;
  const timeoutMs = Number.parseInt(
    getArgOr(args, 'timeout-ms', process.env.E2E_INDEXERS_TIMEOUT_MS || '10000'),
    10
  );

  const baseUrl = resolveBaseUrl(args, backendRaw, transportRaw);
  const errors = [];

  const artifact = {
    runId,
    backend: backendRaw,
    transport: transportRaw,
    status: 'skipped',
    baseUrl,
    timeoutMs,
    available: null,
    seedAsset,
    seedAssetFound: null,
    leaderboardAssets: [],
    globalStats: {
      total_agents: null,
      total_feedbacks: null,
      total_collections: null,
    },
    errors,
    generatedAt: nowIso(),
  };

  if (!baseUrl) {
    artifact.status = 'skipped';
    errors.push('No endpoint configured for this backend/transport');
    writeJson(artifactPath, artifact);
    console.log(`Check artifact: ${artifactPath}`);
    return;
  }

  let client;
  if (transportRaw === 'rest') {
    client = new IndexerClient({
      baseUrl,
      apiKey: resolveApiKey(args, backendRaw),
      timeout: timeoutMs,
      retries: 0,
    });
  } else {
    client = new IndexerGraphQLClient({
      graphqlUrl: baseUrl,
      headers: resolveGraphqlHeaders(backendRaw),
      timeout: timeoutMs,
      retries: 0,
    });
  }

  try {
    artifact.available = await client.isAvailable();
    if (!artifact.available) {
      errors.push('Indexer availability check returned false');
    }
  } catch (error) {
    artifact.available = false;
    errors.push(`Availability check error: ${errorMessage(error)}`);
  }

  try {
    const stats = await client.getGlobalStats();
    artifact.globalStats.total_agents = Number.isFinite(stats?.total_agents) ? stats.total_agents : null;
    artifact.globalStats.total_feedbacks = Number.isFinite(stats?.total_feedbacks) ? stats.total_feedbacks : null;
    artifact.globalStats.total_collections = Number.isFinite(stats?.total_collections) ? stats.total_collections : null;
  } catch (error) {
    errors.push(`Global stats error: ${errorMessage(error)}`);
  }

  try {
    const leaderboard = await client.getLeaderboard({ limit: 5 });
    artifact.leaderboardAssets = Array.isArray(leaderboard)
      ? leaderboard.map((entry) => entry?.asset).filter((value) => typeof value === 'string')
      : [];
  } catch (error) {
    errors.push(`Leaderboard error: ${errorMessage(error)}`);
  }

  if (seedAsset) {
    try {
      const seedAgent = await client.getAgent(seedAsset);
      artifact.seedAssetFound = Boolean(seedAgent);
    } catch (error) {
      artifact.seedAssetFound = false;
      errors.push(`Seed asset lookup error: ${errorMessage(error)}`);
    }
  }

  artifact.status = inferStatus(artifact.available, errors, baseUrl);
  writeJson(artifactPath, artifact);
  console.log(`Check artifact: ${artifactPath}`);

  if (artifact.status === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
