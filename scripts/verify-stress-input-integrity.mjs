#!/usr/bin/env node

import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";

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

function toInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return null;
}

function toStringOrNull(value) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length > 0 ? s : null;
}

function normalizeHex(value) {
  if (value === null || value === undefined) return null;
  let s = String(value).trim().toLowerCase();
  if (s.length === 0) return null;
  if (s.startsWith("\\x")) s = s.slice(2);
  if (s.startsWith("0x")) s = s.slice(2);
  return s.length > 0 ? s : null;
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
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function groupBy(values, keyFn) {
  const m = new Map();
  for (const value of values) {
    const key = keyFn(value);
    const current = m.get(key);
    if (current) current.push(value);
    else m.set(key, [value]);
  }
  return m;
}

function listToInFilter(values) {
  const escaped = values.map((value) =>
    String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
  );
  return `in.(${escaped.map((v) => `"${v}"`).join(",")})`;
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

async function fetchTableByAssets({ baseUrl, table, select, assets, chunkSize, timeoutMs }) {
  const rows = [];
  const errors = [];
  if (assets.length === 0) return { rows, errors };

  for (const group of chunk(assets, chunkSize)) {
    const u = new URL(`${baseUrl}/${table}`);
    u.searchParams.set("select", select);
    u.searchParams.set("asset", listToInFilter(group));
    u.searchParams.set("limit", "100000");
    const r = await fetchJson(u.toString(), timeoutMs);
    if (!r.ok) {
      const msg = typeof r.payload === "object" && r.payload?.message ? r.payload.message : r.raw;
      errors.push(`${table}:HTTP ${r.status}${msg ? `:${String(msg).slice(0, 160)}` : ""}`);
      continue;
    }
    if (Array.isArray(r.payload)) rows.push(...r.payload);
  }
  return { rows, errors };
}

function collectActionsFiles({ runsRoot, actionsFiles }) {
  if (actionsFiles) {
    return actionsFiles
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => resolve(v));
  }

  const root = resolve(runsRoot);
  if (!existsSync(root)) return [];
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "actions.jsonl");
    if (existsSync(file)) out.push(file);
  }
  return out.sort();
}

function normalizePhase(value) {
  return String(value ?? "").trim().toLowerCase();
}

function eventKey(type, event) {
  if (type === "agent") {
    return `${type}:${event.asset}|${event.owner}|${event.uri}|${event.txSignature ?? ""}`;
  }
  if (type === "feedback") {
    return `${type}:${event.asset}|${event.client}|${event.feedbackIndex ?? ""}|${event.value}|${event.valueDecimals}|${event.tag1}|${event.tag2}|${event.endpoint}|${event.feedbackUri}|${event.feedbackHash ?? ""}|${event.txSignature ?? ""}`;
  }
  if (type === "response") {
    return `${type}:${event.asset}|${event.client}|${event.feedbackIndex}|${event.responder}|${event.responseUri}|${event.responseHash ?? ""}|${event.txSignature ?? ""}`;
  }
  return `${type}:${event.asset}|${event.client}|${event.feedbackIndex}|${event.feedbackHash ?? ""}|${event.txSignature ?? ""}`;
}

