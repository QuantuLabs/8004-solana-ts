#!/usr/bin/env node

import { createHash } from 'crypto';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
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
  readJson,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const digest = createHash('sha256');
  for (const line of [...lines].sort()) {
    digest.update(line);
    digest.update('\n');
  }
  return digest.digest('hex');
}

function toBigIntSafe(value, fallback = 0n) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.length > 0) {
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

const AGENT_ID_FIELDS = ['agentId', 'agent_id', 'globalId', 'global_id', 'id'];
const URI_METADATA_FIELDS = ['_uri:name', '_uri:description', '_uri:image'];
const COLLECTION_DIGEST_FIELDS = [
  'version',
  'name',
  'symbol',
  'description',
  'image',
  'banner_image',
  'social_website',
  'social_x',
  'social_discord',
];

function toStringOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function trimTrailingSlashes(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  const normalized = trimmed.replace(/\/+$/g, '');
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:$/.test(normalized)) {
    return trimmed;
  }
  return normalized;
}

function isUrlLikeValue(value) {
  return typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/.+/.test(value.trim());
}

function normalizeDigestFieldValue(field, value) {
  const asString = toStringOrNull(value);
  if (asString === null) return null;
  const trimmed = asString.trim();
  if (trimmed.length === 0) return '';
  if (field === 'social_x') return trimmed;
  if (isUrlLikeValue(trimmed)) return trimTrailingSlashes(trimmed);
  return trimmed;
}

function formatDigestValue(value) {
  return value === null ? 'null' : String(value);
}

function normalizeUriMetadataShape(value) {
  const item = value && typeof value === 'object' ? value : {};
  return {
    '_uri:name':
      toStringOrNull(item['_uri:name']) ??
      toStringOrNull(item.uriName) ??
      toStringOrNull(item.uri_name) ??
      toStringOrNull(item.values?.['_uri:name']) ??
      null,
    '_uri:description':
      toStringOrNull(item['_uri:description']) ??
      toStringOrNull(item.uriDescription) ??
      toStringOrNull(item.uri_description) ??
      toStringOrNull(item.values?.['_uri:description']) ??
      null,
    '_uri:image':
      toStringOrNull(item['_uri:image']) ??
      toStringOrNull(item.uriImage) ??
      toStringOrNull(item.uri_image) ??
      toStringOrNull(item.values?.['_uri:image']) ??
      null,
  };
}

function normalizeCollectionDigestShape(value) {
  const item = value && typeof value === 'object' ? value : {};
  return {
    version: toStringOrNull(item.version),
    name: toStringOrNull(item.name),
    symbol: toStringOrNull(item.symbol),
    description: toStringOrNull(item.description),
    image: toStringOrNull(item.image),
    banner_image: toStringOrNull(item.banner_image ?? item.bannerImage),
    social_website: toStringOrNull(item.social_website ?? item.socialWebsite),
    social_x: toStringOrNull(item.social_x ?? item.socialX),
    social_discord: toStringOrNull(item.social_discord ?? item.socialDiscord),
  };
}

function extractUriMetadataFromRows(rows, assetFilter = null) {
  const byKey = new Map();
  for (const row of rows || []) {
    const rowAsset = toStringOrNull(row?.asset ?? row?.assetPubkey ?? null);
    if (assetFilter && rowAsset && rowAsset !== assetFilter) continue;
    const key =
      (typeof row?.key === 'string' ? row.key : null) ??
      (typeof row?.metadataKey === 'string' ? row.metadataKey : null);
    if (!key) continue;
    const value = toStringOrNull(row?.value ?? row?.metadataValue ?? null);
    byKey.set(key, value);
  }

  return {
    '_uri:name': byKey.get('_uri:name') ?? null,
    '_uri:description': byKey.get('_uri:description') ?? null,
    '_uri:image': byKey.get('_uri:image') ?? null,
  };
}

