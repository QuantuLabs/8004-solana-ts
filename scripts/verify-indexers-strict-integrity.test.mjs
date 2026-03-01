import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCanonicalIndex,
  compareIndexers,
  evaluateIdInvariants,
  evaluateTxSignatureChecks,
  evaluateVerdict,
} from "./verify-indexers-strict-integrity.mjs";

const ENTITY_TABLES = [
  "agents",
  "feedbacks",
  "feedback_responses",
  "revocations",
  "collections",
  "metadata",
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseRows() {
  return {
    agents: [
      {
        asset: "assetA",
        agent_id: 1,
        owner: "ownerA",
        creator: "ownerA",
        agent_uri: "ipfs://agentA",
        atom_enabled: true,
        collection: "colA",
        canonical_col: "colA",
        col_locked: false,
        parent_asset: null,
        parent_creator: null,
        parent_locked: false,
        block_slot: 10,
        tx_index: 0,
        event_ordinal: 0,
        tx_signature: "3z9XAMHajUZX5RdYCD8u95E6HizCr8y4JNTDmq2Yv4iX89yfhq3xCCahfM9VKfN5kYDxURnA3axPdLqV7zZ4YnpF",
        status: "PENDING",
      },
    ],
    feedbacks: [
      {
        asset: "assetA",
        client_address: "clientA",
        feedback_index: 0,
        feedback_id: 1,
        value: "42",
        value_decimals: 0,
        score: 90,
        tag1: "quality",
        tag2: "latency",
        endpoint: "https://service.dev/a",
        feedback_uri: "ipfs://feedbackA",
        feedback_hash: "\\xabcdef",
        block_slot: 11,
        tx_index: 0,
        event_ordinal: 0,
        tx_signature: "2MNN8o2j7k7YxH5s6h2c5RvfCM8R7QLmGqJYDbV2Q1RcA1xDZ33S3hnyVJ5LQGH9tVJ4mBfX8aY2egMuM72tWiV4",
        status: "PENDING",
      },
    ],
    feedback_responses: [
      {
        asset: "assetA",
        client_address: "clientA",
        feedback_index: 0,
        response_id: 1,
        responder: "ownerA",
        response_uri: "ipfs://respA",
        response_hash: "0x1234",
        block_slot: 12,
        tx_index: 0,
        event_ordinal: 0,
        tx_signature: "2dQmLjPG8L6iVT5pu4B5h2B2zY2Zmj2JsD6dz4AETV9WF8rvzow1fvNwQm5J2n1ZjvWVeApMY9H8J2M5d9s4EFrg",
        status: "PENDING",
      },
    ],
    revocations: [
      {
        asset: "assetA",
        client_address: "clientA",
        feedback_index: 0,
        revocation_id: 1,
        feedback_hash: "0x9999",
        original_score: 90,
        atom_enabled: true,
        had_impact: true,
        revoke_count: 1,
        slot: 13,
        tx_index: 0,
        event_ordinal: 0,
        tx_signature: "4fydkQQj7Yfg1XuJUEvN4RZJWRsYwTQ8QCYQjQk5BcPqX6nYc6zvUzgSq8QxxdWf8MM8uK9pQzP2X3TyqvU8f2N2",
        status: "PENDING",
      },
    ],
    collections: [
      {
        collection: "colA",
        creator: "ownerA",
        first_seen_asset: "assetA",
        first_seen_slot: 10,
        first_seen_tx_signature:
          "3z9XAMHajUZX5RdYCD8u95E6HizCr8y4JNTDmq2Yv4iX89yfhq3xCCahfM9VKfN5kYDxURnA3axPdLqV7zZ4YnpF",
        asset_count: 1,
        version: "1",
        name: "Collection A",
        symbol: "CA",
        description: "desc",
        image: "ipfs://img",
        status: "PENDING",
      },
    ],
    metadata: [
      {
        asset: "assetA",
        key: "profile",
        value: "\\x616263",
        immutable: false,
        block_slot: 14,
        tx_index: 0,
        event_ordinal: 0,
        tx_signature: "2YhU7yW2z4aX8U5f2nM7qFQw7rZZu4JvJzQmxX8xgA1C95kZu8m4rVQ5bLEQ1g4mT9x6EuX6Qne1nUuK3NnQKV6h",
        status: "PENDING",
      },
    ],
  };
}

function makeCoverageEntry(table, rows) {
  const canonical = buildCanonicalIndex(table, rows);
  return {
    table,
    endpoint: table,
    supported: true,
    pages: 1,
    count: rows.length,
    includeOrphaned: { requested: true, used: true, fallbackToPlain: false },
    canonical,
    hash: canonical.payloadHash,
    errors: [],
  };
}

function makeReport(baseUrl, rowsByEntity) {
  const coverage = {};
  for (const table of ENTITY_TABLES) {
    coverage[table] = makeCoverageEntry(table, rowsByEntity[table]);
  }

  return {
    baseUrl,
    available: true,
    errors: [],
    coverage,
    idInvariants: { passed: true, failedChecks: [] },
    txSignatureChecks: { passed: true, failingTables: [] },
  };
}

test("evaluateIdInvariants passes for contiguous ids", () => {
  const result = evaluateIdInvariants({
    agents: [{ agent_id: 1 }, { agent_id: 2 }],
    feedbacks: [
      { asset: "A", client_address: "C1", feedback_id: 1, feedback_index: 0 },
      { asset: "A", client_address: "C1", feedback_id: 2, feedback_index: 1 },
    ],
    feedbackResponses: [
      { asset: "A", client_address: "C1", feedback_index: 0, response_id: 1 },
      { asset: "A", client_address: "C1", feedback_index: 0, response_id: 2 },
    ],
    revocations: [{ asset: "A", revocation_id: 1 }, { asset: "A", revocation_id: 2 }],
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.failedChecks, []);
});

test("evaluateTxSignatureChecks flags missing and invalid tx signatures", () => {
  const result = evaluateTxSignatureChecks({
    feedbacks: [{ asset: "A", client_address: "C1", feedback_index: 0, feedback_id: 1, tx_signature: "" }],
    feedbackResponses: [
      { asset: "A", client_address: "C1", feedback_index: 0, response_id: 1, tx_signature: "not_base58!!!" },
    ],
    revocations: [{ asset: "A", client_address: "C1", feedback_index: 0, revocation_id: 1, tx_signature: null }],
  });

  assert.equal(result.passed, false);
  assert.ok(result.failingTables.includes("feedbacks"));
  assert.ok(result.failingTables.includes("feedback_responses"));
  assert.ok(result.failingTables.includes("revocations"));
  assert.equal(result.checks.feedbacks.missingCount, 1);
  assert.equal(result.checks.feedback_responses.invalidFormatCount, 1);
});

test("compareIndexers normalizes metadata binary prefixes across modes", () => {
  const leftRows = baseRows();
  const rightRows = clone(leftRows);
  rightRows.metadata[0].value = "0x616263";

  const left = makeReport("i1", leftRows);
  const right = makeReport("i2", rightRows);

  const comparison = compareIndexers([left, right]);
  assert.equal(comparison.mismatchCount, 0);
});

test("compareIndexers reports payload mismatches with sample keys", () => {
  const leftRows = baseRows();
  const rightRows = clone(leftRows);
  rightRows.feedbacks[0].score = 77;

  const left = makeReport("i1", leftRows);
  const right = makeReport("i2", rightRows);

  const comparison = compareIndexers([left, right]);
  assert.ok(comparison.mismatchCount > 0);

  const mismatch = comparison.mismatches.find((m) => m.table === "feedbacks");
  assert.ok(mismatch);
  assert.equal(mismatch.kind, "canonical");
  assert.ok(mismatch.payloadDiffCount > 0);
  assert.ok(Array.isArray(mismatch.samples.payloadDiff));
  assert.ok(mismatch.samples.payloadDiff.length > 0);
});

test("evaluateVerdict fails when tx signature checks fail", () => {
  const rows = baseRows();
  const report = makeReport("i1", rows);
  report.txSignatureChecks = {
    passed: false,
    failingTables: ["feedbacks"],
    checks: {},
  };

  const verdict = evaluateVerdict([report], { mismatchCount: 0, mismatches: [] });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.failingIndexers.length, 1);
  assert.ok(verdict.failingIndexers[0].problems.some((p) => p.startsWith("tx_signature:")));
});