function parseInputEvents(files) {
  const rawCounts = { register: 0, feedback: 0, response: 0, revoke: 0 };
  const dedup = {
    agent: new Map(),
    feedback: new Map(),
    response: new Map(),
    revoke: new Map(),
  };

  for (const file of files) {
    const lines = readFileSync(file, "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      let row;
      try {
        row = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (row?.success !== true) continue;
      const phase = normalizePhase(row.phase);
      const common = {
        sourceFile: file,
        line: i + 1,
        seq: toInt(row.seq),
        ts: toStringOrNull(row.ts),
        txSignature: toStringOrNull(row.txSignature),
      };

      if (phase === "register") {
        rawCounts.register += 1;
        const ev = {
          ...common,
          asset: toStringOrNull(row.asset ?? row.payload?.asset),
          owner: toStringOrNull(row.wallet ?? row.owner),
          uri: toStringOrNull(row.payload?.uri ?? row.payload?.agent_uri ?? row.uri),
          atomEnabled: toBool(row.payload?.atomEnabled ?? row.payload?.atom_enabled),
        };
        if (!ev.asset) continue;
        dedup.agent.set(eventKey("agent", ev), ev);
        continue;
      }

      if (phase === "feedback") {
        rawCounts.feedback += 1;
        const ev = {
          ...common,
          asset: toStringOrNull(row.asset ?? row.payload?.asset),
          client: toStringOrNull(row.client ?? row.client_address ?? row.wallet),
          feedbackIndex: toInt(row.feedbackIndex ?? row.feedback_index ?? row.payload?.feedbackIndex),
          value: toStringOrNull(row.payload?.value ?? row.value),
          valueDecimals: toInt(row.payload?.valueDecimals ?? row.valueDecimals ?? row.payload?.value_decimals),
          score: toInt(row.payload?.score ?? row.score),
          tag1: toStringOrNull(row.payload?.tag1 ?? row.tag1),
          tag2: toStringOrNull(row.payload?.tag2 ?? row.tag2),
          endpoint: toStringOrNull(row.payload?.endpoint ?? row.endpoint),
          feedbackUri: toStringOrNull(row.payload?.feedbackUri ?? row.feedbackUri ?? row.feedback_uri),
          feedbackHash: normalizeHex(
            row.sealHashHex ?? row.feedbackHashHex ?? row.payload?.feedbackHashHex ?? row.payload?.feedbackFileHashHex
          ),
        };
        if (!ev.asset || !ev.client) continue;
        dedup.feedback.set(eventKey("feedback", ev), ev);
        continue;
      }

      if (phase.includes("response")) {
        rawCounts.response += 1;
        const ev = {
          ...common,
          asset: toStringOrNull(row.asset ?? row.payload?.asset),
          client: toStringOrNull(row.client ?? row.client_address ?? row.payload?.client),
          feedbackIndex: toInt(row.feedbackIndex ?? row.feedback_index ?? row.payload?.feedbackIndex),
          responder: toStringOrNull(row.responder ?? row.wallet ?? row.payload?.responder),
          responseUri: toStringOrNull(row.payload?.responseUri ?? row.responseUri ?? row.response_uri),
          responseHash: normalizeHex(row.responseHashHex ?? row.payload?.responseHashHex ?? row.response_hash),
        };
        if (!ev.asset) continue;
        dedup.response.set(eventKey("response", ev), ev);
        continue;
      }

      if (phase.includes("revoke")) {
        rawCounts.revoke += 1;
        const ev = {
          ...common,
          asset: toStringOrNull(row.asset ?? row.payload?.asset),
          client: toStringOrNull(row.client ?? row.client_address ?? row.payload?.client),
          feedbackIndex: toInt(row.feedbackIndex ?? row.feedback_index ?? row.payload?.feedbackIndex),
          feedbackHash: normalizeHex(
            row.feedbackHashHex ?? row.sealHashHex ?? row.payload?.feedbackHashHex ?? row.payload?.feedbackFileHashHex
          ),
          originalScore: toInt(row.originalScore ?? row.payload?.originalScore),
          atomEnabled: toBool(row.atomEnabled ?? row.payload?.atomEnabled),
        };
        if (!ev.asset) continue;
        dedup.revoke.set(eventKey("revoke", ev), ev);
      }
    }
  }

  return {
    files,
    rawCounts,
    expected: {
      agents: [...dedup.agent.values()],
      feedbacks: [...dedup.feedback.values()],
      responses: [...dedup.response.values()],
      revocations: [...dedup.revoke.values()],
    },
  };
}

function chainSortKey(row, slotField = "block_slot") {
  const slot = toInt(row?.[slotField]) ?? toInt(row?.slot) ?? -1;
  const txIndex = toInt(row?.tx_index) ?? -1;
  const eventOrdinal = toInt(row?.event_ordinal) ?? -1;
  const tx = toStringOrNull(row?.tx_signature) ?? "";
  return `${String(slot).padStart(20, "0")}:${String(txIndex).padStart(8, "0")}:${String(eventOrdinal).padStart(8, "0")}:${tx}`;
}

function compareExact(expected, actual) {
  if (expected === null || expected === undefined) return null;
  if (actual === null || actual === undefined) return `expected=${expected} actual=${actual}`;
  if (String(expected) !== String(actual)) return `expected=${expected} actual=${actual}`;
  return null;
}

function checkContiguous(values) {
  if (values.length <= 1) return { ok: true, error: null };
  const sorted = values.slice().sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] !== sorted[i - 1] + 1) return { ok: false, error: `gap_${sorted[i - 1]}_${sorted[i]}` };
  }
  return { ok: true, error: null };
}