async function readGraphqlUriMetadata(client, asset) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('GraphQL metadata request method unavailable');
  }

  const attempts = [
    {
      query: `query($asset: String!) {
        metadata(first: 256, asset: $asset) {
          asset
          key
          value
        }
      }`,
      parse: (data) =>
        Array.isArray(data?.metadata) ? extractUriMetadataFromRows(data.metadata, asset) : null,
    },
    {
      query: `query($asset: String!) {
        metadata(first: 256, asset: $asset) {
          asset
          metadataKey
          metadataValue
        }
      }`,
      parse: (data) =>
        Array.isArray(data?.metadata) ? extractUriMetadataFromRows(data.metadata, asset) : null,
    },
    {
      query: `query($asset: String!) {
        metadataEntries(first: 256, asset: $asset) {
          asset
          key
          value
        }
      }`,
      parse: (data) =>
        Array.isArray(data?.metadataEntries)
          ? extractUriMetadataFromRows(data.metadataEntries, asset)
          : null,
    },
    {
      query: `query($asset: String!) {
        metadataEntries(first: 256, asset: $asset) {
          asset
          metadataKey
          metadataValue
        }
      }`,
      parse: (data) =>
        Array.isArray(data?.metadataEntries)
          ? extractUriMetadataFromRows(data.metadataEntries, asset)
          : null,
    },
    {
      query: `query($asset: String!) {
        agents(first: 1, asset: $asset) {
          uriName
          uriDescription
          uriImage
        }
      }`,
      parse: (data) => {
        const row = Array.isArray(data?.agents) ? data.agents[0] : null;
        if (!row) return null;
        return normalizeUriMetadataShape(row);
      },
    },
    {
      query: `query($asset: String!) {
        agents(first: 1, asset: $asset) {
          uri_name
          uri_description
          uri_image
        }
      }`,
      parse: (data) => {
        const row = Array.isArray(data?.agents) ? data.agents[0] : null;
        if (!row) return null;
        return normalizeUriMetadataShape(row);
      },
    },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const data = await client.request(attempt.query, { asset });
      const parsed = attempt.parse(data);
      if (parsed) return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `GraphQL URI metadata query unsupported for ${asset}${lastError ? ` (${errorMessage(lastError)})` : ''}`
  );
}

async function readUriMetadataForAsset(client, transport, asset) {
  if (typeof client.getMetadata === 'function') {
    const rows = await client.getMetadata(asset);
    return extractUriMetadataFromRows(rows);
  }

  if (typeof client.getMetadataByKey === 'function') {
    const results = await Promise.all(
      URI_METADATA_FIELDS.map(async (key) => {
        const row = await client.getMetadataByKey(asset, key);
        return [key, toStringOrNull(row?.value)];
      })
    );
    return Object.fromEntries(results);
  }

  if (transport === 'graphql') {
    return readGraphqlUriMetadata(client, asset);
  }

  throw new Error(`URI metadata lookup is unavailable for transport ${transport}`);
}

function valuesEqualForField(field, expectedValue, actualValue) {
  return (
    normalizeDigestFieldValue(field, expectedValue) === normalizeDigestFieldValue(field, actualValue)
  );
}

function normalizeAgentIdValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return null;
}

function canonicalAgentIdForAsset(_asset) {
  return null;
}

function extractAgentId(agent, asset) {
  const row = agent && typeof agent === 'object' ? agent : null;
  let idFieldSeen = false;

  for (const field of AGENT_ID_FIELDS) {
    if (row && Object.prototype.hasOwnProperty.call(row, field)) {
      idFieldSeen = true;
    }
    const value = normalizeAgentIdValue(row?.[field]);
    if (value !== null) {
      return {
        value,
        source: field,
        explicit: true,
        idFieldSeen,
      };
    }
  }

  return {
    value: canonicalAgentIdForAsset(asset),
    source: 'missing',
    explicit: false,
    idFieldSeen,
  };
}

