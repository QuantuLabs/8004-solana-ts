#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { relative } from 'path';
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

function buildCheckArgs({ backend, transport, runId, artifactPath, seedAsset, timeoutMs }) {
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
  return args;
}

function applyArgToEnv(args, argName, envName, env) {
  const value = getArg(args, argName);
  if (value) env[envName] = value;
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

  const checkJobs = [
    {
      id: 'classic-rest',
      label: 'Classic REST Check',
      backend: 'classic',
      transport: 'rest',
      artifactPath: classicRestArtifact,
      logPath: resolveFromCwd(`${logsDir}/classic-rest.log`),
    },
    {
      id: 'classic-graphql',
      label: 'Classic GraphQL Check',
      backend: 'classic',
      transport: 'graphql',
      artifactPath: classicGraphqlArtifact,
      logPath: resolveFromCwd(`${logsDir}/classic-graphql.log`),
    },
    {
      id: 'substream-rest',
      label: 'Substream REST Check',
      backend: 'substream',
      transport: 'rest',
      artifactPath: substreamRestArtifact,
      logPath: resolveFromCwd(`${logsDir}/substream-rest.log`),
    },
    {
      id: 'substream-graphql',
      label: 'Substream GraphQL Check',
      backend: 'substream',
      transport: 'graphql',
      artifactPath: substreamGraphqlArtifact,
      logPath: resolveFromCwd(`${logsDir}/substream-graphql.log`),
    },
  ];

  for (const job of checkJobs) {
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
