#!/usr/bin/env node

import { spawn } from 'child_process';
import { relative } from 'path';
import { pathToFileURL } from 'url';
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

async function runCommand({ command, args, env }) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = ({ status, signal, spawnError = null }) => {
      if (settled) return;
      settled = true;

      if (spawnError) {
        const separator = stderr.length > 0 && !stderr.endsWith('\n') ? '\n' : '';
        stderr += `${separator}spawn_error: ${errorMessage(spawnError)}\n`;
      }

      resolve({ status, signal, stdout, stderr, spawnError });
    };

    let child;
    try {
      child = spawn(command, args, {
        env,
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      finish({ status: null, signal: null, spawnError: error });
      return;
    }

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
    }

    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }

    child.once('error', (error) => {
      finish({ status: null, signal: null, spawnError: error });
    });

    child.once('close', (status, signal) => {
      finish({ status, signal });
    });
  });
}

async function runProcessJob({ id, label, command, args, artifactPath, logPath, env }) {
  const startedAtMs = Date.now();
  const startedAt = nowIso();
  const result = await runCommand({ command, args, env });
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
  const hasProcessError = result.spawnError || result.status !== 0;
  let status = artifactStatus || (!hasProcessError ? 'passed' : 'failed');
  if (hasProcessError && statusRank(status) < statusRank('failed')) {
    status = 'failed';
  }

  const noteParts = [];
  if (hasProcessError) {
    noteParts.push(`exit=${result.status ?? 'null'}`);
    if (result.signal) noteParts.push(`signal=${result.signal}`);
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
    note: noteParts.join(' '),
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

function buildStagedCheckJobs({
  skipGraphql,
  indexerRestArtifact,
  indexerGraphqlArtifact,
  substreamRestArtifact,
  substreamGraphqlArtifact,
  logsDir,
}) {
  const indexer = [
    {
      id: 'indexer-rest',
      label: 'Indexer REST Check',
      backend: 'indexer',
      transport: 'rest',
      artifactPath: indexerRestArtifact,
      logPath: resolveFromCwd(`${logsDir}/indexer-rest.log`),
    },
  ];

  const substream = [
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
    indexer.push({
      id: 'indexer-graphql',
      label: 'Indexer GraphQL Check',
      backend: 'indexer',
      transport: 'graphql',
      artifactPath: indexerGraphqlArtifact,
      logPath: resolveFromCwd(`${logsDir}/indexer-graphql.log`),
    });
    substream.push({
      id: 'substream-graphql',
      label: 'Substream GraphQL Check',
      backend: 'substream',
      transport: 'graphql',
      artifactPath: substreamGraphqlArtifact,
      logPath: resolveFromCwd(`${logsDir}/substream-graphql.log`),
    });
  }

  return { indexer, substream };
}

async function runCheckStage({
  jobs,
  runId,
  seedAsset,
  seedArtifact,
  timeoutMs,
  env,
  runJob = runProcessJob,
}) {
  return Promise.all(
    jobs.map((job) =>
      runJob({
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
    )
  );
}

async function runStagedChecks({ indexerJobs, substreamJobs, runStage, runCatchup }) {
  const records = [];

  if (indexerJobs.length > 0) {
    records.push(...(await runStage(indexerJobs)));
  }

  records.push(await runCatchup());

  if (substreamJobs.length > 0) {
    records.push(...(await runStage(substreamJobs)));
  }

  return records;
}

function canRunParityAfterSeedWrite(seedStatus) {
  return seedStatus !== 'failed';
}

function buildSeedBlockedJobRecords({
  runId,
  seedStatus,
  seedAsset,
  seedArtifact,
  timeoutMs,
  jobsDir,
  stagedChecks,
  substreamCatchupArtifact,
  comparisonJsonPath,
  comparisonMarkdownPath,
  logsDir,
}) {
  const skippedAt = nowIso();
  const reason = `seed-write status=${seedStatus || 'unknown'}; skipped to avoid false-green parity`;
  const checkJobs = [...stagedChecks.indexer, ...stagedChecks.substream];

  const records = checkJobs.map((job) =>
    createManualJobRecord({
      id: job.id,
      label: job.label,
      status: 'skipped',
      startedAt: skippedAt,
      endedAt: skippedAt,
      durationMs: 0,
      command: buildCommandString(
        'node',
        buildCheckArgs({
          backend: job.backend,
          transport: job.transport,
          runId,
          artifactPath: job.artifactPath,
          seedAsset,
          seedArtifactPath: seedArtifact,
          timeoutMs,
        })
      ),
      artifactPath: job.artifactPath,
      logPath: job.logPath,
      note: reason,
    })
  );

  records.push(
    createManualJobRecord({
      id: 'substream-catchup',
      label: 'Substream REST Catch-up',
      status: 'skipped',
      startedAt: skippedAt,
      endedAt: skippedAt,
      durationMs: 0,
      command: 'internal:substream-catchup(skipped)',
      artifactPath: substreamCatchupArtifact,
      logPath: resolveFromCwd(`${logsDir}/substream-catchup.log`),
      note: reason,
    })
  );

  records.push(
    createManualJobRecord({
      id: 'compare',
      label: 'Inter-Indexer Comparison',
      status: 'skipped',
      startedAt: skippedAt,
      endedAt: skippedAt,
      durationMs: 0,
      command: buildCommandString('node', [
        'scripts/e2e-indexers-compare.mjs',
        '--run-id',
        runId,
        '--artifacts-dir',
        jobsDir,
        '--output-json',
        comparisonJsonPath,
        '--output-md',
        comparisonMarkdownPath,
      ]),
      artifactPath: comparisonJsonPath,
      logPath: resolveFromCwd(`${logsDir}/compare.log`),
      note: reason,
    })
  );

  return records;
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

function isAlignedWithIndexer({ indexerArtifact, snapshot, seedAsset }) {
  const targetStats = indexerArtifact?.globalStats || {};
  const stats = snapshot.stats || {};
  const topIndexer = indexerArtifact?.leaderboardAssets?.[0] ?? null;

  const statsMatch =
    stats.total_agents === targetStats.total_agents &&
    stats.total_feedbacks === targetStats.total_feedbacks &&
    stats.total_collections === targetStats.total_collections;
  const topMatch = topIndexer ? snapshot.topAsset === topIndexer : true;
  const seedMatch = seedAsset ? snapshot.seedAssetFound === true : true;
  return statsMatch && topMatch && seedMatch;
}

async function runSubstreamCatchupJob({
  runId,
  env,
  seedAsset,
  indexerRestArtifactPath,
  artifactPath,
  logPath,
}) {
  const startedAtMs = Date.now();
  const startedAt = nowIso();
  const timeoutMs = Number.parseInt(env.E2E_INDEXERS_CATCHUP_TIMEOUT_MS || '120000', 10);
  const pollMs = Number.parseInt(env.E2E_INDEXERS_CATCHUP_POLL_MS || '2000', 10);

  const indexerArtifact = readJson(indexerRestArtifactPath);
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
    indexerTarget: {
      globalStats: indexerArtifact?.globalStats || null,
      topAsset: indexerArtifact?.leaderboardAssets?.[0] ?? null,
    },
    lastSnapshot: null,
    errors: [],
    startedAt,
    endedAt: startedAt,
    durationMs: 0,
  };

  if (!substreamUrl) {
    artifact.errors.push('No substream REST URL configured');
  } else if (!indexerArtifact?.globalStats) {
    artifact.errors.push('Indexer REST artifact missing global stats');
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
      if (isAlignedWithIndexer({ indexerArtifact, snapshot, seedAsset })) {
        artifact.aligned = true;
        artifact.status = 'passed';
        break;
      }
      await sleep(pollMs);
    }

    if (!artifact.aligned) {
      artifact.status = 'partial';
      artifact.errors.push('Substream REST did not catch up to indexer REST before timeout');
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

  applyArgToEnv(args, 'indexer-rest-url', 'INDEXER_URL', env);
  applyArgToEnv(args, 'indexer-rest-key', 'INDEXER_API_KEY', env);
  applyArgToEnv(args, 'indexer-graphql-url', 'INDEXER_GRAPHQL_URL', env);
  applyArgToEnv(args, 'substream-rest-url', 'SUBSTREAM_INDEXER_URL', env);
  applyArgToEnv(args, 'substream-rest-key', 'SUBSTREAM_INDEXER_API_KEY', env);
  applyArgToEnv(args, 'substream-graphql-url', 'SUBSTREAM_INDEXER_GRAPHQL_URL', env);

  const dockerPreArtifact = resolveFromCwd(`${jobsDir}/docker-pre.json`);
  const seedArtifact = resolveFromCwd(`${jobsDir}/seed-write.json`);
  const indexerRestArtifact = resolveFromCwd(`${jobsDir}/indexer-rest.json`);
  const indexerGraphqlArtifact = resolveFromCwd(`${jobsDir}/indexer-graphql.json`);
  const substreamRestArtifact = resolveFromCwd(`${jobsDir}/substream-rest.json`);
  const substreamGraphqlArtifact = resolveFromCwd(`${jobsDir}/substream-graphql.json`);
  const substreamCatchupArtifact = resolveFromCwd(`${jobsDir}/substream-catchup.json`);
  const dockerPostArtifact = resolveFromCwd(`${jobsDir}/docker-post.json`);

  jobRecords.push(
    await runProcessJob({
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
    await runProcessJob({
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

  const stagedChecks = buildStagedCheckJobs({
    skipGraphql,
    indexerRestArtifact,
    indexerGraphqlArtifact,
    substreamRestArtifact,
    substreamGraphqlArtifact,
    logsDir,
  });

  const seedWriteStatus =
    (seedData && typeof seedData.status === 'string' && seedData.status) ||
    jobRecords.find((row) => row.id === 'seed-write')?.status ||
    null;
  const canRunParity = canRunParityAfterSeedWrite(seedWriteStatus);

  if (canRunParity) {
    jobRecords.push(
      ...(await runStagedChecks({
        indexerJobs: stagedChecks.indexer,
        substreamJobs: stagedChecks.substream,
        runStage: (jobs) =>
          runCheckStage({
            jobs,
            runId,
            seedAsset,
            seedArtifact,
            timeoutMs,
            env,
          }),
        runCatchup: () =>
          runSubstreamCatchupJob({
            runId,
            env,
            seedAsset,
            indexerRestArtifactPath: indexerRestArtifact,
            artifactPath: substreamCatchupArtifact,
            logPath: resolveFromCwd(`${logsDir}/substream-catchup.log`),
          }),
      }))
    );

    jobRecords.push(
      await runProcessJob({
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
  } else {
    jobRecords.push(
      ...buildSeedBlockedJobRecords({
        runId,
        seedStatus: seedWriteStatus,
        seedAsset,
        seedArtifact,
        timeoutMs,
        jobsDir,
        stagedChecks,
        substreamCatchupArtifact,
        comparisonJsonPath,
        comparisonMarkdownPath,
        logsDir,
      })
    );
  }

  jobRecords.push(
    await runProcessJob({
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

  const comparisonReport = canRunParity ? readJson(comparisonJsonPath) : null;
  const mismatchCount = canRunParity
    ? comparisonReport && typeof comparisonReport.overallMismatchCount === 'number'
      ? comparisonReport.overallMismatchCount
      : 'n/a'
    : `n/a (seed-write status=${seedWriteStatus || 'unknown'})`;

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

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}

export {
  buildSeedBlockedJobRecords,
  buildStagedCheckJobs,
  canRunParityAfterSeedWrite,
  runCheckStage,
  runStagedChecks,
};