function normalizeExpected(seedExpected) {
  if (!seedExpected || typeof seedExpected !== 'object') return null;

  const agents = Array.isArray(seedExpected.agents) ? seedExpected.agents : [];
  const feedbacks = Array.isArray(seedExpected.feedbacks) ? seedExpected.feedbacks : [];
  const pendingValidations = Array.isArray(seedExpected.pendingValidations)
    ? seedExpected.pendingValidations
    : [];
  const agentUriMetadata = Array.isArray(seedExpected.agentUriMetadata)
    ? seedExpected.agentUriMetadata
    : [];
  const collections = Array.isArray(seedExpected.collections) ? seedExpected.collections : [];

  return {
    agents: agents
      .map((item) => ({
        asset: typeof item?.asset === 'string' ? item.asset : null,
        owner: typeof item?.owner === 'string' ? item.owner : null,
        col: typeof item?.col === 'string' ? item.col : null,
        colLocked: typeof item?.colLocked === 'boolean' ? item.colLocked : null,
        parentAsset: typeof item?.parentAsset === 'string' ? item.parentAsset : null,
        parentLocked: typeof item?.parentLocked === 'boolean' ? item.parentLocked : null,
      }))
      .filter((item) => item.asset),
    feedbacks: feedbacks
      .map((item) => ({
        asset: typeof item?.asset === 'string' ? item.asset : null,
        client: typeof item?.client === 'string' ? item.client : null,
        feedbackIndex: toBigIntSafe(item?.feedbackIndex, -1n),
        isRevoked: Boolean(item?.isRevoked),
        expectedResponses: Number.isFinite(item?.expectedResponses)
          ? Number(item.expectedResponses)
          : 0,
      }))
      .filter((item) => item.asset && item.client && item.feedbackIndex >= 0n),
    pendingValidations: pendingValidations
      .map((item) => ({
        asset: typeof item?.asset === 'string' ? item.asset : null,
        validator: typeof item?.validator === 'string' ? item.validator : null,
        nonce: toBigIntSafe(item?.nonce, -1n),
      }))
      .filter((item) => item.asset && item.validator && item.nonce >= 0n),
    agentUriMetadata: agentUriMetadata
      .map((item) => ({
        asset: typeof item?.asset === 'string' ? item.asset : null,
        ...normalizeUriMetadataShape(item),
      }))
      .filter((item) => item.asset),
    collections: collections
      .map((item) => ({
        pointer:
          (typeof item?.pointer === 'string' ? item.pointer : null) ??
          (typeof item?.col === 'string' ? item.col : null) ??
          (typeof item?.collection === 'string' ? item.collection : null),
        ...normalizeCollectionDigestShape(item),
      }))
      .filter((item) => item.pointer),
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const width = Math.max(1, Math.trunc(concurrency || 1));
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(width, items.length) }, () => runWorker()));
  return results;
}

