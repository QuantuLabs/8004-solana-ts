#!/usr/bin/env node

const { createHash } = require("crypto");
const { execFile } = require("child_process");
const { mkdirSync, writeFileSync } = require("fs");
const { dirname, resolve } = require("path");

const PG_BOOL_TEXT = (expr) => `CASE WHEN ${expr} IS NULL THEN NULL WHEN ${expr} THEN '1' ELSE '0' END`;
const SQLITE_BOOL_TEXT = (expr) => {
  const normalized = `trim(lower(CAST(${expr} AS TEXT)))`;
  return `CASE
    WHEN ${expr} IS NULL THEN NULL
    WHEN ${normalized} = '' THEN NULL
    WHEN ${normalized} IN ('1', 't', 'true', 'y', 'yes', 'on') THEN '1'
    WHEN ${normalized} IN ('0', 'f', 'false', 'n', 'no', 'off') THEN '0'
    WHEN (${normalized} NOT GLOB '*[^0-9]*')
      OR (
        substr(${normalized}, 1, 1) IN ('+', '-')
        AND length(${normalized}) > 1
        AND substr(${normalized}, 2) NOT GLOB '*[^0-9]*'
      )
      THEN CASE WHEN CAST(${normalized} AS INTEGER) = 0 THEN '0' ELSE '1' END
    ELSE '__invalid_bool__:' || lower(hex(CAST(${normalized} AS BLOB)))
  END`;
};
const PG_TEXT = (expr) => `${expr}::text`;
const SQLITE_TEXT = (expr) => `CAST(${expr} AS TEXT)`;
const PG_BYTEA_HEX = (expr) => `CASE WHEN ${expr} IS NULL THEN NULL ELSE lower(encode(${expr}::bytea, 'hex')) END`;
const SQLITE_BLOB_HEX = (expr) => `CASE WHEN ${expr} IS NULL THEN NULL ELSE lower(hex(${expr})) END`;
const PG_HASH_TEXT =
  (expr) => `CASE WHEN ${expr} IS NULL THEN NULL ELSE lower(regexp_replace(${expr}, '^(\\\\x|0x)', '')) END`;
const PG_EMPTY_TO_NULL = (expr) => `NULLIF(${expr}, '')`;
const SQLITE_EMPTY_TO_NULL = (expr) => `NULLIF(${expr}, '')`;
const ZERO_32_HEX = "0000000000000000000000000000000000000000000000000000000000000000";
const PG_HASH_TEXT_NORMALIZED = (expr) => `NULLIF(${PG_HASH_TEXT(expr)}, '${ZERO_32_HEX}')`;
const SQLITE_BLOB_HEX_NORMALIZED = (expr) => `NULLIF(${SQLITE_BLOB_HEX(expr)}, '${ZERO_32_HEX}')`;

