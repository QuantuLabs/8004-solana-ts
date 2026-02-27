#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { relative } from 'path';
import { IndexerClient } from '../dist/index.js';
import {
  boolFromEnv,
  errorMessage,
  fileExists,
  getArg,
  getArgOr,
  getFlag,
  injectRunlogEntries,
  makeRunId,
  nowIso,
  parseArgs,
  readJson,
  readText,
  resolveFromCwd,
  statusRank,
  worstStatus,
  writeText,
} from './e2e-indexers-lib.mjs';

function toRel(pathValue) {
  return relative(process.cwd(), pathValue);
}

function buildCommandString(command, args) {
  return [command, ...args].join(' ');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJobStatusFromArtifact(artifactPath) {
  const artifact = readJson(artifactPath);
  if (!artifact || typeof artifact !== 'object') return null;
  const status = artifact.status;
  if (status === 'passed' || status === 'failed' || status === 'partial' || status === 'skipped') {
    return status;
  }
  return null;
}

function runProcessJob({ id, label, command, args, artifactPath, logPath, env }) {
  const startedAtMs = Date.now();
  const startedAt = nowIso();
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env,
    cwd: process.cwd(),
  });
  const endedAt = nowIso();
  const durationMs = Date.now() - startedAtMs;

  const combinedLog = [
    `command: ${buildCommandString(command, args)}`,
    `exit_code: ${result.status ?? 'null'}`,
    '',
    '[stdout]',
    result.stdout || '',
    '',
    '[stderr]',
    result.stderr || '',
    '',
  ].join('\n');
  writeText(logPath, combinedLog);

  const artifactStatus = readJobStatusFromArtifact(artifactPath);
  let status = artifactStatus || (result.status === 0 ? 'passed' : 'failed');
  if (result.status !== 0 && statusRank(status) < statusRank('failed')) {
    status = 'failed';
  }

  return {
    id,
    label,
    status,
    startedAt,
    endedAt,
    durationMs,
    command: buildCommandString(command, args),
    artifactPath: toRel(artifactPath),
    logPath: toRel(logPath),
    note: result.status === 0 ? '' : `exit=${result.status}`,
  };
}

function createManualJobRecord({
  id,
  label,
  status,
  startedAt,
  endedAt,
  durationMs,
  command,
  artifactPath,
  logPath,
  note = '',
}) {
  return {
    id,
    label,
    status,
    startedAt,
    endedAt,
    durationMs,
    command,
    artifactPath: toRel(artifactPath),
    logPath: toRel(logPath),
    note,
  };
}

function buildCheckArgs({ backend, transport, runId, artifactPath, seedAsset, seedArtifactPath, timeoutMs }) {
  const args = [
    'scripts/e2e-indexers-check.mjs',
    '--backend',
    backend,
    '--transport',
    transport,
    '--run-id',
    runId,
    '--artifact',
    artifactPath,
    '--timeout-ms',
    String(timeoutMs),
  ];
  if (seedAsset) {
    args.push('--seed-asset', seedAsset);
  }
  if (seedArtifactPath) {
    args.push('--seed-artifact', seedArtifactPath);
  }
  return args;
}

function applyArgToEnv(args, argName, envName, env) {
  const value = getArg(args, argName);
  if (value) env[envName] = value;
}

async function fetchSnapshot({ client, seedAsset }) {
  const snapshot = {
    available: null,
    stats: null,
    topAsset: null,
    seedAssetFound: null,
    errors: [],
  };

  try {
    snapshot.available = await client.isAvailable();
  } catch (error) {
    snapshot.available = false;
    snapshot.errors.push(`availability: ${errorMessage(error)}`);
  }

  try {
    const stats = await client.getGlobalStats();
    snapshot.stats = {
      total_agents: Number.isFinite(stats?.total_agents) ? stats.total_agents : null,
      total_feedbacks: Number.isFinite(stats?.total_feedbacks) ? stats.total_feedbacks : null,
      total_collections: Number.isFinite(stats?.total_collections) ? stats.total_collections : null,
    };
  } catch (error) {
    snapshot.errors.push(`global_stats: ${errorMessage(error)}`);
  }

  try {
    const leaderboard = await client.getLeaderboard({ limit: 1 });
    if (Array.isArray(leaderboard) && typeof leaderboard[0]?.asset === 'string') {
      snapshot.topAsset = leaderboard[0].asset;
    }
  } catch (error) {
    snapshot.errors.push(`leaderboard: ${errorMessage(error)}`);
  }

  if (seedAsset) {
    try {
      const seedAgent = await client.getAgent(seedAsset);
      snapshot.seedAssetFound = Boolean(seedAgent);
    } catch (error) {
      snapshot.seedAssetFound = false;
      snapshot.errors.push(`seed_lookup: ${errorMessage(error)}`);
    }
  }

  return snapshot;
}