async function evaluateIdChecks(client, expected, options) {
  const errors = [];
  const agentLines = [];
  const feedbackLines = [];
  const pendingValidationLines = [];
  const uriMetadataLines = [];
  const collectionDigestLines = [];
  const seenExpectedAssets = new Set();
  const seenAgentIdByAsset = new Map();
  const seenAssetByAgentId = new Map();

  const expectedAgents = expected.agents.length;
  const expectedFeedbacks = expected.feedbacks.length;
  const expectedPending = expected.pendingValidations.length;
  const expectedUriMetadata = expected.agentUriMetadata.length;
  const expectedCollections = expected.collections.length;

  for (const item of expected.agents) {
    if (seenExpectedAssets.has(item.asset)) {
      errors.push(`agent.expected_duplicate_asset:${item.asset}`);
      continue;
    }
    seenExpectedAssets.add(item.asset);
  }

  const agentResults = await mapWithConcurrency(
    expected.agents,
    options.concurrency,
    async (item) => {
      try {
        const agent = await client.getAgent(item.asset);
        const confirmAgent = agent ? await client.getAgent(item.asset) : null;
        return { item, agent, confirmAgent };
      } catch (error) {
        return { item, agent: null, confirmAgent: null, error: errorMessage(error) };
      }
    }
  );

  let foundAgents = 0;
  for (const row of agentResults) {
    if (row.error) {
      errors.push(`agent.fetch:${row.item.asset}:${row.error}`);
      continue;
    }
    if (!row.agent) {
      errors.push(`agent.missing:${row.item.asset}`);
      continue;
    }

    foundAgents += 1;
    const firstAgentId = extractAgentId(row.agent, row.item.asset);
    const secondAgentId = extractAgentId(row.confirmAgent, row.item.asset);

    if (firstAgentId.value === null) {
      errors.push(`agent.agentId.missing:${row.item.asset}`);
    }
    if (firstAgentId.idFieldSeen && !firstAgentId.explicit) {
      errors.push(`agent.agentId.null:${row.item.asset}`);
    }
    if (secondAgentId.idFieldSeen && !secondAgentId.explicit) {
      errors.push(`agent.agentId.null_refetch:${row.item.asset}`);
    }

    if (firstAgentId.value && secondAgentId.value && firstAgentId.value !== secondAgentId.value) {
      errors.push(
        `agent.agentId.nondeterministic:${row.item.asset}:first=${firstAgentId.value}:second=${secondAgentId.value}`
      );
    }

    if (firstAgentId.value) {
      const seenForAsset = seenAgentIdByAsset.get(row.item.asset);
      if (seenForAsset && seenForAsset !== firstAgentId.value) {
        errors.push(
          `agent.agentId.asset_mismatch:${row.item.asset}:first=${seenForAsset}:second=${firstAgentId.value}`
        );
      } else if (!seenForAsset) {
        seenAgentIdByAsset.set(row.item.asset, firstAgentId.value);
      }

      const seenAsset = seenAssetByAgentId.get(firstAgentId.value);
      if (seenAsset && seenAsset !== row.item.asset) {
        errors.push(
          `agent.agentId.duplicate:${firstAgentId.value}:assets=${seenAsset},${row.item.asset}`
        );
      } else if (!seenAsset) {
        seenAssetByAgentId.set(firstAgentId.value, row.item.asset);
      }
    }

    if (row.item.owner && row.agent.owner !== row.item.owner) {
      errors.push(`agent.owner:${row.item.asset}:expected=${row.item.owner}:actual=${row.agent.owner}`);
    }
    if (row.item.col !== null && (row.agent.collection_pointer ?? null) !== row.item.col) {
      errors.push(`agent.col:${row.item.asset}:expected=${row.item.col}:actual=${row.agent.collection_pointer ?? null}`);
    }
    if (row.item.colLocked !== null && Boolean(row.agent.col_locked) !== row.item.colLocked) {
      errors.push(
        `agent.colLocked:${row.item.asset}:expected=${row.item.colLocked}:actual=${Boolean(row.agent.col_locked)}`
      );
    }
    if (row.item.parentAsset !== null && (row.agent.parent_asset ?? null) !== row.item.parentAsset) {
      errors.push(
        `agent.parent:${row.item.asset}:expected=${row.item.parentAsset}:actual=${row.agent.parent_asset ?? null}`
      );
    }
    if (row.item.parentLocked !== null && Boolean(row.agent.parent_locked) !== row.item.parentLocked) {
      errors.push(
        `agent.parentLocked:${row.item.asset}:expected=${row.item.parentLocked}:actual=${Boolean(row.agent.parent_locked)}`
      );
    }

    agentLines.push(
      [
        row.item.asset,
        row.agent.owner || '',
        firstAgentId.value == null ? 'null' : firstAgentId.value,
        row.agent.collection_pointer ?? '',
        row.agent.parent_asset ?? '',
        Boolean(row.agent.col_locked) ? '1' : '0',
        Boolean(row.agent.parent_locked) ? '1' : '0',
      ].join('|')
    );
  }

  const feedbackResults = await mapWithConcurrency(
    expected.feedbacks,
    options.concurrency,
    async (item) => {
      try {
        const feedback = await client.getFeedback(item.asset, item.client, item.feedbackIndex);
        const responses = await client.getFeedbackResponsesFor(
          item.asset,
          item.client,
          item.feedbackIndex,
          200
        );
        return { item, feedback, responses };
      } catch (error) {
        return { item, feedback: null, responses: null, error: errorMessage(error) };
      }
    }
  );

  let foundFeedbacks = 0;
  for (const row of feedbackResults) {
    if (row.error) {
      errors.push(
        `feedback.fetch:${row.item.asset}:${row.item.client}:${row.item.feedbackIndex.toString()}:${row.error}`
      );
      continue;
    }

    if (!row.feedback) {
      errors.push(
        `feedback.missing:${row.item.asset}:${row.item.client}:${row.item.feedbackIndex.toString()}`
      );
      continue;
    }

    foundFeedbacks += 1;
    const revoked = Boolean(row.feedback.is_revoked ?? row.feedback.revoked);
    const responseCount = Array.isArray(row.responses) ? row.responses.length : 0;

    if (revoked !== row.item.isRevoked) {
      errors.push(
        `feedback.revoked:${row.item.asset}:${row.item.client}:${row.item.feedbackIndex.toString()}:expected=${row.item.isRevoked}:actual=${revoked}`
      );
    }
    if (responseCount !== row.item.expectedResponses) {
      errors.push(
        `feedback.responses:${row.item.asset}:${row.item.client}:${row.item.feedbackIndex.toString()}:expected=${row.item.expectedResponses}:actual=${responseCount}`
      );
    }

    feedbackLines.push(
      [
        row.item.asset,
        row.item.client,
        row.item.feedbackIndex.toString(),
        revoked ? '1' : '0',
        String(responseCount),
      ].join('|')
    );
  }

  const expectedPendingByValidator = new Map();
  for (const item of expected.pendingValidations) {
    const key = item.validator;
    if (!expectedPendingByValidator.has(key)) expectedPendingByValidator.set(key, []);
    expectedPendingByValidator.get(key).push(item);
  }

  let foundPending = 0;
  for (const [validator, expectedRows] of expectedPendingByValidator.entries()) {
    let pending;
    try {
      pending = await client.getPendingValidations(validator);
    } catch (error) {
      errors.push(`validation.fetch:${validator}:${errorMessage(error)}`);
      continue;
    }

    const actualSet = new Set(
      (pending || []).map((item) => `${item.asset}:${toBigIntSafe(item.nonce, 0n).toString()}`)
    );
    foundPending += pending?.length || 0;

    for (const expectedRow of expectedRows) {
      const expectedKey = `${expectedRow.asset}:${expectedRow.nonce.toString()}`;
      if (!actualSet.has(expectedKey)) {
        errors.push(`validation.pending_missing:${validator}:${expectedKey}`);
      }
    }

    for (const pendingRow of pending || []) {
      pendingValidationLines.push(
        `${validator}|${pendingRow.asset}|${toBigIntSafe(pendingRow.nonce, 0n).toString()}`
      );
    }
  }

  let foundUriMetadata = 0;
  const uriMetadataResults = await mapWithConcurrency(
    expected.agentUriMetadata,
    options.concurrency,
    async (item) => {
      try {
        const observed = await readUriMetadataForAsset(client, options.transport, item.asset);
        return { item, observed };
      } catch (error) {
        return { item, observed: null, error: errorMessage(error) };
      }
    }
  );

  for (const row of uriMetadataResults) {
    if (row.error) {
      errors.push(`uri_metadata.fetch:${row.item.asset}:${row.error}`);
      continue;
    }

    if (row.observed) {
      foundUriMetadata += 1;
    }

    const observedLineParts = [row.item.asset];
    for (const field of URI_METADATA_FIELDS) {
      const expectedValue = normalizeDigestFieldValue(field, row.item[field] ?? null);
      const actualValue = normalizeDigestFieldValue(field, row.observed?.[field] ?? null);
      observedLineParts.push(formatDigestValue(actualValue));
      if (!valuesEqualForField(field, expectedValue, actualValue)) {
        errors.push(
          `uri_metadata.field:${row.item.asset}:${field}:expected=${formatDigestValue(
            expectedValue
          )}:actual=${formatDigestValue(actualValue)}`
        );
      }
    }
    uriMetadataLines.push(observedLineParts.join('|'));
  }

  let foundCollections = 0;
  const collectionResults = await mapWithConcurrency(
    expected.collections,
    options.concurrency,
    async (item) => {
      if (typeof client.getCollectionPointers !== 'function') {
        return { item, observed: null, error: 'getCollectionPointers unavailable' };
      }
      try {
        const rows = await client.getCollectionPointers({
          collection: item.pointer,
          limit: 4,
        });
        const observed = Array.isArray(rows)
          ? rows.find((entry) => {
              const pointer = toStringOrNull(entry?.collection ?? entry?.col);
              return pointer === item.pointer;
            }) ?? rows[0] ?? null
          : null;
        return { item, observed };
      } catch (error) {
        return { item, observed: null, error: errorMessage(error) };
      }
    }
  );

  for (const row of collectionResults) {
    if (row.error) {
      errors.push(`collection.fetch:${row.item.pointer}:${row.error}`);
      continue;
    }

    const observedDigest = row.observed ? normalizeCollectionDigestShape(row.observed) : null;
    if (!observedDigest) {
      errors.push(`collection.missing:${row.item.pointer}`);
    } else {
      foundCollections += 1;
    }

    const observedLineParts = [row.item.pointer];
    for (const field of COLLECTION_DIGEST_FIELDS) {
      const expectedValue = normalizeDigestFieldValue(field, row.item[field] ?? null);
      const actualValue = normalizeDigestFieldValue(field, observedDigest?.[field] ?? null);
      observedLineParts.push(formatDigestValue(actualValue));
      if (!valuesEqualForField(field, expectedValue, actualValue)) {
        errors.push(
          `collection.field:${row.item.pointer}:${field}:expected=${formatDigestValue(
            expectedValue
          )}:actual=${formatDigestValue(actualValue)}`
        );
      }
    }
    collectionDigestLines.push(observedLineParts.join('|'));
  }

  return {
    passed: errors.length === 0,
    expected: {
      agents: expectedAgents,
      feedbacks: expectedFeedbacks,
      pendingValidations: expectedPending,
      agentUriMetadata: expectedUriMetadata,
      collections: expectedCollections,
    },
    observed: {
      agentsFound: foundAgents,
      feedbacksFound: foundFeedbacks,
      pendingValidationsFound: foundPending,
      agentUriMetadataFound: foundUriMetadata,
      collectionsFound: foundCollections,
    },
    hashes: {
      agents: hashLines(agentLines),
      feedbacks: hashLines(feedbackLines),
      pendingValidations: hashLines(pendingValidationLines),
      agentUriMetadata: hashLines(uriMetadataLines),
      collections: hashLines(collectionDigestLines),
    },
    errors,
  };
}

