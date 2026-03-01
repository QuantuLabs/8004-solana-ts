#!/usr/bin/env node

import { createHash } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { pathToFileURL } from "url";

const DEFAULT_INDEXERS = [
  "http://127.0.0.1:3201/rest/v1",
  "http://127.0.0.1:3202/rest/v1",
  "http://127.0.0.1:3203/rest/v1",
  "http://127.0.0.1:3204/rest/v1",
  "http://127.0.0.1:3205/rest/v1",
  "http://127.0.0.1:3206/rest/v1",
];

const ENTITY_TABLES = [
  "agents",
  "feedbacks",
  "feedback_responses",
  "revocations",
  "collections",
  "metadata",
];

const REQUIRED_TABLES = [...ENTITY_TABLES];

const ENTITY_CONFIG = {
  agents: {
    endpointCandidates: ["agents"],
    includeOrphaned: true,
  },
  feedbacks: {
    endpointCandidates: ["feedbacks"],
    includeOrphaned: true,
  },
  feedback_responses: {
    endpointCandidates: ["feedback_responses"],
    includeOrphaned: true,
  },
  revocations: {
    endpointCandidates: ["revocations"],
    includeOrphaned: true,
  },
  collections: {
    endpointCandidates: ["collections", "collection_pointers"],
    includeOrphaned: true,
  },
  metadata: {
    endpointCandidates: ["metadata", "metadata_entries"],
    includeOrphaned: true,
  },
};

const TX_ENTITY_TABLES = ["feedbacks", "feedback_responses", "revocations"];
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = "true";
    }
  }
  return out;
}

function nowId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(
    d.getUTCHours()
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function rootFromRest(baseUrl) {
  return String(baseUrl || "").replace(/\/rest\/v1\/?$/i, "");
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function safeString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function upperOrNull(value) {
  const s = stringOrNull(value);
  return s ? s.toUpperCase() : null;
}

function asInt(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

function asBool(value) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "t") return true;
    if (s === "false" || s === "0" || s === "f") return false;
  }
  return null;
}

export function normalizeBinaryLike(value) {
  const s = stringOrNull(value);
  if (s === null) return null;
  if (/^(?:\\x|0x)[0-9a-f]+$/i.test(s)) {
    return s.replace(/^(?:\\x|0x)/i, "").toLowerCase();
  }
  return s;
}

function normalizeTxSignature(value) {
  return stringOrNull(value);
}

function isLiveRow(row) {
  const status = upperOrNull(row?.status);
  return status !== "ORPHANED";
}

