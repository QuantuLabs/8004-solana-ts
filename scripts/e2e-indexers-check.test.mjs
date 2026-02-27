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
  };
}

test('agent id helpers normalize explicit and derived IDs', () => {
  assert.equal(canonicalAgentIdForAsset('abc'), 'sol:abc');
  assert.equal(normalizeAgentIdValue(' 42 '), '42');
  assert.equal(normalizeAgentIdValue(8), '8');

  const explicit = extractAgentId({ global_id: 7 }, 'asset-a');
  assert.equal(explicit.value, '7');
  assert.equal(explicit.explicit, true);

  const derived = extractAgentId({}, 'asset-b');
  assert.equal(derived.value, 'sol:asset-b');
  assert.equal(derived.explicit, false);
});

test('evaluateIdChecks flags null and nondeterministic agent ids', async () => {
  const client = makeClient({
    assetA: [makeAgent('ownerA', { id: 'sol:assetA' }), makeAgent('ownerA', { id: 'sol:assetA:v2' })],
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

test('evaluateIdChecks accepts deterministic fallback ids when explicit id fields are absent', async () => {
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

  assert.equal(result.passed, true);
  assert.equal(result.errors.length, 0);
});