async function evaluateIdChecksWithRetry(client, expected, options) {
  const start = Date.now();
  const timeoutMs = Math.max(2000, options.timeoutMs);
  const pollMs = Math.max(500, options.pollMs);
  let attempts = 0;
  let last = null;

  while (Date.now() - start <= timeoutMs) {
    attempts += 1;
    last = await evaluateIdChecks(client, expected, options);
    if (last.passed) {
      break;
    }
    await sleep(pollMs);
  }

  return {
    ...last,
    attempts,
    durationMs: Date.now() - start,
  };
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
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
  const seedArtifactPath = resolveFromCwd(
    getArgOr(
      args,
      'seed-artifact',
      process.env.E2E_INDEXERS_SEED_ARTIFACT || `artifacts/e2e-indexers/${runId}/jobs/seed-write.json`
    )
  );
  const timeoutMs = Number.parseInt(
    getArgOr(args, 'timeout-ms', process.env.E2E_INDEXERS_TIMEOUT_MS || '10000'),
    10
  );
  const idCheckTimeoutMs = Number.parseInt(
    getArgOr(args, 'id-check-timeout-ms', process.env.E2E_INDEXERS_IDCHECK_TIMEOUT_MS || '120000'),
    10
  );
  const idCheckPollMs = Number.parseInt(
    getArgOr(args, 'id-check-poll-ms', process.env.E2E_INDEXERS_IDCHECK_POLL_MS || '2000'),
    10
  );
  const idCheckConcurrency = Number.parseInt(
    getArgOr(args, 'id-check-concurrency', process.env.E2E_INDEXERS_IDCHECK_CONCURRENCY || '8'),
    10
  );

  const baseUrl = resolveBaseUrl(args, backendRaw, transportRaw);
  const errors = [];

  const seedArtifact = readJson(seedArtifactPath);
  const expected = normalizeExpected(seedArtifact?.expected);

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
    seedArtifactPath,
    leaderboardAssets: [],
    globalStats: {
      total_agents: null,
      total_feedbacks: null,
      total_collections: null,
    },
    idChecks: {
      enabled: Boolean(expected),
      passed: null,
      attempts: 0,
      durationMs: 0,
      expected: {
        agents: expected?.agents.length || 0,
        feedbacks: expected?.feedbacks.length || 0,
        pendingValidations: expected?.pendingValidations.length || 0,
        agentUriMetadata: expected?.agentUriMetadata.length || 0,
        collections: expected?.collections.length || 0,
      },
      observed: {
        agentsFound: 0,
        feedbacksFound: 0,
        pendingValidationsFound: 0,
        agentUriMetadataFound: 0,
        collectionsFound: 0,
      },
      hashes: {
        agents: null,
        feedbacks: null,
        pendingValidations: null,
        agentUriMetadata: null,
        collections: null,
      },
      errors: [],
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
    artifact.globalStats.total_feedbacks = Number.isFinite(stats?.total_feedbacks)
      ? stats.total_feedbacks
      : null;
    artifact.globalStats.total_collections = Number.isFinite(stats?.total_collections)
      ? stats.total_collections
      : null;
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

  if (expected) {
    try {
      const idCheck = await evaluateIdChecksWithRetry(client, expected, {
        timeoutMs: idCheckTimeoutMs,
        pollMs: idCheckPollMs,
        concurrency: idCheckConcurrency,
        transport: transportRaw,
      });
      artifact.idChecks.passed = idCheck.passed;
      artifact.idChecks.attempts = idCheck.attempts;
      artifact.idChecks.durationMs = idCheck.durationMs;
      artifact.idChecks.expected = idCheck.expected;
      artifact.idChecks.observed = idCheck.observed;
      artifact.idChecks.hashes = idCheck.hashes;
      artifact.idChecks.errors = idCheck.errors.slice(0, 200);
      if (!idCheck.passed) {
        errors.push(
          `ID coherence check failed (${idCheck.errors.length} mismatches after ${idCheck.attempts} attempts)`
        );
      }
    } catch (error) {
      artifact.idChecks.passed = false;
      artifact.idChecks.errors = [`fatal:${errorMessage(error)}`];
      errors.push(`ID coherence check error: ${errorMessage(error)}`);
    }
  }

  artifact.status = inferStatus(artifact.available, errors, baseUrl);
  if (artifact.idChecks.enabled && artifact.idChecks.passed === false) {
    artifact.status = 'failed';
  }
  writeJson(artifactPath, artifact);
  console.log(`Check artifact: ${artifactPath}`);

  if (artifact.status === 'failed') {
    process.exitCode = 1;
  }
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}

export {
  canonicalAgentIdForAsset,
  evaluateIdChecks,
  evaluateIdChecksWithRetry,
  extractAgentId,
  normalizeAgentIdValue,
};
