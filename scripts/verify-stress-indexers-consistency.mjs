#!/usr/bin/env node

import { createHash } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

function nowId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(
    d.getUTCHours()
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function asNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stableHash(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const hash = createHash("sha256");
  for (const line of lines.slice().sort()) {
    hash.update(line);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

function groupBy(values, keyFn) {
  const map = new Map();
  for (const value of values) {
    const key = keyFn(value);
    const bucket = map.get(key);
    if (bucket) bucket.push(value);
    else map.set(key, [value]);
  }
  return map;
}

async function fetchJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let payload = null;
    try {
      payload = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    return { ok: res.ok, status: res.status, payload, raw: text };
  } finally {
    clearTimeout(timer);
  }
}

function rootFromRest(baseUrl) {
  return baseUrl.replace(/\/rest\/v1\/?$/i, "");
}

function listToInFilter(values) {
  const escaped = values.map((value) =>
    String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
  );
  return `in.(${escaped.map((value) => `"${value}"`).join(",")})`;
}

function safeString(value) {
  return value === null || value === undefined ? "" : String(value);
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

async function fetchTableByAssets({ baseUrl, table, select, assets, chunkSize, timeoutMs }) {
  const rows = [];
  const errors = [];
  const groups = chunk(assets, chunkSize);
  for (const group of groups) {
    const u = new URL(`${baseUrl}/${table}`);
    u.searchParams.set("select", select);
    u.searchParams.set("asset", listToInFilter(group));
    u.searchParams.set("limit", "100000");
    const r = await fetchJson(u.toString(), timeoutMs);
    if (!r.ok) {
      errors.push(`${table}:HTTP ${r.status}`);
      continue;
    }
    if (Array.isArray(r.payload)) rows.push(...r.payload);
  }
  return { rows, errors };
}

function checkContiguous(values, startAtZero = false) {
  if (values.length === 0) return { ok: true, error: null };
  const sorted = values.slice().sort((a, b) => a - b);
  if (startAtZero && sorted[0] !== 0) {
    return { ok: false, error: `starts_at_${sorted[0]}_expected_0` };
  }
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      return { ok: false, error: `gap_${sorted[i - 1]}_${sorted[i]}` };
    }
  }
  return { ok: true, error: null };
}

function canonicalizeAgents(rows) {
  return rows.map((row) =>
    [
      safeString(row.asset),
      safeString(row.agent_id),
      safeString(row.owner),
      safeString(row.creator),
      safeString(row.agent_uri),
      safeString(row.col ?? row.collection),
      safeString(row.parent_asset),
      safeString(row.col_locked),
      safeString(row.parent_locked),
    ].join("|")
  );
}

function canonicalizeFeedbacks(rows) {
  return rows.map((row) =>
    [
      safeString(row.asset),
      safeString(row.client_address),
      safeString(row.feedback_index),
      safeString(row.feedback_id),
      safeString(row.status),
      safeString(row.slot ?? row.block_slot),
    ].join("|")
  );
}

function canonicalizeResponses(rows) {
  return rows.map((row) =>
    [
      safeString(row.asset),
      safeString(row.client_address),
      safeString(row.feedback_index),
      safeString(row.response_id),
      safeString(row.status),
      safeString(row.slot ?? row.block_slot),
    ].join("|")
  );
}

function canonicalizeRevocations(rows) {
  return rows.map((row) =>
    [
      safeString(row.asset),
      safeString(row.client_address),
      safeString(row.feedback_index),
      safeString(row.revocation_id),
      safeString(row.status),
      safeString(row.slot ?? row.block_slot),
    ].join("|")
  );
}

function uniq(values) {
  return [...new Set(values)];
}

async function analyzeIndexer({
  baseUrl,
  assets,
  expectedFeedbackPairs,
  chunkSize,
  timeoutMs,
}) {
  const root = rootFromRest(baseUrl);
  const result = {
    baseUrl,
    root,
    available: false,
    stats: null,
    counts: {
      expectedAssets: assets.length,
      foundAssets: 0,
      missingAssets: 0,
      expectedFeedbackPairs: expectedFeedbackPairs.length,
      foundFeedbackPairs: 0,
      missingFeedbackPairs: 0,
    },
    ids: {
      agentsNullId: 0,
      feedbacksNullId: 0,
      responsesNullId: 0,
      revocationsNullId: 0,
      feedbackIndexGapScopes: [],
      feedbackIdGapScopes: [],
      responseIdGapScopes: [],
      revocationIdGapScopes: [],
    },
    hashes: {
      agents: null,
      feedbacks: null,
      responses: null,
      revocations: null,
    },
    missingAssets: [],
    missingFeedbackPairs: [],
    errors: [],
  };

  const health = await fetchJson(`${root}/health`, timeoutMs);
  result.available = health.ok;
  if (!health.ok) {
    result.errors.push(`health_http_${health.status}`);
    return result;
  }

  const statsRes = await fetchJson(`${baseUrl}/stats`, timeoutMs);
  if (statsRes.ok) result.stats = statsRes.payload;
  else result.errors.push(`stats_http_${statsRes.status}`);

  const [agentsRes, feedbackRes, responseRes, revokeRes] = await Promise.all([
    fetchTableByAssets({
      baseUrl,
      table: "agents",
      select:
        "asset,agent_id,owner,creator,agent_uri,collection,parent_asset,col_locked,parent_locked,status",
      assets,
      chunkSize,
      timeoutMs,
    }),
    fetchTableByAssets({
      baseUrl,
      table: "feedbacks",
      select:
        "asset,client_address,feedback_index,feedback_id,status,block_slot",
      assets,
      chunkSize,
      timeoutMs,
    }),
    fetchTableByAssets({
      baseUrl,
      table: "feedback_responses",
      select:
        "asset,client_address,feedback_index,response_id,status,block_slot",
      assets,
      chunkSize,
      timeoutMs,
    }),
    fetchTableByAssets({
      baseUrl,
      table: "revocations",
      select:
        "asset,client_address,feedback_index,revocation_id,status,slot",
      assets,
      chunkSize,
      timeoutMs,
    }),
  ]);

  result.errors.push(
    ...agentsRes.errors,
    ...feedbackRes.errors,
    ...responseRes.errors,
    ...revokeRes.errors
  );

  const agents = agentsRes.rows.filter((r) => String(r.status || "").toUpperCase() !== "ORPHANED");
  const feedbacks = feedbackRes.rows.filter((r) => String(r.status || "").toUpperCase() !== "ORPHANED");
  const responses = responseRes.rows.filter((r) => String(r.status || "").toUpperCase() !== "ORPHANED");
  const revocations = revokeRes.rows.filter((r) => String(r.status || "").toUpperCase() !== "ORPHANED");

  const foundAssetsSet = new Set(agents.map((r) => r.asset));
  result.counts.foundAssets = foundAssetsSet.size;
  result.missingAssets = assets.filter((a) => !foundAssetsSet.has(a));
  result.counts.missingAssets = result.missingAssets.length;

  const foundFeedbackPairsSet = new Set(
    feedbacks.map((r) => `${safeString(r.asset)}|${safeString(r.client_address)}`)
  );
  result.counts.foundFeedbackPairs = expectedFeedbackPairs.filter((k) => foundFeedbackPairsSet.has(k)).length;
  result.missingFeedbackPairs = expectedFeedbackPairs.filter((k) => !foundFeedbackPairsSet.has(k));
  result.counts.missingFeedbackPairs = result.missingFeedbackPairs.length;

  result.ids.agentsNullId = agents.filter((r) => asNumber(r.agent_id) === null).length;
  result.ids.feedbacksNullId = feedbacks.filter((r) => asNumber(r.feedback_id) === null).length;
  result.ids.responsesNullId = responses.filter((r) => asNumber(r.response_id) === null).length;
  result.ids.revocationsNullId = revocations.filter((r) => asNumber(r.revocation_id) === null).length;

  const feedbackByAsset = groupBy(feedbacks, (r) => safeString(r.asset));
  for (const [asset, rows] of feedbackByAsset.entries()) {
    const indexes = rows.map((r) => asNumber(r.feedback_index)).filter((n) => n !== null);
    const ids = rows.map((r) => asNumber(r.feedback_id)).filter((n) => n !== null);
    const idxCheck = checkContiguous(indexes, true);
    if (!idxCheck.ok) result.ids.feedbackIndexGapScopes.push({ asset, error: idxCheck.error });
    const idCheck = checkContiguous(ids, false);
    if (!idCheck.ok) result.ids.feedbackIdGapScopes.push({ asset, error: idCheck.error });
  }

  const responseByScope = groupBy(
    responses,
    (r) => `${safeString(r.asset)}|${safeString(r.client_address)}|${safeString(r.feedback_index)}`
  );
  for (const [scope, rows] of responseByScope.entries()) {
    const ids = rows.map((r) => asNumber(r.response_id)).filter((n) => n !== null);
    const check = checkContiguous(ids, false);
    if (!check.ok) result.ids.responseIdGapScopes.push({ scope, error: check.error });
  }

  const revokeByAsset = groupBy(revocations, (r) => safeString(r.asset));
  for (const [asset, rows] of revokeByAsset.entries()) {
    const ids = rows.map((r) => asNumber(r.revocation_id)).filter((n) => n !== null);
    const check = checkContiguous(ids, false);
    if (!check.ok) result.ids.revocationIdGapScopes.push({ asset, error: check.error });
  }

  result.hashes.agents = stableHash(canonicalizeAgents(agents));
  result.hashes.feedbacks = stableHash(canonicalizeFeedbacks(feedbacks));
  result.hashes.responses = stableHash(canonicalizeResponses(responses));
  result.hashes.revocations = stableHash(canonicalizeRevocations(revocations));

  return result;
}

function compareIndexers(indexers) {
  if (indexers.length < 2) return { equal: true, mismatches: [] };
  const ref = indexers[0];
  const mismatches = [];
  for (let i = 1; i < indexers.length; i += 1) {
    const other = indexers[i];
    for (const field of ["agents", "feedbacks", "responses", "revocations"]) {
      if (ref.hashes[field] !== other.hashes[field]) {
        mismatches.push({
          field: `hashes.${field}`,
          left: ref.baseUrl,
          right: other.baseUrl,
          leftValue: ref.hashes[field],
          rightValue: other.hashes[field],
        });
      }
    }
    if (ref.counts.missingAssets !== other.counts.missingAssets) {
      mismatches.push({
        field: "counts.missingAssets",
        left: ref.baseUrl,
        right: other.baseUrl,
        leftValue: ref.counts.missingAssets,
        rightValue: other.counts.missingAssets,
      });
    }
    if (ref.counts.missingFeedbackPairs !== other.counts.missingFeedbackPairs) {
      mismatches.push({
        field: "counts.missingFeedbackPairs",
        left: ref.baseUrl,
        right: other.baseUrl,
        leftValue: ref.counts.missingFeedbackPairs,
        rightValue: other.counts.missingFeedbackPairs,
      });
    }
  }
  return { equal: mismatches.length === 0, mismatches };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const indexersArg = args.indexers || process.env.INDEXER_URLS || "";
  const assetsFile = args["assets-file"];
  const baselineFile = args["baseline-file"] || null;
  const chunkSize = Number.parseInt(args["chunk-size"] || "80", 10);
  const timeoutMs = Number.parseInt(args["timeout-ms"] || "20000", 10);
  const maxAssets = args["max-assets"] ? Number.parseInt(args["max-assets"], 10) : null;
  const outPath =
    args.output ||
    resolve(
      process.cwd(),
      `artifacts/e2e-indexers/stress-consistency-${nowId()}/report.json`
    );

  if (!indexersArg) throw new Error("--indexers is required (comma-separated REST base urls)");
  if (!assetsFile) throw new Error("--assets-file is required");

  const indexers = indexersArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (indexers.length === 0) throw new Error("No indexers provided");

  let assets = readFileSync(resolve(process.cwd(), assetsFile), "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (maxAssets && Number.isFinite(maxAssets) && maxAssets > 0) {
    assets = assets.slice(0, maxAssets);
  }
  assets = uniq(assets);

  let expectedFeedbackPairs = [];
  if (baselineFile) {
    const baseline = JSON.parse(readFileSync(resolve(process.cwd(), baselineFile), "utf8"));
    if (Array.isArray(baseline.feedbacks)) {
      expectedFeedbackPairs = uniq(
        baseline.feedbacks
          .map((f) => `${safeString(f.asset)}|${safeString(f.client)}`)
          .filter((v) => v !== "|")
      );
    }
  }

  const reports = [];
  for (const baseUrl of indexers) {
    // eslint-disable-next-line no-await-in-loop
    const report = await analyzeIndexer({
      baseUrl,
      assets,
      expectedFeedbackPairs,
      chunkSize,
      timeoutMs,
    });
    reports.push(report);
  }

  const comparison = compareIndexers(reports);
  const final = {
    generatedAt: new Date().toISOString(),
    assetsEvaluated: assets.length,
    expectedFeedbackPairs: expectedFeedbackPairs.length,
    indexers: reports,
    comparison,
  };

  ensureDir(outPath);
  writeFileSync(outPath, `${JSON.stringify(final, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        report: outPath,
        assetsEvaluated: final.assetsEvaluated,
        expectedFeedbackPairs: final.expectedFeedbackPairs,
        equalAcrossIndexers: comparison.equal,
        mismatchCount: comparison.mismatches.length,
      },
      null,
      2
    )
  );

  const hasErrors = reports.some((r) => r.errors.length > 0);
  const hasIdProblems = reports.some(
    (r) =>
      r.ids.agentsNullId > 0 ||
      r.ids.feedbacksNullId > 0 ||
      r.ids.responsesNullId > 0 ||
      r.ids.revocationsNullId > 0 ||
      r.ids.feedbackIndexGapScopes.length > 0 ||
      r.ids.feedbackIdGapScopes.length > 0 ||
      r.ids.responseIdGapScopes.length > 0 ||
      r.ids.revocationIdGapScopes.length > 0
  );
  if (hasErrors || hasIdProblems || !comparison.equal) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
