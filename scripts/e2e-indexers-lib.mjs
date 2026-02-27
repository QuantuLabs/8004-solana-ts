#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

export const RUNLOG_MARKERS = {
  runsStart: '<!-- RUNS:START -->',
  runsEnd: '<!-- RUNS:END -->',
  jobsStart: '<!-- JOBS:START -->',
  jobsEnd: '<!-- JOBS:END -->',
  diffsStart: '<!-- DIFFS:START -->',
  diffsEnd: '<!-- DIFFS:END -->',
};

export const RUNLOG_TEMPLATE = `# E2E Indexers Runlog

Execution history for indexer E2E matrix runs.

## Runbook Notes

- Matrix pass requires seed success plus passing endpoint availability and ID checks on enabled indexer check jobs (\`available: true\`, \`idChecks.passed: true\`).
- Inter-indexer parity mismatch count is diagnostic; parity mismatch alone is not sufficient to classify a run as fail/pass.
- Key env knobs: \`E2E_INDEXERS_REVOKE_PREFLIGHT_POLL_ATTEMPTS\`, \`E2E_INDEXERS_REVOKE_PREFLIGHT_POLL_DELAY_MS\`, \`E2E_INDEXERS_REVOKE_PREFLIGHT_POLL_TIMEOUT_MS\`, \`E2E_INDEXERS_IPFS_API_URL\`, \`E2E_INDEXERS_IPFS_CONTAINER_NAME\`, \`E2E_INDEXERS_IPFS_API_PORT\`, \`E2E_INDEXERS_IPFS_GATEWAY_PORT\`, \`E2E_INDEXERS_IPFS_IMAGE\`.

## Runs
${RUNLOG_MARKERS.runsStart}
${RUNLOG_MARKERS.runsEnd}

## Jobs
${RUNLOG_MARKERS.jobsStart}
${RUNLOG_MARKERS.jobsEnd}

## Diffs
${RUNLOG_MARKERS.diffsStart}
${RUNLOG_MARKERS.diffsEnd}
`;

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

export function getArg(args, name) {
  const value = args[name];
  return typeof value === 'string' ? value : undefined;
}

export function getArgOr(args, name, fallback) {
  return getArg(args, name) ?? fallback;
}

export function getFlag(args, name) {
  return args[name] === true;
}

