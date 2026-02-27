#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { errorMessage, getArgOr, getFlag, parseArgs } from './e2e-indexers-lib.mjs';

const DEFAULT_CONTAINER_NAME = 'e2e-indexers-ipfs-kubo';
const DEFAULT_IMAGE = 'ipfs/kubo:latest';
const DEFAULT_API_PORT = 5001;
const DEFAULT_GATEWAY_PORT = 8080;

function parsePort(raw, label, fallback) {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    if (raw === undefined || raw === null || raw === '') return fallback;
    throw new Error(`${label} must be an integer between 1 and 65535 (got: ${raw})`);
  }
  return parsed;
}

function runDocker(args, { allowFailure = false } = {}) {
  const run = spawnSync('docker', args, {
    encoding: 'utf8',
  });
  if (!allowFailure && run.status !== 0) {
    const stderr = (run.stderr || '').trim();
    throw new Error(`docker ${args.join(' ')} failed: ${stderr || `exit ${run.status ?? 'unknown'}`}`);
  }
  return run;
}

function hasDocker() {
  const probe = spawnSync('sh', ['-lc', 'command -v docker >/dev/null 2>&1'], {
    encoding: 'utf8',
  });
  return probe.status === 0;
}

function inspectContainer(containerName) {
  const run = runDocker(
    ['ps', '-a', '--filter', `name=^/${containerName}$`, '--format', '{{.Status}}'],
    { allowFailure: true }
  );
  if (run.status !== 0) {
    throw new Error((run.stderr || '').trim() || 'docker ps failed');
  }
  const status = (run.stdout || '').trim();
  if (!status) {
    return { exists: false, running: false, status: null };
  }
  return {
    exists: true,
    running: status.startsWith('Up '),
    status,
  };
}

async function waitForIpfsApi(apiUrl, attempts = 25, delayMs = 400) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/v0/version`, {
        method: 'POST',
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Continue until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`IPFS API did not become ready at ${apiUrl} after ${(attempts * delayMs) / 1000}s`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const containerName = getArgOr(
    args,
    'container-name',
    process.env.E2E_INDEXERS_IPFS_CONTAINER_NAME || DEFAULT_CONTAINER_NAME
  );
  const image = getArgOr(args, 'image', process.env.E2E_INDEXERS_IPFS_IMAGE || DEFAULT_IMAGE);
  const apiPort = parsePort(
    getArgOr(args, 'api-port', process.env.E2E_INDEXERS_IPFS_API_PORT || String(DEFAULT_API_PORT)),
    '--api-port',
    DEFAULT_API_PORT
  );
  const gatewayPort = parsePort(
    getArgOr(
      args,
      'gateway-port',
      process.env.E2E_INDEXERS_IPFS_GATEWAY_PORT || String(DEFAULT_GATEWAY_PORT)
    ),
    '--gateway-port',
    DEFAULT_GATEWAY_PORT
  );
  const dryRun = getFlag(args, 'dry-run');

  if (!hasDocker()) {
    throw new Error('docker is not available in PATH');
  }

  const localApiUrl = `http://127.0.0.1:${apiPort}`;
  const existing = inspectContainer(containerName);

  if (existing.running) {
    console.log(`IPFS container already running: ${containerName} (${existing.status})`);
    console.log(`E2E_INDEXERS_IPFS_API_URL=${localApiUrl}`);
    return;
  }

  if (existing.exists) {
    if (dryRun) {
      console.log(`[dry-run] docker rm -f ${containerName}`);
    } else {
      runDocker(['rm', '-f', containerName]);
    }
  }

  const runArgs = [
    'run',
    '-d',
    '--name',
    containerName,
    '-p',
    `${apiPort}:5001`,
    '-p',
    `${gatewayPort}:8080`,
    image,
  ];

  if (dryRun) {
    console.log(`[dry-run] docker ${runArgs.join(' ')}`);
    console.log(`[dry-run] wait for IPFS API at ${localApiUrl}`);
    console.log(`[dry-run] E2E_INDEXERS_IPFS_API_URL=${localApiUrl}`);
    return;
  }

  runDocker(runArgs);
  await waitForIpfsApi(localApiUrl);

  console.log(`Started IPFS container: ${containerName}`);
  console.log(`API: ${localApiUrl}`);
  console.log(`Gateway: http://127.0.0.1:${gatewayPort}`);
  console.log(`Set E2E_INDEXERS_IPFS_API_URL=${localApiUrl}`);
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