const TABLE_SPECS = [
  {
    canonical: "Agent",
    pg: ["agents"],
    sqlite: ["Agent"],
    fromPg: "%TABLE% a",
    fromSqlite: "%TABLE% a",
    columns: [
      { name: "asset", pg: "a.asset", sqlite: "a.id" },
      { name: "owner", pg: "a.owner", sqlite: "a.owner" },
      { name: "creator", pg: PG_EMPTY_TO_NULL("a.creator"), sqlite: SQLITE_EMPTY_TO_NULL("a.creator") },
      { name: "uri", pg: PG_EMPTY_TO_NULL("a.agent_uri"), sqlite: SQLITE_EMPTY_TO_NULL("a.uri") },
      { name: "wallet", pg: PG_EMPTY_TO_NULL("a.agent_wallet"), sqlite: SQLITE_EMPTY_TO_NULL("a.wallet") },
      { name: "atom_enabled", pg: PG_BOOL_TEXT("a.atom_enabled"), sqlite: SQLITE_BOOL_TEXT("a.atomEnabled") },
      { name: "collection", pg: PG_EMPTY_TO_NULL("a.collection"), sqlite: SQLITE_EMPTY_TO_NULL("a.collection") },
      { name: "canonical_col", pg: PG_EMPTY_TO_NULL("a.canonical_col"), sqlite: SQLITE_EMPTY_TO_NULL("a.collectionPointer") },
      { name: "col_locked", pg: PG_BOOL_TEXT("a.col_locked"), sqlite: SQLITE_BOOL_TEXT("a.colLocked") },
      { name: "parent_asset", pg: PG_EMPTY_TO_NULL("a.parent_asset"), sqlite: SQLITE_EMPTY_TO_NULL("a.parentAsset") },
      { name: "parent_creator", pg: PG_EMPTY_TO_NULL("a.parent_creator"), sqlite: SQLITE_EMPTY_TO_NULL("a.parentCreator") },
      { name: "parent_locked", pg: PG_BOOL_TEXT("a.parent_locked"), sqlite: SQLITE_BOOL_TEXT("a.parentLocked") },
      { name: "nft_name", pg: PG_EMPTY_TO_NULL("a.nft_name"), sqlite: SQLITE_EMPTY_TO_NULL("a.nftName") },
      { name: "trust_tier", pg: PG_TEXT("a.trust_tier"), sqlite: SQLITE_TEXT("a.trustTier") },
      { name: "quality_score", pg: PG_TEXT("a.quality_score"), sqlite: SQLITE_TEXT("a.qualityScore") },
      { name: "confidence", pg: PG_TEXT("a.confidence"), sqlite: SQLITE_TEXT("a.confidence") },
      { name: "risk_score", pg: PG_TEXT("a.risk_score"), sqlite: SQLITE_TEXT("a.riskScore") },
      { name: "diversity_ratio", pg: PG_TEXT("a.diversity_ratio"), sqlite: SQLITE_TEXT("a.diversityRatio") },
      { name: "feedback_count", pg: PG_TEXT("a.feedback_count"), sqlite: SQLITE_TEXT("a.feedbackCount") },
      { name: "raw_avg_score", pg: PG_TEXT("a.raw_avg_score"), sqlite: SQLITE_TEXT("a.rawAvgScore") },
      { name: "agent_id", pg: PG_TEXT("a.agent_id"), sqlite: SQLITE_TEXT("a.agent_id") },
      { name: "tx_signature", pg: PG_EMPTY_TO_NULL("a.tx_signature"), sqlite: SQLITE_EMPTY_TO_NULL("a.createdTxSignature") },
      { name: "tx_index", pg: PG_TEXT("a.tx_index"), sqlite: SQLITE_TEXT("a.txIndex") },
      { name: "event_ordinal", pg: PG_TEXT("a.event_ordinal"), sqlite: SQLITE_TEXT("a.eventOrdinal") },
      { name: "status", pg: "a.status", sqlite: "a.status" },
      { name: "verified_slot", pg: PG_TEXT("a.verified_slot"), sqlite: SQLITE_TEXT("a.verifiedSlot") },
    ],
    orderBy: ["tx_signature", "tx_index", "event_ordinal", "asset"],
  },
  {
    canonical: "Collection",
    pg: ["collections"],
    sqlite: ["Registry"],
    fromPg: "%TABLE% c",
    fromSqlite: "%TABLE% c",
    columns: [
      { name: "collection", pg: PG_EMPTY_TO_NULL("c.collection"), sqlite: SQLITE_EMPTY_TO_NULL("c.collection") },
      { name: "registry_type", pg: "upper(c.registry_type)", sqlite: "upper(c.registryType)" },
      { name: "authority", pg: PG_EMPTY_TO_NULL("c.authority"), sqlite: SQLITE_EMPTY_TO_NULL("c.authority") },
      { name: "status", pg: "c.status", sqlite: "c.status" },
    ],
    orderBy: ["collection"],
  },
  {
    canonical: "CollectionPointer",
    pg: ["collection_pointers"],
    sqlite: ["CollectionPointer"],
    fromPg: "%TABLE% cp",
    fromSqlite: "%TABLE% cp",
    columns: [
      { name: "col", pg: "cp.col", sqlite: "cp.col" },
      { name: "creator", pg: "cp.creator", sqlite: "cp.creator" },
      { name: "first_seen_asset", pg: PG_EMPTY_TO_NULL("cp.first_seen_asset"), sqlite: SQLITE_EMPTY_TO_NULL("cp.firstSeenAsset") },
      { name: "first_seen_slot", pg: PG_TEXT("cp.first_seen_slot"), sqlite: SQLITE_TEXT("cp.firstSeenSlot") },
      {
        name: "first_seen_tx_signature",
        pg: PG_EMPTY_TO_NULL("cp.first_seen_tx_signature"),
        sqlite: SQLITE_EMPTY_TO_NULL("cp.firstSeenTxSignature"),
      },
      { name: "last_seen_slot", pg: PG_TEXT("cp.last_seen_slot"), sqlite: SQLITE_TEXT("cp.lastSeenSlot") },
      { name: "last_seen_tx_signature", pg: PG_EMPTY_TO_NULL("cp.last_seen_tx_signature"), sqlite: SQLITE_EMPTY_TO_NULL("cp.lastSeenTxSignature") },
      { name: "asset_count", pg: PG_TEXT("cp.asset_count"), sqlite: SQLITE_TEXT("cp.assetCount") },
      { name: "version", pg: PG_EMPTY_TO_NULL("cp.version"), sqlite: SQLITE_EMPTY_TO_NULL("cp.version") },
      { name: "name", pg: PG_EMPTY_TO_NULL("cp.name"), sqlite: SQLITE_EMPTY_TO_NULL("cp.name") },
      { name: "symbol", pg: PG_EMPTY_TO_NULL("cp.symbol"), sqlite: SQLITE_EMPTY_TO_NULL("cp.symbol") },
      { name: "description", pg: PG_EMPTY_TO_NULL("cp.description"), sqlite: SQLITE_EMPTY_TO_NULL("cp.description") },
      { name: "image", pg: PG_EMPTY_TO_NULL("cp.image"), sqlite: SQLITE_EMPTY_TO_NULL("cp.image") },
      { name: "banner_image", pg: PG_EMPTY_TO_NULL("cp.banner_image"), sqlite: SQLITE_EMPTY_TO_NULL("cp.bannerImage") },
      { name: "social_website", pg: PG_EMPTY_TO_NULL("cp.social_website"), sqlite: SQLITE_EMPTY_TO_NULL("cp.socialWebsite") },
      { name: "social_x", pg: PG_EMPTY_TO_NULL("cp.social_x"), sqlite: SQLITE_EMPTY_TO_NULL("cp.socialX") },
      { name: "social_discord", pg: PG_EMPTY_TO_NULL("cp.social_discord"), sqlite: SQLITE_EMPTY_TO_NULL("cp.socialDiscord") },
      { name: "metadata_status", pg: PG_EMPTY_TO_NULL("cp.metadata_status"), sqlite: SQLITE_EMPTY_TO_NULL("cp.metadataStatus") },
      { name: "metadata_hash", pg: PG_EMPTY_TO_NULL("cp.metadata_hash"), sqlite: SQLITE_EMPTY_TO_NULL("cp.metadataHash") },
      { name: "metadata_bytes", pg: PG_TEXT("cp.metadata_bytes"), sqlite: SQLITE_TEXT("cp.metadataBytes") },
    ],
    orderBy: ["col", "creator"],
  },
  {
    canonical: "Metadata",
    pg: ["metadata"],
    sqlite: ["AgentMetadata"],
    fromPg: "%TABLE% m",
    fromSqlite: "%TABLE% m",
    columns: [
      { name: "asset", pg: "m.asset", sqlite: "m.agentId" },
      { name: "key", pg: "m.key", sqlite: "m.key" },
      { name: "value_hex", pg: PG_BYTEA_HEX("m.value"), sqlite: SQLITE_BLOB_HEX("m.value") },
      { name: "immutable", pg: PG_BOOL_TEXT("m.immutable"), sqlite: SQLITE_BOOL_TEXT("m.immutable") },
      { name: "block_slot", pg: PG_TEXT("m.block_slot"), sqlite: SQLITE_TEXT("m.slot") },
      { name: "tx_signature", pg: PG_EMPTY_TO_NULL("m.tx_signature"), sqlite: SQLITE_EMPTY_TO_NULL("m.txSignature") },
      { name: "tx_index", pg: PG_TEXT("m.tx_index"), sqlite: SQLITE_TEXT("m.txIndex") },
      { name: "event_ordinal", pg: PG_TEXT("m.event_ordinal"), sqlite: SQLITE_TEXT("m.eventOrdinal") },
      { name: "status", pg: "m.status", sqlite: "m.status" },
    ],
    orderBy: ["asset", "key", "block_slot", "tx_signature", "tx_index", "event_ordinal"],
  },
  {
    canonical: "Feedback",
    pg: ["feedbacks"],
    sqlite: ["Feedback"],
    fromPg: "%TABLE% f",
    fromSqlite: "%TABLE% f",
    columns: [
      { name: "feedback_id", pg: PG_TEXT("f.feedback_id"), sqlite: SQLITE_TEXT("f.feedback_id") },
      { name: "asset", pg: "f.asset", sqlite: "f.agentId" },
      { name: "client_address", pg: "f.client_address", sqlite: "f.client" },
      { name: "feedback_index", pg: PG_TEXT("f.feedback_index"), sqlite: SQLITE_TEXT("f.feedbackIndex") },
      { name: "value", pg: PG_TEXT("f.value"), sqlite: "f.value" },
      { name: "value_decimals", pg: PG_TEXT("f.value_decimals"), sqlite: SQLITE_TEXT("f.valueDecimals") },
      { name: "score", pg: PG_TEXT("f.score"), sqlite: SQLITE_TEXT("f.score") },
      { name: "tag1", pg: PG_EMPTY_TO_NULL("f.tag1"), sqlite: SQLITE_EMPTY_TO_NULL("f.tag1") },
      { name: "tag2", pg: PG_EMPTY_TO_NULL("f.tag2"), sqlite: SQLITE_EMPTY_TO_NULL("f.tag2") },
      { name: "endpoint", pg: PG_EMPTY_TO_NULL("f.endpoint"), sqlite: SQLITE_EMPTY_TO_NULL("f.endpoint") },
      { name: "feedback_uri", pg: PG_EMPTY_TO_NULL("f.feedback_uri"), sqlite: SQLITE_EMPTY_TO_NULL("f.feedbackUri") },
      { name: "feedback_hash", pg: PG_HASH_TEXT_NORMALIZED("f.feedback_hash"), sqlite: SQLITE_BLOB_HEX_NORMALIZED("f.feedbackHash") },
      { name: "running_digest", pg: PG_BYTEA_HEX("f.running_digest"), sqlite: SQLITE_BLOB_HEX("f.runningDigest") },
      { name: "is_revoked", pg: PG_BOOL_TEXT("f.is_revoked"), sqlite: SQLITE_BOOL_TEXT("f.revoked") },
      { name: "block_slot", pg: PG_TEXT("f.block_slot"), sqlite: SQLITE_TEXT("f.createdSlot") },
      { name: "tx_signature", pg: PG_EMPTY_TO_NULL("f.tx_signature"), sqlite: SQLITE_EMPTY_TO_NULL("f.createdTxSignature") },
      { name: "tx_index", pg: PG_TEXT("f.tx_index"), sqlite: SQLITE_TEXT("f.txIndex") },
      { name: "event_ordinal", pg: PG_TEXT("f.event_ordinal"), sqlite: SQLITE_TEXT("f.eventOrdinal") },
      { name: "status", pg: "f.status", sqlite: "f.status" },
    ],
    orderBy: [
      "asset",
      "client_address",
      "feedback_index",
      "block_slot",
      "tx_signature",
      "tx_index",
      "event_ordinal",
    ],
  },
  {
    canonical: "FeedbackResponse",
    pg: ["feedback_responses"],
    sqlite: ["FeedbackResponse"],
    sqliteRequires: ["Feedback"],
    fromPg: "%TABLE% fr",
    fromSqlite: "%TABLE% fr LEFT JOIN \"Feedback\" f ON f.id = fr.feedbackId",
    columns: [
      { name: "response_id", pg: PG_TEXT("fr.response_id"), sqlite: SQLITE_TEXT("fr.response_id") },
      { name: "asset", pg: "fr.asset", sqlite: "f.agentId" },
      { name: "client_address", pg: "fr.client_address", sqlite: "f.client" },
      { name: "feedback_index", pg: PG_TEXT("fr.feedback_index"), sqlite: SQLITE_TEXT("f.feedbackIndex") },
      { name: "responder", pg: "fr.responder", sqlite: "fr.responder" },
      { name: "response_uri", pg: PG_EMPTY_TO_NULL("fr.response_uri"), sqlite: SQLITE_EMPTY_TO_NULL("fr.responseUri") },
      { name: "response_hash", pg: PG_HASH_TEXT_NORMALIZED("fr.response_hash"), sqlite: SQLITE_BLOB_HEX_NORMALIZED("fr.responseHash") },
      { name: "running_digest", pg: PG_BYTEA_HEX("fr.running_digest"), sqlite: SQLITE_BLOB_HEX("fr.runningDigest") },
      { name: "response_count", pg: PG_TEXT("fr.response_count"), sqlite: SQLITE_TEXT("fr.responseCount") },
      { name: "block_slot", pg: PG_TEXT("fr.block_slot"), sqlite: SQLITE_TEXT("fr.slot") },
      { name: "tx_signature", pg: PG_EMPTY_TO_NULL("fr.tx_signature"), sqlite: SQLITE_EMPTY_TO_NULL("fr.txSignature") },
      { name: "tx_index", pg: PG_TEXT("fr.tx_index"), sqlite: SQLITE_TEXT("fr.txIndex") },
      { name: "event_ordinal", pg: PG_TEXT("fr.event_ordinal"), sqlite: SQLITE_TEXT("fr.eventOrdinal") },
      { name: "status", pg: "fr.status", sqlite: "fr.status" },
    ],
    orderBy: [
      "asset",
      "client_address",
      "feedback_index",
      "responder",
      "block_slot",
      "tx_signature",
      "tx_index",
      "event_ordinal",
    ],
  },
  {
    canonical: "Revocation",
    pg: ["revocations"],
    sqlite: ["Revocation"],
    fromPg: "%TABLE% r",
    fromSqlite: "%TABLE% r",
    columns: [
      { name: "revocation_id", pg: PG_TEXT("r.revocation_id"), sqlite: SQLITE_TEXT("r.revocation_id") },
      { name: "asset", pg: "r.asset", sqlite: "r.agentId" },
      { name: "client_address", pg: "r.client_address", sqlite: "r.client" },
      { name: "feedback_index", pg: PG_TEXT("r.feedback_index"), sqlite: SQLITE_TEXT("r.feedbackIndex") },
      { name: "feedback_hash", pg: PG_HASH_TEXT_NORMALIZED("r.feedback_hash"), sqlite: SQLITE_BLOB_HEX_NORMALIZED("r.feedbackHash") },
      { name: "slot", pg: PG_TEXT("r.slot"), sqlite: SQLITE_TEXT("r.slot") },
      { name: "original_score", pg: PG_TEXT("r.original_score"), sqlite: SQLITE_TEXT("r.originalScore") },
      { name: "atom_enabled", pg: PG_BOOL_TEXT("r.atom_enabled"), sqlite: SQLITE_BOOL_TEXT("r.atomEnabled") },
      { name: "had_impact", pg: PG_BOOL_TEXT("r.had_impact"), sqlite: SQLITE_BOOL_TEXT("r.hadImpact") },
      { name: "running_digest", pg: PG_BYTEA_HEX("r.running_digest"), sqlite: SQLITE_BLOB_HEX("r.runningDigest") },
      { name: "revoke_count", pg: PG_TEXT("r.revoke_count"), sqlite: SQLITE_TEXT("r.revokeCount") },
      { name: "tx_signature", pg: PG_EMPTY_TO_NULL("r.tx_signature"), sqlite: SQLITE_EMPTY_TO_NULL("r.txSignature") },
      { name: "tx_index", pg: PG_TEXT("r.tx_index"), sqlite: SQLITE_TEXT("r.txIndex") },
      { name: "event_ordinal", pg: PG_TEXT("r.event_ordinal"), sqlite: SQLITE_TEXT("r.eventOrdinal") },
      { name: "status", pg: "r.status", sqlite: "r.status" },
    ],
    orderBy: ["asset", "client_address", "feedback_index", "slot", "tx_signature", "tx_index", "event_ordinal"],
  },
  {
    canonical: "Validation",
    pg: ["validations"],
    sqlite: ["Validation"],
    fromPg: "%TABLE% v",
    fromSqlite: "%TABLE% v",
    columns: [
      { name: "asset", pg: "v.asset", sqlite: "v.agentId" },
      { name: "validator_address", pg: "v.validator_address", sqlite: "v.validator" },
      { name: "nonce", pg: PG_TEXT("v.nonce"), sqlite: SQLITE_TEXT("v.nonce") },
      { name: "requester", pg: "v.requester", sqlite: "v.requester" },
      { name: "request_uri", pg: PG_EMPTY_TO_NULL("v.request_uri"), sqlite: SQLITE_EMPTY_TO_NULL("v.requestUri") },
      { name: "request_hash", pg: PG_HASH_TEXT_NORMALIZED("v.request_hash"), sqlite: SQLITE_BLOB_HEX_NORMALIZED("v.requestHash") },
      { name: "response", pg: PG_TEXT("v.response"), sqlite: SQLITE_TEXT("v.response") },
      { name: "response_uri", pg: PG_EMPTY_TO_NULL("v.response_uri"), sqlite: SQLITE_EMPTY_TO_NULL("v.responseUri") },
      { name: "response_hash", pg: PG_HASH_TEXT_NORMALIZED("v.response_hash"), sqlite: SQLITE_BLOB_HEX_NORMALIZED("v.responseHash") },
      { name: "tag", pg: PG_EMPTY_TO_NULL("v.tag"), sqlite: SQLITE_EMPTY_TO_NULL("v.tag") },
      { name: "chain_status", pg: "v.chain_status", sqlite: "v.chainStatus" },
    ],
    orderBy: ["asset", "validator_address", "nonce"],
  },
  {
    canonical: "IndexerState",
    pg: ["indexer_state"],
    sqlite: ["IndexerState"],
    fromPg: "%TABLE% s",
    fromSqlite: "%TABLE% s",
    columns: [
      { name: "id", pg: "s.id", sqlite: "s.id" },
      { name: "last_signature", pg: "s.last_signature", sqlite: "s.lastSignature" },
      { name: "last_slot", pg: PG_TEXT("s.last_slot"), sqlite: SQLITE_TEXT("s.lastSlot") },
      { name: "source", pg: "s.source", sqlite: "s.source" },
    ],
    orderBy: ["id"],
  },
  {
    canonical: "AgentDigestCache",
    pg: ["agent_digest_cache"],
    sqlite: ["AgentDigestCache"],
    fromPg: "%TABLE% d",
    fromSqlite: "%TABLE% d",
    columns: [
      { name: "agent_id", pg: "d.agent_id", sqlite: "d.agentId" },
      { name: "feedback_digest", pg: PG_BYTEA_HEX("d.feedback_digest"), sqlite: SQLITE_BLOB_HEX("d.feedbackDigest") },
      { name: "feedback_count", pg: PG_TEXT("d.feedback_count"), sqlite: SQLITE_TEXT("d.feedbackCount") },
      { name: "response_digest", pg: PG_BYTEA_HEX("d.response_digest"), sqlite: SQLITE_BLOB_HEX("d.responseDigest") },
      { name: "response_count", pg: PG_TEXT("d.response_count"), sqlite: SQLITE_TEXT("d.responseCount") },
      { name: "revoke_digest", pg: PG_BYTEA_HEX("d.revoke_digest"), sqlite: SQLITE_BLOB_HEX("d.revokeDigest") },
      { name: "revoke_count", pg: PG_TEXT("d.revoke_count"), sqlite: SQLITE_TEXT("d.revokeCount") },
      { name: "last_verified_slot", pg: PG_TEXT("d.last_verified_slot"), sqlite: SQLITE_TEXT("d.lastVerifiedSlot") },
      { name: "needs_gap_fill", pg: PG_BOOL_TEXT("d.needs_gap_fill"), sqlite: SQLITE_BOOL_TEXT("d.needsGapFill") },
      { name: "gap_fill_from_slot", pg: PG_TEXT("d.gap_fill_from_slot"), sqlite: SQLITE_TEXT("d.gapFillFromSlot") },
    ],
    orderBy: ["agent_id"],
  },
];