function pick(row, fields) {
  for (const field of fields) {
    if (row && Object.prototype.hasOwnProperty.call(row, field)) {
      return row[field];
    }
  }
  return null;
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

function stableStringify(value) {
  if (value === null) return "null";
  if (value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function hashPayload(payload) {
  const hash = createHash("sha256");
  hash.update(stableStringify(payload));
  return hash.digest("hex");
}

function joinKey(parts) {
  return parts.map((part) => (part === null || part === undefined ? "" : String(part))).join("|");
}

export function canonicalRecordForEntity(entity, row, idx = 0) {
  if (entity === "agents") {
    const payload = {
      asset: stringOrNull(pick(row, ["asset"])),
      agent_id: asInt(pick(row, ["agent_id"])),
      owner: stringOrNull(pick(row, ["owner"])),
      creator: stringOrNull(pick(row, ["creator"])),
      agent_uri: stringOrNull(pick(row, ["agent_uri"])),
      agent_wallet: stringOrNull(pick(row, ["agent_wallet"])),
      atom_enabled: asBool(pick(row, ["atom_enabled"])),
      collection: stringOrNull(pick(row, ["collection", "col"])),
      canonical_col: stringOrNull(pick(row, ["canonical_col", "collection_pointer"])),
      col_locked: asBool(pick(row, ["col_locked"])),
      parent_asset: stringOrNull(pick(row, ["parent_asset"])),
      parent_creator: stringOrNull(pick(row, ["parent_creator"])),
      parent_locked: asBool(pick(row, ["parent_locked"])),
      block_slot: asInt(pick(row, ["block_slot", "slot"])),
      tx_index: asInt(pick(row, ["tx_index"])),
      event_ordinal: asInt(pick(row, ["event_ordinal"])),
      tx_signature: normalizeTxSignature(pick(row, ["tx_signature"])),
      status: upperOrNull(pick(row, ["status"])),
    };
    const key = payload.asset || `__missing_asset__:${idx}`;
    return { key, payload };
  }

  if (entity === "feedbacks") {
    const payload = {
      asset: stringOrNull(pick(row, ["asset"])),
      client_address: stringOrNull(pick(row, ["client_address"])),
      feedback_index: asInt(pick(row, ["feedback_index"])),
      feedback_id: asInt(pick(row, ["feedback_id"])),
      value: stringOrNull(pick(row, ["value"])),
      value_decimals: asInt(pick(row, ["value_decimals"])),
      score: asInt(pick(row, ["score"])),
      tag1: stringOrNull(pick(row, ["tag1"])),
      tag2: stringOrNull(pick(row, ["tag2"])),
      endpoint: stringOrNull(pick(row, ["endpoint"])),
      feedback_uri: stringOrNull(pick(row, ["feedback_uri"])),
      feedback_hash: normalizeBinaryLike(pick(row, ["feedback_hash"])),
      running_digest: normalizeBinaryLike(pick(row, ["running_digest"])),
      block_slot: asInt(pick(row, ["block_slot", "slot"])),
      tx_index: asInt(pick(row, ["tx_index"])),
      event_ordinal: asInt(pick(row, ["event_ordinal"])),
      tx_signature: normalizeTxSignature(pick(row, ["tx_signature"])),
      status: upperOrNull(pick(row, ["status"])),
    };
    const key =
      joinKey([
        payload.asset,
        payload.client_address,
        payload.feedback_index,
        payload.feedback_id,
        payload.tx_signature,
      ]) || `__missing_feedback_key__:${idx}`;
    return { key, payload };
  }

  if (entity === "feedback_responses") {
    const payload = {
      asset: stringOrNull(pick(row, ["asset"])),
      client_address: stringOrNull(pick(row, ["client_address"])),
      feedback_index: asInt(pick(row, ["feedback_index"])),
      response_id: asInt(pick(row, ["response_id"])),
      responder: stringOrNull(pick(row, ["responder"])),
      response_uri: stringOrNull(pick(row, ["response_uri"])),
      response_hash: normalizeBinaryLike(pick(row, ["response_hash"])),
      response_count: asInt(pick(row, ["response_count"])),
      running_digest: normalizeBinaryLike(pick(row, ["running_digest"])),
      block_slot: asInt(pick(row, ["block_slot", "slot"])),
      tx_index: asInt(pick(row, ["tx_index"])),
      event_ordinal: asInt(pick(row, ["event_ordinal"])),
      tx_signature: normalizeTxSignature(pick(row, ["tx_signature"])),
      status: upperOrNull(pick(row, ["status"])),
    };
    const key =
      joinKey([
        payload.asset,
        payload.client_address,
        payload.feedback_index,
        payload.response_id,
        payload.tx_signature,
      ]) || `__missing_response_key__:${idx}`;
    return { key, payload };
  }

  if (entity === "revocations") {
    const payload = {
      asset: stringOrNull(pick(row, ["asset"])),
      client_address: stringOrNull(pick(row, ["client_address"])),
      feedback_index: asInt(pick(row, ["feedback_index"])),
      revocation_id: asInt(pick(row, ["revocation_id"])),
      feedback_hash: normalizeBinaryLike(pick(row, ["feedback_hash"])),
      original_score: asInt(pick(row, ["original_score"])),
      atom_enabled: asBool(pick(row, ["atom_enabled"])),
      had_impact: asBool(pick(row, ["had_impact"])),
      revoke_count: asInt(pick(row, ["revoke_count"])),
      running_digest: normalizeBinaryLike(pick(row, ["running_digest"])),
      slot: asInt(pick(row, ["slot", "block_slot"])),
      tx_index: asInt(pick(row, ["tx_index"])),
      event_ordinal: asInt(pick(row, ["event_ordinal"])),
      tx_signature: normalizeTxSignature(pick(row, ["tx_signature"])),
      status: upperOrNull(pick(row, ["status"])),
    };
    const key =
      joinKey([
        payload.asset,
        payload.client_address,
        payload.feedback_index,
        payload.revocation_id,
        payload.tx_signature,
      ]) || `__missing_revocation_key__:${idx}`;
    return { key, payload };
  }

  if (entity === "collections") {
    const payload = {
      collection: stringOrNull(pick(row, ["collection", "col"])),
      creator: stringOrNull(pick(row, ["creator", "authority"])),
      first_seen_asset: stringOrNull(pick(row, ["first_seen_asset"])),
      first_seen_slot: asInt(pick(row, ["first_seen_slot"])),
      first_seen_tx_signature: normalizeTxSignature(pick(row, ["first_seen_tx_signature"])),
      last_seen_slot: asInt(pick(row, ["last_seen_slot"])),
      last_seen_tx_signature: normalizeTxSignature(pick(row, ["last_seen_tx_signature"])),
      asset_count: asInt(pick(row, ["asset_count"])),
      version: stringOrNull(pick(row, ["version"])),
      name: stringOrNull(pick(row, ["name"])),
      symbol: stringOrNull(pick(row, ["symbol"])),
      description: stringOrNull(pick(row, ["description"])),
      image: stringOrNull(pick(row, ["image"])),
      banner_image: stringOrNull(pick(row, ["banner_image", "bannerImage"])),
      social_website: stringOrNull(pick(row, ["social_website", "socialWebsite"])),
      social_x: stringOrNull(pick(row, ["social_x", "socialX"])),
      social_discord: stringOrNull(pick(row, ["social_discord", "socialDiscord"])),
      metadata_status: stringOrNull(pick(row, ["metadata_status", "metadataStatus"])),
      metadata_hash: normalizeBinaryLike(pick(row, ["metadata_hash", "metadataHash"])),
      metadata_bytes: asInt(pick(row, ["metadata_bytes", "metadataBytes"])),
      registry_type: stringOrNull(pick(row, ["registry_type"])),
      status: upperOrNull(pick(row, ["status"])),
    };
    const key = joinKey([payload.collection, payload.creator]) || `__missing_collection_key__:${idx}`;
    return { key, payload };
  }

  if (entity === "metadata") {
    const payload = {
      asset: stringOrNull(pick(row, ["asset"])),
      key: stringOrNull(pick(row, ["key", "metadataKey"])),
      value: normalizeBinaryLike(pick(row, ["value", "metadataValue"])),
      immutable: asBool(pick(row, ["immutable"])),
      block_slot: asInt(pick(row, ["block_slot", "slot"])),
      tx_index: asInt(pick(row, ["tx_index"])),
      event_ordinal: asInt(pick(row, ["event_ordinal"])),
      tx_signature: normalizeTxSignature(pick(row, ["tx_signature"])),
      status: upperOrNull(pick(row, ["status"])),
    };
    const key =
      joinKey([
        payload.asset,
        payload.key,
        payload.block_slot,
        payload.tx_index,
        payload.event_ordinal,
        payload.tx_signature,
      ]) || `__missing_metadata_key__:${idx}`;
    return { key, payload };
  }

  throw new Error(`Unsupported entity for canonicalization: ${entity}`);
}

export function buildCanonicalIndex(entity, rows) {
  const map = new Map();
  const fields = new Set();
  const sampleKeys = [];
  const sampleDuplicateKeys = [];
  const sampleConflictKeys = [];

  let missingKeyCount = 0;
  let duplicateKeyCount = 0;
  let conflictingDuplicateKeyCount = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const rec = canonicalRecordForEntity(entity, rows[i], i);
    const key = stringOrNull(rec.key) || `__empty_key__:${i}`;
    if (!stringOrNull(rec.key)) {
      missingKeyCount += 1;
    }

    Object.keys(rec.payload).forEach((k) => fields.add(k));
    const payloadDigest = hashPayload(rec.payload);

    if (!map.has(key)) {
      map.set(key, payloadDigest);
      if (sampleKeys.length < 8) sampleKeys.push(key);
      continue;
    }

    duplicateKeyCount += 1;
    if (sampleDuplicateKeys.length < 8) sampleDuplicateKeys.push(key);

    const existingDigest = map.get(key);
    if (existingDigest !== payloadDigest) {
      conflictingDuplicateKeyCount += 1;
      if (sampleConflictKeys.length < 8) sampleConflictKeys.push(key);
    }
  }

  const keys = [...map.keys()];
  const lines = keys.map((key) => `${key}|${map.get(key)}`);
  const summary = {
    keyCount: rows.length,
    uniqueKeyCount: keys.length,
    missingKeyCount,
    duplicateKeyCount,
    conflictingDuplicateKeyCount,
    keyHash: stableHash(keys),
    payloadHash: stableHash(lines),
    fields: [...fields].sort(),
    sampleKeys,
    sampleDuplicateKeys,
    sampleConflictKeys,
  };

  Object.defineProperty(summary, "_map", {
    enumerable: false,
    value: map,
    writable: false,
  });

  return summary;
}

function endpointUnavailable(status, raw) {
  if (status === 404) return true;
  if (status !== 400) return false;
  const text = String(raw || "").toLowerCase();
  return (
    text.includes("does not exist") ||
    text.includes("relation") ||
    text.includes("unknown") ||
    text.includes("not found")
  );
}

function shouldFallbackIncludeOrphaned(status, _raw) {
  // For Supabase/PostgREST mode, includeOrphaned can be interpreted as a malformed filter.
  // We always retry plain query for 4xx parser/rejection responses.
  return [400, 404, 422].includes(status);
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
    });
    const raw = await res.text();
    let payload = null;
    try {
      payload = raw.length > 0 ? JSON.parse(raw) : null;
    } catch {
      payload = raw;
    }
    return { ok: res.ok, status: res.status, payload, raw };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: null,
      raw: "",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPagedTable({
  baseUrl,
  endpoint,
  timeoutMs,
  pageSize,
  maxPages,
  extraParams,
  includeOrphaned,
}) {
  const rows = [];
  const errors = [];
  let supported = true;
  let pages = 0;
  let lastStatus = null;
  let lastRaw = "";

  let usedIncludeOrphaned = false;
  let fallbackToPlain = false;
  let firstBatch = [];

  const buildUrl = (offset, useIncludeOrphaned) => {
    const u = new URL(`${baseUrl}/${endpoint}`);
    u.searchParams.set("limit", String(pageSize));
    u.searchParams.set("offset", String(offset));
    if (useIncludeOrphaned) {
      u.searchParams.set("includeOrphaned", "true");
    }
    for (const [k, v] of Object.entries(extraParams || {})) {
      if (v !== undefined && v !== null && v !== "") {
        u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  };

  const readPage = async (offset, useIncludeOrphaned) => {
    const url = buildUrl(offset, useIncludeOrphaned);
    const res = await fetchJson(url, timeoutMs);
    return { ...res, url, offset, useIncludeOrphaned };
  };

  const firstOffset = 0;
  if (includeOrphaned) {
    const includeRes = await readPage(firstOffset, true);
    pages += 1;
    lastStatus = includeRes.status;
    lastRaw = includeRes.raw;

    if (includeRes.ok) {
      usedIncludeOrphaned = true;
      firstBatch = Array.isArray(includeRes.payload) ? includeRes.payload : [];
    } else if (shouldFallbackIncludeOrphaned(includeRes.status, includeRes.raw)) {
      fallbackToPlain = true;
      const plainRes = await readPage(firstOffset, false);
      pages += 1;
      lastStatus = plainRes.status;
      lastRaw = plainRes.raw;
      if (!plainRes.ok) {
        const reason = plainRes.error
          ? `ERR:${plainRes.error}`
          : `HTTP ${plainRes.status}:${String(plainRes.raw || "").slice(0, 220)}`;
        errors.push(`${endpoint}:${reason}`);
        supported = false;
        return {
          endpoint,
          supported,
          rows,
          errors,
          pages,
          lastStatus,
          lastRaw,
          includeOrphaned: {
            requested: true,
            used: false,
            fallbackToPlain,
          },
        };
      }
      firstBatch = Array.isArray(plainRes.payload) ? plainRes.payload : [];
    } else {
      const reason = includeRes.error
        ? `ERR:${includeRes.error}`
        : `HTTP ${includeRes.status}:${String(includeRes.raw || "").slice(0, 220)}`;
      errors.push(`${endpoint}:${reason}`);
      supported = false;
      return {
        endpoint,
        supported,
        rows,
        errors,
        pages,
        lastStatus,
        lastRaw,
        includeOrphaned: {
          requested: true,
          used: false,
          fallbackToPlain,
        },
      };
    }
  } else {
    const plainRes = await readPage(firstOffset, false);
    pages += 1;
    lastStatus = plainRes.status;
    lastRaw = plainRes.raw;

    if (!plainRes.ok) {
      const reason = plainRes.error
        ? `ERR:${plainRes.error}`
        : `HTTP ${plainRes.status}:${String(plainRes.raw || "").slice(0, 220)}`;
      errors.push(`${endpoint}:${reason}`);
      supported = false;
      return {
        endpoint,
        supported,
        rows,
        errors,
        pages,
        lastStatus,
        lastRaw,
        includeOrphaned: {
          requested: false,
          used: false,
          fallbackToPlain,
        },
      };
    }
    firstBatch = Array.isArray(plainRes.payload) ? plainRes.payload : [];
  }

  rows.push(...firstBatch);

  let lastBatchSize = firstBatch.length;
  let page = 1;
  while (lastBatchSize === pageSize && page < maxPages) {
    const offset = page * pageSize;
    const res = await readPage(offset, usedIncludeOrphaned);
    pages += 1;
    lastStatus = res.status;
    lastRaw = res.raw;

    if (!res.ok) {
      const reason = res.error
        ? `ERR:${res.error}`
        : `HTTP ${res.status}:${String(res.raw || "").slice(0, 220)}`;
      errors.push(`${endpoint}:${reason}`);
      supported = false;
      return {
        endpoint,
        supported,
        rows,
        errors,
        pages,
        lastStatus,
        lastRaw,
        includeOrphaned: {
          requested: includeOrphaned,
          used: usedIncludeOrphaned,
          fallbackToPlain,
        },
      };
    }

    const batch = Array.isArray(res.payload) ? res.payload : [];
    rows.push(...batch);
    lastBatchSize = batch.length;
    page += 1;
  }

  return {
    endpoint,
    supported,
    rows,
    errors,
    pages,
    lastStatus,
    lastRaw,
    includeOrphaned: {
      requested: includeOrphaned,
      used: usedIncludeOrphaned,
      fallbackToPlain,
    },
  };
}

async function fetchEntityRows({
  baseUrl,
  entity,
  timeoutMs,
  pageSize,
  maxPages,
}) {
  const cfg = ENTITY_CONFIG[entity];
  if (!cfg) {
    throw new Error(`Unknown entity: ${entity}`);
  }

  const attempts = [];

  for (let i = 0; i < cfg.endpointCandidates.length; i += 1) {
    const endpoint = cfg.endpointCandidates[i];
    const fetched = await fetchPagedTable({
      baseUrl,
      endpoint,
      timeoutMs,
      pageSize,
      maxPages,
      extraParams: {},
      includeOrphaned: cfg.includeOrphaned,
    });

    attempts.push({
      endpoint,
      supported: fetched.supported,
      status: fetched.lastStatus,
      error: fetched.errors[0] || null,
      includeOrphaned: fetched.includeOrphaned,
    });

    if (fetched.errors.length === 0) {
      return {
        ...fetched,
        entity,
        endpoint,
        endpointCandidatesTried: attempts,
      };
    }

    const canTryNext =
      i < cfg.endpointCandidates.length - 1 &&
      endpointUnavailable(fetched.lastStatus, fetched.lastRaw);

    if (!canTryNext) {
      return {
        ...fetched,
        entity,
        endpoint,
        endpointCandidatesTried: attempts,
      };
    }
  }

  return {
    entity,
    endpoint: cfg.endpointCandidates[cfg.endpointCandidates.length - 1],
    supported: false,
    rows: [],
    errors: [`${entity}:no_supported_endpoint`],
    pages: 0,
    lastStatus: null,
    lastRaw: "",
    includeOrphaned: {
      requested: cfg.includeOrphaned,
      used: false,
      fallbackToPlain: false,
    },
    endpointCandidatesTried: attempts,
  };
}

function buildCoverageEntry(entity, fetched) {
  const rows = Array.isArray(fetched.rows) ? fetched.rows : [];
  const canonical = buildCanonicalIndex(entity, rows);

  const entry = {
    table: entity,
    endpoint: fetched.endpoint,
    endpointCandidatesTried: fetched.endpointCandidatesTried || [],
    supported: fetched.supported,
    pages: fetched.pages,
    count: rows.length,
    includeOrphaned: {
      requested: Boolean(fetched.includeOrphaned?.requested),
      used: Boolean(fetched.includeOrphaned?.used),
      fallbackToPlain: Boolean(fetched.includeOrphaned?.fallbackToPlain),
    },
    canonical: {
      keyCount: canonical.keyCount,
      uniqueKeyCount: canonical.uniqueKeyCount,
      missingKeyCount: canonical.missingKeyCount,
      duplicateKeyCount: canonical.duplicateKeyCount,
      conflictingDuplicateKeyCount: canonical.conflictingDuplicateKeyCount,
      keyHash: canonical.keyHash,
      payloadHash: canonical.payloadHash,
      fields: canonical.fields,
      sampleKeys: canonical.sampleKeys,
      sampleDuplicateKeys: canonical.sampleDuplicateKeys,
      sampleConflictKeys: canonical.sampleConflictKeys,
    },
    hash: canonical.payloadHash,
    errors: [...(fetched.errors || [])],
  };

  Object.defineProperty(entry.canonical, "_map", {
    enumerable: false,
    value: canonical._map,
    writable: false,
  });

  return entry;
}

function makeEmptyCoverageEntry(entity, includeOrphanedRequested) {
  const canonical = buildCanonicalIndex(entity, []);
  const entry = {
    table: entity,
    endpoint: null,
    endpointCandidatesTried: [],
    supported: false,
    pages: 0,
    count: 0,
    includeOrphaned: {
      requested: Boolean(includeOrphanedRequested),
      used: false,
      fallbackToPlain: false,
    },
    canonical: {
      keyCount: canonical.keyCount,
      uniqueKeyCount: canonical.uniqueKeyCount,
      missingKeyCount: canonical.missingKeyCount,
      duplicateKeyCount: canonical.duplicateKeyCount,
      conflictingDuplicateKeyCount: canonical.conflictingDuplicateKeyCount,
      keyHash: canonical.keyHash,
      payloadHash: canonical.payloadHash,
      fields: canonical.fields,
      sampleKeys: canonical.sampleKeys,
      sampleDuplicateKeys: canonical.sampleDuplicateKeys,
      sampleConflictKeys: canonical.sampleConflictKeys,
    },
    hash: canonical.payloadHash,
    errors: [],
  };

  Object.defineProperty(entry.canonical, "_map", {
    enumerable: false,
    value: canonical._map,
    writable: false,
  });
  return entry;
}

function checkGlobalNumeric(rows, field, { startAtZero = false, checkGaps = true } = {}) {
  const values = rows.map((row) => asInt(row?.[field]));
  const nullCount = values.filter((v) => v === null).length;
  const numeric = values.filter((v) => v !== null);
  const unique = [...new Set(numeric)].sort((a, b) => a - b);
  const duplicateCount = numeric.length - unique.length;

  let gapCount = 0;
  const gapSamples = [];
  if (checkGaps) {
    for (let i = 1; i < unique.length; i += 1) {
      const prev = unique[i - 1];
      const cur = unique[i];
      if (cur > prev + 1) {
        gapCount += cur - prev - 1;
        if (gapSamples.length < 8) gapSamples.push(`${prev + 1}-${cur - 1}`);
      }
    }
  }

  const startIssue = startAtZero && unique.length > 0 && unique[0] !== 0;
  const ok = nullCount === 0 && duplicateCount === 0 && (!checkGaps || gapCount === 0) && !startIssue;
  return {
    ok,
    checkedRows: rows.length,
    numericRows: numeric.length,
    nullCount,
    duplicateCount,
    gapCount,
    min: unique.length > 0 ? unique[0] : null,
    max: unique.length > 0 ? unique[unique.length - 1] : null,
    startIssue,
    gapSamples,
  };
}

function checkScopedNumeric(rows, field, { scopeFn, startAtZero = false }) {
  const byScope = new Map();
  for (const row of rows) {
    const scope = scopeFn(row);
    const bucket = byScope.get(scope);
    if (bucket) bucket.push(row);
    else byScope.set(scope, [row]);
  }

  const issueSamples = [];
  let scopesWithNull = 0;
  let scopesWithDup = 0;
  let scopesWithGap = 0;
  let scopesWithStart = 0;

  for (const [scope, scopedRows] of byScope.entries()) {
    const ids = scopedRows.map((row) => asInt(row?.[field]));
    const nullCount = ids.filter((v) => v === null).length;
    if (nullCount > 0) {
      scopesWithNull += 1;
      if (issueSamples.length < 12) issueSamples.push({ scope, type: "null_id", count: nullCount });
      continue;
    }

    const numeric = ids;
    const unique = [...new Set(numeric)].sort((a, b) => a - b);
    if (unique.length !== numeric.length) {
      scopesWithDup += 1;
      if (issueSamples.length < 12) issueSamples.push({ scope, type: "duplicate_id" });
    }

    if (startAtZero && unique.length > 0 && unique[0] !== 0) {
      scopesWithStart += 1;
      if (issueSamples.length < 12) issueSamples.push({ scope, type: "start_not_zero", first: unique[0] });
    }

    for (let i = 1; i < unique.length; i += 1) {
      if (unique[i] > unique[i - 1] + 1) {
        scopesWithGap += 1;
        if (issueSamples.length < 12) {
          issueSamples.push({
            scope,
            type: "id_gap",
            from: unique[i - 1],
            to: unique[i],
          });
        }
        break;
      }
    }
  }

  const ok =
    scopesWithNull === 0 &&
    scopesWithDup === 0 &&
    scopesWithGap === 0 &&
    scopesWithStart === 0;

  return {
    ok,
    scopes: byScope.size,
    scopesWithNull,
    scopesWithDup,
    scopesWithGap,
    scopesWithStart,
    issueSamples,
  };
}

export function evaluateIdInvariants({ agents, feedbacks, feedbackResponses, revocations }) {
  const checks = {
    agentsGlobalId: checkGlobalNumeric(agents, "agent_id"),
    feedbackIndexPerAsset: checkScopedNumeric(feedbacks, "feedback_index", {
      scopeFn: (row) => `${safeString(row.asset)}`,
      startAtZero: true,
    }),
    feedbackIdPerAsset: checkScopedNumeric(feedbacks, "feedback_id", {
      scopeFn: (row) => `${safeString(row.asset)}`,
      startAtZero: false,
    }),
    responsesPerFeedback: checkScopedNumeric(feedbackResponses, "response_id", {
      scopeFn: (row) =>
        `${safeString(row.asset)}|${safeString(row.client_address)}|${safeString(row.feedback_index)}`,
      startAtZero: false,
    }),
    revocationIdPerAsset: checkScopedNumeric(revocations, "revocation_id", {
      scopeFn: (row) => `${safeString(row.asset)}`,
      startAtZero: false,
    }),
  };

  const failedChecks = Object.entries(checks)
    .filter(([, value]) => value.ok === false)
    .map(([name]) => name);

  return {
    passed: failedChecks.length === 0,
    failedChecks,
    checks,
  };
}

function txSampleKey(entity, row, idx) {
  return canonicalRecordForEntity(entity, row, idx).key;
}

function txSignatureStatus(value) {
  const sig = normalizeTxSignature(value);
  if (!sig) return "missing";
  if (!BASE58_RE.test(sig) || sig.length < 32) return "invalid";
  return "ok";
}

export function evaluateTxSignatureChecks({ feedbacks, feedbackResponses, revocations }) {
  const tableRows = {
    feedbacks,
    feedback_responses: feedbackResponses,
    revocations,
  };

  const checks = {};
  const failingTables = [];

  for (const table of TX_ENTITY_TABLES) {
    const rows = Array.isArray(tableRows[table]) ? tableRows[table] : [];
    let missingCount = 0;
    let invalidFormatCount = 0;
    const missingSamples = [];
    const invalidSamples = [];

    for (let i = 0; i < rows.length; i += 1) {
      const status = txSignatureStatus(rows[i]?.tx_signature);
      if (status === "missing") {
        missingCount += 1;
        if (missingSamples.length < 8) {
          missingSamples.push(txSampleKey(table, rows[i], i));
        }
      } else if (status === "invalid") {
        invalidFormatCount += 1;
        if (invalidSamples.length < 8) {
          invalidSamples.push(txSampleKey(table, rows[i], i));
        }
      }
    }

    const passed = missingCount === 0 && invalidFormatCount === 0;
    if (!passed) failingTables.push(table);

    checks[table] = {
      passed,
      checkedRows: rows.length,
      missingCount,
      invalidFormatCount,
      missingSamples,
      invalidSamples,
    };
  }

  return {
    passed: failingTables.length === 0,
    failingTables,
    checks,
  };
}

function diffKeySets(leftMap, rightMap, sampleLimit = 12) {
  const missingInRight = [];
  const missingInLeft = [];
  const payloadDiff = [];

  for (const [key, leftHash] of leftMap.entries()) {
    if (!rightMap.has(key)) {
      if (missingInRight.length < sampleLimit) missingInRight.push(key);
      continue;
    }
    const rightHash = rightMap.get(key);
    if (leftHash !== rightHash) {
      if (payloadDiff.length < sampleLimit) payloadDiff.push(key);
    }
  }

  for (const key of rightMap.keys()) {
    if (!leftMap.has(key)) {
      if (missingInLeft.length < sampleLimit) missingInLeft.push(key);
    }
  }

  let missingInRightCount = 0;
  for (const key of leftMap.keys()) {
    if (!rightMap.has(key)) missingInRightCount += 1;
  }

  let missingInLeftCount = 0;
  for (const key of rightMap.keys()) {
    if (!leftMap.has(key)) missingInLeftCount += 1;
  }

  let payloadDiffCount = 0;
  for (const [key, leftHash] of leftMap.entries()) {
    if (rightMap.has(key) && rightMap.get(key) !== leftHash) payloadDiffCount += 1;
  }

  return {
    missingInRightCount,
    missingInLeftCount,
    payloadDiffCount,
    missingInRight,
    missingInLeft,
    payloadDiff,
  };
}

export function compareIndexers(indexerReports) {
  const mismatches = [];
  if (!Array.isArray(indexerReports) || indexerReports.length < 2) {
    return { mismatches, mismatchCount: 0 };
  }

  const ref = indexerReports[0];

  for (const table of ENTITY_TABLES) {
    const refCoverage = ref.coverage[table];
    for (let i = 1; i < indexerReports.length; i += 1) {
      const cur = indexerReports[i];
      const curCoverage = cur.coverage[table];

      if (!refCoverage || !curCoverage) {
        mismatches.push({
          kind: "missing_coverage",
          table,
          left: ref.baseUrl,
          right: cur.baseUrl,
          details: "Coverage entry missing",
        });
        continue;
      }

      if (refCoverage.supported !== curCoverage.supported) {
        mismatches.push({
          kind: "support",
          table,
          left: ref.baseUrl,
          right: cur.baseUrl,
          leftValue: refCoverage.supported,
          rightValue: curCoverage.supported,
        });
        continue;
      }

      if (!refCoverage.supported || !curCoverage.supported) continue;

      const leftCanonical = refCoverage.canonical || {};
      const rightCanonical = curCoverage.canonical || {};
      const leftMap = leftCanonical._map instanceof Map ? leftCanonical._map : null;
      const rightMap = rightCanonical._map instanceof Map ? rightCanonical._map : null;

      const duplicateConflictMismatch =
        (leftCanonical.conflictingDuplicateKeyCount || 0) !==
          (rightCanonical.conflictingDuplicateKeyCount || 0) ||
        (leftCanonical.conflictingDuplicateKeyCount || 0) > 0 ||
        (rightCanonical.conflictingDuplicateKeyCount || 0) > 0;

      if (leftMap && rightMap) {
        const diff = diffKeySets(leftMap, rightMap);
        const hasDiff =
          diff.missingInRightCount > 0 ||
          diff.missingInLeftCount > 0 ||
          diff.payloadDiffCount > 0 ||
          duplicateConflictMismatch;

        if (hasDiff) {
          mismatches.push({
            kind: "canonical",
            table,
            left: ref.baseUrl,
            right: cur.baseUrl,
            leftCount: refCoverage.count,
            rightCount: curCoverage.count,
            leftUniqueKeys: leftCanonical.uniqueKeyCount,
            rightUniqueKeys: rightCanonical.uniqueKeyCount,
            missingInRightCount: diff.missingInRightCount,
            missingInLeftCount: diff.missingInLeftCount,
            payloadDiffCount: diff.payloadDiffCount,
            duplicateConflictMismatch,
            leftKeyHash: leftCanonical.keyHash,
            rightKeyHash: rightCanonical.keyHash,
            leftPayloadHash: leftCanonical.payloadHash,
            rightPayloadHash: rightCanonical.payloadHash,
            samples: {
              missingInRight: diff.missingInRight,
              missingInLeft: diff.missingInLeft,
              payloadDiff: diff.payloadDiff,
              leftDuplicateConflictKeys: leftCanonical.sampleConflictKeys || [],
              rightDuplicateConflictKeys: rightCanonical.sampleConflictKeys || [],
            },
          });
        }
        continue;
      }

      if (
        refCoverage.count !== curCoverage.count ||
        leftCanonical.keyHash !== rightCanonical.keyHash ||
        leftCanonical.payloadHash !== rightCanonical.payloadHash ||
        duplicateConflictMismatch
      ) {
        mismatches.push({
          kind: "canonical_summary",
          table,
          left: ref.baseUrl,
          right: cur.baseUrl,
          leftCount: refCoverage.count,
          rightCount: curCoverage.count,
          leftKeyHash: leftCanonical.keyHash,
          rightKeyHash: rightCanonical.keyHash,
          leftPayloadHash: leftCanonical.payloadHash,
          rightPayloadHash: rightCanonical.payloadHash,
          duplicateConflictMismatch,
        });
      }
    }
  }

  return {
    mismatches,
    mismatchCount: mismatches.length,
  };
}

export function evaluateVerdict(indexerReports, comparison) {
  const reasons = [];
  const failingIndexers = [];
  const required = new Set(REQUIRED_TABLES);

  for (const report of indexerReports) {
    const problems = [];

    if (!report.available) problems.push("unavailable");
    if (report.errors.length > 0) problems.push("errors");

    for (const table of required) {
      const coverage = report.coverage[table];
      if (!coverage || !coverage.supported) problems.push(`${table}:unsupported`);
      if (coverage && coverage.errors.length > 0) problems.push(`${table}:fetch_error`);
      if (coverage && coverage.canonical?.conflictingDuplicateKeyCount > 0) {
        problems.push(`${table}:conflicting_duplicate_keys`);
      }
    }

    if (!report.idInvariants.passed) {
      problems.push(`id_invariants:${report.idInvariants.failedChecks.join(",")}`);
    }

    if (!report.txSignatureChecks.passed) {
      problems.push(`tx_signature:${report.txSignatureChecks.failingTables.join(",")}`);
    }

    if (problems.length > 0) {
      failingIndexers.push({
        baseUrl: report.baseUrl,
        problems,
      });
    }
  }

  if (failingIndexers.length > 0) reasons.push("indexer_failures");
  if ((comparison?.mismatchCount || 0) > 0) reasons.push("cross_indexer_mismatches");

  return {
    pass: reasons.length === 0,
    reasons,
    mismatchCount: comparison?.mismatchCount || 0,
    failingIndexers,
  };
}

async function analyzeOneIndexer({ baseUrl, timeoutMs, pageSize, maxPages }) {
  const root = rootFromRest(baseUrl);
  const report = {
    baseUrl,
    root,
    available: false,
    stats: null,
    errors: [],
    coverage: {},
    idInvariants: {
      passed: false,
      failedChecks: ["not_computed"],
      checks: {},
    },
    txSignatureChecks: {
      passed: false,
      failingTables: ["not_computed"],
      checks: {},
    },
  };

  for (const entity of ENTITY_TABLES) {
    report.coverage[entity] = makeEmptyCoverageEntry(
      entity,
      ENTITY_CONFIG[entity]?.includeOrphaned === true
    );
  }

  const health = await fetchJson(`${root}/health`, timeoutMs);
  report.available = health.ok;
  if (!health.ok) {
    report.errors.push(`health_http_${health.status || "ERR"}`);
    return report;
  }

  const stats = await fetchJson(`${baseUrl}/stats`, timeoutMs);
  if (stats.ok) report.stats = stats.payload;
  else report.errors.push(`stats_http_${stats.status || "ERR"}`);

  const rawRows = {};

  for (const entity of ENTITY_TABLES) {
    const fetched = await fetchEntityRows({
      baseUrl,
      entity,
      timeoutMs,
      pageSize,
      maxPages,
    });
    rawRows[entity] = fetched.rows || [];
    report.coverage[entity] = buildCoverageEntry(entity, fetched);
  }

  for (const table of REQUIRED_TABLES) {
    const entry = report.coverage[table];
    if (entry && entry.errors.length > 0) {
      report.errors.push(...entry.errors);
    }
  }

  const liveAgents = rawRows.agents.filter(isLiveRow);
  const liveFeedbacks = rawRows.feedbacks.filter(isLiveRow);
  const liveResponses = rawRows.feedback_responses.filter(isLiveRow);
  const liveRevocations = rawRows.revocations.filter(isLiveRow);

  report.idInvariants = evaluateIdInvariants({
    agents: liveAgents,
    feedbacks: liveFeedbacks,
    feedbackResponses: liveResponses,
    revocations: liveRevocations,
  });

  report.txSignatureChecks = evaluateTxSignatureChecks({
    feedbacks: liveFeedbacks,
    feedbackResponses: liveResponses,
    revocations: liveRevocations,
  });

  return report;
}

function buildCoverageSummary(indexerReports) {
  const summary = {};
  for (const table of ENTITY_TABLES) {
    const states = indexerReports.map((report) => {
      const coverage = report.coverage[table];
      return {
        baseUrl: report.baseUrl,
        endpoint: coverage?.endpoint || null,
        supported: coverage?.supported ?? false,
        count: coverage?.count ?? null,
        includeOrphaned: coverage?.includeOrphaned || {
          requested: false,
          used: false,
          fallbackToPlain: false,
        },
        keyHash: coverage?.canonical?.keyHash ?? null,
        payloadHash: coverage?.canonical?.payloadHash ?? null,
      };
    });

    const supported = states.filter((state) => state.supported);
    const countSet = new Set(supported.map((s) => s.count));
    const keyHashSet = new Set(supported.map((s) => s.keyHash));
    const payloadHashSet = new Set(supported.map((s) => s.payloadHash));

    summary[table] = {
      supportedOn: supported.length,
      unsupportedOn: states.length - supported.length,
      allSupported: supported.length === states.length,
      allEqualCount: countSet.size <= 1,
      allEqualKeyHash: keyHashSet.size <= 1,
      allEqualPayloadHash: payloadHashSet.size <= 1,
      states,
    };
  }
  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const timeoutMs = Number.parseInt(args["timeout-ms"] || "20000", 10);
  const pageSize = Number.parseInt(args["page-size"] || "2000", 10);
  const maxPages = Number.parseInt(args["max-pages"] || "300", 10);
  const enforceSix = args["allow-non-six"] !== "true";

  const indexers = (args.indexers || DEFAULT_INDEXERS.join(","))
    .split(",")
    .map((v) => v.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  if (indexers.length === 0) {
    throw new Error("Missing --indexers (comma-separated REST base URLs)");
  }
  if (enforceSix && indexers.length !== 6) {
    throw new Error(`Strict parity requires 6 indexers (got ${indexers.length}). Use --allow-non-six=true to override.`);
  }

  const outputPath = resolve(
    args.output || `artifacts/e2e-indexers/strict-integrity-${nowId()}/report.json`
  );

  const indexerReports = [];
  for (const baseUrl of indexers) {
    indexerReports.push(await analyzeOneIndexer({ baseUrl, timeoutMs, pageSize, maxPages }));
  }

  const comparison = compareIndexers(indexerReports);
  const coverageSummary = buildCoverageSummary(indexerReports);
  const verdict = evaluateVerdict(indexerReports, comparison);

  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      indexers,
      timeoutMs,
      pageSize,
      maxPages,
      enforceSix,
      requiredTables: REQUIRED_TABLES,
    },
    coverage: coverageSummary,
    indexers: indexerReports,
    mismatches: comparison.mismatches,
    verdict,
  };

  ensureDir(outputPath);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        report: outputPath,
        pass: verdict.pass,
        mismatchCount: verdict.mismatchCount,
        failingIndexers: verdict.failingIndexers.length,
      },
      null,
      2
    )
  );

  if (!verdict.pass) {
    process.exitCode = 2;
  }
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirect) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