export function boolFromEnv(name, fallback = false) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeRunId(prefix = 'matrix') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${prefix}-${stamp}`;
}

export function resolveFromCwd(pathValue) {
  return resolve(process.cwd(), pathValue);
}

export function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function writeJson(filePath, value) {
  ensureParentDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function writeText(filePath, value) {
  ensureParentDir(filePath);
  writeFileSync(filePath, value, 'utf8');
}

export function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function fileExists(filePath) {
  return existsSync(filePath);
}

export function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

export async function pollWithTimeout({
  label = 'poll',
  check,
  maxAttempts = 10,
  intervalMs = 500,
  timeoutMs,
}) {
  if (typeof check !== 'function') {
    throw new Error('pollWithTimeout requires a check function');
  }

  const attemptsLimit = Number.isFinite(maxAttempts)
    ? Math.max(1, Math.trunc(maxAttempts))
    : 1;
  const delayMs = Number.isFinite(intervalMs)
    ? Math.max(0, Math.trunc(intervalMs))
    : 0;
  const timeoutLimit = Number.isFinite(timeoutMs)
    ? Math.max(delayMs, Math.trunc(timeoutMs))
    : attemptsLimit * delayMs + delayMs;

  const startedAt = Date.now();
  let attempts = 0;
  let lastError = null;

  while (attempts < attemptsLimit && Date.now() - startedAt <= timeoutLimit) {
    attempts += 1;
    try {
      const value = await check(attempts);
      if (value) {
        return {
          value,
          attempts,
          elapsedMs: Date.now() - startedAt,
        };
      }
    } catch (error) {
      lastError = error;
    }

    if (attempts >= attemptsLimit) break;
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= timeoutLimit) break;
    const sleepMs = Math.min(delayMs, timeoutLimit - elapsedMs);
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }

  const elapsedMs = Date.now() - startedAt;
  const lastErrorSuffix = lastError
    ? ` Last error: ${errorMessage(lastError)}`
    : '';
  throw new Error(
    `${label} timed out after ${attempts} attempts in ${elapsedMs}ms ` +
      `(limits: attempts=${attemptsLimit}, timeoutMs=${timeoutLimit}).${lastErrorSuffix}`
  );
}

export function statusRank(status) {
  if (status === 'failed') return 3;
  if (status === 'partial') return 2;
  if (status === 'skipped') return 1;
  return 0;
}

export function worstStatus(statuses) {
  const ranked = statuses.map(statusRank);
  const worst = Math.max(...ranked, 0);
  if (worst === 3) return 'failed';
  if (worst === 2) return 'partial';
  if (worst === 1) return 'skipped';
  return 'passed';
}

function ensureNewline(input) {
  return input.endsWith('\n') ? input : `${input}\n`;
}

function upsertSection(content, startMarker, endMarker, entry) {
  const normalized = ensureNewline(content);
  const start = normalized.indexOf(startMarker);
  const end = normalized.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) {
    return `${normalized}\n${entry.trim()}\n`;
  }

  const insertAt = start + startMarker.length;
  const before = normalized.slice(0, insertAt);
  const after = normalized.slice(insertAt);
  return `${before}\n${entry.trim()}\n${after}`;
}

export function ensureRunlogTemplate(content) {
  if (!content || content.trim().length === 0) return RUNLOG_TEMPLATE;

  let next = ensureNewline(content);
  if (!next.includes(RUNLOG_MARKERS.runsStart) || !next.includes(RUNLOG_MARKERS.runsEnd)) {
    next += `\n## Runs\n${RUNLOG_MARKERS.runsStart}\n${RUNLOG_MARKERS.runsEnd}\n`;
  }
  if (!next.includes(RUNLOG_MARKERS.jobsStart) || !next.includes(RUNLOG_MARKERS.jobsEnd)) {
    next += `\n## Jobs\n${RUNLOG_MARKERS.jobsStart}\n${RUNLOG_MARKERS.jobsEnd}\n`;
  }
  if (!next.includes(RUNLOG_MARKERS.diffsStart) || !next.includes(RUNLOG_MARKERS.diffsEnd)) {
    next += `\n## Diffs\n${RUNLOG_MARKERS.diffsStart}\n${RUNLOG_MARKERS.diffsEnd}\n`;
  }
  return next;
}

function statusLabel(status) {
  if (status === 'passed') return 'PASS';
  if (status === 'failed') return 'FAIL';
  if (status === 'partial') return 'PARTIAL';
  if (status === 'skipped') return 'SKIP';
  return String(status).toUpperCase();
}

function secondsFromMs(ms) {
  return (ms / 1000).toFixed(2);
}

function mdPath(pathValue) {
  return pathValue ? `\`${pathValue}\`` : '-';
}

export function formatRunEntry(runRecord) {
  return `- \`${runRecord.runId}\` | ${statusLabel(runRecord.status)} | ${runRecord.startedAt} -> ${runRecord.endedAt} | ${secondsFromMs(runRecord.durationMs)}s`;
}

export function formatJobsEntry(runRecord) {
  const lines = [
    `### ${runRecord.runId}`,
    '',
    '| Job | Status | Duration (s) | Command | Artifact | Log |',
    '| --- | --- | ---: | --- | --- | --- |',
  ];

  for (const job of runRecord.jobs) {
    lines.push(
      `| ${job.label} | ${statusLabel(job.status)} | ${secondsFromMs(job.durationMs)} | \`${job.command}\` | ${mdPath(job.artifactPath)} | ${mdPath(job.logPath)} |`
    );
  }

  return lines.join('\n');
}