const REQUIRED_PORTS = [3201, 3202, 3203, 3204, 3205, 3206];
const DEFAULT_PG_PORTS = [3201, 3202, 3203, 3205, 3206];
const DEFAULT_PG_DBS = [
  "indexer_devnet_3201",
  "indexer_devnet_3202",
  "indexer_devnet_3203",
  "indexer_devnet_3205",
  "indexer_devnet_3206",
];
const DEFAULT_SQLITE_PORT = 3204;
const DEFAULT_SQLITE_DB =
  "/Users/true/Documents/Pipeline/CasterCorp/8004-solana-indexer/prisma/data/devnet-integrity-3204.db";
const DEFAULT_OUTPUT_DIR = "artifacts/e2e-indexers";
const DEFAULT_SAMPLE_LIMIT = 5;
const DEFAULT_SOURCE_CONCURRENCY = 6;
const DEFAULT_TABLE_CONCURRENCY = 4;
const COMMAND_MAX_BUFFER = 512 * 1024 * 1024;

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

function splitCsv(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function asPositiveInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const limit = Math.max(1, Math.min(list.length, asPositiveInt(concurrency) || 1));
  const out = new Array(list.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= list.length) return;
      out[i] = await mapper(list[i], i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return out;
}

function compareStrings(a, b) {
  return String(a).localeCompare(String(b), "en", { sensitivity: "base" });
}

function splitLines(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n").trimEnd();
  if (!text) return [];
  return text.split("\n");
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteIdent(id) {
  return `"${String(id).replace(/"/g, '""')}"`;
}

function describeCommand(file, args) {
  return [file, ...args]
    .map((part) => (String(part).includes(" ") ? JSON.stringify(String(part)) : String(part)))
    .join(" ");
}

function runCommand(file, args) {
  return new Promise((resolvePromise) => {
    execFile(file, args, { encoding: "utf8", maxBuffer: COMMAND_MAX_BUFFER }, (error, stdout, stderr) => {
      resolvePromise({
        ok: !error,
        stdout: stdout || "",
        stderr: stderr || "",
        code: error && Number.isInteger(error.code) ? error.code : 0,
        errorMessage: error ? error.message : null,
      });
    });
  });
}

function sha256Lines(lines) {
  const hash = createHash("sha256");
  for (const line of lines.slice().sort(compareStrings)) {
    hash.update(line);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function pgEncodeExpr(textExpr) {
  return `encode(convert_to((${textExpr})::text, 'UTF8'), 'hex')`;
}

function sqliteEncodeExpr(textExpr) {
  return `lower(hex(CAST((${textExpr}) AS BLOB)))`;
}

function buildRowExpr(columnNames, engine) {
  const encodeExprFn = engine === "pg" ? pgEncodeExpr : sqliteEncodeExpr;
  if (!columnNames.length) return `'__empty__'`;
  return columnNames
    .map((name) => {
      const id = quoteIdent(name);
      const value = `CASE WHEN ${id} IS NULL THEN '∅' ELSE ${id} END`;
      return `${sqlLiteral(`${name}=`)} || ${encodeExprFn(value)}`;
    })
    .join(` || '|' || `);
}

function makeEmptyTableResult({ canonicalTable, physicalTable, mappingCandidates, error, errorDetail, columns }) {
  return {
    canonicalTable,
    physicalTable: physicalTable || null,
    mappingCandidates: mappingCandidates || [],
    columns: columns || [],
    columnCount: (columns || []).length,
    rowCount: 0,
    rowHash: sha256Lines([]),
    lines: [],
    error,
    errorDetail: errorDetail || null,
  };
}

function resolvePhysicalTableName(candidates, availableNames) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const set = new Set(availableNames);
  const lowerMap = new Map(availableNames.map((name) => [String(name).toLowerCase(), name]));
  for (const candidate of candidates) {
    if (set.has(candidate)) return candidate;
    const byLower = lowerMap.get(String(candidate).toLowerCase());
    if (byLower) return byLower;
  }
  return null;
}

function buildTableDefinitions(requestedTables) {
  const byCanonical = new Map(TABLE_SPECS.map((entry) => [entry.canonical.toLowerCase(), entry]));
  const defs = [];
  const unknown = [];
  for (const raw of requestedTables) {
    const match = byCanonical.get(String(raw).toLowerCase());
    if (match) {
      defs.push(match);
    } else {
      unknown.push(raw);
    }
  }
  return { defs, unknown };
}

async function listPgTables({ container, user, password, db }) {
  const sql = "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;";
  const args = [
    "exec",
    "-e",
    `PGPASSWORD=${password}`,
    container,
    "psql",
    "-U",
    user,
    "-d",
    db,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    sql,
  ];
  const out = await runCommand("docker", args);
  if (!out.ok) {
    return {
      names: [],
      error: "source_table_list_failed",
      errorDetail: {
        command: describeCommand("docker", args),
        code: out.code,
        stderr: out.stderr.trim(),
        message: out.errorMessage,
      },
    };
  }
  return { names: splitLines(out.stdout).sort(compareStrings), error: null, errorDetail: null };
}

async function listSqliteTables({ dbPath }) {
  const sql = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;";
  const args = [dbPath, sql];
  const out = await runCommand("sqlite3", args);
  if (!out.ok) {
    return {
      names: [],
      error: "source_table_list_failed",
      errorDetail: {
        command: describeCommand("sqlite3", args),
        code: out.code,
        stderr: out.stderr.trim(),
        message: out.errorMessage,
      },
    };
  }
  return { names: splitLines(out.stdout).sort(compareStrings), error: null, errorDetail: null };
}

function buildProjectionSql(spec, engine, physicalTable) {
  const fromTemplate = engine === "pg" ? spec.fromPg : spec.fromSqlite;
  const tableIdent = quoteIdent(physicalTable);
  const fromClause = String(fromTemplate).split("%TABLE%").join(tableIdent);
  const cols = spec.columns.map((col) => {
    const expr = engine === "pg" ? col.pg : col.sqlite;
    return `${expr} AS ${quoteIdent(col.name)}`;
  });
  const orderBy = Array.isArray(spec.orderBy) && spec.orderBy.length > 0
    ? ` ORDER BY ${spec.orderBy.map((c) => `${quoteIdent(c)} ASC`).join(", ")}`
    : "";
  return `SELECT ${cols.join(", ")} FROM ${fromClause}${orderBy}`;
}

async function fetchPgTableLines({ container, user, password, db, spec, physicalTable }) {
  const canonicalTable = spec.canonical;
  const columnNames = spec.columns.map((c) => c.name);
  const projectionSql = buildProjectionSql(spec, "pg", physicalTable);
  const rowExpr = buildRowExpr(columnNames, "pg");
  const dataSql = `SELECT ${rowExpr} AS line FROM (${projectionSql}) q ORDER BY line;`;

  const dataArgs = [
    "exec",
    "-e",
    `PGPASSWORD=${password}`,
    container,
    "psql",
    "-U",
    user,
    "-d",
    db,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    dataSql,
  ];
  const dataOut = await runCommand("docker", dataArgs);
  if (!dataOut.ok) {
    return makeEmptyTableResult({
      canonicalTable,
      physicalTable,
      mappingCandidates: spec.pg,
      columns: columnNames,
      error: "table_rows_query_failed",
      errorDetail: {
        command: describeCommand("docker", dataArgs),
        code: dataOut.code,
        stderr: dataOut.stderr.trim(),
        message: dataOut.errorMessage,
      },
    });
  }

  const lines = splitLines(dataOut.stdout).sort(compareStrings);
  return {
    canonicalTable,
    physicalTable,
    mappingCandidates: spec.pg,
    columns: columnNames.map((name) => ({ name })),
    columnCount: columnNames.length,
    rowCount: lines.length,
    rowHash: sha256Lines(lines),
    lines,
    error: null,
    errorDetail: null,
  };
}

async function fetchSqliteTableLines({ dbPath, spec, physicalTable }) {
  const canonicalTable = spec.canonical;
  const columnNames = spec.columns.map((c) => c.name);
  const projectionSql = buildProjectionSql(spec, "sqlite", physicalTable);
  const rowExpr = buildRowExpr(columnNames, "sqlite");
  const dataSql = `SELECT ${rowExpr} AS line FROM (${projectionSql}) q ORDER BY line;`;

  const dataArgs = [dbPath, dataSql];
  const dataOut = await runCommand("sqlite3", dataArgs);
  if (!dataOut.ok) {
    return makeEmptyTableResult({
      canonicalTable,
      physicalTable,
      mappingCandidates: spec.sqlite,
      columns: columnNames,
      error: "table_rows_query_failed",
      errorDetail: {
        command: describeCommand("sqlite3", dataArgs),
        code: dataOut.code,
        stderr: dataOut.stderr.trim(),
        message: dataOut.errorMessage,
      },
    });
  }

  const lines = splitLines(dataOut.stdout).sort(compareStrings);
  return {
    canonicalTable,
    physicalTable,
    mappingCandidates: spec.sqlite,
    columns: columnNames.map((name) => ({ name })),
    columnCount: columnNames.length,
    rowCount: lines.length,
    rowHash: sha256Lines(lines),
    lines,
    error: null,
    errorDetail: null,
  };
}

function summarizeSource(source, tableData) {
  const sorted = tableData.slice().sort((a, b) => compareStrings(a.canonicalTable, b.canonicalTable));
  const tables = {};
  for (const item of sorted) {
    tables[item.canonicalTable] = {
      canonicalTable: item.canonicalTable,
      physicalTable: item.physicalTable,
      mappingCandidates: item.mappingCandidates,
      columns: item.columns.map((c) => c.name),
      columnCount: item.columns.length,
      rowCount: item.rowCount,
      hash: item.rowHash,
      error: item.error,
      errorDetail: item.errorDetail,
    };
  }
  return {
    label: source.label,
    port: source.port,
    engine: source.engine,
    db: source.engine === "pg" ? source.db : source.dbPath,
    tables,
    __raw: Object.fromEntries(tableData.map((item) => [item.canonicalTable, item])),
  };
}

function multisetDiffSamples(leftLines, rightLines, sampleLimit) {
  const rightCounts = new Map();
  for (const line of rightLines) {
    rightCounts.set(line, (rightCounts.get(line) || 0) + 1);
  }

  const onlyLeftSample = [];
  let onlyLeftCount = 0;
  for (const line of leftLines) {
    const count = rightCounts.get(line) || 0;
    if (count > 0) {
      rightCounts.set(line, count - 1);
      continue;
    }
    onlyLeftCount += 1;
    if (onlyLeftSample.length < sampleLimit) onlyLeftSample.push(line);
  }

  const leftCounts = new Map();
  for (const line of leftLines) {
    leftCounts.set(line, (leftCounts.get(line) || 0) + 1);
  }

  const onlyRightSample = [];
  let onlyRightCount = 0;
  for (const line of rightLines) {
    const count = leftCounts.get(line) || 0;
    if (count > 0) {
      leftCounts.set(line, count - 1);
      continue;
    }
    onlyRightCount += 1;
    if (onlyRightSample.length < sampleLimit) onlyRightSample.push(line);
  }

  return {
    onlyLeftCount,
    onlyRightCount,
    onlyLeftSample,
    onlyRightSample,
  };
}

function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function compareAll(summaries, tableDefs, sampleLimit) {
  const mismatches = [];
  if (summaries.length < 2) return mismatches;

  const ref = summaries[0];
  for (let i = 1; i < summaries.length; i += 1) {
    const cur = summaries[i];
    for (const tableDef of tableDefs) {
      const table = tableDef.canonical;
      const a = ref.tables[table];
      const b = cur.tables[table];
      if (!a || !b) {
        mismatches.push({
          table,
          kind: "missing_table_summary",
          left: ref.label,
          right: cur.label,
        });
        continue;
      }
      if (a.error || b.error) {
        mismatches.push({
          table,
          kind: "table_error",
          left: ref.label,
          right: cur.label,
          leftError: a.error,
          rightError: b.error,
          leftPhysicalTable: a.physicalTable,
          rightPhysicalTable: b.physicalTable,
        });
        continue;
      }
      if (!arraysEqual(a.columns, b.columns)) {
        mismatches.push({
          table,
          kind: "schema_columns_mismatch",
          left: ref.label,
          right: cur.label,
          leftColumns: a.columns,
          rightColumns: b.columns,
          leftPhysicalTable: a.physicalTable,
          rightPhysicalTable: b.physicalTable,
        });
      }

      let lineDiff = null;
      if (a.rowCount !== b.rowCount || a.hash !== b.hash) {
        const leftRaw = ref.__raw[table] ? ref.__raw[table].lines : [];
        const rightRaw = cur.__raw[table] ? cur.__raw[table].lines : [];
        lineDiff = multisetDiffSamples(leftRaw, rightRaw, sampleLimit);
      }

      if (a.rowCount !== b.rowCount) {
        mismatches.push({
          table,
          kind: "row_count_mismatch",
          left: ref.label,
          right: cur.label,
          leftValue: a.rowCount,
          rightValue: b.rowCount,
          sample: lineDiff,
        });
      }
      if (a.hash !== b.hash) {
        mismatches.push({
          table,
          kind: "row_hash_mismatch",
          left: ref.label,
          right: cur.label,
          leftValue: a.hash,
          rightValue: b.hash,
          sample: lineDiff,
        });
      }
    }
  }

  return mismatches.sort(
    (a, b) =>
      compareStrings(a.table, b.table) ||
      compareStrings(a.kind, b.kind) ||
      compareStrings(a.left, b.left) ||
      compareStrings(a.right, b.right)
  );
}

function parseSources(args) {
  const pgContainer = args["pg-container"] || "idx-devnet-pg";
  const pgUser = args["pg-user"] || "indexer";
  const pgPassword = args["pg-password"] || "indexer";
  const pgPorts = splitCsv(args["pg-ports"] || DEFAULT_PG_PORTS.join(","));
  const pgDbs = splitCsv(args["pg-dbs"] || DEFAULT_PG_DBS.join(","));
  const sqlitePort = asPositiveInt(args["sqlite-port"] || DEFAULT_SQLITE_PORT);
  const sqliteDb = args["sqlite-db"] || DEFAULT_SQLITE_DB;
  const sqliteLabel = args["sqlite-label"] || (sqlitePort ? `indexer_${sqlitePort}` : "indexer_sqlite");
  const configErrors = [];
  const sources = [];

  const pgCount = Math.max(pgPorts.length, pgDbs.length);
  for (let i = 0; i < pgCount; i += 1) {
    const port = asPositiveInt(pgPorts[i]);
    const db = pgDbs[i];
    if (!port || !db) {
      configErrors.push(`invalid_pg_source_mapping:index=${i}:port=${pgPorts[i] || ""}:db=${db || ""}`);
      continue;
    }
    sources.push({
      label: `indexer_${port}`,
      port,
      engine: "pg",
      db,
    });
  }

  if (!sqlitePort) {
    configErrors.push(`invalid_sqlite_port:${args["sqlite-port"] || ""}`);
  }
  if (!sqliteDb) {
    configErrors.push("missing_sqlite_db");
  } else {
    sources.push({
      label: sqliteLabel,
      port: sqlitePort || DEFAULT_SQLITE_PORT,
      engine: "sqlite",
      dbPath: sqliteDb,
    });
  }

  sources.sort(
    (a, b) =>
      (a.port || Number.MAX_SAFE_INTEGER) - (b.port || Number.MAX_SAFE_INTEGER) ||
      compareStrings(a.label, b.label)
  );

  if (sources.length !== 6) {
    configErrors.push(`expected_exactly_6_sources:found_${sources.length}`);
  }

  const seenPorts = new Set(sources.map((s) => s.port));
  const missingRequiredPorts = REQUIRED_PORTS.filter((p) => !seenPorts.has(p));
  if (missingRequiredPorts.length > 0) {
    configErrors.push(`missing_required_ports:${missingRequiredPorts.join(",")}`);
  }

  return {
    pgContainer,
    pgUser,
    pgPassword,
    sqliteDb,
    sqliteLabel,
    sources,
    configErrors,
  };
}

async function processSource(source, tableDefs, pgConfig, tableConcurrency) {
  const listed =
    source.engine === "pg"
      ? await listPgTables({
          container: pgConfig.container,
          user: pgConfig.user,
          password: pgConfig.password,
          db: source.db,
        })
      : await listSqliteTables({ dbPath: source.dbPath });

  const availableNames = listed.names || [];
  const availableSet = new Set(availableNames);

  const tableData = await mapWithConcurrency(tableDefs, tableConcurrency, async (tableDef) => {
    const candidates = source.engine === "pg" ? tableDef.pg : tableDef.sqlite;
    const physicalTable = resolvePhysicalTableName(candidates, availableNames);

    if (listed.error) {
      return makeEmptyTableResult({
        canonicalTable: tableDef.canonical,
        physicalTable: null,
        mappingCandidates: candidates,
        columns: tableDef.columns.map((c) => c.name),
        error: listed.error,
        errorDetail: listed.errorDetail,
      });
    }

    if (!physicalTable) {
      return makeEmptyTableResult({
        canonicalTable: tableDef.canonical,
        physicalTable: null,
        mappingCandidates: candidates,
        columns: tableDef.columns.map((c) => c.name),
        error: "mapped_table_not_found",
        errorDetail: {
          candidates,
          availableTableCount: availableNames.length,
        },
      });
    }

    const requires = source.engine === "pg" ? tableDef.pgRequires || [] : tableDef.sqliteRequires || [];
    const missingRequires = requires.filter((name) => !availableSet.has(name));
    if (missingRequires.length > 0) {
      return makeEmptyTableResult({
        canonicalTable: tableDef.canonical,
        physicalTable,
        mappingCandidates: candidates,
        columns: tableDef.columns.map((c) => c.name),
        error: "required_table_not_found",
        errorDetail: {
          missingRequires,
        },
      });
    }

    if (source.engine === "pg") {
      return fetchPgTableLines({
        container: pgConfig.container,
        user: pgConfig.user,
        password: pgConfig.password,
        db: source.db,
        spec: tableDef,
        physicalTable,
      });
    }

    return fetchSqliteTableLines({
      dbPath: source.dbPath,
      spec: tableDef,
      physicalTable,
    });
  });

  const summary = summarizeSource(source, tableData);
  summary.availableTables = availableNames;
  summary.tableListError = listed.error;
  summary.tableListErrorDetail = listed.errorDetail;
  return summary;
}

function stripRawLines(sourceSummaries) {
  return sourceSummaries.map((summary) => {
    const out = { ...summary };
    delete out.__raw;
    return out;
  });
}

function sourceHasErrors(sourceSummary) {
  if (sourceSummary.tableListError) return true;
  const tableEntries = Object.values(sourceSummary.tables || {});
  return tableEntries.some((entry) => Boolean(entry.error));
}

function buildRunSummary({ outputPath, pass, mismatches, sourceSummaries, tableDefs, configErrors }) {
  return {
    report: outputPath,
    pass,
    status: pass ? "pass" : "fail",
    mismatchCount: mismatches.length,
    sourceCount: sourceSummaries.length,
    tableCount: tableDefs.length,
    sourceErrorCount: sourceSummaries.filter(sourceHasErrors).length,
    configErrorCount: configErrors.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const parsed = parseSources(args);
  const sampleLimit = asPositiveInt(args["sample-limit"]) || DEFAULT_SAMPLE_LIMIT;
  const requestedTables = splitCsv(args.tables || TABLE_SPECS.map((entry) => entry.canonical).join(","));
  const built = buildTableDefinitions(requestedTables);
  const tableDefs = built.defs;
  const outputPath = resolve(args.output || `${DEFAULT_OUTPUT_DIR}/db-full-integrity-${nowId()}.json`);

  if (built.unknown.length > 0) {
    parsed.configErrors.push(`unknown_tables:${built.unknown.join(",")}`);
  }

  const sourceConcurrency = asPositiveInt(args["source-concurrency"]) || DEFAULT_SOURCE_CONCURRENCY;
  const tableConcurrency = asPositiveInt(args["table-concurrency"]) || DEFAULT_TABLE_CONCURRENCY;

  const sourceSummaries = await mapWithConcurrency(parsed.sources, sourceConcurrency, (source) =>
    processSource(
      source,
      tableDefs,
      {
        container: parsed.pgContainer,
        user: parsed.pgUser,
        password: parsed.pgPassword,
      },
      tableConcurrency
    )
  );

  const mismatches = compareAll(sourceSummaries, tableDefs, sampleLimit);
  const sourceErrorCount = sourceSummaries.filter(sourceHasErrors).length;
  const pass = mismatches.length === 0 && sourceErrorCount === 0 && parsed.configErrors.length === 0;

  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      pgContainer: parsed.pgContainer,
      pgUser: parsed.pgUser,
      pgDbs: parsed.sources.filter((s) => s.engine === "pg").map((s) => s.db),
      pgPorts: parsed.sources.filter((s) => s.engine === "pg").map((s) => s.port),
      sqliteDb: parsed.sqliteDb,
      sqliteLabel: parsed.sqliteLabel,
      sqlitePort: parsed.sources.find((s) => s.engine === "sqlite")?.port || null,
      requiredPorts: REQUIRED_PORTS,
      sampleLimit,
      sourceConcurrency,
      tableConcurrency,
      tables: tableDefs.map((table) => table.canonical),
      tableMapping: tableDefs.map((table) => ({
        canonical: table.canonical,
        pgCandidates: table.pg,
        sqliteCandidates: table.sqlite,
      })),
      sources: parsed.sources.map((source) => ({
        label: source.label,
        port: source.port,
        engine: source.engine,
        db: source.engine === "pg" ? source.db : source.dbPath,
      })),
    },
    coverage: {
      mode: "db_full_columns_rows_parallel_strict_canonical",
      description:
        "Mapped tables are fetched in parallel across all sources. Canonical per-table projections align Postgres/SQLite schema differences, then rows are compared strictly by deterministic serialized content.",
      tableCount: tableDefs.length,
      sourceCount: sourceSummaries.length,
    },
    configErrors: parsed.configErrors,
    sources: stripRawLines(sourceSummaries),
    mismatches,
    mismatchCount: mismatches.length,
    sourceErrorCount,
    pass,
    status: pass ? "pass" : "fail",
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      buildRunSummary({
        outputPath,
        pass,
        mismatches,
        sourceSummaries,
        tableDefs,
        configErrors: parsed.configErrors,
      }),
      null,
      2
    )
  );

  if (!pass) process.exitCode = 2;
}

main().catch((error) => {
  const outputPath = resolve(`${DEFAULT_OUTPUT_DIR}/db-full-integrity-${nowId()}-fatal.json`);
  const report = {
    generatedAt: new Date().toISOString(),
    pass: false,
    status: "fail",
    fatalError: {
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : null,
    },
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error(JSON.stringify({ report: outputPath, pass: false, status: "fail", fatal: true }, null, 2));
  process.exitCode = 2;
});