function checkOrderConsistency(rows, idField, scopeFn, slotField = "block_slot", contiguous = true) {
  const byScope = groupBy(rows.filter((r) => String(r.status ?? "").toUpperCase() !== "ORPHANED"), scopeFn);
  const issues = [];
  for (const [scope, scopedRows] of byScope.entries()) {
    const nullIdCount = scopedRows.filter((r) => toInt(r[idField]) === null).length;
    if (nullIdCount > 0) issues.push({ scope, type: "null_id", count: nullIdCount });

    const rowsWithId = scopedRows.filter((r) => toInt(r[idField]) !== null);
    if (rowsWithId.length === 0) continue;

    const chainOrdered = rowsWithId.slice().sort((a, b) => chainSortKey(a, slotField).localeCompare(chainSortKey(b, slotField)));
    const ids = chainOrdered.map((r) => toInt(r[idField]));
    if (contiguous) {
      const contiguousCheck = checkContiguous(ids);
      if (!contiguousCheck.ok) issues.push({ scope, type: "id_gap", error: contiguousCheck.error });
    }

    if (new Set(ids).size !== ids.length) issues.push({ scope, type: "duplicate_id" });

    const chainOrderedAll = scopedRows
      .slice()
      .sort((a, b) => chainSortKey(a, slotField).localeCompare(chainSortKey(b, slotField)));
    const idOrdered = rowsWithId
      .slice()
      .sort((a, b) => {
        const ai = toInt(a[idField]);
        const bi = toInt(b[idField]);
        if (ai !== bi) return ai - bi;
        return chainSortKey(a, slotField).localeCompare(chainSortKey(b, slotField));
      })
      .map((r) => `${r.asset}|${r.client_address ?? ""}|${r.feedback_index ?? ""}|${r.tx_signature ?? ""}`);

    const chainIds = chainOrderedAll
      .filter((r) => toInt(r[idField]) !== null)
      .map((r) => `${r.asset}|${r.client_address ?? ""}|${r.feedback_index ?? ""}|${r.tx_signature ?? ""}`);
    if (JSON.stringify(idOrdered) !== JSON.stringify(chainIds)) {
      issues.push({ scope, type: "id_chain_order_mismatch" });
    }
  }
  return issues;
}

function indexByTx(rows) {
  const m = new Map();
  for (const row of rows) {
    const tx = toStringOrNull(row.tx_signature);
    if (!tx) continue;
    const bucket = m.get(tx);
    if (bucket) bucket.push(row);
    else m.set(tx, [row]);
  }
  return m;
}

function canonicalLines(rows, fields) {
  return rows.map((r) => fields.map((f) => `${f}=${r[f] ?? ""}`).join("|"));
}

function pickUnused(candidates, usedSet, keyFn) {
  for (const row of candidates) {
    const key = keyFn(row);
    if (!usedSet.has(key)) return row;
  }
  return null;
}

function rowKeyAgent(row) {
  return `${row.asset}`;
}

function rowKeyFeedback(row) {
  return `${row.asset}|${row.client_address}|${row.feedback_index}|${row.tx_signature ?? ""}|${row.feedback_id ?? ""}`;
}

function rowKeyResponse(row) {
  return `${row.asset}|${row.client_address}|${row.feedback_index}|${row.responder}|${row.tx_signature ?? ""}|${row.response_id ?? ""}`;
}