export function formatDiffEntry(runRecord, mismatchCount) {
  return `- \`${runRecord.runId}\` | mismatches: **${mismatchCount}** | report: ${mdPath(runRecord.comparisonMarkdownPath)} | json: ${mdPath(runRecord.comparisonJsonPath)}`;
}

export function injectRunlogEntries(content, runRecord, mismatchCount) {
  const templated = ensureRunlogTemplate(content);
  const withRun = upsertSection(
    templated,
    RUNLOG_MARKERS.runsStart,
    RUNLOG_MARKERS.runsEnd,
    formatRunEntry(runRecord)
  );
  const withJobs = upsertSection(
    withRun,
    RUNLOG_MARKERS.jobsStart,
    RUNLOG_MARKERS.jobsEnd,
    formatJobsEntry(runRecord)
  );
  return upsertSection(
    withJobs,
    RUNLOG_MARKERS.diffsStart,
    RUNLOG_MARKERS.diffsEnd,
    formatDiffEntry(runRecord, mismatchCount)
  );
}

function normalizeField(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(',');
  return JSON.stringify(value);
}

function diffField(field, classic, substream) {
  const classicValue = normalizeField(classic);
  const substreamValue = normalizeField(substream);
  return {
    field,
    classic: classicValue,
    substream: substreamValue,
    match: classicValue === substreamValue,
  };
}

function buildTransportDiff(transport, classicArtifact, substreamArtifact) {
  const fields = [
    diffField('available', classicArtifact?.available ?? null, substreamArtifact?.available ?? null),
    diffField(
      'global.total_agents',
      classicArtifact?.globalStats?.total_agents ?? null,
      substreamArtifact?.globalStats?.total_agents ?? null
    ),
    diffField(
      'global.total_feedbacks',
      classicArtifact?.globalStats?.total_feedbacks ?? null,
      substreamArtifact?.globalStats?.total_feedbacks ?? null
    ),
    diffField(
      'global.total_collections',
      classicArtifact?.globalStats?.total_collections ?? null,
      substreamArtifact?.globalStats?.total_collections ?? null
    ),
    diffField(
      'leaderboard.count',
      classicArtifact?.leaderboardAssets?.length ?? 0,
      substreamArtifact?.leaderboardAssets?.length ?? 0
    ),
    diffField(
      'leaderboard.top_asset',
      classicArtifact?.leaderboardAssets?.[0] ?? null,
      substreamArtifact?.leaderboardAssets?.[0] ?? null
    ),
    diffField(
      'seed_asset_found',
      classicArtifact?.seedAssetFound ?? null,
      substreamArtifact?.seedAssetFound ?? null
    ),
    diffField(
      'id_checks.enabled',
      classicArtifact?.idChecks?.enabled ?? null,
      substreamArtifact?.idChecks?.enabled ?? null
    ),
    diffField(
      'id_checks.passed',
      classicArtifact?.idChecks?.passed ?? null,
      substreamArtifact?.idChecks?.passed ?? null
    ),
    diffField(
      'id_checks.expected_agents',
      classicArtifact?.idChecks?.expected?.agents ?? null,
      substreamArtifact?.idChecks?.expected?.agents ?? null
    ),
    diffField(
      'id_checks.observed_agents',
      classicArtifact?.idChecks?.observed?.agentsFound ?? null,
      substreamArtifact?.idChecks?.observed?.agentsFound ?? null
    ),
    diffField(
      'id_checks.expected_feedbacks',
      classicArtifact?.idChecks?.expected?.feedbacks ?? null,
      substreamArtifact?.idChecks?.expected?.feedbacks ?? null
    ),
    diffField(
      'id_checks.observed_feedbacks',
      classicArtifact?.idChecks?.observed?.feedbacksFound ?? null,
      substreamArtifact?.idChecks?.observed?.feedbacksFound ?? null
    ),
    diffField(
      'id_checks.expected_pending_validations',
      classicArtifact?.idChecks?.expected?.pendingValidations ?? null,
      substreamArtifact?.idChecks?.expected?.pendingValidations ?? null
    ),
    diffField(
      'id_checks.observed_pending_validations',
      classicArtifact?.idChecks?.observed?.pendingValidationsFound ?? null,
      substreamArtifact?.idChecks?.observed?.pendingValidationsFound ?? null
    ),
    diffField(
      'id_checks.expected_uri_metadata',
      classicArtifact?.idChecks?.expected?.agentUriMetadata ?? null,
      substreamArtifact?.idChecks?.expected?.agentUriMetadata ?? null
    ),
    diffField(
      'id_checks.observed_uri_metadata',
      classicArtifact?.idChecks?.observed?.agentUriMetadataFound ?? null,
      substreamArtifact?.idChecks?.observed?.agentUriMetadataFound ?? null
    ),
    diffField(
      'id_checks.expected_collections',
      classicArtifact?.idChecks?.expected?.collections ?? null,
      substreamArtifact?.idChecks?.expected?.collections ?? null
    ),
    diffField(
      'id_checks.observed_collections',
      classicArtifact?.idChecks?.observed?.collectionsFound ?? null,
      substreamArtifact?.idChecks?.observed?.collectionsFound ?? null
    ),
    diffField(
      'id_checks.hash_agents',
      classicArtifact?.idChecks?.hashes?.agents ?? null,
      substreamArtifact?.idChecks?.hashes?.agents ?? null
    ),
    diffField(
      'id_checks.hash_feedbacks',
      classicArtifact?.idChecks?.hashes?.feedbacks ?? null,
      substreamArtifact?.idChecks?.hashes?.feedbacks ?? null
    ),
    diffField(
      'id_checks.hash_pending_validations',
      classicArtifact?.idChecks?.hashes?.pendingValidations ?? null,
      substreamArtifact?.idChecks?.hashes?.pendingValidations ?? null
    ),
    diffField(
      'id_checks.hash_uri_metadata',
      classicArtifact?.idChecks?.hashes?.agentUriMetadata ?? null,
      substreamArtifact?.idChecks?.hashes?.agentUriMetadata ?? null
    ),
    diffField(
      'id_checks.hash_collections',
      classicArtifact?.idChecks?.hashes?.collections ?? null,
      substreamArtifact?.idChecks?.hashes?.collections ?? null
    ),
    diffField(
      'id_checks.error_count',
      Array.isArray(classicArtifact?.idChecks?.errors) ? classicArtifact.idChecks.errors.length : null,
      Array.isArray(substreamArtifact?.idChecks?.errors) ? substreamArtifact.idChecks.errors.length : null
    ),
  ];
  const mismatchCount = fields.reduce((acc, field) => acc + (field.match ? 0 : 1), 0);
  return { transport, mismatchCount, fields };
}

