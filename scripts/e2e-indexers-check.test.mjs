import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalAgentIdForAsset,
  evaluateIdChecks,
  extractAgentId,
  normalizeAgentIdValue,
} from './e2e-indexers-check.mjs';

function makeAgent(owner, overrides = {}) {
  return {
    owner,
    collection_pointer: null,
    parent_asset: null,
    col_locked: false,
    parent_locked: false,
    ...overrides,
  };
}

function makeClient(agentSequencesByAsset) {
  const counters = new Map();
  return {
    async getAgent(asset) {
      const sequence = agentSequencesByAsset[asset] || [];
      const index = counters.get(asset) || 0;
      counters.set(asset, index + 1);
      const row = sequence[Math.min(index, sequence.length - 1)] || null;
      return row ? { ...row } : null;
    },
    async getPendingValidations() {
      return [];
    },
  };
}

function expectedAgents(rows) {
  return {
    agents: rows.map((row) => ({
      asset: row.asset,
      owner: row.owner,
      col: null,
      colLocked: null,
      parentAsset: null,
      parentLocked: null,
    })),
    feedbacks: [],
    pendingValidations: [],
    agentUriMetadata: [],
    collections: [],
  };
}

test('agent id helpers normalize explicit and derived IDs', () => {
  assert.equal(canonicalAgentIdForAsset('abc'), null);
  assert.equal(normalizeAgentIdValue(' 42 '), '42');
  assert.equal(normalizeAgentIdValue(8), '8');

  const explicit = extractAgentId({ global_id: 7 }, 'asset-a');
  assert.equal(explicit.value, '7');
  assert.equal(explicit.explicit, true);

  const derived = extractAgentId({}, 'asset-b');
  assert.equal(derived.value, null);
  assert.equal(derived.source, 'missing');
  assert.equal(derived.explicit, false);
});

test('evaluateIdChecks flags null and nondeterministic agent ids', async () => {
  const client = makeClient({
    assetA: [makeAgent('ownerA', { id: 'assetA' }), makeAgent('ownerA', { id: 'assetA:v2' })],
    assetB: [makeAgent('ownerB', { id: null }), makeAgent('ownerB', { id: null })],
  });

  const result = await evaluateIdChecks(
    client,
    expectedAgents([
      { asset: 'assetA', owner: 'ownerA' },
      { asset: 'assetB', owner: 'ownerB' },
    ]),
    { concurrency: 2 }
  );

  assert.equal(result.passed, false);
  assert.ok(
    result.errors.some((line) => line.startsWith('agent.agentId.nondeterministic:assetA'))
  );
  assert.ok(result.errors.some((line) => line === 'agent.agentId.null:assetB'));
  assert.ok(result.errors.some((line) => line === 'agent.agentId.null_refetch:assetB'));
});

test('evaluateIdChecks flags duplicate agent ids across expected assets', async () => {
  const client = makeClient({
    assetA: [makeAgent('ownerA', { id: 'dup-agent-id' }), makeAgent('ownerA', { id: 'dup-agent-id' })],
    assetB: [makeAgent('ownerB', { id: 'dup-agent-id' }), makeAgent('ownerB', { id: 'dup-agent-id' })],
  });

  const result = await evaluateIdChecks(
    client,
    expectedAgents([
      { asset: 'assetA', owner: 'ownerA' },
      { asset: 'assetB', owner: 'ownerB' },
    ]),
    { concurrency: 2 }
  );

  assert.equal(result.passed, false);
  assert.ok(result.errors.some((line) => line.startsWith('agent.agentId.duplicate:dup-agent-id')));
});

test('evaluateIdChecks flags missing ids when explicit id fields are absent', async () => {
  const client = makeClient({
    assetA: [makeAgent('ownerA'), makeAgent('ownerA')],
    assetB: [makeAgent('ownerB'), makeAgent('ownerB')],
  });

  const result = await evaluateIdChecks(
    client,
    expectedAgents([
      { asset: 'assetA', owner: 'ownerA' },
      { asset: 'assetB', owner: 'ownerB' },
    ]),
    { concurrency: 2 }
  );

  assert.equal(result.passed, false);
  assert.ok(result.errors.some((line) => line === 'agent.agentId.missing:assetA'));
  assert.ok(result.errors.some((line) => line === 'agent.agentId.missing:assetB'));
});

