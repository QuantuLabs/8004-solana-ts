#!/usr/bin/env node

import { spawnSync } from 'child_process';
import {
  errorMessage,
  getArgOr,
  nowIso,
  parseArgs,
  resolveFromCwd,
  writeJson,
} from './e2e-indexers-lib.mjs';

function hasDocker() {
  const probe = spawnSync('sh', ['-lc', 'command -v docker >/dev/null 2>&1'], {
    encoding: 'utf8',
  });
  return probe.status === 0;
}

function resolveHookCommand(stage) {
  if (stage === 'pre') {
    return process.env.E2E_INDEXERS_DOCKER_PRE_HOOK || process.env.E2E_INDEXERS_DOCKER_CHECK_CMD || null;
  }
  return process.env.E2E_INDEXERS_DOCKER_POST_HOOK || process.env.E2E_INDEXERS_DOCKER_CHECK_CMD || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stage = getArgOr(args, 'stage', 'pre');
  if (stage !== 'pre' && stage !== 'post') {
    throw new Error(`--stage must be pre|post (got: ${stage})`);
  }

  const runId = getArgOr(args, 'run-id', process.env.E2E_INDEXERS_RUN_ID || 'manual');
  const artifactPath = resolveFromCwd(
    getArgOr(args, 'artifact', `artifacts/e2e-indexers/${runId}/jobs/docker-${stage}.json`)
  );

  const startedAtMs = Date.now();
  const artifact = {
    runId,
    stage,
    status: 'skipped',
    command: null,
    output: '',
    errorOutput: '',
    startedAt: nowIso(),
    endedAt: nowIso(),
    durationMs: 0,
    errors: [],
  };

  const hookCommand = resolveHookCommand(stage);
  let commandToRun = hookCommand;

  if (!commandToRun && hasDocker()) {
    commandToRun = 'docker ps --format "{{.Names}}"';
  }

  if (!commandToRun) {
    artifact.status = 'skipped';
    artifact.errors.push('No docker hook configured and docker command is unavailable');
    artifact.endedAt = nowIso();
    artifact.durationMs = Date.now() - startedAtMs;
    writeJson(artifactPath, artifact);
    console.log(`Docker hook artifact: ${artifactPath}`);
    return;
  }

  artifact.command = commandToRun;
  const run = spawnSync('/bin/bash', ['-lc', commandToRun], {
    encoding: 'utf8',
    env: process.env,
  });

  artifact.output = run.stdout || '';
  artifact.errorOutput = run.stderr || '';

  if (run.status === 0) {
    artifact.status = 'passed';
  } else {
    artifact.status = 'failed';
    artifact.errors.push(`Hook command exited with code ${run.status ?? 'unknown'}`);
  }

  artifact.endedAt = nowIso();
  artifact.durationMs = Date.now() - startedAtMs;
  writeJson(artifactPath, artifact);
  console.log(`Docker hook artifact: ${artifactPath}`);

  if (artifact.status === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
