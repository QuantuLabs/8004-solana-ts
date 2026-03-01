#!/usr/bin/env node

import { spawn } from 'child_process';

function setDefaultEnv(name, value) {
  if (process.env[name] === undefined || process.env[name] === '') {
    process.env[name] = value;
  }
}

// Focus profile: feedback/revoke/response heavy, with a smaller registration phase.
setDefaultEnv('STRESS_PLAN_ONLY', '0');
setDefaultEnv('STRESS_BUDGET_SOL', '10');
setDefaultEnv('STRESS_FORCE_BUDGET', '1');
setDefaultEnv('STRESS_RESERVE_SOL', '0.25');
setDefaultEnv('STRESS_WALLETS', '800');

// Keep registration lower than downstream writes to shift cost/time to feedback flows.
setDefaultEnv('STRESS_AGENTS', '400');
setDefaultEnv('STRESS_FEEDBACKS', '5000');
setDefaultEnv('STRESS_RESPONSES', '3500');
setDefaultEnv('STRESS_REVOKES', '3000');

// Request mixed ATOM/non-ATOM and real IPFS URIs for minted agents.
setDefaultEnv('STRESS_REGISTER_ATOM_ENABLED', '1');
setDefaultEnv('STRESS_REGISTER_ATOM_RATIO', '0.5');
setDefaultEnv('STRESS_REAL_IPFS_RATIO', '0.75');

// Keep scenarios valid for throughput/integrity runs by default.
setDefaultEnv('STRESS_MALFORMED_RATIO', '0');
setDefaultEnv('STRESS_FAKE_SEAL_RATIO', '0');

// Aggressive write parallelism.
setDefaultEnv('STRESS_FUND_BATCH_SIZE', '16');
setDefaultEnv('STRESS_FUND_CONCURRENCY', '4');
setDefaultEnv('STRESS_FUND_CONFIRM_TIMEOUT_MS', '20000');
setDefaultEnv('STRESS_RETRIES', '3');
setDefaultEnv('STRESS_CONCURRENCY_REGISTER', '24');
setDefaultEnv('STRESS_CONCURRENCY_FEEDBACK', '96');
setDefaultEnv('STRESS_CONCURRENCY_RESPONSE', '96');
setDefaultEnv('STRESS_CONCURRENCY_REVOKE', '96');
setDefaultEnv('STRESS_CONCURRENCY_RECOVER', '48');

// Optional post-run compare can be enabled by caller.
setDefaultEnv('STRESS_COMPARE_INDEXER', '0');

const child = spawn('node', ['scripts/stress-sdk-devnet-aggressive.mjs'], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