function rowKeyRevocation(row) {
  return `${row.asset}|${row.client_address}|${row.feedback_index}|${row.tx_signature ?? ""}|${row.revocation_id ?? ""}`;
}

function findMatchAgent(expected, rows, byTx, byAsset, usedSet) {
  if (expected.txSignature) {
    const txRows = byTx.get(expected.txSignature) ?? [];
    const exact = pickUnused(txRows.filter((r) => r.asset === expected.asset), usedSet, rowKeyAgent);
    if (exact) return exact;
    return null;
  }
  const assetRows = byAsset.get(expected.asset) ?? [];
  return pickUnused(assetRows, usedSet, rowKeyAgent);
}

function findMatchFeedback(expected, rows, byTx, usedSet) {
  if (expected.txSignature) {
    const txRows = byTx.get(expected.txSignature) ?? [];
    const exact = pickUnused(
      txRows.filter((r) => r.asset === expected.asset && r.client_address === expected.client),
      usedSet,
      rowKeyFeedback
    );
    if (exact) return exact;
    return null;
  }
  return pickUnused(
    rows.filter((r) => r.asset === expected.asset && r.client_address === expected.client),
    usedSet,
    rowKeyFeedback
  );
}

function findMatchResponse(expected, rows, byTx, usedSet) {
  if (expected.txSignature) {
    const txRows = byTx.get(expected.txSignature) ?? [];
    const exact = pickUnused(txRows.filter((r) => r.asset === expected.asset), usedSet, rowKeyResponse);
    if (exact) return exact;
    return null;
  }
  return pickUnused(
    rows.filter((r) => r.asset === expected.asset && r.client_address === expected.client),
    usedSet,
    rowKeyResponse
  );
}

function findMatchRevocation(expected, rows, byTx, usedSet) {
  if (expected.txSignature) {
    const txRows = byTx.get(expected.txSignature) ?? [];
    const exact = pickUnused(txRows.filter((r) => r.asset === expected.asset), usedSet, rowKeyRevocation);
    if (exact) return exact;
    return null;
  }
  return pickUnused(
    rows.filter((r) => r.asset === expected.asset && r.client_address === expected.client),
    usedSet,
    rowKeyRevocation
  );
}

