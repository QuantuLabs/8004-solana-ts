#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { errorMessage, getArgOr, getFlag, parseArgs } from './e2e-indexers-lib.mjs';

const DEFAULT_CONTAINER_NAME = 'e2e-indexers-ipfs-kubo';

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

function containerExists(containerName) {
  const run = runDocker(
    ['ps', '-a', '--filter', `name=^/${containerName}$`, '--format', '{{.Names}}'],
    { allowFailure: true }
  );
  if (run.status !== 0) {
    throw new Error((run.stderr || '').trim() || 'docker ps failed');
  }
  return (run.stdout || '').trim() === containerName;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const containerName = getArgOr(
    args,
    'container-name',
    process.env.E2E_INDEXERS_IPFS_CONTAINER_NAME || DEFAULT_CONTAINER_NAME
  );
  const dryRun = getFlag(args, 'dry-run');

  if (!hasDocker()) {
    throw new Error('docker is not available in PATH');
  }

  if (!containerExists(containerName)) {
    console.log(`IPFS container not found: ${containerName}`);
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] docker rm -f ${containerName}`);
    return;
  }

  runDocker(['rm', '-f', containerName]);
  console.log(`Stopped IPFS container: ${containerName}`);
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