export function buildComparisonReport({
  runId,
  classicRest,
  classicGraphql,
  substreamRest,
  substreamGraphql,
}) {
  const rest = buildTransportDiff('rest', classicRest, substreamRest);
  const graphql = buildTransportDiff('graphql', classicGraphql, substreamGraphql);
  return {
    runId,
    generatedAt: nowIso(),
    overallMismatchCount: rest.mismatchCount + graphql.mismatchCount,
    transports: [rest, graphql],
  };
}

export function renderComparisonMarkdown(report) {
  const lines = [
    '# Inter-Indexer Comparison Report',
    '',
    `- Run ID: \`${report.runId}\``,
    `- Generated At: \`${report.generatedAt}\``,
    `- Overall Mismatches: **${report.overallMismatchCount}**`,
    '',
  ];

  for (const transport of report.transports) {
    lines.push(`## ${transport.transport.toUpperCase()}`);
    lines.push('');
    lines.push('| Field | Classic | Substream | Match |');
    lines.push('| --- | --- | --- | --- |');
    for (const field of transport.fields) {
      lines.push(`| ${field.field} | \`${field.classic}\` | \`${field.substream}\` | ${field.match ? 'YES' : 'NO'} |`);
    }
    lines.push('');
    lines.push(`Mismatches: **${transport.mismatchCount}**`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}