test('evaluateIdChecks normalizes URL trailing slashes for URI and collection digests', async () => {
  const client = makeClient({
    assetA: [makeAgent('ownerA', { id: 'assetA' }), makeAgent('ownerA', { id: 'assetA' })],
  });
  client.getMetadata = async () => [
    { key: '_uri:name', value: 'Agent A' },
    { key: '_uri:description', value: 'Metadata body' },
    { key: '_uri:image', value: 'https://cdn.example.com/agent-a.png/' },
  ];
  client.getCollectionPointers = async () => [
    {
      collection: 'c1:alpha',
      version: '1.0.0',
      name: 'Alpha Collection',
      symbol: 'ALPHA',
      description: 'Collection digest',
      image: 'ipfs://bafyalphaimage',
      banner_image: 'ipfs://bafyalphabanner',
      social_website: 'https://quantu.ai/',
      social_x: '@quantu_labs',
      social_discord: 'https://discord.gg/quantu/',
    },
  ];

  const expected = expectedAgents([{ asset: 'assetA', owner: 'ownerA' }]);
  expected.agentUriMetadata.push({
    asset: 'assetA',
    '_uri:name': 'Agent A',
    '_uri:description': 'Metadata body',
    '_uri:image': 'https://cdn.example.com/agent-a.png',
  });
  expected.collections.push({
    pointer: 'c1:alpha',
    version: '1.0.0',
    name: 'Alpha Collection',
    symbol: 'ALPHA',
    description: 'Collection digest',
    image: 'ipfs://bafyalphaimage',
    banner_image: 'ipfs://bafyalphabanner',
    social_website: 'https://quantu.ai',
    social_x: '@quantu_labs',
    social_discord: 'https://discord.gg/quantu',
  });

  const result = await evaluateIdChecks(client, expected, { concurrency: 2, transport: 'rest' });

  assert.equal(result.passed, true);
  assert.equal(result.errors.length, 0);
  assert.ok(typeof result.hashes.agentUriMetadata === 'string');
  assert.ok(typeof result.hashes.collections === 'string');
});

test('evaluateIdChecks flags mismatched URI metadata and collection digests', async () => {
  const client = makeClient({
    assetA: [makeAgent('ownerA', { id: 'assetA' }), makeAgent('ownerA', { id: 'assetA' })],
  });
  client.getMetadata = async () => [
    { key: '_uri:name', value: 'Agent A' },
    { key: '_uri:description', value: 'Wrong description' },
    { key: '_uri:image', value: 'ipfs://bafyasseta' },
  ];
  client.getCollectionPointers = async () => [
    {
      collection: 'c1:alpha',
      version: '1.0.0',
      name: 'Alpha Collection',
      symbol: 'WRONG',
      description: 'Collection digest',
      image: 'ipfs://bafyalphaimage',
      banner_image: 'ipfs://bafyalphabanner',
      social_website: 'https://quantu.ai',
      social_x: '@quantu_labs',
      social_discord: 'https://discord.gg/quantu',
    },
  ];

  const expected = expectedAgents([{ asset: 'assetA', owner: 'ownerA' }]);
  expected.agentUriMetadata.push({
    asset: 'assetA',
    '_uri:name': 'Agent A',
    '_uri:description': 'Expected description',
    '_uri:image': 'ipfs://bafyasseta',
  });
  expected.collections.push({
    pointer: 'c1:alpha',
    version: '1.0.0',
    name: 'Alpha Collection',
    symbol: 'ALPHA',
    description: 'Collection digest',
    image: 'ipfs://bafyalphaimage',
    banner_image: 'ipfs://bafyalphabanner',
    social_website: 'https://quantu.ai',
    social_x: '@quantu_labs',
    social_discord: 'https://discord.gg/quantu',
  });

  const result = await evaluateIdChecks(client, expected, { concurrency: 2, transport: 'rest' });

  assert.equal(result.passed, false);
  assert.ok(
    result.errors.some((line) => line.startsWith('uri_metadata.field:assetA:_uri:description'))
  );
  assert.ok(result.errors.some((line) => line.startsWith('collection.field:c1:alpha:symbol')));
});

test('evaluateIdChecks skips pending validation checks when validation feature is archived', async () => {
  const client = makeClient({
    assetA: [makeAgent('ownerA', { id: 'assetA' }), makeAgent('ownerA', { id: 'assetA' })],
  });
  client.getPendingValidations = async () => {
    throw new Error('Validation feature is archived (v0.5.0+) and is not exposed by indexers.');
  };

  const expected = expectedAgents([{ asset: 'assetA', owner: 'ownerA' }]);
  expected.pendingValidations.push({
    asset: 'assetA',
    validator: 'validatorA',
    nonce: 1n,
  });

  const result = await evaluateIdChecks(client, expected, { concurrency: 2, transport: 'rest' });

  assert.equal(result.passed, true);
  assert.equal(result.expected.pendingValidations, 0);
  assert.equal(result.observed.pendingValidationsFound, 0);
  assert.equal(result.hashes.pendingValidations, null);
  assert.ok(result.errors.every((line) => !line.startsWith('validation.')));
});

test('evaluateIdChecks fails when indexer exposes archived pending validation reads', async () => {
  const client = makeClient({
    assetA: [makeAgent('ownerA', { id: 'assetA' }), makeAgent('ownerA', { id: 'assetA' })],
  });
  client.getPendingValidations = async () => [
    { asset: 'assetA', nonce: 1n },
  ];

  const expected = expectedAgents([{ asset: 'assetA', owner: 'ownerA' }]);
  expected.pendingValidations.push({
    asset: 'assetA',
    validator: 'validatorA',
    nonce: 1n,
  });

  const result = await evaluateIdChecks(client, expected, { concurrency: 2, transport: 'rest' });

  assert.equal(result.passed, false);
  assert.ok(result.errors.some((line) => line === 'validation.archived_exposed:validatorA:rows=1'));
});