async function verifyOneIndexer({ baseUrl, expected, assets, timeoutMs, chunkSize }) {
  const result = {
    baseUrl,
    available: false,
    errors: [],
    stats: null,
    counts: {
      expectedAgents: expected.agents.length,
      expectedFeedbacks: expected.feedbacks.length,
      expectedResponses: expected.responses.length,
      expectedRevocations: expected.revocations.length,
      matchedAgents: 0,
      matchedFeedbacks: 0,
      matchedResponses: 0,
      matchedRevocations: 0,
      missingAgents: 0,
      missingFeedbacks: 0,
      missingResponses: 0,
      missingRevocations: 0,
      fieldMismatches: 0,
    },
    missing: { agents: [], feedbacks: [], responses: [], revocations: [] },
    mismatches: [],
    orderChecks: {},
    hashes: { matched: {}, allRowsForAssets: {} },
  };

  const root = baseUrl.replace(/\/rest\/v1\/?$/i, "");
  const health = await fetchJson(`${root}/health`, timeoutMs);
  if (!health.ok) {
    result.errors.push(`health_http_${health.status}`);
    return result;
  }
  result.available = true;

  const statsRes = await fetchJson(`${baseUrl}/stats`, timeoutMs);
  if (statsRes.ok) result.stats = statsRes.payload;

  const [agentsRes, feedbackRes, responseRes, revokeRes] = await Promise.all([
    fetchTableByAssets({
      baseUrl,
      table: "agents",
      select:
        "asset,owner,creator,agent_uri,atom_enabled,agent_id,block_slot,tx_index,event_ordinal,tx_signature,status",
      assets,
      chunkSize,
      timeoutMs,
    }),
    fetchTableByAssets({
      baseUrl,
      table: "feedbacks",
      select:
        "asset,client_address,feedback_index,feedback_id,value,value_decimals,score,tag1,tag2,endpoint,feedback_uri,feedback_hash,block_slot,tx_index,event_ordinal,tx_signature,status",
      assets,
      chunkSize,
      timeoutMs,
    }),
    fetchTableByAssets({
      baseUrl,
      table: "feedback_responses",
      select:
        "asset,client_address,feedback_index,responder,response_uri,response_hash,response_id,response_count,block_slot,tx_index,event_ordinal,tx_signature,status",
      assets,
      chunkSize,
      timeoutMs,
    }),
    fetchTableByAssets({
      baseUrl,
      table: "revocations",
      select:
        "asset,client_address,feedback_index,revocation_id,feedback_hash,slot,tx_index,event_ordinal,tx_signature,status,original_score,atom_enabled,had_impact,revoke_count",
      assets,
      chunkSize,
      timeoutMs,
    }),
  ]);

  result.errors.push(...agentsRes.errors, ...feedbackRes.errors, ...responseRes.errors, ...revokeRes.errors);

  const agents = agentsRes.rows;
  const feedbacks = feedbackRes.rows;
  const responses = responseRes.rows;
  const revocations = revokeRes.rows;
  const liveAgents = agents.filter((r) => String(r.status ?? "").toUpperCase() !== "ORPHANED");
  const liveFeedbacks = feedbacks.filter((r) => String(r.status ?? "").toUpperCase() !== "ORPHANED");
  const liveResponses = responses.filter((r) => String(r.status ?? "").toUpperCase() !== "ORPHANED");
  const liveRevocations = revocations.filter((r) => String(r.status ?? "").toUpperCase() !== "ORPHANED");

  const agentsByTx = indexByTx(liveAgents);
  const feedbackByTx = indexByTx(liveFeedbacks);
  const responsesByTx = indexByTx(liveResponses);
  const revocationsByTx = indexByTx(liveRevocations);
  const agentsByAsset = groupBy(liveAgents, (r) => r.asset);

  const matched = { agents: [], feedbacks: [], responses: [], revocations: [] };
  const usedAgents = new Set();
  const usedFeedbacks = new Set();
  const usedResponses = new Set();
  const usedRevocations = new Set();

  for (const exp of expected.agents) {
    const row = findMatchAgent(exp, liveAgents, agentsByTx, agentsByAsset, usedAgents);
    if (!row) {
      result.missing.agents.push({ asset: exp.asset, txSignature: exp.txSignature });
      continue;
    }
    usedAgents.add(rowKeyAgent(row));
    matched.agents.push(row);
    result.counts.matchedAgents += 1;
    const diffs = [];
    const txDiff = compareExact(exp.txSignature, row.tx_signature);
    if (txDiff) diffs.push(`tx_signature:${txDiff}`);
    const ownerDiff = compareExact(exp.owner, row.owner);
    if (ownerDiff) diffs.push(`owner:${ownerDiff}`);
    const uriDiff = compareExact(exp.uri, row.agent_uri);
    if (uriDiff) diffs.push(`agent_uri:${uriDiff}`);
    if (exp.atomEnabled !== null && exp.atomEnabled !== toBool(row.atom_enabled)) {
      diffs.push(`atom_enabled:expected=${exp.atomEnabled} actual=${row.atom_enabled}`);
    }
    if (diffs.length > 0) result.mismatches.push({ type: "agent", asset: exp.asset, txSignature: exp.txSignature, diffs });
  }

  for (const exp of expected.feedbacks) {
    const row = findMatchFeedback(exp, liveFeedbacks, feedbackByTx, usedFeedbacks);
    if (!row) {
      result.missing.feedbacks.push({ asset: exp.asset, client: exp.client, txSignature: exp.txSignature });
      continue;
    }
    usedFeedbacks.add(rowKeyFeedback(row));
    matched.feedbacks.push(row);
    result.counts.matchedFeedbacks += 1;
    const diffs = [];
    const txDiff = compareExact(exp.txSignature, row.tx_signature);
    if (txDiff) diffs.push(`tx_signature:${txDiff}`);
    for (const [k, a, b] of [
      ["asset", exp.asset, row.asset],
      ["client_address", exp.client, row.client_address],
      ["value", exp.value, toStringOrNull(row.value)],
      ["value_decimals", exp.valueDecimals, toInt(row.value_decimals)],
      ["score", exp.score, toInt(row.score)],
      ["tag1", exp.tag1, row.tag1],
      ["tag2", exp.tag2, row.tag2],
      ["endpoint", exp.endpoint, row.endpoint],
      ["feedback_uri", exp.feedbackUri, row.feedback_uri],
    ]) {
      const d = compareExact(a, b);
      if (d) diffs.push(`${k}:${d}`);
    }
    if (exp.feedbackIndex !== null && !exp.txSignature) {
      const indexDiff = compareExact(exp.feedbackIndex, toInt(row.feedback_index));
      if (indexDiff) diffs.push(`feedback_index:${indexDiff}`);
    }
    const expectedHash = normalizeHex(exp.feedbackHash);
    const actualHash = normalizeHex(row.feedback_hash);
    if (expectedHash && expectedHash !== actualHash) {
      diffs.push(`feedback_hash:expected=${expectedHash} actual=${actualHash}`);
    }
    if (diffs.length > 0) result.mismatches.push({ type: "feedback", asset: exp.asset, txSignature: exp.txSignature, diffs });
  }

  for (const exp of expected.responses) {
    const row = findMatchResponse(exp, liveResponses, responsesByTx, usedResponses);
    if (!row) {
      result.missing.responses.push({ asset: exp.asset, client: exp.client, txSignature: exp.txSignature });
      continue;
    }
    usedResponses.add(rowKeyResponse(row));
    matched.responses.push(row);
    result.counts.matchedResponses += 1;
    const diffs = [];
    const txDiff = compareExact(exp.txSignature, row.tx_signature);
    if (txDiff) diffs.push(`tx_signature:${txDiff}`);
    for (const [k, a, b] of [
      ["asset", exp.asset, row.asset],
      ["client_address", exp.client, row.client_address],
      ["feedback_index", exp.feedbackIndex, toInt(row.feedback_index)],
      ["responder", exp.responder, row.responder],
      ["response_uri", exp.responseUri, row.response_uri],
    ]) {
      const d = compareExact(a, b);
      if (d) diffs.push(`${k}:${d}`);
    }
    const expectedHash = normalizeHex(exp.responseHash);
    const actualHash = normalizeHex(row.response_hash);
    if (expectedHash && expectedHash !== actualHash) {
      diffs.push(`response_hash:expected=${expectedHash} actual=${actualHash}`);
    }
    if (diffs.length > 0) result.mismatches.push({ type: "response", asset: exp.asset, txSignature: exp.txSignature, diffs });
  }

  for (const exp of expected.revocations) {
    const row = findMatchRevocation(exp, liveRevocations, revocationsByTx, usedRevocations);
    if (!row) {
      result.missing.revocations.push({ asset: exp.asset, client: exp.client, txSignature: exp.txSignature });
      continue;
    }
    usedRevocations.add(rowKeyRevocation(row));
    matched.revocations.push(row);
    result.counts.matchedRevocations += 1;
    const diffs = [];
    const txDiff = compareExact(exp.txSignature, row.tx_signature);
    if (txDiff) diffs.push(`tx_signature:${txDiff}`);
    for (const [k, a, b] of [
      ["asset", exp.asset, row.asset],
      ["client_address", exp.client, row.client_address],
      ["feedback_index", exp.feedbackIndex, toInt(row.feedback_index)],
      ["original_score", exp.originalScore, toInt(row.original_score)],
      ["atom_enabled", exp.atomEnabled, toBool(row.atom_enabled)],
    ]) {
      const d = compareExact(a, b);
      if (d) diffs.push(`${k}:${d}`);
    }
    const expectedHash = normalizeHex(exp.feedbackHash);
    const actualHash = normalizeHex(row.feedback_hash);
    if (expectedHash && expectedHash !== actualHash) {
      diffs.push(`feedback_hash:expected=${expectedHash} actual=${actualHash}`);
    }
    if (diffs.length > 0) result.mismatches.push({ type: "revocation", asset: exp.asset, txSignature: exp.txSignature, diffs });
  }

  result.counts.missingAgents = result.missing.agents.length;
  result.counts.missingFeedbacks = result.missing.feedbacks.length;
  result.counts.missingResponses = result.missing.responses.length;
  result.counts.missingRevocations = result.missing.revocations.length;
  result.counts.fieldMismatches = result.mismatches.length;

  result.orderChecks = {
    agents: checkOrderConsistency(liveAgents, "agent_id", () => "__global_agents__", "block_slot", false),
    feedbacks: checkOrderConsistency(liveFeedbacks, "feedback_id", (r) => String(r.asset), "block_slot"),
    responses: checkOrderConsistency(
      liveResponses,
      "response_id",
      (r) => `${r.asset}|${r.client_address}|${r.feedback_index}`,
      "block_slot"
    ),
    revocations: checkOrderConsistency(liveRevocations, "revocation_id", (r) => String(r.asset), "slot"),
  };

  result.hashes.matched = {
    agents: stableHash(canonicalLines(matched.agents, ["asset", "owner", "agent_uri", "agent_id", "tx_signature", "block_slot"])),
    feedbacks: stableHash(
      canonicalLines(matched.feedbacks, [
        "asset",
        "client_address",
        "feedback_index",
        "feedback_id",
        "value",
        "value_decimals",
        "score",
        "tag1",
        "tag2",
        "endpoint",
        "feedback_uri",
        "feedback_hash",
        "tx_signature",
        "block_slot",
      ])
    ),
    responses: stableHash(
      canonicalLines(matched.responses, [
        "asset",
        "client_address",
        "feedback_index",
        "response_id",
        "responder",
        "response_uri",
        "response_hash",
        "tx_signature",
        "block_slot",
      ])
    ),
    revocations: stableHash(
      canonicalLines(matched.revocations, [
        "asset",
        "client_address",
        "feedback_index",
        "revocation_id",
        "feedback_hash",
        "tx_signature",
        "slot",
      ])
    ),
  };

  result.hashes.allRowsForAssets = {
    agents: stableHash(canonicalLines(liveAgents, ["asset", "owner", "agent_uri", "agent_id", "tx_signature", "block_slot"])),
    feedbacks: stableHash(
      canonicalLines(liveFeedbacks, [
        "asset",
        "client_address",
        "feedback_index",
        "feedback_id",
        "value",
        "value_decimals",
        "score",
        "tag1",
        "tag2",
        "endpoint",
        "feedback_uri",
        "feedback_hash",
        "tx_signature",
        "block_slot",
      ])
    ),
    responses: stableHash(
      canonicalLines(liveResponses, [
        "asset",
        "client_address",
        "feedback_index",
        "response_id",
        "responder",
        "response_uri",
        "response_hash",
        "tx_signature",
        "block_slot",
      ])
    ),
    revocations: stableHash(
      canonicalLines(liveRevocations, [
        "asset",
        "client_address",
        "feedback_index",
        "revocation_id",
        "feedback_hash",
        "tx_signature",
        "slot",
      ])
    ),
  };

  return result;
}