function isAlignedWithClassic({ classicArtifact, snapshot, seedAsset }) {
  const targetStats = classicArtifact?.globalStats || {};
  const stats = snapshot.stats || {};
  const topClassic = classicArtifact?.leaderboardAssets?.[0] ?? null;

  const statsMatch =
    stats.total_agents === targetStats.total_agents &&
    stats.total_feedbacks === targetStats.total_feedbacks &&
    stats.total_collections === targetStats.total_collections;
  const topMatch = topClassic ? snapshot.topAsset === topClassic : true;
  const seedMatch = seedAsset ? snapshot.seedAssetFound === true : true;
  return statsMatch && topMatch && seedMatch;
}

async function runSubstreamCatchupJob({
  runId,
  env,
  seedAsset,
  classicRestArtifactPath,
  artifactPath,
  logPath,
}) {
  const startedAtMs = Date.now();
  const startedAt = nowIso();
  const timeoutMs = Number.parseInt(env.E2E_INDEXERS_CATCHUP_TIMEOUT_MS || '120000', 10);
  const pollMs = Number.parseInt(env.E2E_INDEXERS_CATCHUP_POLL_MS || '2000', 10);

  const classicArtifact = readJson(classicRestArtifactPath);
  const substreamUrl = env.SUBSTREAM_INDEXER_URL || env.E2E_INDEXERS_SUBSTREAM_REST_URL || null;
  const substreamApiKey = env.SUBSTREAM_INDEXER_API_KEY || env.E2E_INDEXERS_SUBSTREAM_API_KEY || '';
  const command = `internal:substream-catchup(${substreamUrl || 'no-url'})`;
  const pollLog = [];

  const artifact = {
    runId,
    status: 'skipped',
    substreamUrl,
    seedAsset: seedAsset || null,
    timeoutMs,
    pollMs,
    attempts: 0,
    aligned: false,
    classicTarget: {
      globalStats: classicArtifact?.globalStats || null,
      topAsset: classicArtifact?.leaderboardAssets?.[0] ?? null,
    },
    lastSnapshot: null,
    errors: [],
    startedAt,
    endedAt: startedAt,
    durationMs: 0,
  };

  if (!substreamUrl) {
    artifact.errors.push('No substream REST URL configured');
  } else if (!classicArtifact?.globalStats) {
    artifact.errors.push('Classic REST artifact missing global stats');
  } else {
    const client = new IndexerClient({
      baseUrl: substreamUrl,
      apiKey: substreamApiKey,
      timeout: Math.max(10000, pollMs * 2),
      retries: 0,
    });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      artifact.attempts += 1;
      const snapshot = await fetchSnapshot({ client, seedAsset });
      artifact.lastSnapshot = snapshot;
      pollLog.push(
        `attempt=${artifact.attempts} stats=${JSON.stringify(snapshot.stats)} top=${snapshot.topAsset} seed=${snapshot.seedAssetFound} errors=${snapshot.errors.join(' | ')}`
      );
      if (isAlignedWithClassic({ classicArtifact, snapshot, seedAsset })) {
        artifact.aligned = true;
        artifact.status = 'passed';
        break;
      }
      await sleep(pollMs);
    }

    if (!artifact.aligned) {
      artifact.status = 'partial';
      artifact.errors.push('Substream REST did not catch up to classic REST before timeout');
    }
  }

  artifact.endedAt = nowIso();
  artifact.durationMs = Date.now() - startedAtMs;
  writeText(logPath, `${pollLog.join('\n')}\n`);
  writeText(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

  return createManualJobRecord({
    id: 'substream-catchup',
    label: 'Substream REST Catch-up',
    status: artifact.status,
    startedAt,
    endedAt: artifact.endedAt,
    durationMs: artifact.durationMs,
    command,
    artifactPath,
    logPath,
    note: artifact.aligned ? '' : 'catch-up timeout',
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = getArgOr(args, 'run-id', process.env.E2E_INDEXERS_RUN_ID || makeRunId('matrix'));
  const artifactsRoot = resolveFromCwd(getArgOr(args, 'artifacts-root', 'artifacts/e2e-indexers'));
  const runlogPath = resolveFromCwd(getArgOr(args, 'runlog', 'docs/e2e-indexers-runlog.md'));

  const runDir = resolveFromCwd(`${artifactsRoot}/${runId}`);
  const jobsDir = resolveFromCwd(`${runDir}/jobs`);
  const logsDir = resolveFromCwd(`${runDir}/logs`);
  const comparisonJsonPath = resolveFromCwd(`${runDir}/comparison/report.json`);
  const comparisonMarkdownPath = resolveFromCwd(`${runDir}/comparison/report.md`);

  const startedAtMs = Date.now();
  const startedAt = nowIso();
  const jobRecords = [];

  const timeoutMs = Number.parseInt(
    getArgOr(args, 'timeout-ms', process.env.E2E_INDEXERS_TIMEOUT_MS || '10000'),
    10
  );
  const skipGraphql = getFlag(args, 'skip-graphql') || boolFromEnv('E2E_INDEXERS_SKIP_GRAPHQL', false);

  const env = { ...process.env, E2E_INDEXERS_RUN_ID: runId };
  if (getFlag(args, 'dry-run') || boolFromEnv('E2E_INDEXERS_DRY_RUN', false)) {
    env.E2E_INDEXERS_DISABLE_WRITES = '1';
    env.E2E_INDEXERS_SKIP_SEED_WRITE = '1';
  }

  applyArgToEnv(args, 'classic-rest-url', 'CLASSIC_INDEXER_URL', env);
  applyArgToEnv(args, 'classic-rest-key', 'CLASSIC_INDEXER_API_KEY', env);
  applyArgToEnv(args, 'classic-graphql-url', 'CLASSIC_INDEXER_GRAPHQL_URL', env);
  applyArgToEnv(args, 'substream-rest-url', 'SUBSTREAM_INDEXER_URL', env);
  applyArgToEnv(args, 'substream-rest-key', 'SUBSTREAM_INDEXER_API_KEY', env);
  applyArgToEnv(args, 'substream-graphql-url', 'SUBSTREAM_INDEXER_GRAPHQL_URL', env);

  const dockerPreArtifact = resolveFromCwd(`${jobsDir}/docker-pre.json`);
  const seedArtifact = resolveFromCwd(`${jobsDir}/seed-write.json`);
  const classicRestArtifact = resolveFromCwd(`${jobsDir}/classic-rest.json`);
  const classicGraphqlArtifact = resolveFromCwd(`${jobsDir}/classic-graphql.json`);
  const substreamRestArtifact = resolveFromCwd(`${jobsDir}/substream-rest.json`);
  const substreamGraphqlArtifact = resolveFromCwd(`${jobsDir}/substream-graphql.json`);
  const substreamCatchupArtifact = resolveFromCwd(`${jobsDir}/substream-catchup.json`);
  const dockerPostArtifact = resolveFromCwd(`${jobsDir}/docker-post.json`);

  jobRecords.push(
    runProcessJob({
      id: 'docker-pre',
      label: 'Docker Pre Hook',
      command: 'node',
      args: [
        'scripts/e2e-indexers-docker-hook.mjs',
        '--stage',
        'pre',
        '--run-id',
        runId,
        '--artifact',
        dockerPreArtifact,
      ],
      artifactPath: dockerPreArtifact,
      logPath: resolveFromCwd(`${logsDir}/docker-pre.log`),
      env,
    })
  );

  jobRecords.push(
    runProcessJob({
      id: 'seed-write',
      label: 'Seed/Write Flow',
      command: 'node',
      args: [
        'scripts/e2e-indexers-seed-write.mjs',
        '--run-id',
        runId,
        '--artifact',
        seedArtifact,
      ],
      artifactPath: seedArtifact,
      logPath: resolveFromCwd(`${logsDir}/seed-write.log`),
      env,
    })
  );

  const seedData = readJson(seedArtifact);
  const seedAsset =
    seedData && typeof seedData === 'object' && typeof seedData.seedAsset === 'string'
      ? seedData.seedAsset
      : null;
  if (seedAsset) env.E2E_INDEXERS_SEED_ASSET = seedAsset;

  // Run classic REST first and use it as the catch-up target for substream REST.
  jobRecords.push(
    runProcessJob({
      id: 'classic-rest',
      label: 'Classic REST Check',
      command: 'node',
      args: buildCheckArgs({
        backend: 'classic',
        transport: 'rest',
        runId,
        artifactPath: classicRestArtifact,
        seedAsset,
        seedArtifactPath: seedArtifact,
        timeoutMs,
      }),
      artifactPath: classicRestArtifact,
      logPath: resolveFromCwd(`${logsDir}/classic-rest.log`),
      env,
    })
  );

  jobRecords.push(
    await runSubstreamCatchupJob({
      runId,
      env,
      seedAsset,
      classicRestArtifactPath: classicRestArtifact,
      artifactPath: substreamCatchupArtifact,
      logPath: resolveFromCwd(`${logsDir}/substream-catchup.log`),
    })
  );

  const remainingChecks = [
    {
      id: 'substream-rest',
      label: 'Substream REST Check',
      backend: 'substream',
      transport: 'rest',
      artifactPath: substreamRestArtifact,
      logPath: resolveFromCwd(`${logsDir}/substream-rest.log`),
    },
  ];

  if (!skipGraphql) {
    remainingChecks.unshift({
      id: 'classic-graphql',
      label: 'Classic GraphQL Check',
      backend: 'classic',
      transport: 'graphql',
      artifactPath: classicGraphqlArtifact,
      logPath: resolveFromCwd(`${logsDir}/classic-graphql.log`),
    });
    remainingChecks.push({
      id: 'substream-graphql',
      label: 'Substream GraphQL Check',
      backend: 'substream',
      transport: 'graphql',
      artifactPath: substreamGraphqlArtifact,
      logPath: resolveFromCwd(`${logsDir}/substream-graphql.log`),
    });
  }

  for (const job of remainingChecks) {
    jobRecords.push(
      runProcessJob({
        id: job.id,
        label: job.label,
        command: 'node',
        args: buildCheckArgs({
          backend: job.backend,
          transport: job.transport,
          runId,
          artifactPath: job.artifactPath,
          seedAsset,
          seedArtifactPath: seedArtifact,
          timeoutMs,
        }),
        artifactPath: job.artifactPath,
        logPath: job.logPath,
        env,
      })
    );
  }

  jobRecords.push(
    runProcessJob({
      id: 'compare',
      label: 'Inter-Indexer Comparison',
      command: 'node',
      args: [
        'scripts/e2e-indexers-compare.mjs',
        '--run-id',
        runId,
        '--artifacts-dir',
        jobsDir,
        '--output-json',
        comparisonJsonPath,
        '--output-md',
        comparisonMarkdownPath,
      ],
      artifactPath: comparisonJsonPath,
      logPath: resolveFromCwd(`${logsDir}/compare.log`),
      env,
    })
  );

  jobRecords.push(
    runProcessJob({
      id: 'docker-post',
      label: 'Docker Post Hook',
      command: 'node',
      args: [
        'scripts/e2e-indexers-docker-hook.mjs',
        '--stage',
        'post',
        '--run-id',
        runId,
        '--artifact',
        dockerPostArtifact,
      ],
      artifactPath: dockerPostArtifact,
      logPath: resolveFromCwd(`${logsDir}/docker-post.log`),
      env,
    })
  );

  const endedAt = nowIso();
  const durationMs = Date.now() - startedAtMs;
  const runStatus = worstStatus(jobRecords.map((job) => job.status));

  const comparisonReport = readJson(comparisonJsonPath);
  const mismatchCount =
    comparisonReport && typeof comparisonReport.overallMismatchCount === 'number'
      ? comparisonReport.overallMismatchCount
      : 0;

  const runRecord = {
    runId,
    status: runStatus,
    startedAt,
    endedAt,
    durationMs,
    jobs: jobRecords,
    comparisonMarkdownPath: fileExists(comparisonMarkdownPath) ? toRel(comparisonMarkdownPath) : null,
    comparisonJsonPath: fileExists(comparisonJsonPath) ? toRel(comparisonJsonPath) : null,
  };

  const runSummaryPath = resolveFromCwd(`${runDir}/run-summary.json`);
  writeText(runSummaryPath, `${JSON.stringify(runRecord, null, 2)}\n`);

  const runlogExisting = readText(runlogPath);
  const runlogNext = injectRunlogEntries(runlogExisting || '', runRecord, mismatchCount);
  writeText(runlogPath, runlogNext);

  console.log(`Run ID: ${runId}`);
  console.log(`Run status: ${runStatus}`);
  console.log(`Run summary: ${runSummaryPath}`);
  console.log(`Runlog updated: ${runlogPath}`);
  console.log(`Mismatch count: ${mismatchCount}`);

  if (runStatus === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