function compareCrossIndexers(indexers) {
  if (indexers.length < 2) return { equalMatched: true, equalAllRows: true, mismatches: [] };
  const mismatches = [];
  const ref = indexers[0];
  for (let i = 1; i < indexers.length; i += 1) {
    const cur = indexers[i];
    for (const key of ["agents", "feedbacks", "responses", "revocations"]) {
      if (ref.hashes.matched[key] !== cur.hashes.matched[key]) {
        mismatches.push({
          scope: "matched",
          type: key,
          left: ref.baseUrl,
          right: cur.baseUrl,
          leftHash: ref.hashes.matched[key],
          rightHash: cur.hashes.matched[key],
        });
      }
      if (ref.hashes.allRowsForAssets[key] !== cur.hashes.allRowsForAssets[key]) {
        mismatches.push({
          scope: "allRowsForAssets",
          type: key,
          left: ref.baseUrl,
          right: cur.baseUrl,
          leftHash: ref.hashes.allRowsForAssets[key],
          rightHash: cur.hashes.allRowsForAssets[key],
        });
      }
    }
  }
  return {
    equalMatched: mismatches.every((m) => m.scope !== "matched"),
    equalAllRows: mismatches.every((m) => m.scope !== "allRowsForAssets"),
    mismatches,
  };
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const indexers = String(args.indexers ?? "")
    .split(",")
    .map((v) => v.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (indexers.length === 0) {
    throw new Error("Missing --indexers (comma-separated REST base URLs)");
  }

  const runsRoot = resolve(args["runs-root"] ?? "artifacts/stress-sdk");
  const actionsFiles = args["actions-files"] ?? "";
  const timeoutMs = Number(args["timeout-ms"] ?? 20000);
  const chunkSize = Number(args["chunk-size"] ?? 120);
  const outputPath = resolve(
    args.output ?? `artifacts/e2e-indexers/stress-input-integrity-${nowId()}/report.json`
  );

  const files = collectActionsFiles({ runsRoot, actionsFiles });
  if (files.length === 0) throw new Error(`No actions.jsonl files found (runs-root=${runsRoot})`);

  const parsed = parseInputEvents(files);
  const assets = [
    ...new Set(
      [...parsed.expected.agents, ...parsed.expected.feedbacks, ...parsed.expected.responses, ...parsed.expected.revocations]
        .map((e) => e.asset)
        .filter(Boolean)
    ),
  ];

  const indexerReports = [];
  for (const baseUrl of indexers) {
    indexerReports.push(
      await verifyOneIndexer({
        baseUrl,
        expected: parsed.expected,
        assets,
        timeoutMs,
        chunkSize,
      })
    );
  }

  const cross = compareCrossIndexers(indexerReports);
  const report = {
    generatedAt: new Date().toISOString(),
    input: {
      files: parsed.files,
      rawCounts: parsed.rawCounts,
      dedupCounts: {
        agents: parsed.expected.agents.length,
        feedbacks: parsed.expected.feedbacks.length,
        responses: parsed.expected.responses.length,
        revocations: parsed.expected.revocations.length,
      },
      assetsEvaluated: assets.length,
    },
    indexers: indexerReports,
    crossIndexer: cross,
  };

  ensureDir(outputPath);
  writeFileSync(outputPath, JSON.stringify(report, null, 2));

  const summary = {
    report: outputPath,
    assetsEvaluated: assets.length,
    input: report.input.dedupCounts,
    equalMatchedAcrossIndexers: cross.equalMatched,
    equalAllRowsAcrossIndexers: cross.equalAllRows,
    mismatchCount: cross.mismatches.length,
  };
  console.log(JSON.stringify(summary, null, 2));

  let hasError = false;
  for (const idx of indexerReports) {
    if (!idx.available) hasError = true;
    if (idx.errors.length > 0) hasError = true;
    if (
      idx.counts.missingAgents > 0 ||
      idx.counts.missingFeedbacks > 0 ||
      idx.counts.missingResponses > 0 ||
      idx.counts.missingRevocations > 0 ||
      idx.counts.fieldMismatches > 0
    ) {
      hasError = true;
    }
    if (
      idx.orderChecks.agents.length > 0 ||
      idx.orderChecks.feedbacks.length > 0 ||
      idx.orderChecks.responses.length > 0 ||
      idx.orderChecks.revocations.length > 0
    ) {
      hasError = true;
    }
  }
  if (!cross.equalMatched || !cross.equalAllRows) hasError = true;

  process.exit(hasError ? 2 : 0);
}

main().catch((err) => {
  console.error(`[verify-stress-input-integrity] ${err?.message ?? err}`);
  process.exit(1);
});
